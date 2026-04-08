import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../auth/AuthProvider';
import { MaterialItem } from '../../types';
import { Vendor, PurchaseOrder, POItem } from '../../types/Vendor';
import { X, Building2, Package, Trash2, Send, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { determineOptimalVendor } from '../../utils/procurementLogic';

interface VendorOrderCartProps {
    isOpen: boolean;
    onClose: () => void;
    selectedMaterials: MaterialItem[];
}

export const VendorOrderCart: React.FC<VendorOrderCartProps> = ({ isOpen, onClose, selectedMaterials }) => {
    const { user } = useAuth();
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [fallbackVendorId, setFallbackVendorId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    
    // Grouped order items by Vendor ID
    const [groupedItems, setGroupedItems] = useState<Record<string, POItem[]>>({});
    
    // Fetch active vendors first
    useEffect(() => {
        const fetchVendors = async () => {
            if (!user?.org_id) return;
            try {
                const q = query(
                    collection(db, 'vendors'),
                    where('organizationId', '==', user.org_id),
                    where('active', '==', true)
                );
                const snapshot = await getDocs(q);
                const fetchedVendors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendor));
                fetchedVendors.sort((a, b) => a.name.localeCompare(b.name));
                setVendors(fetchedVendors);
                
                if (fetchedVendors.length > 0 && !fallbackVendorId) {
                    setFallbackVendorId(fetchedVendors[0].id!);
                }
            } catch (err) {
                console.error('Error fetching vendors:', err);
                toast.error('Failed to load vendors');
            } finally {
                setLoading(false);
            }
        };

        if (isOpen) {
            fetchVendors();
        }
    }, [isOpen, user?.org_id]);

    // Initialize grouped items once vendors map is available
    useEffect(() => {
        if (!isOpen || selectedMaterials.length === 0 || vendors.length === 0) {
            if (!isOpen) setGroupedItems({});
            return;
        }

        const groups: Record<string, POItem[]> = {};

        selectedMaterials.forEach(m => {
            const optimalVendorAssignment = determineOptimalVendor(m.vendors, vendors);
            let targetVendorId = 'UNASSIGNED';

            if (optimalVendorAssignment && optimalVendorAssignment.vendorId) {
                // Double check the vendor actually still exists and is active
                if (vendors.some(v => v.id === optimalVendorAssignment.vendorId)) {
                    targetVendorId = optimalVendorAssignment.vendorId;
                }
            }

            if (!groups[targetVendorId]) {
                groups[targetVendorId] = [];
            }

            const initialQty = Math.max(1, (m.minQuantity || 0) - m.quantity);
            const unitCost = optimalVendorAssignment?.unitCost ?? (m.unitCost || 0);

            groups[targetVendorId].push({
                materialId: m.id || '',
                name: m.name,
                sku: optimalVendorAssignment?.partNumber || m.sku || '',
                quantity: initialQty,
                unitPrice: unitCost,
                totalPrice: initialQty * unitCost
            });
        });

        setGroupedItems(groups);
    }, [isOpen, selectedMaterials, vendors]);

    if (!isOpen) return null;

    const handleQuantityChange = (vendorId: string, idx: number, newQty: number) => {
        if (newQty < 1) return;
        setGroupedItems(prev => {
            const updated = { ...prev };
            const item = updated[vendorId][idx];
            item.quantity = newQty;
            item.totalPrice = newQty * item.unitPrice;
            return updated;
        });
    };

    const handlePriceChange = (vendorId: string, idx: number, newPrice: number) => {
        if (newPrice < 0) return;
        setGroupedItems(prev => {
            const updated = { ...prev };
            const item = updated[vendorId][idx];
            item.unitPrice = newPrice;
            item.totalPrice = item.quantity * newPrice;
            return updated;
        });
    };

    const handleRemoveItem = (vendorId: string, idx: number) => {
        setGroupedItems(prev => {
            const updated = { ...prev };
            updated[vendorId].splice(idx, 1);
            if (updated[vendorId].length === 0) {
                delete updated[vendorId];
            }
            return updated;
        });
    };

    const getGroupSubtotal = (vendorId: string) => {
        return (groupedItems[vendorId] || []).reduce((sum, item) => sum + item.totalPrice, 0);
    };

    const getOverallTotals = () => {
        let subtotal = 0;
        Object.values(groupedItems).forEach(items => {
            subtotal += items.reduce((sum, item) => sum + item.totalPrice, 0);
        });
        const tax = subtotal * 0.08;
        return { subtotal, tax, total: subtotal + tax };
    };

    const { subtotal, tax, total } = getOverallTotals();

    const handleSubmitOrder = async () => {
        if (!user?.org_id) return;
        
        const groupKeys = Object.keys(groupedItems);
        if (groupKeys.length === 0) {
            toast.error('Order cart is empty');
            return;
        }

        if (groupedItems['UNASSIGNED'] && groupedItems['UNASSIGNED'].length > 0 && !fallbackVendorId) {
            toast.error('Please select a fallback vendor for unassigned items.');
            return;
        }

        setSubmitting(true);
        try {
            const promises = groupKeys.map(async vendorId => {
                const items = groupedItems[vendorId];
                if (!items || items.length === 0) return;

                // Resolve target vendor (unassigned objects use the fallback dropdown value)
                const targetId = vendorId === 'UNASSIGNED' ? fallbackVendorId : vendorId;
                const vendorObj = vendors.find(v => v.id === targetId);
                
                if (!vendorObj) throw new Error(`Target Vendor ID ${targetId} not found.`);

                const groupSub = items.reduce((s, i) => s + i.totalPrice, 0);
                const groupTax = groupSub * 0.08;

                const poData: Partial<PurchaseOrder> = {
                    organizationId: user.org_id,
                    vendorId: vendorObj.id!,
                    vendorName: vendorObj.name,
                    status: 'draft',
                    items,
                    subtotal: groupSub,
                    tax: groupTax,
                    shipping: 0,
                    total: groupSub + groupTax,
                    notes: vendorId === 'UNASSIGNED' ? 'Assigned via fallback.' : 'Auto-routed via priority rules.',
                    createdAt: serverTimestamp() as any,
                    createdBy: user.uid,
                    sentAt: null
                };

                await addDoc(collection(db, 'purchaseOrders'), poData);
            });

            await Promise.all(promises);
            
            toast.success(`Successfully generated ${groupKeys.length} Purchase Order(s)!`);
            onClose();
            
        } catch (err) {
            console.error('Error submitting order(s):', err);
            toast.error('Failed to create purchase order(s).');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            <Building2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">Smart Vendor Cart</h2>
                            <p className="text-sm text-gray-500">Items are automatically routed based on your Priority Rules.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto bg-gray-50">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full items-start">
                        {/* Left Column: Vendor Buckets */}
                        <div className="lg:col-span-2 space-y-6">
                            {loading ? (
                                <div className="space-y-4">
                                    <div className="animate-pulse h-24 bg-gray-200 rounded-xl" />
                                    <div className="animate-pulse h-24 bg-gray-200 rounded-xl" />
                                </div>
                            ) : Object.keys(groupedItems).length === 0 ? (
                                <div className="p-8 text-center text-gray-500 bg-white rounded-xl border">
                                    No materials selected in cart.
                                </div>
                            ) : (
                                Object.keys(groupedItems).map(vId => {
                                    const items = groupedItems[vId];
                                    const isUnassigned = vId === 'UNASSIGNED';
                                    const vendorObj = vendors.find(v => v.id === vId);
                                    
                                    return (
                                        <div key={vId} className={`rounded-xl shadow-sm border overflow-hidden ${isUnassigned ? 'bg-amber-50/50 border-amber-200' : 'bg-white'}`}>
                                            <div className={`p-4 border-b flex items-center justify-between ${isUnassigned ? 'bg-amber-100/50' : 'bg-gray-50'}`}>
                                                <div>
                                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                                        {isUnassigned ? <AlertCircle className="w-4 h-4 text-amber-600" /> : <Package className="w-4 h-4 text-blue-600" />}
                                                        {isUnassigned ? 'Unassigned Items' : vendorObj?.name || 'Unknown Vendor'}
                                                    </h3>
                                                    {!isUnassigned && vendorObj?.accountNumber && (
                                                        <p className="text-xs text-gray-500 mt-0.5">Acct: {vendorObj.accountNumber}</p>
                                                    )}
                                                </div>
                                                <div className="text-right font-medium text-gray-900">
                                                    ${getGroupSubtotal(vId).toFixed(2)}
                                                </div>
                                            </div>

                                            {isUnassigned && (
                                                <div className="p-4 bg-amber-50 border-b border-amber-100">
                                                    <label className="block text-sm font-medium text-amber-900 mb-2">
                                                        Fallback Vendor Required for these Items *
                                                    </label>
                                                    <select
                                                        value={fallbackVendorId}
                                                        onChange={(e) => setFallbackVendorId(e.target.value)}
                                                        className="w-full border-amber-200 rounded-lg p-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                                                    >
                                                        <option value="" disabled>Select fallback vendor...</option>
                                                        {vendors.map(v => (
                                                            <option key={v.id} value={v.id}>{v.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            <div className="divide-y max-h-80 overflow-y-auto">
                                                {items.map((item, idx) => (
                                                    <div key={idx} className="p-4 flex items-center justify-between gap-4 bg-white/50">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 truncate">{item.name}</p>
                                                            <p className="text-xs text-gray-500 truncate">SKU/Part: {item.sku || 'N/A'}</p>
                                                        </div>
                                                        
                                                        <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
                                                            <div className="flex items-center gap-2">
                                                                <label className="text-xs text-gray-500">Qty:</label>
                                                                <input 
                                                                    type="number"
                                                                    min="1"
                                                                    value={item.quantity}
                                                                    onChange={(e) => handleQuantityChange(vId, idx, parseInt(e.target.value) || 1)}
                                                                    className="w-16 border border-gray-300 rounded p-1 text-center"
                                                                />
                                                            </div>
                                                            
                                                            <div className="flex items-center gap-2">
                                                                <label className="text-xs text-gray-500">Price:</label>
                                                                <div className="relative">
                                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                                                    <input 
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.01"
                                                                        value={item.unitPrice}
                                                                        onChange={(e) => handlePriceChange(vId, idx, parseFloat(e.target.value) || 0)}
                                                                        className="w-24 pl-5 border border-gray-300 rounded p-1"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="w-20 text-right font-medium text-gray-900">
                                                                ${item.totalPrice.toFixed(2)}
                                                            </div>
                                                            
                                                            <button onClick={() => handleRemoveItem(vId, idx)} className="text-gray-400 hover:text-red-500 p-1 bg-white rounded-full transition-colors border shadow-sm">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Right Column: Master Order Summary */}
                        <div className="bg-white rounded-xl shadow-sm border p-5 flex flex-col sticky top-0">
                            <h3 className="font-medium text-gray-900 mb-4">Master Order Summary</h3>
                            
                            <div className="space-y-3 text-sm text-gray-600 mb-6 flex-1">
                                <div className="flex justify-between">
                                    <span>Total Draft POs</span>
                                    <span className="font-medium">{Object.keys(groupedItems).length}</span>
                                </div>
                                <div className="pt-3 border-t"></div>
                                <div className="flex justify-between">
                                    <span>Subtotal</span>
                                    <span>${subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Estimated Tax (8%)</span>
                                    <span>${tax.toFixed(2)}</span>
                                </div>
                                <div className="pt-3 border-t flex justify-between font-semibold text-xl text-gray-900">
                                    <span>Total</span>
                                    <span>${total.toFixed(2)}</span>
                                </div>
                            </div>

                            <button
                                onClick={handleSubmitOrder}
                                disabled={submitting || Object.keys(groupedItems).length === 0}
                                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Generate {Object.keys(groupedItems).length} PO(s)
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-gray-500 text-center mt-3">
                                Draft POs are generated for each assigned vendor.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
