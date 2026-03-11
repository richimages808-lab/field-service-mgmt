import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, increment } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { InventoryItem } from '../types';
import { Package, Plus, Minus, AlertTriangle, Search, Edit2, X, Check, Truck, Warehouse } from 'lucide-react';

interface PartsInventoryProps {
    jobId?: string; // If provided, shows usage mode for a specific job
    techId?: string; // Filter to specific tech's inventory
    onSelectPart?: (part: InventoryItem, quantity: number) => void;
    compact?: boolean;
}

const CATEGORIES = [
    'Filters',
    'Refrigerant',
    'Electrical',
    'Plumbing',
    'HVAC Components',
    'Tools',
    'Safety Equipment',
    'Fasteners',
    'Other'
];

export const PartsInventory: React.FC<PartsInventoryProps> = ({
    jobId,
    techId,
    onSelectPart,
    compact = false
}) => {
    const { user } = useAuth();
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('');
    const [showLowStock, setShowLowStock] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formSku, setFormSku] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formCategory, setFormCategory] = useState(CATEGORIES[0]);
    const [formQuantity, setFormQuantity] = useState(0);
    const [formMinQuantity, setFormMinQuantity] = useState(5);
    const [formUnitCost, setFormUnitCost] = useState(0);
    const [formUnitPrice, setFormUnitPrice] = useState(0);
    const [formLocation, setFormLocation] = useState('truck');

    const orgId = (user as any)?.org_id || 'demo-org';
    const currentTechId = techId || user?.uid;

    useEffect(() => {
        let inventoryQuery = query(
            collection(db, 'inventory'),
            where('org_id', '==', orgId)
        );

        // Filter by tech if specified or if user is a tech viewing their own inventory
        if (techId) {
            inventoryQuery = query(
                collection(db, 'inventory'),
                where('org_id', '==', orgId),
                where('tech_id', '==', techId)
            );
        }

        const unsubscribe = onSnapshot(inventoryQuery, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as InventoryItem));
            setInventory(items.sort((a, b) => a.name.localeCompare(b.name)));
            setLoading(false);
        }, (error) => {
            console.error('Error fetching inventory:', error);
            setLoading(false);
        });

        return unsubscribe;
    }, [orgId, techId]);

    const filteredInventory = inventory.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.sku?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = !filterCategory || item.category === filterCategory;
        const matchesLowStock = !showLowStock || item.quantity <= item.minQuantity;
        return matchesSearch && matchesCategory && matchesLowStock;
    });

    const lowStockItems = inventory.filter(item => item.quantity <= item.minQuantity);

    const resetForm = () => {
        setFormName('');
        setFormSku('');
        setFormDescription('');
        setFormCategory(CATEGORIES[0]);
        setFormQuantity(0);
        setFormMinQuantity(5);
        setFormUnitCost(0);
        setFormUnitPrice(0);
        setFormLocation('truck');
        setEditingItem(null);
        setShowAddForm(false);
    };

    const handleEdit = (item: InventoryItem) => {
        setEditingItem(item);
        setFormName(item.name);
        setFormSku(item.sku || '');
        setFormDescription(item.description || '');
        setFormCategory(item.category);
        setFormQuantity(item.quantity);
        setFormMinQuantity(item.minQuantity);
        setFormUnitCost(item.unitCost);
        setFormUnitPrice(item.unitPrice);
        setFormLocation(item.location || 'truck');
        setShowAddForm(true);
    };

    const handleSave = async () => {
        if (!formName.trim() || !user) return;

        setSaving(true);
        try {
            const itemData = {
                org_id: orgId,
                tech_id: currentTechId,
                name: formName.trim(),
                sku: formSku.trim() || null,
                description: formDescription.trim() || null,
                category: formCategory,
                quantity: formQuantity,
                minQuantity: formMinQuantity,
                unitCost: formUnitCost,
                unitPrice: formUnitPrice,
                location: formLocation
            };

            if (editingItem) {
                await updateDoc(doc(db, 'inventory', editingItem.id), {
                    ...itemData,
                    updatedAt: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, 'inventory'), {
                    ...itemData,
                    createdAt: serverTimestamp()
                });
            }
            resetForm();
        } catch (error) {
            console.error('Error saving inventory item:', error);
            alert('Failed to save item');
        }
        setSaving(false);
    };

    const handleQuantityChange = async (item: InventoryItem, delta: number) => {
        const newQuantity = Math.max(0, item.quantity + delta);
        try {
            await updateDoc(doc(db, 'inventory', item.id), {
                quantity: newQuantity,
                updatedAt: serverTimestamp(),
                ...(delta < 0 ? { lastUsed: serverTimestamp() } : { lastRestocked: serverTimestamp() })
            });

            // If this is for a job, record the usage
            if (jobId && delta < 0) {
                await addDoc(collection(db, 'inventory_usage'), {
                    org_id: orgId,
                    job_id: jobId,
                    item_id: item.id,
                    quantity: Math.abs(delta),
                    unitPrice: item.unitPrice,
                    total: Math.abs(delta) * item.unitPrice,
                    usedAt: serverTimestamp(),
                    usedBy: user?.uid
                });
            }
        } catch (error) {
            console.error('Error updating quantity:', error);
        }
    };

    if (compact) {
        return (
            <div className="bg-white rounded-lg shadow p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold">Parts</span>
                    </div>
                    {lowStockItems.length > 0 && (
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                            {lowStockItems.length} low
                        </span>
                    )}
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                    {filteredInventory.slice(0, 5).map(item => (
                        <div
                            key={item.id}
                            className="flex items-center justify-between text-sm p-1 hover:bg-gray-50 rounded cursor-pointer"
                            onClick={() => onSelectPart?.(item, 1)}
                        >
                            <span className={item.quantity <= item.minQuantity ? 'text-red-600' : ''}>
                                {item.name}
                            </span>
                            <span className="text-gray-500">{item.quantity}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Parts Inventory</h3>
                    {lowStockItems.length > 0 && (
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {lowStockItems.length} low stock
                        </span>
                    )}
                </div>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                    <Plus className="w-4 h-4" />
                    Add Item
                </button>
            </div>

            {/* Search and Filters */}
            <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search parts..."
                        className="w-full pl-9 pr-3 py-2 border rounded"
                    />
                </div>
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="p-2 border rounded"
                >
                    <option value="">All Categories</option>
                    {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
                <button
                    onClick={() => setShowLowStock(!showLowStock)}
                    className={`px-3 py-2 rounded text-sm ${
                        showLowStock ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                    }`}
                >
                    Low Stock
                </button>
            </div>

            {/* Add/Edit Form */}
            {showAddForm && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{editingItem ? 'Edit Item' : 'Add New Part'}</h4>
                        <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Part Name</label>
                            <input
                                type="text"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder="e.g., HVAC Filter 20x25"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                            <input
                                type="text"
                                value={formSku}
                                onChange={(e) => setFormSku(e.target.value)}
                                placeholder="Optional"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                            <select
                                value={formCategory}
                                onChange={(e) => setFormCategory(e.target.value)}
                                className="w-full p-2 border rounded"
                            >
                                {CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Current Qty</label>
                            <input
                                type="number"
                                value={formQuantity}
                                onChange={(e) => setFormQuantity(parseInt(e.target.value) || 0)}
                                min="0"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Min Qty (Alert)</label>
                            <input
                                type="number"
                                value={formMinQuantity}
                                onChange={(e) => setFormMinQuantity(parseInt(e.target.value) || 0)}
                                min="0"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                            <select
                                value={formLocation}
                                onChange={(e) => setFormLocation(e.target.value)}
                                className="w-full p-2 border rounded"
                            >
                                <option value="truck">Truck</option>
                                <option value="warehouse">Warehouse</option>
                                <option value="office">Office</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost ($)</label>
                            <input
                                type="number"
                                value={formUnitCost}
                                onChange={(e) => setFormUnitCost(parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Sell Price ($)</label>
                            <input
                                type="number"
                                value={formUnitPrice}
                                onChange={(e) => setFormUnitPrice(parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div className="col-span-2 md:col-span-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <input
                                type="text"
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                placeholder="Optional notes"
                                className="w-full p-2 border rounded"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={handleSave}
                            disabled={saving || !formName.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            {saving ? 'Saving...' : 'Save Item'}
                        </button>
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Inventory List */}
            {loading ? (
                <p className="text-gray-500 text-sm">Loading inventory...</p>
            ) : filteredInventory.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                    {searchTerm || filterCategory ? 'No matching items found.' : 'No inventory items yet.'}
                </p>
            ) : (
                <div className="space-y-2">
                    {filteredInventory.map(item => (
                        <div
                            key={item.id}
                            className={`p-3 rounded-lg border flex items-center justify-between ${
                                item.quantity <= item.minQuantity ? 'border-red-300 bg-red-50' : 'bg-white'
                            }`}
                        >
                            <div className="flex items-center gap-3 flex-1">
                                <div className={`p-2 rounded ${
                                    item.location === 'truck' ? 'bg-blue-100' : 'bg-gray-100'
                                }`}>
                                    {item.location === 'truck' ? (
                                        <Truck className="w-4 h-4 text-blue-600" />
                                    ) : (
                                        <Warehouse className="w-4 h-4 text-gray-600" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-gray-900">{item.name}</p>
                                        {item.sku && (
                                            <span className="text-xs text-gray-500">#{item.sku}</span>
                                        )}
                                        {item.quantity <= item.minQuantity && (
                                            <AlertTriangle className="w-4 h-4 text-red-500" />
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {item.category} | Cost: ${item.unitCost.toFixed(2)} | Sell: ${item.unitPrice.toFixed(2)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleQuantityChange(item, -1)}
                                        disabled={item.quantity <= 0}
                                        className="p-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <span className={`w-12 text-center font-medium ${
                                        item.quantity <= item.minQuantity ? 'text-red-600' : 'text-gray-900'
                                    }`}>
                                        {item.quantity}
                                    </span>
                                    <button
                                        onClick={() => handleQuantityChange(item, 1)}
                                        className="p-1 rounded bg-gray-100 hover:bg-gray-200"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>

                                {onSelectPart && (
                                    <button
                                        onClick={() => onSelectPart(item, 1)}
                                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                        Use
                                    </button>
                                )}

                                <button
                                    onClick={() => handleEdit(item)}
                                    className="p-1 text-gray-400 hover:text-blue-600"
                                    title="Edit"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Summary */}
            {!loading && filteredInventory.length > 0 && (
                <div className="mt-4 pt-4 border-t text-sm text-gray-500">
                    <div className="flex justify-between">
                        <span>{filteredInventory.length} items</span>
                        <span>
                            Total Value: ${filteredInventory.reduce((sum, i) => sum + (i.quantity * i.unitCost), 0).toFixed(2)}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
