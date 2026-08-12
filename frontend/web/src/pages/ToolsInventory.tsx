/**
 * ToolsInventory - Equipment & Tools Management Page
 * 
 * Features:
 * - Large visual photo tiles for every tool & equipment piece
 * - Per-Unit Allocation Manager: Assign individual units (Unit 1, Unit 2, Unit 3...) to specific Techs & Locations
 * - Serial number tracking & internal Asset Tags (QR/Barcode) per unit
 * - Tech Truck Kit View Mode: Group tools by Technician to audit truck equipment in one click
 * - Filter by Technician to instantly view all tools assigned to any tech
 * - Safe date formatting for last job history
 * - AI Business Context & Field Operations Usage Generator
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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
    DollarSign,
    Package,
    User,
    Tag,
    ShieldCheck,
    Layers,
    Info,
    ChevronRight,
    Barcode,
    Briefcase,
    LayoutGrid,
    Truck,
    ListFilter
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { TOP_TRACKER_CATALOG, getGroupedTrackerCatalog, shouldRefreshCatalog, getTrackerInputFields } from '../utils/trackerCatalog';
import { TrackerBatteryAlertWidget } from '../components/inventory/TrackerBatteryAlertWidget';
import {
    collection,
    query,
    where,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { ToolItem, AIIdentifiedTool, VendorAssignment, ToolUnitAssignment } from '../types';
import { Vendor } from '../types/Vendor';
import { PhotoUploadModal } from '../components/PhotoUploadModal';
import { MaterialsReviewModal } from '../components/MaterialsReviewModal';
import { uploadPhotos, identifyMaterials, resolveCatalogItem } from '../lib/aiMaterialsService';
import { determineOptimalVendor } from '../utils/procurementLogic';
import { getDefaultInventorySettings } from '../utils/defaultInventoryCategories';

// Category options for tools
const TOOL_CATEGORIES: Array<{ value: ToolItem['category']; label: string }> = [
    { value: 'hand_tool', label: 'Hand Tools' },
    { value: 'power_tool', label: 'Power Tools' },
    { value: 'diagnostic', label: 'Diagnostic Equipment' },
    { value: 'safety', label: 'Safety Equipment' },
    { value: 'specialized', label: 'Specialty Tools' },
    { value: 'other', label: 'Other' }
];

// Condition options
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

// Safe date formatter for lastJobDate / Timestamp
function formatToolDate(dateVal: any): string | null {
    if (!dateVal) return null;
    try {
        if (typeof dateVal === 'string') {
            const d = new Date(dateVal);
            return isNaN(d.getTime()) ? null : d.toLocaleDateString();
        }
        if (typeof dateVal === 'number') {
            const d = new Date(dateVal);
            return isNaN(d.getTime()) ? null : d.toLocaleDateString();
        }
        if (dateVal.toDate && typeof dateVal.toDate === 'function') {
            return dateVal.toDate().toLocaleDateString();
        }
        if (dateVal._seconds) {
            return new Date(dateVal._seconds * 1000).toLocaleDateString();
        }
        if (dateVal.seconds) {
            return new Date(dateVal.seconds * 1000).toLocaleDateString();
        }
    } catch (e) {
        return null;
    }
    return null;
}

const ToolDetailsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    tool: ToolItem | null;
    onUpdateTool: (id: string, updates: Partial<ToolItem>) => void;
}> = ({ isOpen, onClose, tool, onUpdateTool }) => {
    const { user } = useAuth();
    const [loadingUsage, setLoadingUsage] = useState(false);

    useEffect(() => {
        if (isOpen && tool && (!tool.suggestedUsage || !tool.businessContextExplanation) && user) {
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
                businessContextExplanation: catalogData.suggestedUsage,
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
    const usageExplanation = tool.businessContextExplanation || tool.suggestedUsage;
    const formattedLastDate = formatToolDate(tool.lastJobDate);
    const units = tool.unitAssignments && tool.unitAssignments.length > 0 ? tool.unitAssignments : [];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[90vh] flex flex-col">
                {imageUrl ? (
                    <div className="w-full h-64 bg-gray-900 flex items-center justify-center relative shrink-0">
                        <img src={imageUrl} alt={tool.name} className="w-full h-full object-cover" />
                        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/60 text-white hover:bg-black/80 rounded-full transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center justify-between p-5 border-b shrink-0 bg-gray-50">
                        <h2 className="text-xl font-bold text-gray-900">{tool.name}</h2>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}
                <div className="p-6 overflow-y-auto space-y-6">
                    {imageUrl && (
                        <div>
                            <h2 className="text-2xl font-extrabold text-gray-900">{tool.name}</h2>
                            {(tool.make || tool.model || tool.size) && (
                                <p className="text-sm font-semibold text-gray-500 mt-1">
                                    {[tool.make, tool.model, tool.size].filter(Boolean).join(' • ')}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Unit Allocation Breakdown Table */}
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-blue-600" />
                            Individual Unit Allocations ({units.length || tool.quantity || 1} units)
                        </h3>
                        {units.length > 0 ? (
                            <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 border-b font-semibold text-gray-700">
                                        <tr>
                                            <th className="p-2.5">Unit</th>
                                            <th className="p-2.5">Assigned Tech</th>
                                            <th className="p-2.5">Location / Truck</th>
                                            <th className="p-2.5">Serial # / Tag</th>
                                            <th className="p-2.5">Condition</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {units.map((u, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-2.5 font-bold text-gray-900">Unit #{u.unitIndex || (idx + 1)}</td>
                                                <td className="p-2.5 font-semibold text-blue-700">{u.techName || 'Unassigned (Shop)'}</td>
                                                <td className="p-2.5 text-gray-700">{u.location || 'Warehouse'}</td>
                                                <td className="p-2.5 font-mono text-gray-600">{u.serialNumber || u.assetTag || '-'}</td>
                                                <td className="p-2.5 capitalize font-medium">{u.condition || 'good'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm space-y-1">
                                <p className="font-semibold text-gray-800">Assigned Tech: <span className="text-blue-700">{tool.assignedTechName || 'Unassigned'}</span></p>
                                <p className="text-gray-600 text-xs">Location: {tool.location || 'Warehouse'}</p>
                            </div>
                        )}
                    </div>

                    {/* Last Job / Tech History Box */}
                    {tool.lastJobName && (
                        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs space-y-1">
                            <span className="font-bold text-amber-900 flex items-center gap-1.5">
                                <Briefcase className="w-4 h-4 text-amber-700" />
                                Last Known Job Assignment
                            </span>
                            <p className="text-amber-800 font-semibold text-sm">{tool.lastJobName}</p>
                            {formattedLastDate && (
                                <p className="text-amber-600 text-xs">Date: {formattedLastDate}</p>
                            )}
                        </div>
                    )}

                    {/* AI Field Context Explanation */}
                    <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-100">
                        <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-blue-600" />
                            AI Field Usage & Business Context
                        </h3>
                        {usageExplanation ? (
                            <p className="text-gray-700 leading-relaxed text-sm">
                                {usageExplanation}
                            </p>
                        ) : loadingUsage ? (
                            <div className="flex items-center gap-3 text-blue-600 text-sm py-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating AI business explanation...
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm italic">No business context explanation generated.</p>
                        )}
                    </div>
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
    const [techs, setTechs] = useState<Array<{ id: string; name: string }>>([]);

    // View Mode: 'grid' (standard grid) vs 'by_tech' (grouped by technician's truck kit)
    const [viewMode, setViewMode] = useState<'grid' | 'by_tech'>('grid');

    // Fetch technicians list from org users
    useEffect(() => {
        const orgId = (user as any)?.org_id || user?.uid;
        if (!orgId) return;

        const q = query(collection(db, 'users'), where('org_id', '==', orgId));
        const unsub = onSnapshot(q, snap => {
            const list = snap.docs.map(dDoc => {
                const data = dDoc.data();
                return {
                    id: dDoc.id,
                    name: data.name || data.displayName || data.email || dDoc.id
                };
            });
            setTechs(list);
        }, err => {
            console.warn('Could not fetch org users for tool assignment:', err);
        });
        return () => unsub();
    }, [(user as any)?.org_id, user?.uid]);

    useEffect(() => {
        if (!user?.org_id) return;
        const q = query(collection(db, 'vendors'), where('organizationId', '==', user.org_id));
        const unsub = onSnapshot(q, snap => {
            const v = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vendor[];
            v.sort((a, b) => a.name.localeCompare(b.name));
            setAvailableVendors(v);
        });
        return () => unsub();
    }, [user?.org_id]);

    const [filteredTools, setFilteredTools] = useState<ToolItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedTechFilter, setSelectedTechFilter] = useState<string>('all');
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const [loading, setLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editTool, setEditTool] = useState<ToolItem | null>(null);
    const [editToolVendors, setEditToolVendors] = useState<VendorAssignment[]>([]);
    const [selectedTrackerModelId, setSelectedTrackerModelId] = useState<string>('none');

    // Form Unit Assignments State (for multi-quantity per-unit assignments)
    const [formUnits, setFormUnits] = useState<ToolUnitAssignment[]>([]);

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

    // When modal opens or editTool changes, initialize unit assignments array & tracker model
    useEffect(() => {
        if (!isAddModalOpen) return;

        setSelectedTrackerModelId(editTool?.trackerModelId || (editTool?.trackerType ? (editTool.trackerType === 'airtag' ? 'apple_airtag' : editTool.trackerType === 'tile' ? 'tile_pro' : editTool.trackerType === 'ble_beacon' ? 'minew_ble_tag' : 'samsara_ag52') : 'none'));

        if (editTool) {
            if (editTool.unitAssignments && editTool.unitAssignments.length > 0) {
                setFormUnits(editTool.unitAssignments);
            } else {
                const qty = editTool.quantity || 1;
                const init: ToolUnitAssignment[] = [];
                for (let i = 0; i < qty; i++) {
                    init.push({
                        unitIndex: i + 1,
                        serialNumber: i === 0 ? (editTool.serialNumber || '') : '',
                        assetTag: i === 0 ? (editTool.assetTag || '') : '',
                        techId: editTool.assignedTechId || null,
                        techName: editTool.assignedTechName || null,
                        location: editTool.location || 'Warehouse',
                        condition: editTool.condition || 'good',
                        status: editTool.status || 'available'
                    });
                }
                setFormUnits(init);
            }
        } else {
            setFormUnits([{
                unitIndex: 1,
                serialNumber: '',
                assetTag: '',
                techId: null,
                techName: null,
                location: 'Warehouse',
                condition: 'good',
                status: 'available'
            }]);
        }
    }, [editTool, isAddModalOpen]);

    const handleFormQuantityChange = (newQty: number) => {
        const qty = Math.max(1, newQty);
        setFormUnits(prev => {
            const next = [...prev];
            if (next.length < qty) {
                for (let i = next.length; i < qty; i++) {
                    next.push({
                        unitIndex: i + 1,
                        serialNumber: '',
                        assetTag: '',
                        techId: null,
                        techName: null,
                        location: prev[0]?.location || 'Warehouse',
                        condition: 'good',
                        status: 'available'
                    });
                }
            } else if (next.length > qty) {
                return next.slice(0, qty);
            }
            return next;
        });
    };

    // Fetch tools from Firestore
    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        const orgId = (user as any).org_id || user.uid;
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

        return () => unsubscribe();
    }, [user?.uid]);

    // Filter tools based on search, category, tech assignment
    useEffect(() => {
        let filtered = [...tools];

        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(lower) ||
                (t.make && t.make.toLowerCase().includes(lower)) ||
                (t.model && t.model.toLowerCase().includes(lower)) ||
                (t.serialNumber && t.serialNumber.toLowerCase().includes(lower)) ||
                (t.location && t.location.toLowerCase().includes(lower)) ||
                (t.assignedTechName && t.assignedTechName.toLowerCase().includes(lower)) ||
                (t.unitAssignments && t.unitAssignments.some(u =>
                    (u.techName && u.techName.toLowerCase().includes(lower)) ||
                    (u.location && u.location.toLowerCase().includes(lower)) ||
                    (u.serialNumber && u.serialNumber.toLowerCase().includes(lower))
                ))
            );
        }

        if (selectedCategory !== 'all') {
            filtered = filtered.filter(tool => tool.category === selectedCategory);
        }

        if (selectedTechFilter !== 'all') {
            if (selectedTechFilter === 'unassigned') {
                filtered = filtered.filter(tool => {
                    if (!tool.assignedTechId) return true;
                    if (tool.unitAssignments && tool.unitAssignments.some(u => !u.techId)) return true;
                    return false;
                });
            } else {
                filtered = filtered.filter(tool => {
                    if (tool.assignedTechId === selectedTechFilter) return true;
                    if (tool.unitAssignments && tool.unitAssignments.some(u => u.techId === selectedTechFilter)) return true;
                    return false;
                });
            }
        }

        if (showMissingOnly) {
            filtered = filtered.filter(tool =>
                tool.status === 'missing' ||
                (tool.unitAssignments && tool.unitAssignments.some(u => u.status === 'missing'))
            );
        }

        setFilteredTools(filtered);
    }, [tools, searchQuery, selectedCategory, selectedTechFilter, showMissingOnly]);

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
                    quantity: item.quantity || 1,
                    category: item.category || 'other',
                    condition: item.condition || 'good',
                    notes: item.notes || '',
                    status: item.status || 'available',
                    location: item.location || 'Warehouse',
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

    const handleSaveTool = async (toolData: Partial<ToolItem>) => {
        if (!user?.uid) return;

        try {
            const orgId = (user as any).org_id || user.uid;
            const now = serverTimestamp();

            // Set primary location & primary tech from unit 1
            const primaryTechId = formUnits[0]?.techId || null;
            const primaryTechName = formUnits[0]?.techName || null;
            const primaryLocation = formUnits[0]?.location || (toolData.location || 'Warehouse');
            const primaryCondition = formUnits[0]?.condition || (toolData.condition || 'good');
            const primaryStatus = formUnits[0]?.status || (toolData.status || 'available');
            const primarySerial = formUnits[0]?.serialNumber || toolData.serialNumber || '';
            const primaryAssetTag = formUnits[0]?.assetTag || toolData.assetTag || '';

            const payload = {
                ...toolData,
                quantity: formUnits.length,
                unitAssignments: formUnits,
                assignedTechId: primaryTechId,
                assignedTechName: primaryTechName,
                location: primaryLocation,
                condition: primaryCondition,
                status: primaryStatus,
                serialNumber: primarySerial,
                assetTag: primaryAssetTag,
                vendors: editToolVendors,
                updatedAt: now
            };

            if (editTool) {
                await updateDoc(doc(db, 'tools', editTool.id), payload);
            } else {
                await addDoc(collection(db, 'tools'), {
                    ...payload,
                    org_id: orgId,
                    tech_id: (user as any).role === 'technician' ? user.uid : null,
                    createdAt: now
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
            case 'excellent': return 'bg-green-100 text-green-800 border-green-200';
            case 'good': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'fair': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'needs_replacement': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getConditionLabel = (condition: ToolItem['condition']) => {
        return CONDITIONS.find(c => c.value === condition)?.label || condition;
    };

    const getStatusColor = (status: ToolItem['status']) => {
        switch (status) {
            case 'available': return 'bg-emerald-100 text-emerald-800';
            case 'in_use': return 'bg-indigo-100 text-indigo-800';
            case 'missing': return 'bg-rose-100 text-rose-800';
            case 'maintenance': return 'bg-amber-100 text-amber-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusLabel = (status: ToolItem['status']) => {
        return STATUSES.find(s => s.value === status)?.label || status;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
            {/* Top Switcher Navigation Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center gap-2">
                    <Link
                        to="/materials"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                    >
                        <Package className="w-4 h-4 text-gray-500" />
                        Materials & Parts
                    </Link>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm bg-blue-600 text-white shadow-sm">
                        <Wrench className="w-4 h-4" />
                        Tools & Equipment
                    </div>
                    <Link
                        to="/inventory/trackers"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-slate-700 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                    >
                        <Tag className="w-4 h-4 text-blue-600" />
                        Tag & Tracker Portal
                    </Link>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Per-Unit Tech Allocations Active</span>
                </div>
            </div>

            {/* Banner Callout Module */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 opacity-10 pointer-events-none">
                    <Wrench className="w-80 h-80" />
                </div>
                <div className="relative z-10 max-w-3xl space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-200 text-xs font-semibold border border-blue-400/30">
                        <ShieldCheck className="w-3.5 h-3.5" /> Multi-Unit Allocation & Tech Truck Management
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Tools & Field Equipment Inventory</h1>
                    <p className="text-blue-100 text-sm leading-relaxed">
                        Assign individual tool units to specific technician trucks or warehouse shelves. Filter by technician to instantly review a tech's truck toolkit before dispatch.
                    </p>
                </div>
            </div>

            {/* Header, Action Buttons & View Switcher */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Equipment Catalog & Truck Kits</h2>
                    <p className="text-gray-500 text-sm">{tools.length} tool models ({tools.reduce((sum, t) => sum + (t.quantity || 1), 0)} total units assigned)</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {/* View Mode Switcher: Grid vs By Tech */}
                    <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-bold">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                                viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                            }`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            All Tools Grid
                        </button>
                        <button
                            onClick={() => setViewMode('by_tech')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                                viewMode === 'by_tech' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                            }`}
                        >
                            <Truck className="w-3.5 h-3.5" />
                            By Tech Truck Kit
                        </button>
                    </div>

                    {canPurchaseTools && (
                        <button
                            onClick={() => setIsPhotoModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold text-sm shadow-sm transition-colors"
                        >
                            <Camera className="w-4 h-4" />
                            Add from Photo
                        </button>
                    )}
                    {canPurchaseTools && (
                        <button
                            onClick={() => {
                                setIsAddModalOpen(true);
                                setEditTool(null);
                                setEditToolVendors([]);
                                setSelectedFormCategory(toolCategories[0]?.id || '');
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm shadow-sm transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Tool / Equipment
                        </button>
                    )}
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex-1 relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search tool name, make, model, serial #, truck, or assigned tech..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="all">All Categories</option>
                        {toolCategories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>

                    {/* Filter by Technician */}
                    <div className="flex items-center gap-1 bg-blue-50/80 px-2 py-1 rounded-lg border border-blue-100">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                        <select
                            value={selectedTechFilter}
                            onChange={(e) => setSelectedTechFilter(e.target.value)}
                            className="bg-transparent text-sm font-bold text-blue-900 border-none focus:ring-0 cursor-pointer"
                        >
                            <option value="all">Filter by Tech: All</option>
                            <option value="unassigned">Unassigned (Shop/Warehouse)</option>
                            {techs.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    <label className="flex items-center gap-2 ml-2 cursor-pointer text-sm">
                        <input
                            type="checkbox"
                            checked={showMissingOnly}
                            onChange={(e) => setShowMissingOnly(e.target.checked)}
                            className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                        />
                        <span className="text-gray-700 font-medium">Missing Only</span>
                    </label>
                </div>
            </div>

            {/* Tracker Battery Maintenance & Charge Alert Widget */}
            <TrackerBatteryAlertWidget />

            {/* VIEW MODE 1: BY TECH TRUCK KIT GROUPED VIEW */}
            {viewMode === 'by_tech' ? (
                <div className="space-y-6">
                    {/* Render Group per Tech */}
                    {[...techs, { id: 'unassigned', name: 'Unassigned (Main Warehouse & Shop)' }].map(tGroup => {
                        const isUnassigned = tGroup.id === 'unassigned';
                        const techTools = filteredTools.filter(tool => {
                            if (isUnassigned) {
                                return !tool.assignedTechId || (tool.unitAssignments && tool.unitAssignments.some(u => !u.techId));
                            }
                            return tool.assignedTechId === tGroup.id || (tool.unitAssignments && tool.unitAssignments.some(u => u.techId === tGroup.id));
                        });

                        if (techTools.length === 0) return null;

                        return (
                            <div key={tGroup.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-600 rounded-xl">
                                            {isUnassigned ? <Wrench className="w-5 h-5 text-white" /> : <User className="w-5 h-5 text-white" />}
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-lg leading-none">{tGroup.name}</h3>
                                            <p className="text-xs text-slate-300 mt-1">{techTools.length} tool model(s) assigned</p>
                                        </div>
                                    </div>
                                    <span className="px-3 py-1 bg-white/10 text-white text-xs font-bold rounded-full border border-white/20">
                                        {techTools.reduce((acc, tool) => {
                                            if (isUnassigned) {
                                                const count = tool.unitAssignments?.filter(u => !u.techId).length || 1;
                                                return acc + count;
                                            }
                                            const count = tool.unitAssignments?.filter(u => u.techId === tGroup.id).length || 1;
                                            return acc + count;
                                        }, 0)} units on truck
                                    </span>
                                </div>

                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50">
                                    {techTools.map(tool => {
                                        const unitsOnThisTech = isUnassigned
                                            ? tool.unitAssignments?.filter(u => !u.techId)
                                            : tool.unitAssignments?.filter(u => u.techId === tGroup.id);

                                        return (
                                            <div key={tool.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start gap-3">
                                                <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                                                    {tool.imageUrl ? (
                                                        <img src={tool.imageUrl} alt={tool.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Wrench className="w-8 h-8 text-gray-400 m-auto mt-4" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-gray-900 text-sm truncate">{tool.name}</h4>
                                                    <p className="text-xs text-gray-500 mt-0.5">{[tool.make, tool.model].filter(Boolean).join(' • ')}</p>
                                                    <div className="mt-2 text-xs space-y-1">
                                                        {(unitsOnThisTech && unitsOnThisTech.length > 0) ? (
                                                            unitsOnThisTech.map((u, uIdx) => (
                                                                <div key={uIdx} className="bg-blue-50/70 p-1.5 rounded border border-blue-100 flex items-center justify-between text-[11px]">
                                                                    <span className="font-bold text-blue-900">Unit #{u.unitIndex}</span>
                                                                    <span className="text-gray-600 truncate max-w-[120px]">{u.location || 'Truck'}</span>
                                                                    {u.serialNumber && <span className="font-mono text-gray-500 font-semibold">{u.serialNumber}</span>}
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="text-gray-600 font-semibold">Location: {tool.location || 'Truck'}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* VIEW MODE 2: STANDARD TOOLS GRID WITH EXPANDABLE PER-UNIT ALLOCATIONS */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredTools.length === 0 ? (
                        <div className="col-span-full bg-white rounded-2xl shadow-sm border p-12 text-center">
                            <Wrench className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-800">No tools found</h3>
                            <p className="text-gray-500 text-sm mt-1">Try adjusting search filters or add a new tool.</p>
                            <button
                                onClick={() => {
                                    setIsAddModalOpen(true);
                                    setEditTool(null);
                                    setEditToolVendors([]);
                                    setSelectedFormCategory(toolCategories[0]?.id || '');
                                }}
                                className="mt-5 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
                            >
                                Add New Tool
                            </button>
                        </div>
                    ) : (
                        filteredTools.map(tool => {
                            const imageUrl = tool.imageUrl || tool.aiMetadata?.photoUrl;
                            const formattedLastDate = formatToolDate(tool.lastJobDate);
                            const optimalVendor = determineOptimalVendor(tool as any, availableVendors);
                            const units = tool.unitAssignments && tool.unitAssignments.length > 0 ? tool.unitAssignments : [];
                            const qty = units.length || tool.quantity || 1;

                            return (
                                <div key={tool.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-lg transition-all overflow-hidden flex flex-col justify-between group">
                                    <div>
                                        {/* Large Featured Tool Image Tile */}
                                        <div
                                            onClick={() => {
                                                setDetailsItem(tool);
                                                setIsDetailsModalOpen(true);
                                            }}
                                            className="w-full h-48 bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden cursor-pointer flex items-center justify-center border-b border-gray-200"
                                        >
                                            {imageUrl ? (
                                                <img
                                                    src={imageUrl}
                                                    alt={tool.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-slate-400">
                                                    <Wrench className="w-16 h-16 text-slate-300" />
                                                    <span className="text-xs font-semibold text-slate-400">Click to view specs</span>
                                                </div>
                                            )}

                                            {/* Overlay Badges */}
                                            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                                                <span className="px-2.5 py-1 bg-black/75 backdrop-blur-md text-white text-xs font-black rounded-lg shadow-sm">
                                                    Qty: {qty}
                                                </span>
                                                {tool.status && (
                                                    <span className={`px-2.5 py-1 text-xs font-bold rounded-lg shadow-sm capitalize ${getStatusColor(tool.status)}`}>
                                                        {getStatusLabel(tool.status)}
                                                    </span>
                                                )}
                                                {tool.trackerType && tool.trackerType !== 'none' && (
                                                    <a
                                                        href={tool.trackerUrl || '#'}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="px-2.5 py-1 bg-blue-600/90 hover:bg-blue-600 backdrop-blur-md text-white text-xs font-extrabold rounded-lg shadow-sm flex items-center gap-1 transition-all"
                                                        title="Open Live AirTag / Smart Tracker Location Map"
                                                    >
                                                        <Tag className="w-3 h-3" />
                                                        {tool.trackerType === 'airtag' ? 'AirTag' : tool.trackerType === 'tile' ? 'Tile' : 'GPS Tag'}
                                                    </a>
                                                )}
                                            </div>

                                            <div className="absolute top-3 right-3 flex gap-1 bg-white/90 backdrop-blur-md p-1 rounded-xl shadow-sm">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditTool(tool);
                                                        setEditToolVendors(tool.vendors || []);
                                                        setSelectedFormCategory(tool.category || toolCategories[0]?.id || '');
                                                        setIsAddModalOpen(true);
                                                    }}
                                                    className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Edit Tool & Tech Allocations"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteTool(tool.id);
                                                    }}
                                                    className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete Tool"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Tile Details */}
                                        <div className="p-5 space-y-3">
                                            <div>
                                                <h3
                                                    onClick={() => {
                                                        setDetailsItem(tool);
                                                        setIsDetailsModalOpen(true);
                                                    }}
                                                    className="font-extrabold text-gray-900 text-lg group-hover:text-blue-600 transition-colors cursor-pointer leading-snug"
                                                >
                                                    {tool.name}
                                                </h3>
                                                {(tool.make || tool.model || tool.size) && (
                                                    <p className="text-xs font-semibold text-gray-500 mt-1">
                                                        {[tool.make, tool.model, tool.size].filter(Boolean).join(' • ')}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Reorder / Supplier Callouts */}
                                            {(tool.status === 'missing' || tool.condition === 'needs_replacement') && (
                                                <div className="text-xs text-rose-700 font-bold bg-rose-50 px-2.5 py-1 rounded-md border border-rose-100 flex items-center gap-1">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                                    Action: Needs Reorder / Replacement
                                                </div>
                                            )}

                                            {/* Per-Unit Tech Allocation Breakdown */}
                                            <div className="space-y-1 text-xs">
                                                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                                    Unit Tech Assignments ({units.length || 1})
                                                </span>

                                                {units.length > 0 ? (
                                                    units.slice(0, 3).map((u, idx) => (
                                                        <div key={idx} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px]">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <User className="w-3 h-3 text-blue-600 shrink-0" />
                                                                <span className="font-bold text-gray-900 truncate">{u.techName || 'Unassigned (Shop)'}</span>
                                                            </div>
                                                            <span className="text-gray-500 font-medium shrink-0 ml-2 truncate max-w-[110px]">{u.location || 'Warehouse'}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px]">
                                                        <span className="font-bold text-gray-900">{tool.assignedTechName || 'Unassigned (Shop)'}</span>
                                                        <span className="text-gray-500 font-medium">{tool.location || 'Warehouse'}</span>
                                                    </div>
                                                )}

                                                {units.length > 3 && (
                                                    <p className="text-[10px] font-bold text-blue-600 pt-0.5">
                                                        +{units.length - 3} more unit assignments...
                                                    </p>
                                                )}
                                            </div>

                                            {/* Last Seen / Last Job Box (Preserved with safe formatting) */}
                                            {tool.lastJobName && (
                                                <div className="p-3 bg-amber-50/80 rounded-xl text-xs border border-amber-200/60 space-y-0.5">
                                                    <span className="font-bold text-amber-900 flex items-center gap-1">
                                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                                        Last seen at:
                                                    </span>
                                                    <p className="text-amber-800 font-semibold">{tool.lastJobName}</p>
                                                    {formattedLastDate && (
                                                        <p className="text-amber-600 text-[11px]">{formattedLastDate}</p>
                                                    )}
                                                </div>
                                            )}

                                            {tool.notes && (
                                                <p className="text-xs text-gray-600 line-clamp-2 italic bg-gray-50 p-2 rounded-lg">{tool.notes}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Footer Action Bar */}
                                    <div className="bg-slate-50 p-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                                        <button
                                            onClick={() => {
                                                setDetailsItem(tool);
                                                setIsDetailsModalOpen(true);
                                            }}
                                            className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 group-hover:underline"
                                        >
                                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                            AI Usage Context
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                        {tool.replacementCost !== undefined && tool.replacementCost > 0 && (
                                            <span className="font-bold text-gray-900">
                                                Cost: ${Number(tool.replacementCost).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

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

            {/* Add/Edit Tool Modal with PER-UNIT ALLOCATION MANAGER */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4 border-b pb-3">
                            <h2 className="text-xl font-bold text-gray-900">
                                {editTool ? 'Edit Tool & Per-Unit Tech Allocations' : 'Add New Tool to Equipment Inventory'}
                            </h2>
                            <button
                                onClick={() => {
                                    setIsAddModalOpen(false);
                                    setEditTool(null);
                                    setEditToolVendors([]);
                                }}
                                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);

                                handleSaveTool({
                                    name: formData.get('name') as string,
                                    make: formData.get('make') as string,
                                    model: formData.get('model') as string,
                                    size: formData.get('size') as string,
                                    category: formData.get('category') as string,
                                    subcategory: formData.get('subcategory') as string,
                                    trackerType: (formData.get('trackerType') as any) || 'none',
                                    trackerModelId: formData.get('trackerModelId') as string,
                                    trackerUrl: formData.get('trackerUrl') as string,
                                    trackerSerial: formData.get('trackerSerial') as string,
                                    trackerMac: formData.get('trackerMac') as string,
                                    trackerImei: formData.get('trackerImei') as string,
                                    trackerMajorMinor: formData.get('trackerMajorMinor') as string,
                                    replacementCost: parseFloat(formData.get('replacementCost') as string) || 0,
                                    imageUrl: formData.get('imageUrl') as string,
                                    notes: formData.get('notes') as string,
                                    suggestedUsage: formData.get('suggestedUsage') as string,
                                    businessContextExplanation: formData.get('suggestedUsage') as string,
                                });
                            }}
                            className="space-y-5"
                        >
                            {/* Tool Name & AI Auto-Fill */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Tool / Equipment Name *
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        name="name"
                                        id="addToolName"
                                        defaultValue={editTool?.name}
                                        required
                                        className="flex-1 px-3.5 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 font-medium"
                                        placeholder="e.g. Klein Tools 11-in-1 Screwdriver"
                                    />
                                    <button
                                        type="button"
                                        onClick={async (e) => {
                                            const btn = e.currentTarget;
                                            const nameInput = document.getElementById('addToolName') as HTMLInputElement;
                                            if (!nameInput?.value) return;

                                            btn.disabled = true;
                                            btn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div> AI Cataloging...';

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
                                                btn.innerHTML = '✨ AI Auto-Fill';
                                            }
                                        }}
                                        className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-sm font-bold hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                                    >
                                        ✨ AI Auto-Fill
                                    </button>
                                </div>
                                <input type="hidden" name="suggestedUsage" id="addToolUsage" defaultValue={editTool?.suggestedUsage} />
                            </div>

                            {/* Quantity Control */}
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex items-center justify-between">
                                <div>
                                    <label className="block text-sm font-bold text-blue-950">Total Quantity of this Tool Model</label>
                                    <p className="text-xs text-blue-700">Enter how many identical units your business owns to configure per-unit tech assignments below.</p>
                                </div>
                                <div className="w-28">
                                    <input
                                        type="number"
                                        name="quantity"
                                        min="1"
                                        value={formUnits.length}
                                        onChange={(e) => handleFormQuantityChange(parseInt(e.target.value) || 1)}
                                        className="w-full text-center px-3 py-2 border border-blue-300 rounded-xl text-base font-extrabold text-blue-900 focus:ring-2 focus:ring-blue-500 bg-white"
                                    />
                                </div>
                            </div>

                            {/* PER-UNIT TECHNICIAN & LOCATION ALLOCATION MANAGER */}
                            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                                        <User className="w-4 h-4 text-blue-600" />
                                        Individual Unit Tech & Location Allocations ({formUnits.length} unit{formUnits.length > 1 ? 's' : ''})
                                    </h3>
                                    <span className="text-xs font-semibold text-gray-500">Configure each unit's truck & tech</span>
                                </div>

                                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                                    {formUnits.map((u, uIndex) => (
                                        <div key={uIndex} className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm space-y-2 text-xs">
                                            <div className="font-bold text-gray-900 text-sm flex items-center justify-between">
                                                <span>Unit #{u.unitIndex || (uIndex + 1)}</span>
                                                <span className="text-xs font-normal text-gray-400">Assigned Asset #{uIndex + 1}</span>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                <div>
                                                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Assigned Tech</label>
                                                    <select
                                                        value={u.techId || ''}
                                                        onChange={(e) => {
                                                            const selected = techs.find(t => t.id === e.target.value);
                                                            const next = [...formUnits];
                                                            next[uIndex] = {
                                                                ...u,
                                                                techId: e.target.value || null,
                                                                techName: selected ? selected.name : null
                                                            };
                                                            setFormUnits(next);
                                                        }}
                                                        className="w-full px-2.5 py-1.5 border rounded-lg bg-white font-medium focus:ring-1 focus:ring-blue-500"
                                                    >
                                                        <option value="">Unassigned (Warehouse/Shop)</option>
                                                        {techs.map(t => (
                                                            <option key={t.id} value={t.id}>{t.name}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Location / Truck</label>
                                                    <input
                                                        type="text"
                                                        value={u.location || ''}
                                                        onChange={(e) => {
                                                            const next = [...formUnits];
                                                            next[uIndex] = { ...u, location: e.target.value };
                                                            setFormUnits(next);
                                                        }}
                                                        placeholder="e.g. Truck 1 - Front Seat"
                                                        className="w-full px-2.5 py-1.5 border rounded-lg font-medium focus:ring-1 focus:ring-blue-500"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Serial # / Asset Tag</label>
                                                    <input
                                                        type="text"
                                                        value={u.serialNumber || u.assetTag || ''}
                                                        onChange={(e) => {
                                                            const next = [...formUnits];
                                                            next[uIndex] = { ...u, serialNumber: e.target.value, assetTag: e.target.value };
                                                            setFormUnits(next);
                                                        }}
                                                        placeholder="e.g. SN-8849201"
                                                        className="w-full px-2.5 py-1.5 border rounded-lg font-mono focus:ring-1 focus:ring-blue-500"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Make, Model, Size */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Make / Brand</label>
                                    <input
                                        type="text"
                                        name="make"
                                        defaultValue={editTool?.make || ''}
                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g. Klein Tools, Milwaukee"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Model #</label>
                                    <input
                                        type="text"
                                        name="model"
                                        defaultValue={editTool?.model || ''}
                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g. 11-in-1 Multi-Bit"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Size / Specs</label>
                                    <input
                                        type="text"
                                        name="size"
                                        defaultValue={editTool?.size || ''}
                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g. Standard 8 inch"
                                    />
                                </div>
                            </div>

                            {/* Category & Replacement Cost */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Tool Category</label>
                                    <select
                                        name="category"
                                        value={selectedFormCategory || toolCategories[0]?.id || ''}
                                        onChange={(e) => setSelectedFormCategory(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                                    >
                                        {toolCategories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Replacement Cost ($)</label>
                                    <input
                                        type="number"
                                        name="replacementCost"
                                        id="addToolCost"
                                        step="0.01"
                                        min="0"
                                        defaultValue={editTool?.replacementCost || ''}
                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            {/* Smart Tracker / Hardware Catalog Integration */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b pb-2">
                                    <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                        <Tag className="w-4 h-4 text-blue-600" />
                                        Smart Tracker Hardware Device (Top 20+ Catalog)
                                    </label>
                                    <span className="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-blue-600" />
                                        Dynamic Spec Collector Active
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Select Tracker Hardware Model</label>
                                        <select
                                            name="trackerModelId"
                                            id="trackerModelSelect"
                                            value={selectedTrackerModelId}
                                            onChange={(e) => {
                                                const modelId = e.target.value;
                                                setSelectedTrackerModelId(modelId);
                                                const found = TOP_TRACKER_CATALOG.find(m => m.id === modelId);
                                                const typeInput = document.getElementById('trackerTypeHidden') as HTMLInputElement;
                                                if (found && typeInput) {
                                                    typeInput.value = found.type === 'find_my' ? 'airtag' : found.type === 'tile' ? 'tile' : found.type === 'gps_cellular' ? 'gps' : 'ble_beacon';
                                                }
                                            }}
                                            className="w-full px-3 py-2 border rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 bg-white"
                                        >
                                            <option value="none">No Tracker Tag Attached</option>
                                            {getGroupedTrackerCatalog().map(group => (
                                                <optgroup key={group.groupName} label={group.groupName}>
                                                    {group.items.map(item => (
                                                        <option key={item.id} value={item.id}>
                                                            {item.name} ({item.brand})
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                        <input type="hidden" name="trackerType" id="trackerTypeHidden" defaultValue={editTool?.trackerType || 'none'} />
                                    </div>

                                    {selectedTrackerModelId !== 'none' && (() => {
                                        const config = getTrackerInputFields(selectedTrackerModelId);
                                        return (
                                            <div className="space-y-3 pt-2 border-t border-slate-200">
                                                <div className="p-2.5 bg-blue-100/70 rounded-lg text-blue-950 text-xs font-bold flex items-center gap-1.5 border border-blue-200 shadow-sm">
                                                    <Info className="w-4 h-4 text-blue-700 shrink-0" />
                                                    <span>{config.badgeHelp}</span>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-gray-700 mb-1">{config.field1Label} *</label>
                                                        <input
                                                            type={config.field1Type}
                                                            name={config.field1Key}
                                                            id={`field_${config.field1Key}`}
                                                            defaultValue={(editTool as any)?.[config.field1Key] || (config.field1Key === 'trackerUrl' ? editTool?.trackerUrl || '' : '')}
                                                            className="w-full px-3 py-2 border rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 bg-white"
                                                            placeholder={config.field1Placeholder}
                                                        />
                                                    </div>

                                                    {config.field2Label && (
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-700 mb-1">{config.field2Label}</label>
                                                            <input
                                                                type={config.field2Type || 'text'}
                                                                name={config.field2Key}
                                                                id={`field_${config.field2Key}`}
                                                                defaultValue={(editTool as any)?.[config.field2Key] || ''}
                                                                className="w-full px-3 py-2 border rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 bg-white"
                                                                placeholder={config.field2Placeholder}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Image URL */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Image / Photo URL</label>
                                <input
                                    type="url"
                                    name="imageUrl"
                                    id="addToolImage"
                                    defaultValue={editTool?.imageUrl || ''}
                                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                    placeholder="https://..."
                                />
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                                <textarea
                                    name="notes"
                                    defaultValue={editTool?.notes}
                                    rows={2}
                                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                    placeholder="Additional notes..."
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAddModalOpen(false);
                                        setEditToolVendors([]);
                                        setEditTool(null);
                                    }}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
                                >
                                    {editTool ? 'Save Specs & Tech Allocations' : 'Save Tool'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Details Modal */}
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
