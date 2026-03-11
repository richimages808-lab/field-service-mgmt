import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { Job, JobCost } from '../types';
import { DollarSign, Clock, Package, Car, Plus, Minus, TrendingUp, TrendingDown, Calculator, Save } from 'lucide-react';

interface JobCostTrackerProps {
    job: Job;
    onUpdate?: (costs: Job['costs']) => void;
    readOnly?: boolean;
    compact?: boolean;
}

const DEFAULT_HOURLY_RATE = 85;
const DEFAULT_MILEAGE_RATE = 0.67;

export const JobCostTracker: React.FC<JobCostTrackerProps> = ({
    job,
    onUpdate,
    readOnly = false,
    compact = false
}) => {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);

    // Cost state
    const [laborHours, setLaborHours] = useState(0);
    const [laborRate, setLaborRate] = useState(DEFAULT_HOURLY_RATE);
    // Added material_id to parts items
    const [partsItems, setPartsItems] = useState<{ name: string; quantity: number; unitCost: number; material_id?: string }[]>([]);
    const [mileage, setMileage] = useState(0);
    const [mileageRate, setMileageRate] = useState(DEFAULT_MILEAGE_RATE);
    const [otherCosts, setOtherCosts] = useState<{ description: string; amount: number }[]>([]);

    // Inventory state
    const [inventory, setInventory] = useState<any[]>([]);
    const [showInventory, setShowInventory] = useState<number | null>(null); // Index of row showing inventory dropdown

    // Initialize from job data
    useEffect(() => {
        if (job.actual_duration) {
            setLaborHours(job.actual_duration / 60);
        } else if (job.estimated_duration) {
            setLaborHours(job.estimated_duration / 60);
        }

        if (job.mileage) {
            setMileage(job.mileage);
        }

        if (job.costs) {
            // Restore from saved costs if available
            // Handle labor (number or object)
            if (typeof job.costs.labor === 'object' && job.costs.labor.total !== undefined) {
                setLaborHours(job.costs.labor.total / DEFAULT_HOURLY_RATE);
            } else if (typeof job.costs.labor === 'number') {
                setLaborHours(job.costs.labor / DEFAULT_HOURLY_RATE);
            }

            // Handle parts (number or object)
            if (typeof job.costs.parts === 'object' && job.costs.parts.items) {
                setPartsItems(job.costs.parts.items);
            } else if (typeof job.costs.parts === 'number') {
                // Legacy or simple number support - we can't restore items from a number
            }

            // Handle mileage (number or object)
            if (typeof job.costs.mileage === 'object' && job.costs.mileage.total !== undefined) {
                setMileage(job.costs.mileage.total / DEFAULT_MILEAGE_RATE);
            } else if (typeof job.costs.mileage === 'number') {
                setMileage(job.costs.mileage / DEFAULT_MILEAGE_RATE);
            }
            // Handle mileage (number or object)
            if (typeof job.costs.mileage === 'object' && job.costs.mileage.total !== undefined) {
                setMileage(job.costs.mileage.total / DEFAULT_MILEAGE_RATE);
            } else if (typeof job.costs.mileage === 'number') {
                setMileage(job.costs.mileage / DEFAULT_MILEAGE_RATE);
            }

            // Handle parts (number or object) - safely access items
            if (typeof job.costs.parts === 'object' && 'items' in job.costs.parts && Array.isArray(job.costs.parts.items)) {
                setPartsItems(job.costs.parts.items.map(item => ({
                    ...item,
                    material_id: (item as any).material_id
                })));
            }
        }
    }, [job]);

    // Fetch inventory
    useEffect(() => {
        if (!user) return;
        const orgId = (user as any).org_id || user.uid;

        const fetchInventory = async () => {
            // Basic fetch, ideally this belongs in a hook or context
            const { collection, query, where, getDocs } = await import('firebase/firestore');
            const q = query(
                collection(db, 'materials'),
                where('org_id', '==', orgId)
            );

            try {
                const snapshot = await getDocs(q);
                const items = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setInventory(items);
            } catch (err) {
                console.error("Error loading inventory:", err);
            }
        };
        fetchInventory();
    }, [user]);

    // Calculate totals
    const laborCost = laborHours * laborRate;
    const partsCost = partsItems.reduce((sum, p) => sum + (p.quantity * p.unitCost), 0);
    const mileageCost = mileage * mileageRate;
    const otherTotal = otherCosts.reduce((sum, o) => sum + o.amount, 0);
    const totalCost = laborCost + partsCost + mileageCost + otherTotal;

    // Estimated vs actual comparison
    const estimatedTotal = (job.estimated_duration || 60) / 60 * DEFAULT_HOURLY_RATE;
    const variance = totalCost - estimatedTotal;
    const variancePercent = estimatedTotal > 0 ? (variance / estimatedTotal) * 100 : 0;

    const addPartsItem = () => {
        setPartsItems([...partsItems, { name: '', quantity: 1, unitCost: 0 }]);
    };

    const updatePartsItem = (index: number, field: keyof typeof partsItems[0], value: any) => {
        const updated = [...partsItems];
        updated[index] = { ...updated[index], [field]: value };
        setPartsItems(updated);
    };

    const selectInventoryItem = (index: number, item: any) => {
        const updated = [...partsItems];
        updated[index] = {
            ...updated[index],
            name: item.name,
            unitCost: item.unit_cost || 0,
            material_id: item.id
        };
        setPartsItems(updated);
        setShowInventory(null);
    }

    const removePartsItem = (index: number) => {
        setPartsItems(partsItems.filter((_, i) => i !== index));
    };

    const addOtherCost = () => {
        setOtherCosts([...otherCosts, { description: '', amount: 0 }]);
    };

    const updateOtherCost = (index: number, field: keyof typeof otherCosts[0], value: any) => {
        const updated = [...otherCosts];
        updated[index] = { ...updated[index], [field]: value };
        setOtherCosts(updated);
    };

    const removeOtherCost = (index: number) => {
        setOtherCosts(otherCosts.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (!user) return;

        setSaving(true);

        try {
            const costsData = {
                labor: laborCost,
                parts: partsCost,
                mileage: mileageCost,
                other: otherTotal,
                total: totalCost
            };

            // Enhanced parts data saving (including item details)
            const partsData = {
                estimated: 0, // Placeholder
                actual: partsCost,
                items: partsItems
            };

            await updateDoc(doc(db, 'jobs', job.id), {
                costs: {
                    ...costsData,
                    parts: partsData // Saving the full parts object
                },
                // Flattened parts_used field specifically for the cloud function trigger if needed, 
                // but preserving the structure in 'costs' is cleaner.
                // We will read 'costs.parts.items' in the cloud function.
                mileage: mileage,
                actual_duration: Math.round(laborHours * 60),
                updatedAt: serverTimestamp()
            });

            if (onUpdate) {
                onUpdate(costsData);
            }
        } catch (error) {
            console.error('Error saving costs:', error);
            alert('Failed to save costs');
        }

        setSaving(false);
    };

    if (compact) {
        return (
            <div className="bg-white rounded-lg shadow p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-semibold">Job Costs</span>
                    </div>
                    <span className="font-bold text-green-600">${totalCost.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                    <div>Labor: ${laborCost.toFixed(2)}</div>
                    <div>Parts: ${partsCost.toFixed(2)}</div>
                    <div>Mileage: ${mileageCost.toFixed(2)}</div>
                    <div>Other: ${otherTotal.toFixed(2)}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900">Job Cost Tracking</h3>
                </div>
                {!readOnly && (
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-blue-50 rounded-lg p-3">
                    <div className="flex items-center gap-1 text-xs text-blue-600 mb-1">
                        <Clock className="w-3 h-3" /> Labor
                    </div>
                    <p className="text-lg font-bold text-blue-900">${laborCost.toFixed(2)}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3">
                    <div className="flex items-center gap-1 text-xs text-purple-600 mb-1">
                        <Package className="w-3 h-3" /> Parts
                    </div>
                    <p className="text-lg font-bold text-purple-900">${partsCost.toFixed(2)}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3">
                    <div className="flex items-center gap-1 text-xs text-orange-600 mb-1">
                        <Car className="w-3 h-3" /> Mileage
                    </div>
                    <p className="text-lg font-bold text-orange-900">${mileageCost.toFixed(2)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                    <div className="flex items-center gap-1 text-xs text-green-600 mb-1">
                        <DollarSign className="w-3 h-3" /> Total
                    </div>
                    <p className="text-lg font-bold text-green-900">${totalCost.toFixed(2)}</p>
                </div>
            </div>

            {/* Variance Indicator */}
            {estimatedTotal > 0 && (
                <div className={`mb-4 p-3 rounded-lg ${variance > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
                    }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {variance > 0 ? (
                                <TrendingUp className="w-5 h-5 text-red-500" />
                            ) : (
                                <TrendingDown className="w-5 h-5 text-green-500" />
                            )}
                            <span className={`text-sm font-medium ${variance > 0 ? 'text-red-700' : 'text-green-700'
                                }`}>
                                {variance > 0 ? 'Over Budget' : 'Under Budget'}
                            </span>
                        </div>
                        <div className="text-right">
                            <p className={`font-bold ${variance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                                {variance > 0 ? '+' : ''}${variance.toFixed(2)} ({variancePercent.toFixed(1)}%)
                            </p>
                            <p className="text-xs text-gray-500">
                                Est: ${estimatedTotal.toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Labor Section */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Labor
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Hours</label>
                        <input
                            type="number"
                            value={laborHours}
                            onChange={(e) => setLaborHours(parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.25"
                            disabled={readOnly}
                            className="w-full p-2 border rounded"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Rate ($/hr)</label>
                        <input
                            type="number"
                            value={laborRate}
                            onChange={(e) => setLaborRate(parseFloat(e.target.value) || 0)}
                            min="0"
                            disabled={readOnly}
                            className="w-full p-2 border rounded"
                        />
                    </div>
                </div>
            </div>

            {/* Parts Section */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-700 flex items-center gap-2">
                        <Package className="w-4 h-4" /> Parts Used
                    </h4>
                    {!readOnly && (
                        <button
                            onClick={addPartsItem}
                            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                            <Plus className="w-4 h-4" /> Add Part
                        </button>
                    )}
                </div>
                {partsItems.length === 0 ? (
                    <p className="text-sm text-gray-500">No parts recorded</p>
                ) : (
                    <div className="space-y-2">
                        {partsItems.map((item, index) => (
                            <div key={index} className="flex gap-2 items-start relative">
                                <div className="flex-1">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={item.name}
                                            onChange={(e) => updatePartsItem(index, 'name', e.target.value)}
                                            onFocus={() => setShowInventory(index)}
                                            placeholder="Part name"
                                            disabled={readOnly}
                                            className="w-full p-2 border rounded text-sm"
                                        />
                                        {/* Material ID indicator */}
                                        {item.material_id && (
                                            <span className="absolute right-2 top-2 text-xs text-green-600 font-medium" title="Linked to inventory">
                                                Linked
                                            </span>
                                        )}
                                        {/* Inventory Dropdown */}
                                        {showInventory === index && !readOnly && (
                                            <div className="absolute z-10 w-full bg-white border rounded shadow-lg mt-1 max-h-48 overflow-y-auto">
                                                <div className="p-2 border-b bg-gray-50 flex justify-between items-center">
                                                    <span className="text-xs text-gray-500">Inventory</span>
                                                    <button
                                                        onClick={() => setShowInventory(null)}
                                                        className="text-xs text-red-500 hover:text-red-700"
                                                    >
                                                        Close
                                                    </button>
                                                </div>
                                                {inventory.filter(i => i.name.toLowerCase().includes(item.name.toLowerCase())).length > 0 ? (
                                                    inventory.filter(i => i.name.toLowerCase().includes(item.name.toLowerCase())).map(invItem => (
                                                        <button
                                                            key={invItem.id}
                                                            className="w-full text-left p-2 hover:bg-blue-50 text-sm flex justify-between"
                                                            onClick={() => selectInventoryItem(index, invItem)}
                                                        >
                                                            <span>{invItem.name}</span>
                                                            <span className="text-gray-500 text-xs">${invItem.unit_cost?.toFixed(2) || '0.00'} | Qty: {invItem.quantity}</span>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="p-2 text-sm text-gray-400">No matching items</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updatePartsItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                    min="1"
                                    disabled={readOnly}
                                    className="w-16 p-2 border rounded text-sm"
                                    title="Qty"
                                />
                                <div className="relative">
                                    <DollarSign className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
                                    <input
                                        type="number"
                                        value={item.unitCost}
                                        onChange={(e) => updatePartsItem(index, 'unitCost', parseFloat(e.target.value) || 0)}
                                        min="0"
                                        step="0.01"
                                        disabled={readOnly}
                                        className="w-24 p-2 pl-6 border rounded text-sm"
                                        title="Cost"
                                    />
                                </div>
                                <span className="text-sm text-gray-600 w-20 text-right mt-2">
                                    ${(item.quantity * item.unitCost).toFixed(2)}
                                </span>
                                {!readOnly && (
                                    <button
                                        onClick={() => removePartsItem(index)}
                                        className="p-1 mt-2 text-gray-400 hover:text-red-600"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Mileage Section */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Car className="w-4 h-4" /> Mileage
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Miles</label>
                        <input
                            type="number"
                            value={mileage}
                            onChange={(e) => setMileage(parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.1"
                            disabled={readOnly}
                            className="w-full p-2 border rounded"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Rate ($/mile)</label>
                        <input
                            type="number"
                            value={mileageRate}
                            onChange={(e) => setMileageRate(parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                            disabled={readOnly}
                            className="w-full p-2 border rounded"
                        />
                    </div>
                </div>
            </div>

            {/* Other Costs Section */}
            <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-700 flex items-center gap-2">
                        <DollarSign className="w-4 h-4" /> Other Costs
                    </h4>
                    {!readOnly && (
                        <button
                            onClick={addOtherCost}
                            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                            <Plus className="w-4 h-4" /> Add
                        </button>
                    )}
                </div>
                {otherCosts.length === 0 ? (
                    <p className="text-sm text-gray-500">No other costs</p>
                ) : (
                    <div className="space-y-2">
                        {otherCosts.map((cost, index) => (
                            <div key={index} className="flex gap-2 items-center">
                                <input
                                    type="text"
                                    value={cost.description}
                                    onChange={(e) => updateOtherCost(index, 'description', e.target.value)}
                                    placeholder="Description"
                                    disabled={readOnly}
                                    className="flex-1 p-2 border rounded text-sm"
                                />
                                <div className="relative">
                                    <DollarSign className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
                                    <input
                                        type="number"
                                        value={cost.amount}
                                        onChange={(e) => updateOtherCost(index, 'amount', parseFloat(e.target.value) || 0)}
                                        min="0"
                                        step="0.01"
                                        disabled={readOnly}
                                        className="w-28 p-2 pl-6 border rounded text-sm"
                                    />
                                </div>
                                {!readOnly && (
                                    <button
                                        onClick={() => removeOtherCost(index)}
                                        className="p-1 text-gray-400 hover:text-red-600"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
