import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { MaterialItem, AIIdentifiedMaterial } from '../types';
import {
    Package,
    Plus,
    Search,
    Filter,
    Truck,
    Warehouse,
    AlertTriangle,
    Edit2,
    Trash2,
    X,
    Save,
    ChevronDown,
    TrendingDown,
    DollarSign,
    Hash,
    Camera,
    History as HistoryIcon
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PhotoUploadModal } from '../components/PhotoUploadModal';
import { MaterialsReviewModal } from '../components/MaterialsReviewModal';
import { uploadPhotos, identifyMaterials as identifyMaterialsAI, batchCreateMaterials } from '../lib/aiMaterialsService';

const CATEGORIES = [
    { value: 'parts', label: 'Parts', color: 'bg-blue-100 text-blue-800' },
    { value: 'consumables', label: 'Consumables', color: 'bg-green-100 text-green-800' },
    { value: 'materials', label: 'Materials', color: 'bg-purple-100 text-purple-800' },
    { value: 'equipment', label: 'Equipment', color: 'bg-orange-100 text-orange-800' },
    { value: 'other', label: 'Other', color: 'bg-gray-100 text-gray-800' }
];

const LOCATIONS = [
    { value: 'truck', label: 'Truck', icon: Truck },
    { value: 'warehouse', label: 'Warehouse', icon: Warehouse },
    { value: 'supplier', label: 'At Supplier', icon: Package },
    { value: 'on_order', label: 'On Order', icon: Package }
];

const UNITS = ['each', 'box', 'case', 'ft', 'lb', 'gal', 'other'];

interface AddMaterialModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (material: Partial<MaterialItem>) => void;
    editMaterial?: MaterialItem | null;
}

const AddMaterialModal: React.FC<AddMaterialModalProps> = ({ isOpen, onClose, onSave, editMaterial }) => {
    const [formData, setFormData] = useState<Partial<MaterialItem>>({
        name: '',
        sku: '',
        description: '',
        category: 'parts',
        quantity: 0,
        minQuantity: 5,
        unit: 'each',
        unitCost: 0,
        unitPrice: 0,
        taxable: true,
        location: 'truck',
        supplier: '',
        binLocation: ''
    });

    useEffect(() => {
        if (editMaterial) {
            setFormData(editMaterial);
        } else {
            setFormData({
                name: '',
                sku: '',
                description: '',
                category: 'parts',
                quantity: 0,
                minQuantity: 5,
                unit: 'each',
                unitCost: 0,
                unitPrice: 0,
                taxable: true,
                location: 'truck',
                supplier: '',
                binLocation: ''
            });
        }
    }, [editMaterial, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-xl font-semibold">
                        {editMaterial ? 'Edit Material' : 'Add New Material'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Name *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., 1/2 inch Copper Elbow"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                SKU
                            </label>
                            <input
                                type="text"
                                value={formData.sku || ''}
                                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Optional SKU"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Category
                            </label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value as MaterialItem['category'] })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                {CATEGORIES.map(cat => (
                                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description
                        </label>
                        <textarea
                            value={formData.description || ''}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={2}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Optional description"
                        />
                    </div>

                    {/* Inventory */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Quantity
                            </label>
                            <input
                                type="number"
                                min="0"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Min Qty (Alert)
                            </label>
                            <input
                                type="number"
                                min="0"
                                value={formData.minQuantity}
                                onChange={(e) => setFormData({ ...formData, minQuantity: parseInt(e.target.value) || 0 })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Unit
                            </label>
                            <select
                                value={formData.unit}
                                onChange={(e) => setFormData({ ...formData, unit: e.target.value as MaterialItem['unit'] })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                {UNITS.map(unit => (
                                    <option key={unit} value={unit}>{unit}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Location
                            </label>
                            <select
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value as MaterialItem['location'] })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                {LOCATIONS.map(loc => (
                                    <option key={loc.value} value={loc.value}>{loc.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Pricing */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Unit Cost (Your Cost)
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.unitCost}
                                    onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
                                    className="w-full border border-gray-300 rounded-lg p-2.5 pl-7 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Unit Price (Customer Pays)
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.unitPrice}
                                    onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                                    className="w-full border border-gray-300 rounded-lg p-2.5 pl-7 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <div className="flex items-end">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.taxable}
                                    onChange={(e) => setFormData({ ...formData, taxable: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">Taxable</span>
                            </label>
                        </div>
                    </div>

                    {/* Additional Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Supplier
                            </label>
                            <input
                                type="text"
                                value={formData.supplier || ''}
                                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., Home Depot, Ferguson"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Bin Location
                            </label>
                            <input
                                type="text"
                                value={formData.binLocation || ''}
                                onChange={(e) => setFormData({ ...formData, binLocation: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., Truck Bin 3, A-12"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            {editMaterial ? 'Update' : 'Add Material'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export const MaterialsInventory: React.FC = () => {
    const { user } = useAuth();
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [locationFilter, setLocationFilter] = useState<string>('all');
    const [showLowStockOnly, setShowLowStockOnly] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editMaterial, setEditMaterial] = useState<MaterialItem | null>(null);
    const [showFilters, setShowFilters] = useState(false);

    // AI Photo Upload States
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [identifiedItems, setIdentifiedItems] = useState<AIIdentifiedMaterial[]>([]);
    const [uploadedPhotos, setUploadedPhotos] = useState<File[]>([]);

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        const orgId = (user as any).org_id || user.uid;
        const techId = (user as any).role === 'technician' ? user.uid : undefined;

        const q = query(
            collection(db, 'materials'),
            where('org_id', '==', orgId),
            orderBy('name')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as MaterialItem[];

            // Filter to tech's inventory if technician
            const filtered = techId
                ? items.filter(m => m.tech_id === techId || !m.tech_id)
                : items;

            setMaterials(filtered);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    const handleSaveMaterial = async (materialData: Partial<MaterialItem>) => {
        if (!user?.uid) return;

        try {
            const orgId = (user as any).org_id || user.uid;
            const now = serverTimestamp();

            if (editMaterial) {
                await updateDoc(doc(db, 'materials', editMaterial.id), {
                    ...materialData,
                    updatedAt: now
                });
            } else {
                await addDoc(collection(db, 'materials'), {
                    ...materialData,
                    org_id: orgId,
                    tech_id: (user as any).role === 'technician' ? user.uid : null,
                    createdAt: now,
                    updatedAt: now
                });
            }

            setIsAddModalOpen(false);
            setEditMaterial(null);
        } catch (error) {
            console.error('Error saving material:', error);
        }
    };

    const handleDeleteMaterial = async (id: string) => {
        if (!confirm('Are you sure you want to delete this material?')) return;

        try {
            await deleteDoc(doc(db, 'materials', id));
        } catch (error) {
            console.error('Error deleting material:', error);
        }
    };

    // Adjust Stock Modal State
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [adjustItem, setAdjustItem] = useState<MaterialItem | null>(null);
    const [adjustType, setAdjustType] = useState<'restock' | 'correction' | 'return'>('restock');
    const [adjustQuantity, setAdjustQuantity] = useState(0);
    const [adjustNotes, setAdjustNotes] = useState('');

    const openAdjustModal = (item: MaterialItem, type: 'restock' | 'correction' | 'return') => {
        setAdjustItem(item);
        setAdjustType(type);
        setAdjustQuantity(0);
        setAdjustNotes('');
        setIsAdjustModalOpen(true);
    };

    // History Modal State
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyItem, setHistoryItem] = useState<MaterialItem | null>(null);

    const handleStockAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid || !adjustItem) return;

        setLoading(true);
        try {
            const orgId = (user as any).org_id || user.uid;
            // Calculate delta based on type
            let delta = Math.abs(adjustQuantity);
            if (adjustType === 'correction' && adjustQuantity < 0) {
                // allow negative correction if entered directly
                delta = adjustQuantity;
            } else if (adjustType === 'return') {
                // Restocking from a return? Or returning to supplier?
                // Let's assume returning to supplier -> decrease stock
                // OR customer returned item -> increase stock.
                // Ambiguous. Let's simplify: 
                // Restock = Increase
                // Correction = +/-
                // Let's rely on the sign for correction, but Restock is always +, used elsewhere is -
            }

            // Simplified Logic:
            // Restock: +Qty
            // Correction: +/- Qty (User inputs signed int, or we provide toggle)
            // Let's strictly follow the UI: 
            // If type is 'restock', delta is positive.
            // If type is 'correction', we trust the input (can be negative).

            // Refined:
            let finalDelta = adjustQuantity;
            if (adjustType === 'restock') finalDelta = Math.abs(adjustQuantity);

            // 1. Create Transaction Record
            const transactionRef = doc(collection(db, 'inventory_transactions'));
            const transactionData = {
                id: transactionRef.id,
                org_id: orgId,
                item_id: adjustItem.id,
                type: adjustType,
                quantity_change: finalDelta,
                quantity_after: (adjustItem.quantity || 0) + finalDelta,
                notes: adjustNotes,
                performed_by: user.uid,
                createdAt: serverTimestamp()
            };

            // 2. Update Inventory Item
            const itemRef = doc(db, 'materials', adjustItem.id);

            // Execute as Batch
            // Note: firestore batch or runTransaction is better, but allow separate writes for now as types might be tricky with raw SDK
            // We'll use runTransaction to be safe if possible, or just sequential awaits
            await addDoc(collection(db, 'inventory_transactions'), transactionData);
            await updateDoc(itemRef, {
                quantity: (adjustItem.quantity || 0) + finalDelta,
                updatedAt: serverTimestamp()
            });

            toast.success('Stock adjusted successfully');
            setIsAdjustModalOpen(false);
        } catch (error) {
            console.error('Error adjusting stock:', error);
            toast.error('Failed to adjust stock');
        } finally {
            setLoading(false);
        }
    };

    // AI Photo Upload Handlers
    const handlePhotosSelected = (photos: File[]) => {
        setUploadedPhotos(photos);
    };

    const handleIdentifyMaterials = async (photoUrls: string[]) => {
        if (!user?.uid) return;

        const orgId = (user as any).org_id || user.uid;

        try {
            // Upload photos to Firebase Storage
            const uploadedUrls = await uploadPhotos(uploadedPhotos, orgId, 'materials');

            // Call AI to identify materials
            const identified = await identifyMaterialsAI(uploadedUrls, orgId, 'materials');

            // Set identified items and open review modal
            setIdentifiedItems(identified as AIIdentifiedMaterial[]);
            setIsPhotoModalOpen(false);
            setIsReviewModalOpen(true);
        } catch (error) {
            console.error('Error identifying materials:', error);
            alert('Failed to identify materials from photos. Please try again.');
        }
    };

    const handleSaveIdentifiedMaterials = async (items: AIIdentifiedMaterial[]) => {
        if (!user?.uid) return;

        const orgId = (user as any).org_id || user.uid;
        const techId = (user as any).role === 'technician' ? user.uid : undefined;

        try {
            // Convert AI identified items to MaterialItem format
            const materialsToCreate = items.map(item => ({
                name: item.name,
                sku: item.suggestedSKU || '',
                description: item.notes || '',
                category: item.category,
                quantity: item.quantity,
                minQuantity: 5,
                unit: item.unit as any,
                unitCost: item.suggestedUnitCost || 0,
                unitPrice: item.suggestedUnitPrice || 0,
                taxable: true,
                location: 'truck' as any,
                supplier: '',
                binLocation: '',
                aiMetadata: {
                    identifiedFromPhoto: true,
                    photoUrl: item.photoUrl,
                    confidence: item.confidence,
                    originalAIName: item.name,
                    manuallyEdited: false,
                    identifiedAt: serverTimestamp()
                }
            }));

            // Batch create materials
            await batchCreateMaterials(materialsToCreate, orgId, user.uid, techId);

            // Close modal and reset state
            setIsReviewModalOpen(false);
            setIdentifiedItems([]);
            setUploadedPhotos([]);

            alert(`Successfully added ${items.length} material${items.length !== 1 ? 's' : ''}!`);
        } catch (error) {
            console.error('Error saving materials:', error);
            throw error;
        }
    };

    // Filter materials
    const filteredMaterials = materials.filter(m => {
        if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !(m.sku?.toLowerCase().includes(searchQuery.toLowerCase()))) {
            return false;
        }
        if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
        if (locationFilter !== 'all' && m.location !== locationFilter) return false;
        if (showLowStockOnly && m.quantity >= (m.minQuantity || 0)) return false;
        return true;
    });

    const lowStockCount = materials.filter(m => m.quantity < (m.minQuantity || 0)).length;
    const totalValue = materials.reduce((sum, m) => sum + (m.quantity * (m.unitCost || 0)), 0);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Materials Inventory</h1>
                        <p className="text-gray-500 mt-1">
                            {materials.length} items • ${totalValue.toFixed(2)} total value
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsPhotoModalOpen(true)}
                            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                        >
                            <Camera className="w-5 h-5 mr-2" />
                            Add from Photo
                        </button>
                        <button
                            onClick={() => {
                                setEditMaterial(null);
                                setIsAddModalOpen(true);
                            }}
                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                        >
                            <Plus className="w-5 h-5 mr-2" />
                            Add Material
                        </button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-4 shadow-sm border">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Package className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Items</p>
                                <p className="text-xl font-semibold">{materials.length}</p>
                            </div>
                        </div>
                    </div>

                    <div className={`rounded-xl p-4 shadow-sm border ${lowStockCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${lowStockCount > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
                                <AlertTriangle className={`w-5 h-5 ${lowStockCount > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Low Stock</p>
                                <p className="text-xl font-semibold">{lowStockCount}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <DollarSign className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Inventory Value</p>
                                <p className="text-xl font-semibold">${totalValue.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search and Filters */}
                <div className="bg-white rounded-xl shadow-sm border mb-6">
                    <div className="p-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search by name or SKU..."
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`inline-flex items-center px-4 py-2 border rounded-lg font-medium ${showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                <Filter className="w-4 h-4 mr-2" />
                                Filters
                                <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        {showFilters && (
                            <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                    <select
                                        value={categoryFilter}
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="all">All Categories</option>
                                        {CATEGORIES.map(cat => (
                                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                                    <select
                                        value={locationFilter}
                                        onChange={(e) => setLocationFilter(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="all">All Locations</option>
                                        {LOCATIONS.map(loc => (
                                            <option key={loc.value} value={loc.value}>{loc.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-end">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={showLowStockOnly}
                                            onChange={(e) => setShowLowStockOnly(e.target.checked)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700">Low Stock Only</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Materials Table */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {filteredMaterials.length === 0 ? (
                        <div className="text-center py-12">
                            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">No materials found</p>
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
                            >
                                Add your first material
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                                            Material
                                        </th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                                            Category
                                        </th>
                                        <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                                            Qty
                                        </th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                                            Location
                                        </th>
                                        <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                                            Cost / Price
                                        </th>
                                        <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredMaterials.map(material => {
                                        const isLowStock = material.quantity < (material.minQuantity || 0);
                                        const category = CATEGORIES.find(c => c.value === material.category);
                                        const location = LOCATIONS.find(l => l.value === material.location);

                                        return (
                                            <tr key={material.id} className={isLowStock ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                                                <td className="px-6 py-4">
                                                    <div>
                                                        <div className="font-medium text-gray-900 flex items-center gap-2">
                                                            {material.name}
                                                            {isLowStock && (
                                                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                            )}
                                                        </div>
                                                        {material.sku && (
                                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                                <Hash className="w-3 h-3" />
                                                                {material.sku}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${category?.color}`}>
                                                        {category?.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => openAdjustModal(material, 'correction')}
                                                            className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                                                            title="Adjust / Correct"
                                                        >
                                                            <Edit2 className="w-3 h-3" />
                                                        </button>
                                                        <span className={`font-semibold min-w-[3rem] text-center ${isLowStock ? 'text-amber-600' : 'text-gray-900'}`}>
                                                            {material.quantity}
                                                        </span>
                                                        <button
                                                            onClick={() => openAdjustModal(material, 'restock')}
                                                            className="w-7 h-7 rounded bg-green-100 hover:bg-green-200 flex items-center justify-center text-green-600"
                                                            title="Restock"
                                                        >
                                                            <Plus className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    <div className="text-xs text-gray-400 text-center mt-1">
                                                        min: {material.minQuantity || 0} {material.unit || 'each'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                                        {location && <location.icon className="w-4 h-4" />}
                                                        {location?.label}
                                                        {material.binLocation && (
                                                            <span className="text-gray-400">({material.binLocation})</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="text-sm">
                                                        <div className="text-gray-500">${(material.unitCost || 0).toFixed(2)} cost</div>
                                                        <div className="font-medium text-gray-900">${(material.unitPrice || 0).toFixed(2)} price</div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setHistoryItem(material);
                                                                setIsHistoryModalOpen(true);
                                                            }}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                            title="View History"
                                                        >
                                                            <HistoryIcon className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditMaterial(material);
                                                                setIsAddModalOpen(true);
                                                            }}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                            title="Edit Details"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteMaterial(material.id)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* AI Photo Upload Modal */}
            <PhotoUploadModal
                isOpen={isPhotoModalOpen}
                onClose={() => {
                    setIsPhotoModalOpen(false);
                    setUploadedPhotos([]);
                }}
                onPhotosSelected={handlePhotosSelected}
                onIdentify={handleIdentifyMaterials}
                type="materials"
            />

            {/* AI Materials Review Modal */}
            <MaterialsReviewModal
                isOpen={isReviewModalOpen}
                onClose={() => {
                    setIsReviewModalOpen(false);
                    setIdentifiedItems([]);
                }}
                items={identifiedItems}
                type="materials"
                onSave={handleSaveIdentifiedMaterials}
            />

            {/* Add Material Modal */}
            <AddMaterialModal
                isOpen={isAddModalOpen}
                onClose={() => {
                    setIsAddModalOpen(false);
                    setEditMaterial(null);
                }}
                onSave={handleSaveMaterial}
                editMaterial={editMaterial}
            />
        </div>
    );
};
