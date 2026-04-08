/**
 * ToolsInventory - Tools management page with AI photo identification
 * 
 * Similar to MaterialsInventory but for managing tools and equipment.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    Wrench,
    Plus,
    Search,
    Filter,
    Edit2,
    Trash2,
    Camera,
    AlertTriangle,
    CheckCircle,
    XCircle,
    MapPin,
    X,
    Sparkles,
    Loader2,
    DollarSign
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import {
    collection,
    query,
    where,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { ToolItem, AIIdentifiedTool, VendorAssignment } from '../types';
import { Vendor } from '../types/Vendor';
import { PhotoUploadModal } from '../components/PhotoUploadModal';
import { MaterialsReviewModal } from '../components/MaterialsReviewModal';
import { uploadPhotos, identifyMaterials, resolveCatalogItem } from '../lib/aiMaterialsService';
import { determineOptimalVendor } from '../utils/procurementLogic';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { getDefaultInventorySettings } from '../utils/defaultInventoryCategories';

// Category options for tools (matches ToolItem type)
const TOOL_CATEGORIES: Array<{ value: ToolItem['category']; label: string }> = [
    { value: 'hand_tool', label: 'Hand Tools' },
    { value: 'power_tool', label: 'Power Tools' },
    { value: 'diagnostic', label: 'Diagnostic Equipment' },
    { value: 'safety', label: 'Safety Equipment' },
    { value: 'specialized', label: 'Specialty Tools' },
    { value: 'other', label: 'Other' }
];

// Condition options (matches ToolItem type)
const CONDITIONS: Array<{ value: ToolItem['condition']; label: string }> = [
    { value: 'excellent', label: 'Excellent' },
    { value: 'good', label: 'Good' },
    { value: 'fair', label: 'Fair' },
    { value: 'needs_replacement', label: 'Needs Replacement' }
];

const STATUSES: Array<{ value: ToolItem['status']; label: string }> = [
    { value: 'available', label: 'Available' },
    { value: 'in_use', label: 'In Use' },
    { value: 'missing', label: 'Missing' },
    { value: 'maintenance', label: 'In Maintenance' }
];

const ToolDetailsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    tool: ToolItem | null;
    onUpdateTool: (id: string, updates: Partial<ToolItem>) => void;
}> = ({ isOpen, onClose, tool, onUpdateTool }) => {
    const { user } = useAuth();
    const [loadingUsage, setLoadingUsage] = useState(false);
    
    useEffect(() => {
        if (isOpen && tool && !tool.suggestedUsage && user) {
            fetchUsage();
        }
    }, [isOpen, tool]);

    const fetchUsage = async () => {
        if (!tool || !user) return;
        setLoadingUsage(true);
        try {
            const catalogData = await resolveCatalogItem(tool.name, 'tool');
            onUpdateTool(tool.id, { 
                suggestedUsage: catalogData.suggestedUsage,
                imageUrl: catalogData.imageUrl || tool.imageUrl
            });
        } catch (error) {
            console.error('Error fetching usage:', error);
        } finally {
            setLoadingUsage(false);
        }
    };

    if (!isOpen || !tool) return null;
    
    const imageUrl = tool.imageUrl || tool.aiMetadata?.photoUrl;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
                {imageUrl ? (
                    <div className="w-full h-64 bg-gray-100 flex items-center justify-center relative">
                        <img src={imageUrl} alt={tool.name} className="w-full h-full object-contain" />
                        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/50 text-white hover:bg-black/70 rounded-full">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center justify-between p-4 border-b">
                        <h2 className="text-xl font-semibold px-2">{tool.name}</h2>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}
                <div className="p-6">
                    {imageUrl && <h2 className="text-xl font-semibold mb-4">{tool.name}</h2>}
                    
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Suggested Usage & Best Practices</h3>
                    {tool.suggestedUsage ? (
                        <p className="text-gray-700 leading-relaxed text-sm">
                            {tool.suggestedUsage}
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

export const ToolsInventory: React.FC = () => {
    const { user, organization } = useAuth();
    
    // Extracted Permission checks
    const userRole = (user as any)?.role;
    const userPermissions = (user as any)?.permissions;
    const canPurchaseTools = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canPurchaseTools ?? true);

    const orgSettings = (organization as any)?.inventorySettings || getDefaultInventorySettings((organization as any)?.businessProfile || 'general');
    const toolCategories = orgSettings.toolCategories;

    const [tools, setTools] = useState<ToolItem[]>([]);
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
    const [filteredTools, setFilteredTools] = useState<ToolItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const [loading, setLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editTool, setEditTool] = useState<ToolItem | null>(null);
    const [editToolVendors, setEditToolVendors] = useState<VendorAssignment[]>([]);

    // Vendor mapping states
    const [vendorSearchTerm, setVendorSearchTerm] = useState<{ [key: number]: string }>({});
    const [vendorMatches, setVendorMatches] = useState<{ [key: number]: any[] }>({});
    const [isSearchingVendorProduct, setIsSearchingVendorProduct] = useState<{ [key: number]: boolean }>({});
    const [evaluatingItemId, setEvaluatingItemId] = useState<string | null>(null);
    const [identifyingVendor, setIdentifyingVendor] = useState<{ [key: number]: boolean }>({});
    
    const [selectedFormCategory, setSelectedFormCategory] = useState<string>('');

    // AI Photo workflow states
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [identifiedItems, setIdentifiedItems] = useState<AIIdentifiedTool[]>([]);
    const [uploadedPhotos, setUploadedPhotos] = useState<File[]>([]);
    
    // Details modal
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [detailsItem, setDetailsItem] = useState<ToolItem | null>(null);

    const syncAttemptedRef = useRef<Set<string>>(new Set());

    // Background catalog sync for missing data and price updates
    useEffect(() => {
        if (!tools.length || !user) return;
        
        const itemsToUpdate = tools.filter(m => {
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
            console.log("No tool items to sync.");
            return;
        }

        console.log("Starting runSync for tool items:", itemsToUpdate.map(i => i.name));

        const runSync = async () => {
            for (const item of itemsToUpdate) {
                console.log("Syncing item:", item.name);
                syncAttemptedRef.current.add(item.id);
                try {
                    const updates: Partial<ToolItem> = {};
                    let updatedVendors = item.vendors ? [...item.vendors] : [];
                    let vendorUpdated = false;

                    // 1. Sync catalog data if needed
                    if (!item.suggestedUsage || item.suggestedUsage === "No usage information available." || !item.imageUrl || (!item.replacementCost || item.replacementCost === 0)) {
                        const catalogData = await resolveCatalogItem(item.name, 'tool');
                        if (catalogData.suggestedUsage && item.suggestedUsage !== catalogData.suggestedUsage) {
                            updates.suggestedUsage = catalogData.suggestedUsage;
                        }
                        if (catalogData.imageUrl && item.imageUrl !== catalogData.imageUrl) {
                            updates.imageUrl = catalogData.imageUrl;
                        }
                        if (catalogData.estimatedCost && (!item.replacementCost || item.replacementCost === 0)) {
                            updates.replacementCost = catalogData.estimatedCost;
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
                        const tempTool = { ...item, vendors: updatedVendors };
                        const optimal = determineOptimalVendor(tempTool as any, availableVendors);
                        if (optimal && optimal.unitCost !== undefined) {
                            updates.replacementCost = optimal.unitCost;
                        }
                    }

                    if (priceSyncAttempted) {
                        updates.priceLastUpdated = serverTimestamp();
                    }
                    
                    if (Object.keys(updates).length > 0) {
                        await updateDoc(doc(db, 'tools', item.id), updates);
                    }
                } catch (e) {
                    console.error("Background sync failed for", item.name, e);
                }
            }
        };

        runSync();
    }, [tools, user, availableVendors]);

    // Fetch tools from Firestore
    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        const orgId = (user as any).org_id || user.uid;

        console.log("Fetching tools for OrgID:", orgId);

        const q = query(collection(db, 'tools'), where('org_id', '==', orgId));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const toolsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ToolItem[];
            setTools(toolsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching tools:", error);
            setLoading(false);
        });


        const vendorQ = query(collection(db, 'vendors'), where('organizationId', '==', orgId));
        const unsubVendors = onSnapshot(vendorQ, snap => {
            const v = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vendor[];
            v.sort((a,b) => a.name.localeCompare(b.name));
            setAvailableVendors(v);
        });

        return () => {
            unsubscribe();
            unsubVendors();
        };
    }, [user?.uid]);

    // Filter tools based on search and category
    useEffect(() => {
        let filtered = [...tools];

        if (searchQuery) {
            const lowerSearch = searchQuery.toLowerCase();
            filtered = filtered.filter(tool =>
                tool.name.toLowerCase().includes(lowerSearch)
            );
        }

        if (selectedCategory !== 'all') {
            filtered = filtered.filter(tool => tool.category === selectedCategory);
        }

        if (showMissingOnly) {
            filtered = filtered.filter(tool => tool.status === 'missing');
        }

        setFilteredTools(filtered);
    }, [tools, searchQuery, selectedCategory, showMissingOnly]);

    // AI Photo workflow handlers
    const handlePhotosSelected = (files: File[]) => {
        setUploadedPhotos(files);
    };

    const handleIdentifyTools = async () => {
        if (!user?.uid) return;

        try {
            const orgId = (user as any).org_id || user.uid;
            const uploadedUrls = await uploadPhotos(uploadedPhotos, orgId, 'tools');
            const identified = await identifyMaterials(uploadedUrls, orgId, 'tools');
            setIdentifiedItems(identified as AIIdentifiedTool[]);
            setIsPhotoModalOpen(false);
            setIsReviewModalOpen(true);
        } catch (error) {
            console.error('Error identifying tools:', error);
        }
    };

    const handleSaveIdentifiedTools = async (items: AIIdentifiedTool[]) => {
        if (!user?.uid) return;

        try {
            const orgId = (user as any).org_id || user.uid;
            const now = serverTimestamp();

            for (const item of items) {
                await addDoc(collection(db, 'tools'), {
                    name: item.name,
                    category: item.category || 'other',
                    condition: item.condition || 'good',
                    notes: item.notes || '',
                    status: item.status || 'available',
                    location: item.location || '',
                    replacementCost: item.replacementCost || item.suggestedReplacementCost || 0,
                    org_id: orgId,
                    tech_id: (user as any).role === 'technician' ? user.uid : null,
                    createdAt: now,
                    updatedAt: now,
                    aiMetadata: {
                        identifiedFromPhoto: true,
                        photoUrl: item.photoUrl,
                        confidence: item.confidence,
                        originalAIName: item.name,
                        identifiedAt: now
                    }
                });
            }

            setIsReviewModalOpen(false);
            setIdentifiedItems([]);
        } catch (error) {
            console.error('Error saving tools:', error);
        }
    };

    const handleAutoFetchVendorPrice = async (index: number) => {
        const v = editToolVendors[index];
        if (!v.vendorName) return;

        setIsSearchingVendorProduct(prev => ({ ...prev, [index]: true }));

        try {
            const searchFn = httpsCallable(functions, 'searchVendorCatalog');
            const toolNameForSearch = editTool?.name || (document.getElementById('addToolName') as HTMLInputElement)?.value || "";
            const searchTerm = v.vendorProductTitle || toolNameForSearch;

            if (!searchTerm) {
                setVendorMatches(prev => ({ ...prev, [index]: [] }));
                return;
            }

            const result = await searchFn({ vendorName: v.vendorName, searchTerm });
            const data = result.data as { success: boolean, products: any[] };

            if (data.success && data.products) {
                setVendorMatches(prev => ({ ...prev, [index]: data.products }));
            } else {
                setVendorMatches(prev => ({ ...prev, [index]: [] }));
            }
        } catch (error: any) {
            console.error("Error auto-fetching vendor price:", error);
        } finally {
            setIsSearchingVendorProduct(prev => ({ ...prev, [index]: false }));
        }
    };

    const handleEvaluateVendor = async (toolId: string) => {
        setEvaluatingItemId(toolId);
        try {
            const evaluateFn = httpsCallable(functions, 'evaluateVendorPreference');
            await evaluateFn({ entityId: toolId, entityType: 'tool' });
            // Since it updates Firestore, onSnapshot will pick up changes
        } catch (e: any) {
            console.error("AI Evaluation failed", e);
        } finally {
            setEvaluatingItemId(null);
        }
    };

    const handleSaveTool = async (toolData: Partial<ToolItem>) => {
        if (!user?.uid) return;

        try {
            const orgId = (user as any).org_id || user.uid;
            const now = serverTimestamp();

            if (editTool) {
                await updateDoc(doc(db, 'tools', editTool.id), {
                    ...toolData,
                    vendors: editToolVendors,
                    updatedAt: now
                });
            } else {
                await addDoc(collection(db, 'tools'), {
                    ...toolData,
                    vendors: editToolVendors,
                    org_id: orgId,
                    tech_id: (user as any).role === 'technician' ? user.uid : null,
                    createdAt: now,
                    updatedAt: now
                });
            }

            setIsAddModalOpen(false);
            setEditTool(null);
        } catch (error) {
            console.error('Error saving tool:', error);
        }
    };

    const handleDeleteTool = async (toolId: string) => {
        if (!confirm('Are you sure you want to delete this tool?')) return;

        try {
            await deleteDoc(doc(db, 'tools', toolId));
        } catch (error) {
            console.error('Error deleting tool:', error);
        }
    };

    const getConditionColor = (condition: ToolItem['condition']) => {
        switch (condition) {
            case 'excellent': return 'bg-green-100 text-green-800';
            case 'good': return 'bg-blue-100 text-blue-800';
            case 'fair': return 'bg-yellow-100 text-yellow-800';
            case 'needs_replacement': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getConditionLabel = (condition: ToolItem['condition']) => {
        return CONDITIONS.find(c => c.value === condition)?.label || condition;
    };

    const getStatusColor = (status: ToolItem['status']) => {
        switch (status) {
            case 'available': return 'bg-green-100 text-green-800';
            case 'in_use': return 'bg-blue-100 text-blue-800';
            case 'missing': return 'bg-red-100 text-red-800';
            case 'maintenance': return 'bg-orange-100 text-orange-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusLabel = (status: ToolItem['status']) => {
        return STATUSES.find(s => s.value === status)?.label || status;
    };

    const getCategoryLabel = (category: ToolItem['category']) => {
        return TOOL_CATEGORIES.find(c => c.value === category)?.label || category;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Tools Inventory</h1>
                    <p className="text-gray-600">{tools.length} tools</p>
                </div>
                <div className="flex gap-3">
                    {canPurchaseTools && (
                        <button
                            onClick={() => setIsPhotoModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            <Camera className="w-4 h-4" />
                            Add from Photo
                        </button>
                    )}
                    {canPurchaseTools && (
                        <button
                            onClick={() => {
                                setIsAddModalOpen(true);
                                setEditToolVendors([]);
                                setSelectedFormCategory(toolCategories[0]?.id || '');
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Tool
                        </button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                        <Wrench className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Total Tools</p>
                        <p className="text-2xl font-bold">{tools.length}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Good Condition</p>
                        <p className="text-2xl font-bold">
                            {tools.filter(t => t.condition === 'good' || t.condition === 'excellent').length}
                        </p>
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
                    <div className="p-3 bg-yellow-100 rounded-lg">
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Fair Condition</p>
                        <p className="text-2xl font-bold">
                            {tools.filter(t => t.condition === 'fair').length}
                        </p>
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
                    <div className="p-3 bg-red-100 rounded-lg">
                        <XCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Needs Replacement</p>
                        <p className="text-2xl font-bold">
                            {tools.filter(t => t.condition === 'needs_replacement').length}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search tools by name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-gray-400" />
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">All Categories</option>
                        {toolCategories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                    <label className="flex items-center gap-2 ml-4 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showMissingOnly}
                            onChange={(e) => setShowMissingOnly(e.target.checked)}
                            className="rounded text-red-600 focus:ring-red-500 w-5 h-5"
                        />
                        <span className="text-gray-700 font-medium">Missing Only</span>
                    </label>
                </div>
            </div>

            {/* Tools Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTools.length === 0 ? (
                    <div className="col-span-full bg-white rounded-xl shadow-sm border p-8 text-center">
                        <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No tools found</p>
                        <button
                            onClick={() => {
                                setIsAddModalOpen(true);
                                setEditToolVendors([]);
                                setSelectedFormCategory(toolCategories[0]?.id || '');
                            }}
                            className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
                        >
                            Add your first tool
                        </button>
                    </div>
                ) : (
                    filteredTools.map(tool => (
                        <div key={tool.id} className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div 
                                        onClick={() => {
                                            setDetailsItem(tool);
                                            setIsDetailsModalOpen(true);
                                        }}
                                        className="w-20 h-20 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                                    >
                                        {tool.imageUrl ? (
                                            <img src={tool.imageUrl} alt={tool.name} className="w-full h-full object-cover" />
                                        ) : tool.aiMetadata?.photoUrl ? (
                                            <img src={tool.aiMetadata.photoUrl} alt={tool.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <Wrench className="w-8 h-8 text-gray-400" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{tool.name}</h3>
                                        <div className="flex flex-col items-start gap-1 mt-1">
                                            {determineOptimalVendor(tool as any, availableVendors) && (
                                                <div className="text-[11px] text-blue-700 font-medium bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100/50 inline-block w-fit">
                                                    Supplier: {determineOptimalVendor(tool as any, availableVendors)?.vendorName}
                                                </div>
                                            )}
                                            {(tool.status === 'missing' || tool.condition === 'needs_replacement') && (
                                                <div className="text-[11px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-100/50 inline-block w-fit">
                                                    Action: Needs Reorder
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => {
                                            setEditTool(tool);
                                            setEditToolVendors(tool.vendors || []);
                                            setSelectedFormCategory(tool.category || toolCategories[0]?.id || '');
                                            setIsAddModalOpen(true);
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteTool(tool.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                    {toolCategories.find(c => c.id === tool.category)?.name || tool.category}
                                </span>
                                {tool.subcategory && (
                                    <span className="px-2 py-1 bg-gray-50 text-gray-600 text-xs rounded border border-gray-100">
                                        {tool.subcategory}
                                    </span>
                                )}
                                <span className={`px-2 py-1 text-xs rounded ${getConditionColor(tool.condition)}`}>
                                    {getConditionLabel(tool.condition)}
                                </span>
                                {tool.status && (
                                    <span className={`px-2 py-1 text-xs rounded ${getStatusColor(tool.status)}`}>
                                        {getStatusLabel(tool.status)}
                                    </span>
                                )}
                                {tool.aiMetadata?.identifiedFromPhoto && (
                                    <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded flex items-center gap-1">
                                        <Camera className="w-3 h-3" />
                                        AI
                                    </span>
                                )}
                            </div>
                            
                            {tool.location && (
                                <p className="mt-3 text-sm text-gray-600 flex items-center gap-1">
                                    <MapPin className="w-4 h-4" /> {tool.location}
                                </p>
                            )}
                            
                            {tool.replacementCost !== undefined && tool.replacementCost > 0 && (
                                <p className="mt-1 text-sm text-gray-900 font-medium whitespace-nowrap">
                                    Replacement Cost: ${Number(tool.replacementCost).toFixed(2)}
                                </p>
                            )}

                            {tool.lastJobName && (
                                <div className="mt-3 p-2 bg-red-50 rounded-lg text-sm border border-red-100 flex flex-col gap-1">
                                    <span className="font-semibold text-red-800 flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> Last seen at:</span>
                                    <span className="text-red-700">{tool.lastJobName}</span>
                                    {tool.lastJobDate && <span className="text-red-500 text-xs">{new Date(tool.lastJobDate).toLocaleDateString()}</span>}
                                </div>
                            )}

                            {tool.notes && (
                                <p className="mt-2 text-sm text-gray-600 line-clamp-2">{tool.notes}</p>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Photo Upload Modal */}
            <PhotoUploadModal
                isOpen={isPhotoModalOpen}
                onClose={() => {
                    setIsPhotoModalOpen(false);
                    setUploadedPhotos([]);
                }}
                onPhotosSelected={handlePhotosSelected}
                onIdentify={handleIdentifyTools}
                type="tools"
            />

            {/* Review Modal */}
            <MaterialsReviewModal
                isOpen={isReviewModalOpen}
                onClose={() => {
                    setIsReviewModalOpen(false);
                    setIdentifiedItems([]);
                }}
                items={identifiedItems as any}
                type="tools"
                onSave={handleSaveIdentifiedTools as any}
            />

            {/* Add/Edit Tool Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">
                            {editTool ? 'Edit Tool' : 'Add New Tool'}
                        </h2>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                handleSaveTool({
                                    name: formData.get('name') as string,
                                    category: formData.get('category') as string,
                                    subcategory: formData.get('subcategory') as string,
                                    condition: formData.get('condition') as ToolItem['condition'],
                                    status: formData.get('status') as ToolItem['status'],
                                    location: formData.get('location') as string,
                                    replacementCost: parseFloat(formData.get('replacementCost') as string) || 0,
                                    imageUrl: formData.get('imageUrl') as string,
                                    notes: formData.get('notes') as string,
                                    suggestedUsage: formData.get('suggestedUsage') as string,
                                    globalVendorPreference: formData.get('globalVendorPreference') as any
                                });
                            }}
                            className="space-y-4"
                        >
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tool Name
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        name="name"
                                        id="addToolName"
                                        defaultValue={editTool?.name}
                                        required
                                        className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., DeWalt Cordless Drill"
                                    />
                                    <button
                                        type="button"
                                        onClick={async (e) => {
                                            const btn = e.currentTarget;
                                            const nameInput = document.getElementById('addToolName') as HTMLInputElement;
                                            if (!nameInput?.value) return;
                                            
                                            btn.disabled = true;
                                            btn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div> Auto-fill';
                                            
                                            try {
                                                const catalogData = await resolveCatalogItem(nameInput.value, 'tool');
                                                const costInput = document.getElementById('addToolCost') as HTMLInputElement;
                                                const imgInput = document.getElementById('addToolImage') as HTMLInputElement;
                                                const usageInput = document.getElementById('addToolUsage') as HTMLInputElement;
                                                
                                                if (catalogData.estimatedCost && costInput && !costInput.value) costInput.value = catalogData.estimatedCost.toString();
                                                if (catalogData.imageUrl && imgInput && !imgInput.value) imgInput.value = catalogData.imageUrl;
                                                if (catalogData.suggestedUsage && usageInput) usageInput.value = catalogData.suggestedUsage;
                                            } catch (error) {
                                                console.error('Failed to auto-fill from catalog:', error);
                                            } finally {
                                                btn.disabled = false;
                                                btn.innerHTML = '<div class="text-xl leading-none">✨</div> Auto-fill';
                                            }
                                        }}
                                        className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                                    >
                                        <div className="text-xl leading-none">✨</div>
                                        Auto-fill
                                    </button>
                                </div>
                                <input type="hidden" name="suggestedUsage" id="addToolUsage" defaultValue={editTool?.suggestedUsage} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Category
                                    </label>
                                    <select
                                        name="category"
                                        value={selectedFormCategory || toolCategories[0]?.id || ''}
                                        onChange={(e) => setSelectedFormCategory(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        {toolCategories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Subcategory
                                    </label>
                                    <select
                                        name="subcategory"
                                        defaultValue={editTool?.subcategory || ''}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">None</option>
                                        {(toolCategories.find(c => c.id === (selectedFormCategory || toolCategories[0]?.id))?.subcategories || []).map(sub => (
                                            <option key={sub} value={sub}>{sub}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Condition
                                </label>
                                <select
                                    name="condition"
                                    defaultValue={editTool?.condition || 'good'}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    {CONDITIONS.map(cond => (
                                        <option key={cond.value} value={cond.value}>{cond.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Status
                                        </label>
                                        <select
                                            name="status"
                                            id="toolStatusSelect"
                                            defaultValue={editTool?.status || 'available'}
                                            onChange={(e) => {
                                                const cb = document.getElementById('toolMissingCheckbox') as HTMLInputElement;
                                                if(cb) cb.checked = e.target.value === 'missing';
                                            }}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                        >
                                            {STATUSES.map(stat => (
                                                <option key={stat.value} value={stat.value}>{stat.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <label className="flex items-center gap-2 p-2 bg-red-50 border border-red-100 rounded-lg cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            id="toolMissingCheckbox"
                                            defaultChecked={editTool?.status === 'missing'}
                                            onChange={(e) => {
                                                const select = document.getElementById('toolStatusSelect') as HTMLSelectElement;
                                                if (select) {
                                                    select.value = e.target.checked ? 'missing' : 'available';
                                                }
                                            }}
                                            className="w-5 h-5 rounded border-red-300 text-red-600 focus:ring-red-500 cursor-pointer"
                                        />
                                        <span className="text-sm font-bold text-red-700">Mark Tool as Missing</span>
                                    </label>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Replacement Cost ($)
                                    </label>
                                    <input
                                        type="number"
                                        name="replacementCost"
                                        id="addToolCost"
                                        step="0.01"
                                        min="0"
                                        defaultValue={editTool?.replacementCost || ''}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Location / Truck
                                </label>
                                <input
                                    type="text"
                                    name="location"
                                    defaultValue={editTool?.location || ''}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Truck 12, Main Warehouse"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Image URL (Optional)
                                </label>
                                <input
                                    type="url"
                                    name="imageUrl"
                                    id="addToolImage"
                                    defaultValue={editTool?.imageUrl || ''}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="https://example.com/image.jpg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Notes (Optional)
                                </label>
                                <textarea
                                    name="notes"
                                    defaultValue={editTool?.notes}
                                    rows={2}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Additional notes..."
                                />
                            </div>

                            {/* Vendor Assignments */}
                            <div className="pt-4 border-t border-gray-100">
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-900 mb-1">
                                        Global Vendor Preference (How should we source this?)
                                    </label>
                                    <select
                                        name="globalVendorPreference"
                                        defaultValue={editTool?.globalVendorPreference || 'lowest_price'}
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
                                        {editToolVendors && editToolVendors.length > 0 && editTool?.id && (
                                            <button
                                                type="button"
                                                onClick={() => handleEvaluateVendor(editTool.id)}
                                                className="ml-2 px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs rounded-full font-medium flex items-center gap-1 transition-colors"
                                            >
                                                {evaluatingItemId === editTool.id ? (
                                                    <Loader2 className="w-3 h-3 animate-spin"/>
                                                ) : (
                                                    <Sparkles className="w-3 h-3" />
                                                )}
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
                                            setEditToolVendors(prev => [...prev, newVendor]);
                                        }}
                                        className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-700"
                                    >
                                        <Plus className="w-4 h-4" /> Add Vendor
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {editToolVendors.length === 0 ? (
                                        <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg text-center border border-dashed border-gray-200">
                                            No vendors assigned.
                                        </div>
                                    ) : (
                                        editToolVendors.map((v, index) => (
                                            <div key={index} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-200">
                                                <div className="col-span-12 space-y-3">
                                                    <div className="grid grid-cols-12 gap-2 items-center">
                                                        <div className="col-span-12 md:col-span-4">
                                                            <select
                                                                value={v.vendorId}
                                                                onChange={(e) => {
                                                                    const selected = availableVendors.find(vend => vend.id === e.target.value);
                                                                    const newVendors = [...editToolVendors];
                                                                    newVendors[index] = { ...v, vendorId: e.target.value, vendorName: selected?.name || '' };
                                                                    setEditToolVendors(newVendors);
                                                                }}
                                                                className="w-full border border-gray-300 rounded text-sm p-1.5 focus:ring-1 focus:ring-blue-500"
                                                            >
                                                                {availableVendors.map(vend => (
                                                                    <option key={vend.id} value={vend.id}>{vend.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="col-span-12 md:col-span-7 flex items-center justify-end gap-2 text-sm text-gray-700 font-medium h-9">
                                                            Cost: ${(v.unitCost || 0).toFixed(2)}
                                                            {editTool?.preferredVendorId === v.vendorId && (
                                                                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded font-bold border border-green-200">
                                                                    ★ WINNER
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="col-span-2 md:col-span-1 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const newVendors = editToolVendors.filter((_, i) => i !== index);
                                                                    setEditToolVendors(newVendors);
                                                                }}
                                                                className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Reason Area (If Winner) */}
                                                    {editTool?.preferredVendorId === v.vendorId && editTool?.preferredVendorReason && (
                                                        <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-800 mb-2">
                                                            <strong>Evaluation Reason:</strong> {editTool.preferredVendorReason}
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
                                                            onClick={() => handleAutoFetchVendorPrice(index)}
                                                            disabled={isSearchingVendorProduct[index]}
                                                            className="shrink-0 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs flex items-center gap-1 font-medium"
                                                        >
                                                            {isSearchingVendorProduct[index] ? <Loader2 className="w-3 h-3 animate-spin text-blue-500" /> : <Search className="w-3 h-3 text-blue-500" />}
                                                            Find Matches
                                                        </button>
                                                    </div>

                                                    {/* Match Results Picker */}
                                                    {vendorMatches[index] && vendorMatches[index].length > 0 && (
                                                        <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border border-blue-100 rounded-lg bg-blue-50/30 p-2">
                                                            <div className="text-xs font-semibold text-blue-800 uppercase px-1">Select Best Match</div>
                                                            {vendorMatches[index].map((product, pIdx) => {
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
                                                                                const newVendors = [...editToolVendors];
                                                                                newVendors[index] = { 
                                                                                    ...v, 
                                                                                    unitCost: pVal, 
                                                                                    vendorProductTitle: product.title, 
                                                                                    vendorProductUrl: product.url 
                                                                                };
                                                                                setEditToolVendors(newVendors);
                                                                                
                                                                                if (editTool) {
                                                                                    setEditTool({ ...editTool, priceLastUpdated: new Date() as any});
                                                                                }

                                                                                setVendorMatches(prev => ({ ...prev, [index]: [] })); // Clear results
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
                            
                            {editTool?.lastJobName && (
                                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-200 mt-2">
                                    <strong className="text-gray-900">Last Known Job:</strong> {editTool.lastJobName}
                                    {editTool.lastJobDate && ` on ${new Date(editTool.lastJobDate.toDate ? editTool.lastJobDate.toDate() : editTool.lastJobDate).toLocaleDateString()}`}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAddModalOpen(false);
                                        setEditToolVendors([]);
                                        setEditTool(null);
                                    }}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    {editTool ? 'Save Changes' : 'Add Tool'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Tool Details Modal */}
            <ToolDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => {
                    setIsDetailsModalOpen(false);
                    setDetailsItem(null);
                }}
                tool={detailsItem}
                onUpdateTool={async (id, updates) => {
                    await updateDoc(doc(db, 'tools', id), updates);
                }}
            />
        </div>
    );
};
