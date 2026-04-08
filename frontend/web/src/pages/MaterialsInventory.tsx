import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { MaterialItem, AIIdentifiedMaterial } from '../types';
import {
    Package,
    Plus,
    Minus,
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
    DollarSign,
    Hash,
    Camera,
    Bell,
    Settings,
    Building2,
    History as HistoryIcon,
    Sparkles,
    Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PhotoUploadModal } from '../components/PhotoUploadModal';
import { MaterialsReviewModal } from '../components/MaterialsReviewModal';
import { StockAlertsModal } from '../components/inventory/StockAlertsModal';
import { ManageLocationsModal, DEFAULT_LOCATIONS } from '../components/inventory/ManageLocationsModal';
import { ManageVendorsModal } from '../components/inventory/ManageVendorsModal';
import { VendorOrderCart } from '../components/inventory/VendorOrderCart';
import { uploadPhotos, identifyMaterials as identifyMaterialsAI, batchCreateMaterials, resolveCatalogItem } from '../lib/aiMaterialsService';
import { getDoc } from 'firebase/firestore';
import { determineOptimalVendor } from '../utils/procurementLogic';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { getDefaultInventorySettings } from '../utils/defaultInventoryCategories';



const UNITS = ['each', 'box', 'case', 'ft', 'lb', 'gal', 'other'];

import { Vendor } from '../types/Vendor';
import { VendorAssignment, InventoryCategory } from '../types';

interface AddMaterialModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (material: Partial<MaterialItem>) => void;
    editMaterial?: MaterialItem | null;
    locations: string[];
    onAddNewLocation: () => void;
    materialCategories: InventoryCategory[];
}

const AddMaterialModal: React.FC<AddMaterialModalProps> = ({ isOpen, onClose, onSave, editMaterial, locations, onAddNewLocation, materialCategories }) => {
    const { user } = useAuth();
    const [selectedFormCategory, setSelectedFormCategory] = useState<string>('');
    const [availableVendors, setAvailableVendors] = useState<Vendor[]>([]);

    useEffect(() => {
        if (!isOpen || !user?.org_id) return;
        const q = query(collection(db, 'vendors'), where('organizationId', '==', user.org_id));
        const unsub = onSnapshot(q, snap => {
            const v = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vendor[];
            v.sort((a,b) => a.name.localeCompare(b.name));
            setAvailableVendors(v);
        });
        return () => unsub();
    }, [isOpen, user?.org_id]);

    const [formData, setFormData] = useState<Partial<MaterialItem>>({
        name: '',
        sku: '',
        description: '',
        category: '',
        quantity: 0,
        minQuantity: 5,
        unit: 'each',
        unitCost: 0,
        unitPrice: 0,
        taxable: true,
        location: 'truck',
        supplier: '',
        vendors: [],
        binLocation: '',
        imageUrl: ''
    });

    useEffect(() => {
        if (editMaterial) {
            setFormData({
                ...editMaterial,
                vendors: editMaterial.vendors || []
            });
            setSelectedFormCategory(editMaterial.category || materialCategories[0]?.id || '');
        } else {
            setFormData({
                name: '',
                sku: '',
                description: '',
                category: materialCategories[0]?.id || '',
                quantity: 0,
                minQuantity: 5,
                unit: 'each',
                unitCost: 0,
                unitPrice: 0,
                taxable: true,
                location: locations[0] || 'Truck',
                supplier: '',
                vendors: [],
                binLocation: '',
                imageUrl: ''
            });
        }
    }, [editMaterial, isOpen]);

    const [catalogLoading, setCatalogLoading] = useState(false);
    const [vendorPriceLoading, setVendorPriceLoading] = useState<string | null>(null);
    const [aiMatchResults, setAiMatchResults] = useState<{ [vendorId: string]: any[] }>({});

    const handleAutoFetchVendorPrice = async (vendorName: string, vendorId: string) => {
        if (!formData.name || !vendorName) return;
        
        setVendorPriceLoading(vendorId);
        try {
            const searchFn = httpsCallable(functions, 'searchVendorCatalog');
            const result = await searchFn({ vendorName, searchTerm: formData.name });
            const data = result.data as { success: boolean, products: any[] };
            
            if (data.success && data.products && data.products.length > 0) {
                setAiMatchResults(prev => ({ ...prev, [vendorId]: data.products }));
                toast.success(`Found ${data.products.length} potential matches from ${vendorName}.`);
            } else {
                toast.error(`Could not find "${formData.name}" directly from ${vendorName}.`);
                setAiMatchResults(prev => ({ ...prev, [vendorId]: [] }));
            }
        } catch (error: any) {
            console.error('Failed to fetch pricing:', error);
            toast.error('Search failed: ' + error.message);
        } finally {
            setVendorPriceLoading(null);
        }
    };

    const handleAutoFill = async () => {
        if (!formData.name) return;
        setCatalogLoading(true);
        try {
            const catalogData = await resolveCatalogItem(formData.name, 'material');
            setFormData(prev => ({
                ...prev,
                suggestedUsage: catalogData.suggestedUsage,
                imageUrl: catalogData.imageUrl || prev.imageUrl,
                unitCost: catalogData.estimatedCost || prev.unitCost
            }));
        } catch (error) {
            console.error('Failed to auto-fill from catalog:', error);
        } finally {
            setCatalogLoading(false);
        }
    };

    const handleEvaluateVendor = async () => {
        if (!formData.name || !formData.vendors || formData.vendors.length === 0) {
            toast.error('Please assign at least one vendor first and ensure the material has a name.');
            return;
        }
        
        const toastId = toast.loading('Evaluating best vendor...');
        try {
            const evalFn = httpsCallable(functions, 'evaluateVendorPreference');
            const dataToPass = {
                materialName: formData.name,
                preference: formData.globalVendorPreference || 'lowest_price',
                vendors: formData.vendors,
            };
            const result = await evalFn(dataToPass);
            const data = result.data as { success: boolean, winningVendorId: string, reason: string };
            
            if (data.success && data.winningVendorId) {
                const winningVendor = formData.vendors.find(v => v.vendorId === data.winningVendorId);
                setFormData(prev => ({
                    ...prev,
                    preferredVendorId: data.winningVendorId,
                    preferredVendorReason: data.reason,
                    unitCost: winningVendor?.unitCost || prev.unitCost, // Update cost to winner's cost
                    priceLastUpdated: new Date() // Record the new price sync operation
                }));
                toast.success('Evaluation complete! Best vendor selected.', { id: toastId });
            } else {
                toast.error('Evaluation failed to determine a winner.', { id: toastId });
            }
        } catch (error: any) {
            console.error('Failed to evaluate vendor:', error);
            toast.error('Evaluation failed: ' + error.message, { id: toastId });
        }
    };

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
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="flex-1 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="e.g., 1/2 inch Copper Elbow"
                                />
                                <button
                                    type="button"
                                    onClick={handleAutoFill}
                                    disabled={!formData.name || catalogLoading}
                                    className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                                >
                                    {catalogLoading ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                    ) : (
                                        <div className="text-xl leading-none">✨</div>
                                    )}
                                    Auto-fill
                                </button>
                            </div>
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
                                onChange={(e) => {
                                    setFormData({ ...formData, category: e.target.value, subcategory: '' });
                                    setSelectedFormCategory(e.target.value);
                                }}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                {materialCategories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Subcategory
                            </label>
                            <select
                                value={formData.subcategory || ''}
                                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="">None</option>
                                {(materialCategories.find(c => c.id === (selectedFormCategory || formData.category))?.subcategories || []).map(sub => (
                                    <option key={sub} value={sub}>{sub}</option>
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
                                value={formData.location || ''}
                                onChange={(e) => {
                                    if (e.target.value === '__add_new') {
                                        onAddNewLocation();
                                    } else {
                                        setFormData({ ...formData, location: e.target.value as string })
                                    }
                                }}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                {locations.map(loc => (
                                    <option key={loc} value={loc}>{loc}</option>
                                ))}
                                <option value="__add_new" className="font-bold text-blue-600">+ Add New Location...</option>
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

                    {/* Vendor Assignments */}
                    <div className="pt-4 border-t border-gray-100">
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-900 mb-1">
                                Global Vendor Preference (How should we source this?)
                            </label>
                            <select
                                value={formData.globalVendorPreference || 'lowest_price'}
                                onChange={(e) => setFormData({ ...formData, globalVendorPreference: e.target.value as any })}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50/30"
                            >
                                <option value="lowest_price">Lowest Price (Default)</option>
                                <option value="best_value">Best Value (Lowest Cost Per Unit/Highest Qty)</option>
                                <option value="longest_lasting">Longest Lasting (Best Quality/Reviews)</option>
                                <option value="fastest_shipping">Fastest Shipping</option>
                                <option value="closest_location">Closest Location</option>
                            </select>
                        </div>

                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-900 flex items-center gap-2">
                                Assigned Vendors
                                {formData.vendors && formData.vendors.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleEvaluateVendor}
                                        className="ml-2 px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs rounded-full font-medium flex items-center gap-1 transition-colors"
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        Evaluate Best Vendor
                                    </button>
                                )}
                            </label>
                            <button
                                type="button"
                                onClick={() => {
                                    if (availableVendors.length === 0) return alert("Please add vendors in Organization Settings first.");
                                    const newVendor: VendorAssignment = {
                                        vendorId: availableVendors[0].id || '',
                                        vendorName: availableVendors[0].name || '',
                                        priorityLogic: 'preferred'
                                    };
                                    setFormData(prev => ({ ...prev, vendors: [...(prev.vendors || []), newVendor] }));
                                }}
                                className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-700"
                            >
                                <Plus className="w-4 h-4" /> Add Vendor
                            </button>
                        </div>

                        <div className="space-y-3">
                            {formData.vendors?.length === 0 ? (
                                <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg text-center border border-dashed border-gray-200">
                                    No vendors assigned.
                                </div>
                            ) : (
                                formData.vendors?.map((v, index) => (
                                    <div key={index} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-200">
                                        <div className="col-span-12 space-y-3">
                                            <div className="grid grid-cols-12 gap-2 items-center">
                                                <div className="col-span-12 md:col-span-4">
                                                    <select
                                                        value={v.vendorId}
                                                        onChange={(e) => {
                                                            const selected = availableVendors.find(vend => vend.id === e.target.value);
                                                            const newVendors = [...formData.vendors!];
                                                            newVendors[index] = { ...v, vendorId: e.target.value, vendorName: selected?.name || '' };
                                                            setFormData({ ...formData, vendors: newVendors });
                                                        }}
                                                        className="w-full border border-gray-300 rounded text-sm p-1.5 focus:ring-1 focus:ring-blue-500"
                                                    >
                                                        {availableVendors.map(vend => (
                                                            <option key={vend.id} value={vend.id}>{vend.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                    {/* Removed priorityLogic dropdown */}
                                                <div className="col-span-12 md:col-span-7 flex items-center justify-end gap-2 text-sm text-gray-700 font-medium h-9">
                                                    Cost: ${(v.unitCost || 0).toFixed(2)}
                                                    {formData.preferredVendorId === v.vendorId && (
                                                        <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded font-bold border border-green-200">
                                                            ★ WINNER
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="col-span-2 md:col-span-1 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newVendors = formData.vendors!.filter((_, i) => i !== index);
                                                            setFormData({ ...formData, vendors: newVendors });
                                                        }}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Reason Area (If Winner) */}
                                            {formData.preferredVendorId === v.vendorId && formData.preferredVendorReason && (
                                                <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-800 mb-2">
                                                    <strong>Evaluation Reason:</strong> {formData.preferredVendorReason}
                                                </div>
                                            )}

                                            {/* Matches Area */}
                                            <div className="bg-white border rounded p-2 flex items-center justify-between text-sm">
                                                <div className="truncate pr-4 flex-1">
                                                    {v.vendorProductTitle ? (
                                                        <a href={v.vendorProductUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                                            ✓ {v.vendorProductTitle}
                                                        </a>
                                                    ) : (
                                                        <span className="text-gray-400 italic">No exact match selected</span>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleAutoFetchVendorPrice(v.vendorName || '', v.vendorId)}
                                                    disabled={vendorPriceLoading === v.vendorId}
                                                    className="shrink-0 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs flex items-center gap-1 font-medium"
                                                >
                                                    {vendorPriceLoading === v.vendorId ? <Loader2 className="w-3 h-3 animate-spin text-blue-500" /> : <Search className="w-3 h-3 text-blue-500" />}
                                                    Find Matches
                                                </button>
                                            </div>

                                            {/* Match Results Picker */}
                                            {aiMatchResults[v.vendorId] && aiMatchResults[v.vendorId].length > 0 && (
                                                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border border-blue-100 rounded-lg bg-blue-50/30 p-2">
                                                    <div className="text-xs font-semibold text-blue-800 uppercase px-1">Select Best Match</div>
                                                    {aiMatchResults[v.vendorId].map((product, pIdx) => {
                                                        const pPriceStr = product.price?.replace(/[^0-9.]/g, '');
                                                        const pVal = pPriceStr ? parseFloat(pPriceStr) : 0;
                                                        return (
                                                            <div key={pIdx} className="bg-white p-2 rounded border border-gray-200 flex items-start justify-between gap-3 text-sm">
                                                                <div className="flex-1">
                                                                    <div className="font-medium text-gray-900 line-clamp-2">{product.title}</div>
                                                                    <div className="text-gray-500 text-xs mt-0.5 line-clamp-1">{product.description || product.url}</div>
                                                                    <div className="text-green-700 font-semibold mt-1">${pVal > 0 ? pVal.toFixed(2) : '???'}</div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const newVendors = [...formData.vendors!];
                                                                        newVendors[index] = { 
                                                                            ...v, 
                                                                            unitCost: pVal, 
                                                                            vendorProductTitle: product.title, 
                                                                            vendorProductUrl: product.url 
                                                                        };
                                                                        setFormData({ ...formData, vendors: newVendors, priceLastUpdated: new Date() });
                                                                        setAiMatchResults(prev => ({ ...prev, [v.vendorId]: [] })); // Clear results
                                                                    }}
                                                                    className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
                                                                    disabled={pVal <= 0}
                                                                >
                                                                    Select
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Additional Info */}
                    <div className="grid grid-cols-1 gap-4">
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

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Image URL
                        </label>
                        <input
                            type="text"
                            value={formData.imageUrl || ''}
                            onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Optional image URL (https://...)"
                        />
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

const MaterialDetailsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    material: MaterialItem | null;
    onUpdateMaterial: (id: string, updates: Partial<MaterialItem>) => void;
}> = ({ isOpen, onClose, material, onUpdateMaterial }) => {
    const { user } = useAuth();
    const [loadingUsage, setLoadingUsage] = useState(false);
    
    useEffect(() => {
        if (isOpen && material && !material.suggestedUsage && user) {
            fetchUsage();
        }
    }, [isOpen, material]);

    const fetchUsage = async () => {
        if (!material || !user) return;
        setLoadingUsage(true);
        try {
            const catalogData = await resolveCatalogItem(material.name, 'material');
            onUpdateMaterial(material.id, { 
                suggestedUsage: catalogData.suggestedUsage,
                imageUrl: catalogData.imageUrl || material.imageUrl
            });
        } catch (error) {
            console.error('Error fetching usage:', error);
        } finally {
            setLoadingUsage(false);
        }
    };

    if (!isOpen || !material) return null;
    
    const imageUrl = material.imageUrl || material.aiMetadata?.photoUrl;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
                {imageUrl ? (
                    <div className="w-full h-64 bg-gray-100 flex items-center justify-center relative">
                        <img src={imageUrl} alt={material.name} className="w-full h-full object-contain" />
                        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/50 text-white hover:bg-black/70 rounded-full">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center justify-between p-4 border-b">
                        <h2 className="text-xl font-semibold px-2">{material.name}</h2>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}
                <div className="p-6">
                    {imageUrl && <h2 className="text-xl font-semibold mb-4">{material.name}</h2>}
                    
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Suggested Usage & Best Practices</h3>
                    {material.suggestedUsage ? (
                        <p className="text-gray-700 leading-relaxed text-sm">
                            {material.suggestedUsage}
                        </p>
                    ) : loadingUsage ? (
                        <div className="flex items-center gap-3 text-gray-500 text-sm py-4">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            Generating AI suggestions...
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm italic">No usage information available.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export const MaterialsInventory: React.FC = () => {
    const { user, organization } = useAuth();
    
    // Extracted Permission checks
    const userRole = (user as any)?.role;
    const userPermissions = (user as any)?.permissions;
    const canPurchaseMaterials = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canPurchaseMaterials ?? true);
    const canAddLocations = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canAddLocations ?? true);
    const canAddVendors = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canAddVendors ?? true);

    const orgSettings = (organization as any)?.inventorySettings || getDefaultInventorySettings((organization as any)?.businessProfile || 'general');
    const materialCategories = orgSettings.materialCategories;

    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [availableVendors, setAvailableVendors] = useState<Vendor[]>([]);

    useEffect(() => {
        if (!user?.org_id) return;
        const q = query(collection(db, 'vendors'), where('organizationId', '==', user.org_id));
        const unsub = onSnapshot(q, snap => {
            const v = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vendor[];
            v.sort((a,b) => a.name.localeCompare(b.name));
            setAvailableVendors(v);
        });
        return () => unsub();
    }, [user?.org_id]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [locationFilter, setLocationFilter] = useState<string>('all');
    const [showLowStockOnly, setShowLowStockOnly] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editMaterial, setEditMaterial] = useState<MaterialItem | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
    const [isManageLocationsModalOpen, setIsManageLocationsModalOpen] = useState(false);
    const [isManageVendorsModalOpen, setIsManageVendorsModalOpen] = useState(false);
    const [isVendorOrderCartOpen, setIsVendorOrderCartOpen] = useState(false);
    const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
    const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
    const [detailsItem, setDetailsItem] = useState<MaterialItem | null>(null);

    // AI Photo Upload States
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [identifiedItems, setIdentifiedItems] = useState<AIIdentifiedMaterial[]>([]);
    const [uploadedPhotos, setUploadedPhotos] = useState<File[]>([]);

    const handleQuickAdjust = async (material: MaterialItem, delta: number) => {
        try {
            const newQuantity = Math.max(0, material.quantity + delta);
            await updateDoc(doc(db, 'materials', material.id), {
                quantity: newQuantity,
                updatedAt: serverTimestamp()
            });
            // We use a silent update to avoid toast spam for quick clicks
        } catch (error) {
            console.error('Error updating quantity:', error);
            toast.error('Failed to update quantity');
        }
    };

    const syncAttemptedRef = useRef<Set<string>>(new Set());

    // Background catalog sync for missing data and price updates
    useEffect(() => {
        if (!materials.length || !user) return;
        
        const itemsToUpdate = materials.filter(m => {
            if (syncAttemptedRef.current.has(m.id)) return false;
            
            const needsCatalogSync = !m.suggestedUsage || 
                   m.suggestedUsage === "No usage information available." ||
                   !m.imageUrl;
                   
            const needsPriceSync = m.vendors && m.vendors.length > 0 && m.vendors.some(v => 
                (v.vendorProductTitle || v.vendorProductUrl) && 
                (!v.unitCost || v.unitCost === 0 || !m.priceLastUpdated)
            );
            
            return needsCatalogSync || needsPriceSync;
        });

        if (itemsToUpdate.length === 0) {
            console.log("No items to sync.");
            return;
        }

        console.log("Starting runSync for items:", itemsToUpdate.map(i => i.name));

        const runSync = async () => {
            for (const item of itemsToUpdate) {
                console.log("Syncing item:", item.name);
                syncAttemptedRef.current.add(item.id);
                try {
                    const updates: Partial<MaterialItem> = {};
                    let updatedVendors = item.vendors ? [...item.vendors] : [];
                    let vendorUpdated = false;

                    // 1. Sync catalog data if needed
                    if (!item.suggestedUsage || item.suggestedUsage === "No usage information available." || !item.imageUrl || (!item.unitCost || item.unitCost === 0)) {
                        const catalogData = await resolveCatalogItem(item.name, 'material');
                        if (catalogData.suggestedUsage && item.suggestedUsage !== catalogData.suggestedUsage) {
                            updates.suggestedUsage = catalogData.suggestedUsage;
                        }
                        if (catalogData.imageUrl && item.imageUrl !== catalogData.imageUrl) {
                            updates.imageUrl = catalogData.imageUrl;
                        }
                        if (catalogData.estimatedCost && (!item.unitCost || item.unitCost === 0)) {
                            updates.unitCost = catalogData.estimatedCost;
                            updates.priceLastUpdated = serverTimestamp();
                        }
                    }
                    
                    // 2. Sync vendor pricing ONLY for explicitly matched vendors
                    let priceSyncAttempted = false;
                    if (updatedVendors.length > 0) {
                        const searchFn = httpsCallable(functions, 'searchVendorCatalog');
                        for (let i = 0; i < updatedVendors.length; i++) {
                            const v = updatedVendors[i];
                            const hasExplicitMatch = v.vendorProductTitle || v.vendorProductUrl;
                            const needsUpdate = !v.unitCost || v.unitCost === 0 || !item.priceLastUpdated;
                            
                            if (v.vendorName && hasExplicitMatch && needsUpdate) {
                                priceSyncAttempted = true;
                                try {
                                    // Search using the explicitly matched title
                                    const searchTerm = v.vendorProductTitle || item.name;
                                    const result = await searchFn({ vendorName: v.vendorName, searchTerm });
                                    const data = result.data as { success: boolean, products: any[] };
                                    
                                    if (data.success && data.products && data.products.length > 0) {
                                        // Find exactly the product they matched
                                        const exactProduct = data.products.find(p => 
                                            (v.vendorProductUrl && p.url === v.vendorProductUrl) || 
                                            (v.vendorProductTitle && p.title === v.vendorProductTitle)
                                        );
                                        
                                        const productToUse = exactProduct || data.products[0]; // Fallback to first if exact URL changed but title matched
                                        
                                        const match = productToUse.price?.replace(/[^0-9.]/g, '');
                                        if (match) {
                                            const pVal = parseFloat(match);
                                            if (pVal > 0) {
                                                updatedVendors[i] = { ...v, unitCost: pVal };
                                                vendorUpdated = true;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error("Failed to sync vendor price for EXPLICIT match", item.name, v.vendorName, e);
                                }
                            }
                        }
                    }

                    if (vendorUpdated) {
                        updates.vendors = updatedVendors;
                        // Build a temporary material object for the optimal logic since it now accepts MaterialItem or assignments
                        // We pass the full item with updated vendors so global preferences are respected.
                        const tempMaterial = { ...item, vendors: updatedVendors };
                        const optimal = determineOptimalVendor(tempMaterial, availableVendors);
                        if (optimal && optimal.unitCost !== undefined) {
                            updates.unitCost = optimal.unitCost;
                        }
                    }

                    if (priceSyncAttempted) {
                        updates.priceLastUpdated = serverTimestamp();
                    }
                    
                    if (Object.keys(updates).length > 0) {
                        await updateDoc(doc(db, 'materials', item.id), updates);
                    }
                } catch (e) {
                    console.error("Background sync failed for", item.name, e);
                }
            }
        };

        runSync();
    }, [materials, user, availableVendors]);

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        const orgId = (user as any).org_id || user.uid;
        const techId = (user as any).role === 'technician' ? user.uid : undefined;

        // Load organization locations
        const loadLocations = async () => {
            try {
                const docSnap = await getDoc(doc(db, 'organizations', orgId));
                if (docSnap.exists() && docSnap.data().inventoryLocations) {
                    setLocations(docSnap.data().inventoryLocations);
                }
            } catch (e) {
                console.error("Error loading locations", e);
            }
        };
        loadLocations();

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
                location: locations[0] || 'Truck',
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
        if (locationFilter !== 'all' && m.location?.toLowerCase() !== locationFilter.toLowerCase()) return false;
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
                            onClick={() => setIsAlertsModalOpen(true)}
                            className="inline-flex items-center px-4 py-2 bg-white/50 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                        >
                            <Bell className="w-5 h-5 mr-2" />
                            Stock Alerts
                        </button>
                        {canPurchaseMaterials && (
                            <button
                                onClick={() => setIsPhotoModalOpen(true)}
                                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                            >
                                <Camera className="w-5 h-5 mr-2" />
                                Add from Photo
                            </button>
                        )}
                        {canPurchaseMaterials && (
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
                        )}
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
                                        {materialCategories.map((cat: any) => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
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

                {/* Location Navigation Tabs */}
                <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                    <button
                        onClick={() => setLocationFilter('all')}
                        className={`whitespace-nowrap px-4 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${locationFilter === 'all' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                    >
                        {locationFilter === 'all' && <div className="w-1.5 h-1.5 rounded-full bg-white opacity-80" />}
                        All Locations
                    </button>
                    {locations.map((loc) => (
                        <button
                            key={loc}
                            onClick={() => setLocationFilter(loc)}
                            className={`whitespace-nowrap px-4 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 border ${locationFilter === loc ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'}`}
                        >
                            {locationFilter === loc && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                            {loc}
                        </button>
                    ))}
                    
                    <div className="h-6 w-px bg-gray-200 mx-1 flex-shrink-0"></div>
                    
                    {canAddLocations && (
                        <button
                            onClick={() => setIsManageLocationsModalOpen(true)}
                            className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-full font-medium text-sm text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 hover:shadow-sm"
                        >
                            <Settings className="w-4 h-4 text-gray-500" /> Manage Locations
                        </button>
                    )}
                    {canAddVendors && (
                        <button
                            onClick={() => setIsManageVendorsModalOpen(true)}
                            className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-full font-medium text-sm text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors hover:shadow-sm"
                        >
                            <Building2 className="w-4 h-4 text-blue-500" /> Manage Vendors
                        </button>
                    )}
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
                                        <th className="w-12 px-6 py-3">
                                            <input 
                                                type="checkbox"
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={filteredMaterials.length > 0 && selectedMaterialIds.size === filteredMaterials.length}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedMaterialIds(new Set(filteredMaterials.map(m => m.id!)));
                                                    } else {
                                                        setSelectedMaterialIds(new Set());
                                                    }
                                                }}
                                            />
                                        </th>
                                        <th className="w-16 px-6 py-3"></th>
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
                                        const category = materialCategories.find((c: any) => c.id === material.category);
                                        const displayLocation = locations.find(l => l.toLowerCase() === material.location?.toLowerCase()) || material.location;

                                        return (
                                            <tr key={material.id} className={isLowStock ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                                                <td className="px-6 py-4">
                                                    <input 
                                                        type="checkbox"
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        checked={selectedMaterialIds.has(material.id!)}
                                                        onChange={(e) => {
                                                            const newSet = new Set(selectedMaterialIds);
                                                            if (e.target.checked) {
                                                                newSet.add(material.id!);
                                                            } else {
                                                                newSet.delete(material.id!);
                                                            }
                                                            setSelectedMaterialIds(newSet);
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div 
                                                        onClick={() => {
                                                            setDetailsItem(material);
                                                            setIsDetailsModalOpen(true);
                                                        }}
                                                        className="w-20 h-20 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                                                    >
                                                        {material.imageUrl || material.aiMetadata?.photoUrl ? (
                                                            <img 
                                                                src={material.imageUrl || material.aiMetadata?.photoUrl} 
                                                                alt={material.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <Package className="w-8 h-8 text-gray-400" />
                                                        )}
                                                    </div>
                                                </td>
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
                                                        <div className="mt-1 flex flex-col gap-1">
                                                            
                                                            {determineOptimalVendor(material, availableVendors) && (
                                                                <div className="text-[11px] text-blue-700 font-medium bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100/50 inline-block w-fit">
                                                                    Supplier: {determineOptimalVendor(material, availableVendors)?.vendorName}
                                                                </div>
                                                            )}
                                                            
                                                                {isLowStock && (
                                                                    <div className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded inline-block w-fit border border-amber-100">
                                                                        Needs Restock
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800`}>
                                                        {category?.name || material.category}
                                                    </span>
                                                    {material.subcategory && (
                                                        <div className="mt-1 text-xs text-gray-500">
                                                            {material.subcategory}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleQuickAdjust(material, -1);
                                                            }}
                                                            className="w-7 h-7 rounded bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-600 transition-colors"
                                                            title="Decrease Stock"
                                                        >
                                                            <Minus className="w-4 h-4" />
                                                        </button>
                                                        <span className={`font-semibold w-8 text-center ${isLowStock ? 'text-amber-600' : 'text-gray-900'} cursor-pointer hover:bg-gray-100 rounded py-0.5`}
                                                              onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  openAdjustModal(material, 'correction');
                                                              }}
                                                              title="Manual Adjust"
                                                        >
                                                            {material.quantity}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleQuickAdjust(material, 1);
                                                            }}
                                                            className="w-7 h-7 rounded bg-green-50 hover:bg-green-100 flex items-center justify-center text-green-600 transition-colors"
                                                            title="Increase Stock"
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
                                                        {displayLocation}
                                                        {material.binLocation && (
                                                            <span className="text-gray-400">({material.binLocation})</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="text-sm">
                                                        <div className="text-gray-500">${(material.unitCost || 0).toFixed(2)} cost</div>
                                                        <div className="font-medium text-gray-900">${(material.unitPrice || 0).toFixed(2)} price</div>
                                                        {material.priceLastUpdated && (
                                                            <div className="text-[10.5px] text-gray-400 mt-0.5 whitespace-nowrap">
                                                                Updated: {new Date(material.priceLastUpdated?.toMillis ? material.priceLastUpdated.toMillis() : material.priceLastUpdated).toLocaleDateString()}
                                                            </div>
                                                        )}
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

            {/* Stock Alerts Modal */}
            <StockAlertsModal
                isOpen={isAlertsModalOpen}
                onClose={() => setIsAlertsModalOpen(false)}
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
                locations={locations}
                onAddNewLocation={() => setIsManageLocationsModalOpen(true)}
                materialCategories={materialCategories as any}
            />

            <ManageLocationsModal
                isOpen={isManageLocationsModalOpen}
                onClose={() => setIsManageLocationsModalOpen(false)}
                onLocationsUpdated={(newLocs) => setLocations(newLocs)}
            />

            {isManageVendorsModalOpen && (
                <ManageVendorsModal 
                    onClose={() => setIsManageVendorsModalOpen(false)}
                />
            )}

            {selectedMaterialIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-2xl border border-blue-200 p-2 flex items-center gap-4 z-40 px-6 animate-in slide-in-from-bottom-10 fade-in duration-200">
                    <span className="font-medium text-gray-700">{selectedMaterialIds.size} item(s) selected</span>
                    {canPurchaseMaterials && (
                        <button 
                            onClick={() => setIsVendorOrderCartOpen(true)} 
                            className="bg-blue-600 text-white px-4 py-2 rounded-full font-medium hover:bg-blue-700 shadow-sm transition-colors"
                        >
                            Create Purchase Order
                        </button>
                    )}
                    <button title="Clear selection" onClick={() => setSelectedMaterialIds(new Set())} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100">
                        <X className="w-5 h-5"/>
                    </button>
                </div>
            )}

            <VendorOrderCart
                isOpen={isVendorOrderCartOpen}
                onClose={() => {
                    setIsVendorOrderCartOpen(false);
                    setSelectedMaterialIds(new Set());
                }}
                selectedMaterials={materials.filter(m => selectedMaterialIds.has(m.id!))}
            />

            <MaterialDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => {
                    setIsDetailsModalOpen(false);
                    setDetailsItem(null);
                }}
                material={detailsItem}
                onUpdateMaterial={async (id, updates) => {
                    await updateDoc(doc(db, 'materials', id), updates);
                }}
            />
        </div>
    );
};
