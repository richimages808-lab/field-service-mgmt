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
import { Link, useNavigate } from 'react-router-dom';
import { ModuleHeader, ModuleTabs, ModuleFilterToolbar } from '../components/ui';
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
    ListFilter,
    ExternalLink,
    HelpCircle,
    Clipboard,
    QrCode,
    Bluetooth,
    Check
} from 'lucide-react';
import toast from 'react-hot-toast';
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
    const navigate = useNavigate();

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

    // Tag Search, Registration & Scanner states
    const [trackerField1Value, setTrackerField1Value] = useState<string>('');
    const [trackerField2Value, setTrackerField2Value] = useState<string>('');
    const [isTagAssistantOpen, setIsTagAssistantOpen] = useState(false);
    const [isTagCameraScannerOpen, setIsTagCameraScannerOpen] = useState(false);
    const [tagAssistantSearchQuery, setTagAssistantSearchQuery] = useState('');
    const [tagAssistantInput1, setTagAssistantInput1] = useState('');
    const [tagAssistantInput2, setTagAssistantInput2] = useState('');
    const tagScannerRef = useRef<any>(null);

    const handlePasteToField = async (fieldNum: 1 | 2) => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text || !text.trim()) {
                toast.error('Clipboard is empty. Copy the tag identifier or link first.');
                return;
            }
            const cleaned = text.trim();
            if (fieldNum === 1) {
                setTrackerField1Value(cleaned);
            } else {
                setTrackerField2Value(cleaned);
            }
            toast.success(`Saved to form: ${cleaned.length > 30 ? cleaned.substring(0, 30) + '...' : cleaned}`);
        } catch {
            toast.error('Clipboard permission denied. Please paste directly into the field.');
        }
    };

    const startTagScanner = async () => {
        setIsTagCameraScannerOpen(true);
        try {
            const { Html5Qrcode } = await import('html5-qrcode');
            await new Promise(r => setTimeout(r, 300));
            const scanner = new Html5Qrcode('tag-camera-scanner-reader');
            tagScannerRef.current = scanner;
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 260, height: 130 }, aspectRatio: 1.5 },
                (decodedText) => {
                    const cleaned = decodedText.trim();
                    setTrackerField1Value(cleaned);
                    toast.success(`Scanned & saved to form: ${cleaned}`);
                    stopTagScanner();
                },
                () => {}
            );
        } catch (err) {
            console.error('Tag camera scanner error:', err);
            toast.error('Could not access camera. Check browser permissions.');
            setIsTagCameraScannerOpen(false);
        }
    };

    const stopTagScanner = async () => {
        if (tagScannerRef.current) {
            try {
                await tagScannerRef.current.stop();
                tagScannerRef.current.clear();
            } catch (e) {}
            tagScannerRef.current = null;
        }
        setIsTagCameraScannerOpen(false);
    };

    const handleScanBluetoothTag = async () => {
        if (!('bluetooth' in navigator)) {
            toast.error('Web Bluetooth is not supported in this browser. Use Chrome or Edge.');
            return;
        }
        try {
            toast.loading('Searching for nearby Bluetooth tags & beacons...', { id: 'ble-tag-scan' });
            const device = await (navigator as any).bluetooth.requestDevice({
                acceptAllDevices: true
            });
            toast.dismiss('ble-tag-scan');
            if (device) {
                const ident = device.name || device.id;
                setTrackerField1Value(ident);
                toast.success(`Detected "${device.name || 'Bluetooth Tag'}"! Saved ID to form.`);
            }
        } catch (err: any) {
            toast.dismiss('ble-tag-scan');
            if (err.name !== 'NotFoundError') {
                console.error('BLE error:', err);
                toast.error('Bluetooth scanning canceled.');
            }
        }
    };

    // When modal opens or editTool changes, initialize unit assignments array & tracker model
    useEffect(() => {
        if (!isAddModalOpen) return;

        const initialModelId = editTool?.trackerModelId || (editTool?.trackerType ? (
            editTool.trackerType === 'airtag' ? 'apple_airtag' :
            editTool.trackerType === 'tile' ? 'tile_pro' :
            editTool.trackerType === 'ble_beacon' ? 'minew_ble_tag' :
            editTool.trackerType === 'android_find' ? 'samsung_smarttag2' :
            editTool.trackerType === 'tool_brand' ? 'milwaukee_tick' :
            editTool.trackerType === 'gps' ? 'samsara_ag52' : 'none'
        ) : 'none');

        setSelectedTrackerModelId(initialModelId);

        if (initialModelId !== 'none') {
            const config = getTrackerInputFields(initialModelId);
            const f1Val = (editTool as any)?.[config.field1Key] ||
                (config.field1Key === 'trackerUrl' ? editTool?.trackerUrl || '' :
                 config.field1Key === 'trackerSerial' ? editTool?.trackerSerial || editTool?.serialNumber || '' :
                 config.field1Key === 'trackerMac' ? editTool?.trackerMac || '' :
                 config.field1Key === 'trackerImei' ? editTool?.trackerImei || '' : '');
            setTrackerField1Value(f1Val);

            const f2Val = config.field2Key ? (
                (editTool as any)?.[config.field2Key] ||
                (config.field2Key === 'trackerUrl' ? editTool?.trackerUrl || '' :
                 config.field2Key === 'trackerSerial' ? editTool?.trackerSerial || '' :
                 config.field2Key === 'trackerMajorMinor' ? editTool?.trackerMajorMinor || '' : '')
            ) : '';
            setTrackerField2Value(f2Val);
        } else {
            setTrackerField1Value('');
            setTrackerField2Value('');
        }

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
        <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-5 max-w-[1600px] mx-auto min-h-screen">
            {/* Top Inventory Subnav Tabs */}
            <ModuleTabs
                tabs={[
                    { id: '/materials', label: 'Materials & Parts', icon: Package },
                    { id: '/tools', label: 'Tools & Equipment', icon: Wrench },
                    { id: '/inventory/trackers', label: 'Tag & Tracker Portal', icon: Tag },
                ]}
                activeTab="/tools"
                onChange={(id) => navigate(id)}
                variant="segmented"
                size="md"
            />

            {/* Harmonized Module Header */}
            <ModuleHeader
                title="Tools & Field Equipment Inventory"
                subtitle={`Assign individual tool units to technician trucks or warehouse shelves. ${tools.length} tool models (${tools.reduce((sum, t) => sum + (t.quantity || 1), 0)} total units assigned).`}
                icon={Wrench}
                iconGradient="bg-gradient-to-br from-amber-500 to-blue-600"
                badge={
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        <Sparkles className="w-3 h-3 text-blue-500" />
                        Multi-Unit Tracking
                    </span>
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {canPurchaseTools && (
                            <button
                                onClick={() => setIsPhotoModalOpen(true)}
                                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                            >
                                <Camera className="w-4 h-4 text-emerald-600" />
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
                                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs"
                            >
                                <Plus className="w-4 h-4" />
                                Add Tool / Equipment
                            </button>
                        )}
                    </div>
                }
            />

            {/* View Mode & Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <ModuleTabs
                    tabs={[
                        { id: 'grid', label: 'All Tools Grid', icon: LayoutGrid },
                        { id: 'by_tech', label: 'By Tech Truck Kit', icon: Truck },
                    ]}
                    activeTab={viewMode}
                    onChange={(id) => setViewMode(id as 'grid' | 'by_tech')}
                    variant="segmented"
                    size="sm"
                />
            </div>

            {/* Harmonized Filter Toolbar */}
            <ModuleFilterToolbar
                searchPlaceholder="Search tool name, make, model, serial #, truck, or assigned tech..."
                searchTerm={searchQuery}
                onSearchChange={setSearchQuery}
                filters={
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="all">All Categories</option>
                            {toolCategories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>

                        <select
                            value={selectedTechFilter}
                            onChange={(e) => setSelectedTechFilter(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="all">Filter by Tech: All</option>
                            <option value="unassigned">Unassigned (Shop/Warehouse)</option>
                            {techs.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>

                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs font-semibold text-slate-700 transition-colors">
                            <input
                                type="checkbox"
                                checked={showMissingOnly}
                                onChange={(e) => setShowMissingOnly(e.target.checked)}
                                className="rounded text-red-600 focus:ring-red-500 w-3.5 h-3.5"
                            />
                            <span>Missing Only</span>
                        </label>
                    </div>
                }
            />

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
                                                {tool.trackerType && tool.trackerType !== 'none' && (() => {
                                                    const model = TOP_TRACKER_CATALOG.find(m => m.id === tool.trackerModelId) ||
                                                                  TOP_TRACKER_CATALOG.find(m => m.type === tool.trackerType);
                                                    const badgeLabel = model?.brand ? `${model.brand} Tag` :
                                                                       tool.trackerType === 'airtag' ? 'AirTag' :
                                                                       tool.trackerType === 'tile' ? 'Tile' :
                                                                       tool.trackerType === 'android_find' ? 'SmartTag' : 'GPS Tag';
                                                    const targetUrl = tool.trackerUrl || model?.vendorRegistrationUrl ||
                                                                      (tool.trackerType === 'android_find' ? 'https://smartthingsfind.samsung.com/' :
                                                                       tool.trackerType === 'airtag' ? 'https://www.icloud.com/find' : '#');
                                                    return (
                                                        <a
                                                            href={targetUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="px-2.5 py-1 bg-blue-600/90 hover:bg-blue-600 backdrop-blur-md text-white text-xs font-extrabold rounded-lg shadow-sm flex items-center gap-1 transition-all"
                                                            title={`Open Live ${model?.name || badgeLabel} Location Map / Portal`}
                                                        >
                                                            <Tag className="w-3 h-3" />
                                                            {badgeLabel}
                                                        </a>
                                                    );
                                                })()}
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

                                const config = selectedTrackerModelId !== 'none' ? getTrackerInputFields(selectedTrackerModelId) : null;
                                const f1Key = config?.field1Key;
                                const f2Key = config?.field2Key;

                                const formTrackerUrl = (formData.get('trackerUrl') as string) || (f1Key === 'trackerUrl' ? trackerField1Value : f2Key === 'trackerUrl' ? trackerField2Value : '');
                                const formTrackerSerial = (formData.get('trackerSerial') as string) || (f1Key === 'trackerSerial' ? trackerField1Value : f2Key === 'trackerSerial' ? trackerField2Value : '');
                                const formTrackerMac = (formData.get('trackerMac') as string) || (f1Key === 'trackerMac' ? trackerField1Value : '');
                                const formTrackerImei = (formData.get('trackerImei') as string) || (f1Key === 'trackerImei' ? trackerField1Value : '');
                                const formTrackerMajorMinor = (formData.get('trackerMajorMinor') as string) || (f2Key === 'trackerMajorMinor' ? trackerField2Value : '');

                                handleSaveTool({
                                    name: formData.get('name') as string,
                                    make: formData.get('make') as string,
                                    model: formData.get('model') as string,
                                    size: formData.get('size') as string,
                                    category: formData.get('category') as string,
                                    subcategory: formData.get('subcategory') as string,
                                    trackerType: (formData.get('trackerType') as any) || 'none',
                                    trackerModelId: formData.get('trackerModelId') as string,
                                    trackerUrl: formTrackerUrl,
                                    trackerSerial: formTrackerSerial,
                                    trackerMac: formTrackerMac,
                                    trackerImei: formTrackerImei,
                                    trackerMajorMinor: formTrackerMajorMinor,
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
                                                    typeInput.value = found.type === 'find_my' ? 'airtag' :
                                                                      found.type === 'tile' ? 'tile' :
                                                                      found.type === 'gps_cellular' ? 'gps' :
                                                                      found.type === 'android_find' ? 'android_find' :
                                                                      found.type === 'tool_brand' ? 'tool_brand' : 'ble_beacon';
                                                } else if (typeInput) {
                                                    typeInput.value = 'none';
                                                }

                                                if (modelId !== 'none') {
                                                    const config = getTrackerInputFields(modelId);
                                                    const f1 = (editTool as any)?.[config.field1Key] || '';
                                                    const f2 = config.field2Key ? ((editTool as any)?.[config.field2Key] || '') : '';
                                                    setTrackerField1Value(f1);
                                                    setTrackerField2Value(f2);
                                                } else {
                                                    setTrackerField1Value('');
                                                    setTrackerField2Value('');
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
                                        const selectedModel = TOP_TRACKER_CATALOG.find(m => m.id === selectedTrackerModelId);
                                        return (
                                            <div className="space-y-3 pt-2 border-t border-slate-200">
                                                {/* Tracker Model Badge */}
                                                <div className="p-2.5 bg-blue-50/90 rounded-xl text-blue-950 text-xs font-bold flex items-center justify-between border border-blue-200 shadow-xs">
                                                    <div className="flex items-center gap-1.5">
                                                        <Info className="w-4 h-4 text-blue-700 shrink-0" />
                                                        <span>{config.badgeHelp}</span>
                                                    </div>
                                                    {selectedModel && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded bg-white border border-blue-200 text-blue-800 font-bold uppercase tracking-wider">
                                                            {selectedModel.brand}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Contextual Step-by-Step Identifier Guide & Links */}
                                                {config.helpGuide && (
                                                    <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-xs space-y-2.5">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                                                                <HelpCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                                                <span>How to find the identifier for this {selectedModel?.brand || 'tracker'}:</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setTagAssistantInput1(trackerField1Value);
                                                                    setTagAssistantInput2(trackerField2Value);
                                                                    setIsTagAssistantOpen(true);
                                                                }}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition-all"
                                                                title="Open assistant to search, register, or scan tags and auto-save the identifier back to form"
                                                            >
                                                                <Search className="w-3 h-3 text-indigo-200" />
                                                                <span>Search / Register Tag Assistant</span>
                                                            </button>
                                                        </div>

                                                        <div className="text-[11px] leading-relaxed text-slate-600 whitespace-pre-line pl-3 border-l-2 border-blue-400">
                                                            {config.helpGuide}
                                                        </div>

                                                        {config.helpLinks && config.helpLinks.length > 0 && (
                                                            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Official Portals & Guides:</span>
                                                                {config.helpLinks.map((link, lIdx) => (
                                                                    <a
                                                                        key={lIdx}
                                                                        href={link.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50/70 hover:bg-blue-100/80 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold transition-all shadow-xs"
                                                                        title={link.description || link.label}
                                                                    >
                                                                        <span>{link.label}</span>
                                                                        <ExternalLink className="w-3 h-3 text-blue-600" />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Dynamic Identifier Input Fields with Auto-Save Controls */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <label className="block text-xs font-semibold text-gray-700">{config.field1Label}</label>
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePasteToField(1)}
                                                                    className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 transition-colors"
                                                                    title="Paste copied identifier from clipboard"
                                                                >
                                                                    <Clipboard className="w-2.5 h-2.5" /> Paste
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={startTagScanner}
                                                                    className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 transition-colors"
                                                                    title="Scan tag barcode or QR code with camera"
                                                                >
                                                                    <Camera className="w-2.5 h-2.5" /> Scan
                                                                </button>
                                                                {(selectedModel?.type === 'ble_beacon' || selectedModel?.id === 'samsung_smarttag2' || selectedModel?.type === 'tile') && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleScanBluetoothTag}
                                                                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 transition-colors"
                                                                        title="Detect nearby Bluetooth tag"
                                                                    >
                                                                        <Bluetooth className="w-2.5 h-2.5" /> BLE
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <input
                                                            key={`${selectedTrackerModelId}_${config.field1Key}`}
                                                            type={config.field1Type}
                                                            name={config.field1Key}
                                                            id={`field_${config.field1Key}`}
                                                            value={trackerField1Value}
                                                            onChange={(e) => setTrackerField1Value(e.target.value)}
                                                            className="w-full px-3 py-2 border rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 bg-white"
                                                            placeholder={config.field1Placeholder}
                                                        />
                                                    </div>

                                                    {config.field2Label && (
                                                        <div>
                                                            <div className="flex items-center justify-between mb-1">
                                                                <label className="block text-xs font-semibold text-gray-700">{config.field2Label}</label>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePasteToField(2)}
                                                                    className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 transition-colors"
                                                                    title="Paste copied URL from clipboard"
                                                                >
                                                                    <Clipboard className="w-2.5 h-2.5" /> Paste
                                                                </button>
                                                            </div>
                                                            <input
                                                                key={`${selectedTrackerModelId}_${config.field2Key}`}
                                                                type={config.field2Type || 'text'}
                                                                name={config.field2Key}
                                                                id={`field_${config.field2Key}`}
                                                                value={trackerField2Value}
                                                                onChange={(e) => setTrackerField2Value(e.target.value)}
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

            {/* Search & Register Tag Assistant Modal */}
            {isTagAssistantOpen && selectedTrackerModelId !== 'none' && (() => {
                const config = getTrackerInputFields(selectedTrackerModelId);
                const selectedModel = TOP_TRACKER_CATALOG.find(m => m.id === selectedTrackerModelId);
                return (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
                            {/* Header */}
                            <div className="flex items-center justify-between border-b pb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-indigo-50 rounded-xl text-indigo-700 border border-indigo-100">
                                        <Tag className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-extrabold text-slate-900 text-base">Search & Register Tag Assistant</h3>
                                        <p className="text-xs text-slate-500 font-medium">Model: {selectedModel?.name} ({selectedModel?.brand})</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsTagAssistantOpen(false)}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Step 1: Search & Register in Vendor Portal */}
                            <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                                        <ExternalLink className="w-4 h-4 text-blue-700" />
                                        Official Vendor Registration & Search Portals
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white text-blue-800 border border-blue-200">
                                        Step 1
                                    </span>
                                </div>
                                <p className="text-xs text-blue-900 leading-relaxed">
                                    Launch the official vendor portal to locate your tag or register a new one. Once you have the serial number or share URL, copy it and use the capture box below to save it directly to your tool.
                                </p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {config.helpLinks.map((link, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                window.open(link.url, '_blank', 'noopener,noreferrer');
                                                toast.success(`Opened ${link.label}! When finished, paste or type the identifier below.`);
                                            }}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                        >
                                            <span>{link.label}</span>
                                            <ExternalLink className="w-3.5 h-3.5 text-blue-200" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Step 2: Capture Identifier and Save to Form */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                                        Save Identifier Back to Form
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        Step 2
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-xs font-bold text-slate-700">{config.field1Label}</label>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        try {
                                                            const text = await navigator.clipboard.readText();
                                                            if (text?.trim()) {
                                                                setTagAssistantInput1(text.trim());
                                                                toast.success('Pasted into identifier field!');
                                                            } else {
                                                                toast.error('Clipboard is empty.');
                                                            }
                                                        } catch {
                                                            toast.error('Could not access clipboard.');
                                                        }
                                                    }}
                                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-100"
                                                >
                                                    <Clipboard className="w-3 h-3" /> Paste
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsTagAssistantOpen(false);
                                                        startTagScanner();
                                                    }}
                                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100"
                                                >
                                                    <Camera className="w-3 h-3" /> Camera Scan
                                                </button>
                                            </div>
                                        </div>
                                        <input
                                            type={config.field1Type}
                                            value={tagAssistantInput1}
                                            onChange={(e) => setTagAssistantInput1(e.target.value)}
                                            placeholder={config.field1Placeholder}
                                            className="w-full px-3 py-2 border rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    {config.field2Label && (
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-xs font-bold text-slate-700">{config.field2Label}</label>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        try {
                                                            const text = await navigator.clipboard.readText();
                                                            if (text?.trim()) {
                                                                setTagAssistantInput2(text.trim());
                                                                toast.success('Pasted into secondary field!');
                                                            }
                                                        } catch {}
                                                    }}
                                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-100"
                                                >
                                                    <Clipboard className="w-3 h-3" /> Paste
                                                </button>
                                            </div>
                                            <input
                                                type={config.field2Type || 'text'}
                                                value={tagAssistantInput2}
                                                onChange={(e) => setTagAssistantInput2(e.target.value)}
                                                placeholder={config.field2Placeholder}
                                                className="w-full px-3 py-2 border rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!tagAssistantInput1.trim()) {
                                                toast.error('Please enter, paste, or scan an identifier first.');
                                                return;
                                            }
                                            setTrackerField1Value(tagAssistantInput1.trim());
                                            if (config.field2Key) {
                                                setTrackerField2Value(tagAssistantInput2.trim());
                                            }
                                            setIsTagAssistantOpen(false);
                                            toast.success('Saved tag identifier back to the tool form! 🎉');
                                        }}
                                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center justify-center gap-2"
                                    >
                                        <Check className="w-4 h-4" />
                                        Save Identifier Directly to Form
                                    </button>
                                </div>
                            </div>

                            {/* Step 3: Search Pre-Registered Fleet Tags */}
                            <div className="border-t pt-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                        <Search className="w-3.5 h-3.5 text-slate-500" />
                                        Or Pick from Pre-Registered / Existing Fleet Tags
                                    </label>
                                </div>
                                <input
                                    type="text"
                                    value={tagAssistantSearchQuery}
                                    onChange={(e) => setTagAssistantSearchQuery(e.target.value)}
                                    placeholder="Search company tools by name or tag ID..."
                                    className="w-full px-3 py-1.5 border rounded-lg text-xs bg-slate-50"
                                />
                                <div className="max-h-36 overflow-y-auto divide-y border rounded-lg bg-white">
                                    {tools
                                        .filter(t => (t.trackerSerial || t.trackerUrl || t.trackerMac || t.trackerImei) &&
                                            (t.name.toLowerCase().includes(tagAssistantSearchQuery.toLowerCase()) ||
                                             (t.trackerSerial || '').toLowerCase().includes(tagAssistantSearchQuery.toLowerCase()) ||
                                             (t.trackerMac || '').toLowerCase().includes(tagAssistantSearchQuery.toLowerCase())))
                                        .slice(0, 8)
                                        .map(t => (
                                            <div key={t.id} className="p-2 flex items-center justify-between text-xs hover:bg-slate-50">
                                                <div>
                                                    <span className="font-bold text-slate-900">{t.name}</span>
                                                    <span className="text-[10px] text-slate-500 block font-mono">
                                                        {t.trackerSerial ? `S/N: ${t.trackerSerial}` : t.trackerMac ? `MAC: ${t.trackerMac}` : t.trackerUrl ? 'Web Share Link' : ''}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (t.trackerModelId) setSelectedTrackerModelId(t.trackerModelId);
                                                        const ident = t.trackerSerial || t.trackerMac || t.trackerImei || t.trackerUrl || '';
                                                        setTrackerField1Value(ident);
                                                        if (t.trackerUrl) setTrackerField2Value(t.trackerUrl);
                                                        setIsTagAssistantOpen(false);
                                                        toast.success(`Copied tag identifier from "${t.name}" to form!`);
                                                    }}
                                                    className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded text-[11px] font-bold border"
                                                >
                                                    Use This Tag
                                                </button>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Tag Camera Barcode / QR Scanner Modal */}
            {isTagCameraScannerOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b pb-2">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                                    <Camera className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-extrabold text-sm text-slate-900">Scan Tag Barcode / QR Code</h4>
                                    <p className="text-[11px] text-slate-500">Point camera at tag packaging, barcode, or QR code</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={stopTagScanner}
                                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border">
                            <div id="tag-camera-scanner-reader" className="w-full h-full" />
                        </div>

                        <p className="text-[11px] text-slate-500 text-center">
                            Supports Samsung S/N barcodes, Milwaukee TICK 2D DataMatrix, DeWalt QR codes, BLE MAC stickers & GPS IMEI barcodes.
                        </p>

                        <button
                            type="button"
                            onClick={stopTagScanner}
                            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                        >
                            Cancel Scanning
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
