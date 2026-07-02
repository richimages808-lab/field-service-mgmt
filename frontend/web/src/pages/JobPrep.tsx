import React, { useEffect, useState, useMemo, useRef } from 'react';
import { db } from '../firebase';
import {
    collection, query, where, onSnapshot, addDoc, updateDoc, doc,
    Timestamp, getDocs, getDoc, orderBy, deleteDoc, increment
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { Job, MaterialItem, ToolItem, JobPrepPackage, PrepMaterialItem, PrepToolItem, Quote, QuoteLineItem } from '../types';
import {
    ClipboardList, Package, Wrench, Truck, Printer, CheckCircle2,
    Clock, MapPin, User, Calendar, ChevronRight, ChevronDown,
    Plus, Minus, Search, AlertTriangle, ArrowLeft, Loader2,
    CheckSquare, Square, PackageCheck, Box, ListChecks,
    ShieldCheck, Trash2, FileText, Phone, Mail, Hash,
    Filter, SortAsc, RefreshCw, Eye, ChevronUp, Star
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════
 *  JOB PREP MODULE
 *  Prepare upcoming jobs with materials/tools pick lists,
 *  printable job packets, and truck loading checklists.
 * ═══════════════════════════════════════════════════════════ */

type TabId = 'upcoming' | 'picking' | 'ready';

const STATUS_CONFIG = {
    not_prepped: { label: 'Not Prepped', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
    prepping: { label: 'Prepping', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
    ready: { label: 'Ready', color: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
    loaded: { label: 'Loaded', color: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
    dispatched: { label: 'Dispatched', color: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
};

// ─── Sorting helper for bin locations ──────────────────────────────
function binSortKey(item: { zone?: string; aisle?: string; rack?: string; shelf?: string; binLocation?: string }): string {
    return [item.zone || '', item.aisle || '', item.rack || '', item.shelf || '', item.binLocation || '']
        .map(s => s.toLowerCase().padStart(10, '0'))
        .join('|');
}

// ─── Format timestamp ──────────────────────────────────────────────
function formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateTime(ts: any): string {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatTime(ts: any): string {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function daysUntil(ts: any): number {
    if (!ts) return Infinity;
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export const JobPrep: React.FC = () => {
    const { user, organization } = useAuth();
    const [activeTab, setActiveTab] = useState<TabId>('upcoming');

    // Data
    const [jobs, setJobs] = useState<Job[]>([]);
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [tools, setTools] = useState<ToolItem[]>([]);
    const [prepPackages, setPrepPackages] = useState<JobPrepPackage[]>([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [selectedPackage, setSelectedPackage] = useState<JobPrepPackage | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [daysAhead, setDaysAhead] = useState(7);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [printMode, setPrintMode] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    const [loadedItems, setLoadedItems] = useState<Record<string, boolean>>({});

    // Staging Modal State
    const [showStagingModal, setShowStagingModal] = useState(false);
    const [stagingPackage, setStagingPackage] = useState<JobPrepPackage | null>(null);
    const [stagingInput, setStagingInput] = useState('');

    useEffect(() => {
        setLoadedItems({});
    }, [selectedPackage]);

    const orgId = user?.org_id || (user as any)?.organizationId;

    // ─── Load Data ───────────────────────────────────────────────────
    useEffect(() => {
        if (!orgId) return;
        setLoading(true);

        const unsubs: (() => void)[] = [];

        // 1. Jobs — scheduled, upcoming
        const jobsQ = query(
            collection(db, 'jobs'),
            where('org_id', '==', orgId),
            where('status', 'in', ['scheduled', 'in_progress'])
        );
        unsubs.push(onSnapshot(jobsQ, snap => {
            setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
        }));

        // 2. Materials
        const matsQ = query(collection(db, 'materials'), where('org_id', '==', orgId));
        unsubs.push(onSnapshot(matsQ, snap => {
            setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as MaterialItem)));
        }));

        // 3. Tools
        const toolsQ = query(collection(db, 'tools'), where('org_id', '==', orgId));
        unsubs.push(onSnapshot(toolsQ, snap => {
            setTools(snap.docs.map(d => ({ id: d.id, ...d.data() } as ToolItem)));
        }));

        // 4. Prep Packages
        const prepQ = query(collection(db, 'jobPrepPackages'), where('org_id', '==', orgId));
        unsubs.push(onSnapshot(prepQ, snap => {
            setPrepPackages(snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPrepPackage)));
            setLoading(false);
        }));

        return () => unsubs.forEach(u => u());
    }, [orgId]);

    // ─── Filtered Data ──────────────────────────────────────────────
    const upcomingJobs = useMemo(() => {
        const now = new Date();
        const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
        return jobs.filter(j => {
            if (!j.scheduled_at) return false;
            const d = j.scheduled_at?.toDate ? j.scheduled_at.toDate() : new Date(j.scheduled_at);
            return d >= now && d <= cutoff;
        }).sort((a, b) => {
            const da = a.scheduled_at?.toDate ? a.scheduled_at.toDate() : new Date(a.scheduled_at);
            const db2 = b.scheduled_at?.toDate ? b.scheduled_at.toDate() : new Date(b.scheduled_at);
            return da.getTime() - db2.getTime();
        });
    }, [jobs, daysAhead]);

    const preppingPackages = useMemo(() =>
        prepPackages.filter(p => p.status === 'prepping')
            .sort((a, b) => {
                const da = a.scheduledAt?.toDate ? a.scheduledAt.toDate() : new Date(a.scheduledAt || 0);
                const db2 = b.scheduledAt?.toDate ? b.scheduledAt.toDate() : new Date(b.scheduledAt || 0);
                return da.getTime() - db2.getTime();
            }),
        [prepPackages]
    );

    const readyPackages = useMemo(() =>
        prepPackages.filter(p => ['ready', 'loaded', 'dispatched'].includes(p.status))
            .sort((a, b) => {
                const da = a.scheduledAt?.toDate ? a.scheduledAt.toDate() : new Date(a.scheduledAt || 0);
                const db2 = b.scheduledAt?.toDate ? b.scheduledAt.toDate() : new Date(b.scheduledAt || 0);
                return da.getTime() - db2.getTime();
            }),
        [prepPackages]
    );

    // Map of job_id to prep package
    const jobPrepMap = useMemo(() => {
        const map: Record<string, JobPrepPackage> = {};
        prepPackages.forEach(p => { map[p.job_id] = p; });
        return map;
    }, [prepPackages]);

    // ─── Fuzzy match a tool name against inventory ────────────────────
    const fuzzyMatchTool = (name: string): ToolItem | undefined => {
        const lower = name.toLowerCase();
        // Exact name match first
        let match = tools.find(t => t.name.toLowerCase() === lower);
        if (match) return match;
        // Partial match — tool name contains the search or vice versa
        match = tools.find(t =>
            t.name.toLowerCase().includes(lower) || lower.includes(t.name.toLowerCase())
        );
        if (match) return match;
        // Word-level match — any significant word matches
        const words = lower.split(/[\s/,&-]+/).filter(w => w.length > 3);
        match = tools.find(t => {
            const tLower = t.name.toLowerCase();
            return words.some(w => tLower.includes(w));
        });
        return match;
    };

    // ─── Create Prep Package ─────────────────────────────────────────
    const handleCreatePrepPackage = async (job: Job) => {
        if (!user || !orgId) return;
        setIsSubmitting(true);

        try {
            // Try to load the job's approved quote for auto-populating materials
            let quoteMaterials: PrepMaterialItem[] = [];
            let quoteId: string | undefined;
            let quoteEquipmentNames: string[] = [];

            if (job.active_quote_id) {
                try {
                    const quoteDoc = await getDoc(doc(db, 'quotes', job.active_quote_id));
                    if (quoteDoc.exists()) {
                        const quote = quoteDoc.data() as Quote;
                        quoteId = job.active_quote_id;

                        // Extract material line items from the quote
                        quoteMaterials = (quote.lineItems || [])
                            .filter((li: QuoteLineItem) => li.type === 'material' && li.materialId)
                            .map((li: QuoteLineItem) => {
                                // Find the material in inventory for bin location
                                const mat = materials.find(m => m.id === li.materialId);
                                return {
                                    materialId: li.materialId!,
                                    name: li.description || mat?.name || 'Unknown Material',
                                    sku: mat?.sku || '',
                                    quantityNeeded: li.quantity,
                                    quantityPulled: 0,
                                    binLocation: mat?.binLocation || '',
                                    zone: mat?.zone || '',
                                    aisle: mat?.aisle || '',
                                    rack: mat?.rack || '',
                                    shelf: mat?.shelf || '',
                                    unitCost: li.baseCost || li.unitPrice || 0,
                                    picked: false,
                                };
                            });

                        // Collect equipment line item names for tool matching
                        quoteEquipmentNames = (quote.lineItems || [])
                            .filter((li: QuoteLineItem) => li.type === 'equipment')
                            .map((li: QuoteLineItem) => li.description);
                    }
                } catch (e) {
                    console.warn('Could not load quote for auto-populating prep:', e);
                }
            }

            // ─── Auto-recommend tools ────────────────────────────────
            const recommendedTools: PrepToolItem[] = [];
            const addedToolIds = new Set<string>();

            // Source 1: AI job recommendation requiredTools
            if (job.aiRecommendation?.requiredTools) {
                for (const aiTool of job.aiRecommendation.requiredTools) {
                    const match = fuzzyMatchTool(aiTool.name);
                    if (match && !addedToolIds.has(match.id)) {
                        addedToolIds.add(match.id);
                        recommendedTools.push({
                            toolId: match.id,
                            name: match.name,
                            category: match.category || '',
                            currentLocation: match.location || '',
                            binLocation: '',
                            condition: match.condition || 'good',
                            picked: false,
                        });
                    }
                }
            }

            // Source 2: Equipment line items from the quote
            for (const equipName of quoteEquipmentNames) {
                const match = fuzzyMatchTool(equipName);
                if (match && !addedToolIds.has(match.id)) {
                    addedToolIds.add(match.id);
                    recommendedTools.push({
                        toolId: match.id,
                        name: match.name,
                        category: match.category || '',
                        currentLocation: match.location || '',
                        binLocation: '',
                        condition: match.condition || 'good',
                        picked: false,
                    });
                }
            }

            // Source 3: Category-based common tools (from COMMON_TOOLS mapping)
            const jobCategory = (job.category || job.type || '').toLowerCase();
            const CATEGORY_TOOL_KEYWORDS: Record<string, string[]> = {
                hvac: ['multimeter', 'gauge', 'vacuum', 'leak detector', 'thermometer', 'wrench'],
                plumbing: ['pipe wrench', 'plunger', 'snake', 'auger', 'basin wrench', 'tubing cutter', 'torch'],
                electrical: ['multimeter', 'wire stripper', 'voltage tester', 'circuit', 'fish tape'],
                repair: ['screwdriver', 'wrench', 'drill', 'multimeter'],
                maintenance: ['screwdriver', 'wrench', 'filter', 'cleaning'],
                installation: ['drill', 'level', 'wrench', 'screwdriver', 'tape'],
                inspection: ['multimeter', 'camera', 'flashlight', 'gauge'],
                emergency: ['multimeter', 'wrench', 'flashlight', 'pipe wrench'],
            };
            const categoryKeywords = CATEGORY_TOOL_KEYWORDS[jobCategory] || CATEGORY_TOOL_KEYWORDS['repair'] || [];
            for (const keyword of categoryKeywords) {
                if (addedToolIds.size >= 10) break; // Cap at 10 recommended tools
                const match = fuzzyMatchTool(keyword);
                if (match && !addedToolIds.has(match.id)) {
                    addedToolIds.add(match.id);
                    recommendedTools.push({
                        toolId: match.id,
                        name: match.name,
                        category: match.category || '',
                        currentLocation: match.location || '',
                        binLocation: '',
                        condition: match.condition || 'good',
                        picked: false,
                    });
                }
            }

            const prepPackage: Omit<JobPrepPackage, 'id'> = {
                org_id: orgId,
                job_id: job.id,
                quote_id: quoteId || null,
                customerName: job.customer?.name || 'Unknown',
                customerAddress: job.customer?.address || '',
                customerPhone: job.customer?.phone || '',
                scheduledAt: job.scheduled_at || null,
                jobDescription: job.request?.description || '',
                assignedTechId: job.assigned_tech_id || null,
                assignedTechName: job.assigned_tech_name || null,
                jobCategory: job.category || job.type || null,
                estimatedDuration: job.estimated_duration || job.estimates?.duration_minutes || null,
                materials: quoteMaterials,
                tools: recommendedTools,
                status: 'prepping',
                prepStartedAt: Timestamp.now(),
                preparedBy: user.uid,
                preparedByName: user.displayName || user.email || 'Unknown',
                specialInstructions: job.notes?.internal || '',
                internalNotes: '',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                createdBy: user.uid,
            };

            await addDoc(collection(db, 'jobPrepPackages'), prepPackage);
            const itemCount = quoteMaterials.length + recommendedTools.length;
            toast.success(`Prep package created for ${job.customer?.name}${itemCount > 0 ? ` — ${quoteMaterials.length} materials, ${recommendedTools.length} tools auto-added` : ''}`);
            setShowCreateModal(false);
            setSelectedJob(null);
            setActiveTab('picking');
        } catch (err) {
            console.error('Error creating prep package:', err);
            toast.error('Failed to create prep package');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── Update Picking Status (with inventory deduction) ─────────────
    const toggleMaterialPicked = async (pkg: JobPrepPackage, matIndex: number) => {
        const mat = pkg.materials[matIndex];
        const wasPicked = mat.picked;
        const nowPicked = !wasPicked;
        const qty = mat.quantityNeeded;

        const updatedMaterials = [...pkg.materials];
        updatedMaterials[matIndex] = {
            ...updatedMaterials[matIndex],
            picked: nowPicked,
            quantityPulled: nowPicked ? qty : 0,
        };

        // Update the prep package
        await updateDoc(doc(db, 'jobPrepPackages', pkg.id), {
            materials: updatedMaterials,
            updatedAt: Timestamp.now(),
        });

        // Deduct/restore inventory quantity
        if (mat.materialId) {
            try {
                const delta = nowPicked ? -qty : qty; // picking = decrement, un-picking = restore
                await updateDoc(doc(db, 'materials', mat.materialId), {
                    quantity: increment(delta),
                });
            } catch (e) {
                console.warn('Could not update inventory quantity:', e);
            }
        }
    };

    const toggleToolPicked = async (pkg: JobPrepPackage, toolIndex: number) => {
        const updatedTools = [...pkg.tools];
        updatedTools[toolIndex] = {
            ...updatedTools[toolIndex],
            picked: !updatedTools[toolIndex].picked,
        };

        await updateDoc(doc(db, 'jobPrepPackages', pkg.id), {
            tools: updatedTools,
            updatedAt: Timestamp.now(),
        });
    };

    // ─── Mark Package as Ready (opens modal) ─────────────────────────
    const markAsReady = (pkg: JobPrepPackage) => {
        const allMaterialsPicked = pkg.materials.every(m => m.picked);
        const allToolsPicked = pkg.tools.every(t => t.picked);

        if (!allMaterialsPicked || !allToolsPicked) {
            toast.error('Not all items have been picked yet');
            return;
        }

        setStagingPackage(pkg);
        setStagingInput(pkg.stagingLocation || '');
        setShowStagingModal(true);
    };

    // ─── Confirm Package Staging and Mark Ready ──────────────────────
    const handleConfirmStaging = async () => {
        if (!stagingPackage) return;
        setIsSubmitting(true);
        try {
            await updateDoc(doc(db, 'jobPrepPackages', stagingPackage.id), {
                status: 'ready',
                stagingLocation: stagingInput.trim() || 'General Staging',
                prepCompletedAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });
            toast.success('Package marked as ready and staged!');
            setSelectedPackage(null);
            setShowStagingModal(false);
            setStagingPackage(null);
            setStagingInput('');
        } catch (err) {
            console.error('Error marking ready:', err);
            toast.error('Failed to update status');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── Verify/Load Package ─────────────────────────────────────────
    const markAsLoaded = async (pkg: JobPrepPackage) => {
        if (!user) return;
        await updateDoc(doc(db, 'jobPrepPackages', pkg.id), {
            status: 'loaded',
            verifiedBy: user.uid,
            verifiedByName: user.displayName || user.email || 'Unknown',
            updatedAt: Timestamp.now(),
        });
        toast.success('Package verified & loaded on truck!');
    };

    const markAsDispatched = async (pkg: JobPrepPackage) => {
        await updateDoc(doc(db, 'jobPrepPackages', pkg.id), {
            status: 'dispatched',
            updatedAt: Timestamp.now(),
        });
        toast.success('Dispatched!');
    };

    // ─── Delete Package ──────────────────────────────────────────────
    const deletePackage = async (pkg: JobPrepPackage) => {
        if (!window.confirm('Delete this prep package? This cannot be undone.')) return;
        
        // Reverse logistics: return picked materials back to inventory
        for (const mat of pkg.materials) {
            if (mat.materialId && mat.picked) {
                try {
                    await updateDoc(doc(db, 'materials', mat.materialId), {
                        quantity: increment(mat.quantityNeeded),
                    });
                } catch (e) {
                    console.warn(`Failed to restore material ${mat.materialId} on delete:`, e);
                }
            }
        }
        
        await deleteDoc(doc(db, 'jobPrepPackages', pkg.id));
        toast.success('Prep package deleted and picked inventory restored!');
        setSelectedPackage(null);
    };

    // ─── Add Material to Package ─────────────────────────────────────
    const [showAddMaterial, setShowAddMaterial] = useState(false);
    const [materialSearch, setMaterialSearch] = useState('');
    const [addingToPackage, setAddingToPackage] = useState<JobPrepPackage | null>(null);

    const filteredAddMaterials = useMemo(() => {
        if (!materialSearch.trim()) return materials.slice(0, 20);
        const q = materialSearch.toLowerCase();
        return materials.filter(m =>
            m.name.toLowerCase().includes(q) ||
            m.sku?.toLowerCase().includes(q) ||
            m.category?.toLowerCase().includes(q)
        ).slice(0, 20);
    }, [materials, materialSearch]);

    const addMaterialToPackage = async (mat: MaterialItem, pkg: JobPrepPackage) => {
        // Check if already in package
        if (pkg.materials.some(m => m.materialId === mat.id)) {
            toast.error('Material already in package');
            return;
        }

        const newMat: PrepMaterialItem = {
            materialId: mat.id,
            name: mat.name,
            sku: mat.sku,
            quantityNeeded: 1,
            quantityPulled: 0,
            binLocation: mat.binLocation || '',
            zone: mat.zone || '',
            aisle: mat.aisle || '',
            rack: mat.rack || '',
            shelf: mat.shelf || '',
            unitCost: mat.unitCost || 0,
            picked: false,
        };

        await updateDoc(doc(db, 'jobPrepPackages', pkg.id), {
            materials: [...pkg.materials, newMat],
            updatedAt: Timestamp.now(),
        });
        toast.success(`Added ${mat.name}`);
    };

    // ─── Add Tool to Package ─────────────────────────────────────────
    const [showAddTool, setShowAddTool] = useState(false);
    const [toolSearch, setToolSearch] = useState('');

    const filteredAddTools = useMemo(() => {
        if (!toolSearch.trim()) return tools.slice(0, 20);
        const q = toolSearch.toLowerCase();
        return tools.filter(t =>
            t.name.toLowerCase().includes(q) ||
            t.category?.toLowerCase().includes(q)
        ).slice(0, 20);
    }, [tools, toolSearch]);

    const addToolToPackage = async (tool: ToolItem, pkg: JobPrepPackage) => {
        if (pkg.tools.some(t => t.toolId === tool.id)) {
            toast.error('Tool already in package');
            return;
        }

        const newTool: PrepToolItem = {
            toolId: tool.id,
            name: tool.name,
            category: tool.category || '',
            currentLocation: tool.location || '',
            binLocation: '',
            condition: tool.condition || 'good',
            picked: false,
        };

        await updateDoc(doc(db, 'jobPrepPackages', pkg.id), {
            tools: [...pkg.tools, newTool],
            updatedAt: Timestamp.now(),
        });
        toast.success(`Added ${tool.name}`);
    };

    // ─── Remove Item from Package ────────────────────────────────────
    const removeMaterialFromPackage = async (pkg: JobPrepPackage, index: number) => {
        const mat = pkg.materials[index];
        // Reverse logistics: return to inventory if picked
        if (mat.materialId && mat.picked) {
            try {
                await updateDoc(doc(db, 'materials', mat.materialId), {
                    quantity: increment(mat.quantityNeeded),
                });
            } catch (e) {
                console.warn(`Failed to restore material ${mat.materialId} on remove:`, e);
            }
        }

        const updated = pkg.materials.filter((_, i) => i !== index);
        await updateDoc(doc(db, 'jobPrepPackages', pkg.id), {
            materials: updated,
            updatedAt: Timestamp.now(),
        });
    };

    const removeToolFromPackage = async (pkg: JobPrepPackage, index: number) => {
        const updated = pkg.tools.filter((_, i) => i !== index);
        await updateDoc(doc(db, 'jobPrepPackages', pkg.id), {
            tools: updated,
            updatedAt: Timestamp.now(),
        });
    };

    // ─── Update Material Quantity ────────────────────────────────────
    const updateMaterialQty = async (pkg: JobPrepPackage, index: number, qty: number) => {
        const updatedMaterials = [...pkg.materials];
        updatedMaterials[index] = { ...updatedMaterials[index], quantityNeeded: Math.max(1, qty) };
        await updateDoc(doc(db, 'jobPrepPackages', pkg.id), {
            materials: updatedMaterials,
            updatedAt: Timestamp.now(),
        });
    };

    // ─── Print Job Packet ────────────────────────────────────────────
    const handlePrint = (pkg: JobPrepPackage) => {
        setSelectedPackage(pkg);
        setPrintMode(true);
        setTimeout(() => window.print(), 300);
        setTimeout(() => setPrintMode(false), 1000);
    };

    // ═══════════════════════════════════════════════════════════════
    //  TAB CONTENT RENDERERS
    // ═══════════════════════════════════════════════════════════════

    // ─── TAB 1: Upcoming Jobs ──────────────────────────────────────
    const renderUpcomingJobs = () => {
        const filtered = searchQuery.trim()
            ? upcomingJobs.filter(j =>
                j.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                j.customer.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                j.assigned_tech_name?.toLowerCase().includes(searchQuery.toLowerCase())
            )
            : upcomingJobs;

        // Group by date
        const grouped: Record<string, Job[]> = {};
        filtered.forEach(job => {
            const dateKey = formatDate(job.scheduled_at);
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(job);
        });

        return (
            <div className="space-y-4">
                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search jobs..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Show next:</span>
                        {[3, 7, 14, 30].map(d => (
                            <button
                                key={d}
                                onClick={() => setDaysAhead(d)}
                                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${daysAhead === d
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="text-2xl font-bold text-gray-900">{filtered.length}</div>
                        <div className="text-sm text-gray-500">Upcoming Jobs</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="text-2xl font-bold text-green-600">
                            {filtered.filter(j => jobPrepMap[j.id]?.status === 'ready' || jobPrepMap[j.id]?.status === 'loaded').length}
                        </div>
                        <div className="text-sm text-gray-500">Prepped & Ready</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="text-2xl font-bold text-amber-600">
                            {filtered.filter(j => jobPrepMap[j.id]?.status === 'prepping').length}
                        </div>
                        <div className="text-sm text-gray-500">In Progress</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="text-2xl font-bold text-red-600">
                            {filtered.filter(j => !jobPrepMap[j.id]).length}
                        </div>
                        <div className="text-sm text-gray-500">Need Prepping</div>
                    </div>
                </div>

                {/* Grouped Jobs */}
                {Object.keys(grouped).length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-lg font-medium">No scheduled jobs in the next {daysAhead} days</p>
                        <p className="text-sm mt-1">Jobs will appear here when scheduled on the calendar</p>
                    </div>
                ) : (
                    Object.entries(grouped).map(([dateKey, dateJobs]) => (
                        <div key={dateKey} className="space-y-2">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-1 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {dateKey}
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                    {dateJobs.length} job{dateJobs.length !== 1 ? 's' : ''}
                                </span>
                            </h3>
                            <div className="grid gap-3">
                                {dateJobs.map(job => {
                                    const prep = jobPrepMap[job.id];
                                    const days = daysUntil(job.scheduled_at);
                                    const isUrgent = days <= 1;

                                    return (
                                        <div
                                            key={job.id}
                                            className={`bg-white border rounded-xl p-4 hover:shadow-md transition-all ${isUrgent && !prep ? 'border-red-300 bg-red-50/30' : 'border-gray-200'
                                                }`}
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="font-semibold text-gray-900 truncate">{job.customer.name}</h4>
                                                        {isUrgent && !prep && (
                                                            <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                                                <AlertTriangle className="w-3 h-3" /> {days === 0 ? 'Today!' : 'Tomorrow'}
                                                            </span>
                                                        )}
                                                        {prep && (
                                                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[prep.status].color}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[prep.status].dot}`} />
                                                                {STATUS_CONFIG[prep.status].label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-gray-500">
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3.5 h-3.5" />
                                                            {formatTime(job.scheduled_at)}
                                                        </span>
                                                        {job.assigned_tech_name && (
                                                            <span className="flex items-center gap-1">
                                                                <User className="w-3.5 h-3.5" />
                                                                {job.assigned_tech_name}
                                                            </span>
                                                        )}
                                                        {job.customer.address && (
                                                            <span className="flex items-center gap-1 truncate max-w-[250px]">
                                                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                                                {job.customer.address}
                                                            </span>
                                                        )}
                                                        {job.estimated_duration && (
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="w-3.5 h-3.5" />
                                                                ~{Math.round(job.estimated_duration / 60)}h
                                                            </span>
                                                        )}
                                                    </div>
                                                    {job.request?.description && (
                                                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{job.request.description}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {prep ? (
                                                        <button
                                                            onClick={() => {
                                                                setSelectedPackage(prep);
                                                                if (prep.status === 'prepping') setActiveTab('picking');
                                                                else setActiveTab('ready');
                                                            }}
                                                            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                            View Prep
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleCreatePrepPackage(job)}
                                                            disabled={isSubmitting}
                                                            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                                                        >
                                                            {isSubmitting ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                            ) : (
                                                                <PackageCheck className="w-4 h-4" />
                                                            )}
                                                            Start Prep
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        );
    };

    // ─── TAB 2: Picking List ───────────────────────────────────────
    const renderPickingList = () => {
        if (selectedPackage && selectedPackage.status === 'prepping') {
            return renderPickingDetail(selectedPackage);
        }

        if (preppingPackages.length === 0) {
            return (
                <div className="text-center py-16 text-gray-400">
                    <ListChecks className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium">No packages being prepped</p>
                    <p className="text-sm mt-1">Start prepping a job from the Upcoming Jobs tab</p>
                </div>
            );
        }

        return (
            <div className="space-y-3">
                <p className="text-sm text-gray-500">Active prep packages that need picking. Click to open the pick list.</p>
                {preppingPackages.map(pkg => {
                    const totalItems = pkg.materials.length + pkg.tools.length;
                    const pickedItems = pkg.materials.filter(m => m.picked).length + pkg.tools.filter(t => t.picked).length;
                    const progress = totalItems > 0 ? Math.round((pickedItems / totalItems) * 100) : 0;

                    return (
                        <div
                            key={pkg.id}
                            onClick={() => setSelectedPackage(pkg)}
                            className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-blue-300 cursor-pointer transition-all"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-semibold text-gray-900">{pkg.customerName}</h4>
                                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {formatDateTime(pkg.scheduledAt)}
                                        </span>
                                        {pkg.assignedTechName && (
                                            <span className="flex items-center gap-1">
                                                <User className="w-3.5 h-3.5" />
                                                {pkg.assignedTechName}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <div className="text-sm font-medium">{pickedItems}/{totalItems} picked</div>
                                        <div className="w-24 h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-400" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // ─── Picking Detail View ─────────────────────────────────────────
    const renderPickingDetail = (pkg: JobPrepPackage) => {
        const sortedMaterials = [...pkg.materials].sort((a, b) => binSortKey(a).localeCompare(binSortKey(b)));
        const sortedTools = [...pkg.tools].sort((a, b) => (a.currentLocation || '').localeCompare(b.currentLocation || ''));

        const totalItems = pkg.materials.length + pkg.tools.length;
        const pickedItems = pkg.materials.filter(m => m.picked).length + pkg.tools.filter(t => t.picked).length;
        const allPicked = totalItems > 0 && pickedItems === totalItems;

        return (
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setSelectedPackage(null)}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to list
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handlePrint(pkg)}
                            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                        >
                            <Printer className="w-4 h-4" />
                            Print
                        </button>
                        <button
                            onClick={() => deletePackage(pkg)}
                            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Job Summary Card */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="text-lg font-bold text-gray-900">{pkg.customerName}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600">
                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDateTime(pkg.scheduledAt)}</span>
                        {pkg.assignedTechName && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{pkg.assignedTechName}</span>}
                        {pkg.customerAddress && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{pkg.customerAddress}</span>}
                        {pkg.estimatedDuration && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />~{Math.round(pkg.estimatedDuration / 60)}h</span>}
                    </div>
                    {pkg.jobDescription && (
                        <p className="text-sm text-gray-600 mt-2 line-clamp-3">{pkg.jobDescription}</p>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Pick Progress</span>
                        <span className={`text-sm font-bold ${allPicked ? 'text-green-600' : 'text-blue-600'}`}>
                            {pickedItems} / {totalItems} items
                        </span>
                    </div>
                    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${allPicked ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${totalItems > 0 ? (pickedItems / totalItems) * 100 : 0}%` }}
                        />
                    </div>
                </div>

                {/* Materials Pick List */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                            <Package className="w-4 h-4 text-blue-600" />
                            Materials ({pkg.materials.filter(m => m.picked).length}/{pkg.materials.length})
                        </h4>
                        <button
                            onClick={() => { setAddingToPackage(pkg); setShowAddMaterial(true); setMaterialSearch(''); }}
                            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add
                        </button>
                    </div>

                    {sortedMaterials.length === 0 ? (
                        <div className="p-6 text-center text-gray-400 text-sm">No materials added yet</div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {sortedMaterials.map((mat, idx) => {
                                const originalIdx = pkg.materials.findIndex(m => m.materialId === mat.materialId);
                                const invMat = materials.find(m => m.id === mat.materialId);
                                const inStock = invMat ? invMat.quantity : 0;
                                const hasShortage = inStock < mat.quantityNeeded;

                                return (
                                    <div
                                        key={mat.materialId}
                                        className={`flex items-center gap-3 px-4 py-3 transition-colors ${mat.picked ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}
                                    >
                                        {/* Pick checkbox — large touch target */}
                                        <button
                                            onClick={() => toggleMaterialPicked(pkg, originalIdx)}
                                            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border-2 transition-colors touch-manipulation"
                                            style={{
                                                borderColor: mat.picked ? '#22c55e' : '#d1d5db',
                                                backgroundColor: mat.picked ? '#dcfce7' : 'transparent',
                                            }}
                                        >
                                            {mat.picked ? (
                                                <CheckSquare className="w-6 h-6 text-green-600" />
                                            ) : (
                                                <Square className="w-6 h-6 text-gray-400" />
                                            )}
                                        </button>

                                        {/* Item info */}
                                        <div className="flex-1 min-w-0">
                                            <div className={`font-medium ${mat.picked ? 'text-green-700 line-through' : 'text-gray-900'}`}>
                                                {mat.name}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                                                {mat.sku && <span>SKU: {mat.sku}</span>}
                                                {mat.binLocation && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono font-medium">
                                                        <MapPin className="w-3 h-3" />
                                                        {mat.binLocation}
                                                    </span>
                                                )}
                                                {mat.zone && <span>Zone: {mat.zone}</span>}
                                                <span className="font-semibold text-gray-600">Stock: {inStock}</span>
                                                {hasShortage && !mat.picked && (
                                                    <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                        ⚠️ Shortage
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Quantity */}
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={e => { e.stopPropagation(); updateMaterialQty(pkg, originalIdx, mat.quantityNeeded - 1); }}
                                                disabled={mat.picked}
                                                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Minus className="w-3 h-3" />
                                            </button>
                                            <span className="w-8 text-center text-sm font-bold">{mat.quantityNeeded}</span>
                                            <button
                                                onClick={e => { e.stopPropagation(); updateMaterialQty(pkg, originalIdx, mat.quantityNeeded + 1); }}
                                                disabled={mat.picked}
                                                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Plus className="w-3 h-3" />
                                            </button>
                                        </div>

                                        {/* Remove */}
                                        <button
                                            onClick={e => { e.stopPropagation(); removeMaterialFromPackage(pkg, originalIdx); }}
                                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Tools Pick List */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-purple-600" />
                            Tools ({pkg.tools.filter(t => t.picked).length}/{pkg.tools.length})
                        </h4>
                        <button
                            onClick={() => { setAddingToPackage(pkg); setShowAddTool(true); setToolSearch(''); }}
                            className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add
                        </button>
                    </div>

                    {sortedTools.length === 0 ? (
                        <div className="p-6 text-center text-gray-400 text-sm">No tools added yet — add tools this job will need</div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {sortedTools.map((tool, idx) => {
                                const originalIdx = pkg.tools.findIndex(t => t.toolId === tool.toolId);
                                const otherAllocated = prepPackages.find(p =>
                                    p.id !== pkg.id &&
                                    ['prepping', 'ready', 'loaded'].includes(p.status) &&
                                    p.tools.some(t => t.toolId === tool.toolId && t.picked)
                                );

                                return (
                                    <div
                                        key={tool.toolId}
                                        className={`flex items-center gap-3 px-4 py-3 transition-colors ${tool.picked ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}
                                    >
                                        <button
                                            onClick={() => toggleToolPicked(pkg, originalIdx)}
                                            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border-2 transition-colors touch-manipulation"
                                            style={{
                                                borderColor: tool.picked ? '#22c55e' : '#d1d5db',
                                                backgroundColor: tool.picked ? '#dcfce7' : 'transparent',
                                            }}
                                        >
                                            {tool.picked ? (
                                                <CheckSquare className="w-6 h-6 text-green-600" />
                                            ) : (
                                                <Square className="w-6 h-6 text-gray-400" />
                                            )}
                                        </button>

                                        <div className="flex-1 min-w-0">
                                            <div className={`font-medium ${tool.picked ? 'text-green-700 line-through' : 'text-gray-900'}`}>
                                                {tool.name}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                                                {tool.category && <span>{tool.category}</span>}
                                                {tool.currentLocation && (
                                                    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                                        <Truck className="w-3 h-3" />
                                                        {tool.currentLocation}
                                                    </span>
                                                )}
                                                {tool.condition && tool.condition !== 'good' && (
                                                    <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        {tool.condition}
                                                    </span>
                                                )}
                                                {otherAllocated && !tool.picked && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                        ⚠️ Allocated to {otherAllocated.customerName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={e => { e.stopPropagation(); removeToolFromPackage(pkg, originalIdx); }}
                                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Special Instructions */}
                {pkg.specialInstructions && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <h4 className="font-semibold text-amber-800 flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4" />
                            Special Instructions
                        </h4>
                        <p className="text-sm text-amber-900">{pkg.specialInstructions}</p>
                    </div>
                )}

                {/* Mark as Ready */}
                {allPicked && (
                    <button
                        onClick={() => markAsReady(pkg)}
                        className="w-full flex items-center justify-center gap-2 px-6 py-4 text-base font-semibold rounded-xl bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl transition-all"
                    >
                        <CheckCircle2 className="w-5 h-5" />
                        All Items Picked — Mark as Ready
                    </button>
                )}
            </div>
        );
    };

    // ─── TAB 3: Ready / History ────────────────────────────────────
    const renderReady = () => {
        if (selectedPackage && ['ready', 'loaded', 'dispatched'].includes(selectedPackage.status)) {
            return renderReadyDetail(selectedPackage);
        }

        if (readyPackages.length === 0) {
            return (
                <div className="text-center py-16 text-gray-400">
                    <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium">No packages ready yet</p>
                    <p className="text-sm mt-1">Completed picks will show up here for truck loading</p>
                </div>
            );
        }

        return (
            <div className="space-y-3">
                {readyPackages.map(pkg => (
                    <div
                        key={pkg.id}
                        onClick={() => setSelectedPackage(pkg)}
                        className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-green-300 cursor-pointer transition-all"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-gray-900">{pkg.customerName}</h4>
                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[pkg.status].color}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[pkg.status].dot}`} />
                                        {STATUS_CONFIG[pkg.status].label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5" />
                                        {formatDateTime(pkg.scheduledAt)}
                                    </span>
                                    {pkg.preparedByName && (
                                        <span className="flex items-center gap-1">
                                            <User className="w-3.5 h-3.5" />
                                            Prepped by {pkg.preparedByName}
                                        </span>
                                    )}
                                    {pkg.stagingLocation && (
                                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                                            📍 {pkg.stagingLocation}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">
                                    {pkg.materials.length + pkg.tools.length} items
                                </span>
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // ─── Ready Detail / Truck Loading ──────────────────────────────
    const renderReadyDetail = (pkg: JobPrepPackage) => {
        const allMaterialsLoaded = pkg.materials.every(m => loadedItems[m.materialId]);
        const allToolsLoaded = pkg.tools.every(t => loadedItems[t.toolId]);
        const allLoaded = allMaterialsLoaded && allToolsLoaded;

        return (
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setSelectedPackage(null)}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handlePrint(pkg)}
                            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                        >
                            <Printer className="w-4 h-4" />
                            Print Packet
                        </button>
                        <button
                            onClick={() => deletePackage(pkg)}
                            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Status Card */}
                <div className={`rounded-xl p-4 border ${pkg.status === 'ready' ? 'bg-green-50 border-green-200' : pkg.status === 'loaded' ? 'bg-blue-50 border-blue-200' : 'bg-purple-50 border-purple-200'}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">{pkg.customerName}</h3>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-600">
                                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDateTime(pkg.scheduledAt)}</span>
                                {pkg.assignedTechName && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{pkg.assignedTechName}</span>}
                            </div>
                            {pkg.stagingLocation && (
                                <div className="mt-2 text-sm font-semibold text-blue-800 bg-blue-100/50 px-3 py-1 rounded-lg inline-block">
                                    📍 Staging Location: <strong>{pkg.stagingLocation}</strong>
                                </div>
                            )}
                        </div>
                        <span className={`inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium ${STATUS_CONFIG[pkg.status].color}`}>
                            <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[pkg.status].dot}`} />
                            {STATUS_CONFIG[pkg.status].label}
                        </span>
                    </div>
                </div>

                {/* Truck Loading Checklist */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                            <Truck className="w-4 h-4 text-blue-600" />
                            Truck Loading Checklist
                        </h4>
                        {pkg.status === 'ready' && (
                            <span className="text-xs text-gray-500 font-semibold bg-gray-200 px-2 py-0.5 rounded-full">
                                {Object.values(loadedItems).filter(Boolean).length} / {pkg.materials.length + pkg.tools.length} loaded
                            </span>
                        )}
                    </div>

                    <div className="divide-y divide-gray-100">
                        {pkg.materials.map((mat, idx) => {
                            const isLoaded = pkg.status !== 'ready' || !!loadedItems[mat.materialId];
                            return (
                                <div key={mat.materialId} className="flex items-center gap-3 px-4 py-2.5">
                                    <button
                                        onClick={() => setLoadedItems(prev => ({ ...prev, [mat.materialId]: !prev[mat.materialId] }))}
                                        disabled={pkg.status !== 'ready'}
                                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border transition-colors touch-manipulation disabled:opacity-75"
                                        style={{
                                            borderColor: isLoaded ? '#22c55e' : '#d1d5db',
                                            backgroundColor: isLoaded ? '#dcfce7' : 'transparent',
                                        }}
                                    >
                                        {isLoaded ? (
                                            <CheckSquare className="w-5 h-5 text-green-600" />
                                        ) : (
                                            <Square className="w-5 h-5 text-gray-400" />
                                        )}
                                    </button>
                                    <span className={`flex-1 text-sm ${isLoaded ? 'text-green-700 line-through' : 'text-gray-900'}`}>{mat.name}</span>
                                    <span className="text-sm text-gray-500 font-medium">×{mat.quantityNeeded}</span>
                                </div>
                            );
                        })}
                        {pkg.tools.map((tool, idx) => {
                            const isLoaded = pkg.status !== 'ready' || !!loadedItems[tool.toolId];
                            return (
                                <div key={tool.toolId} className="flex items-center gap-3 px-4 py-2.5">
                                    <button
                                        onClick={() => setLoadedItems(prev => ({ ...prev, [tool.toolId]: !prev[tool.toolId] }))}
                                        disabled={pkg.status !== 'ready'}
                                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border transition-colors touch-manipulation disabled:opacity-75"
                                        style={{
                                            borderColor: isLoaded ? '#22c55e' : '#d1d5db',
                                            backgroundColor: isLoaded ? '#dcfce7' : 'transparent',
                                        }}
                                    >
                                        {isLoaded ? (
                                            <CheckSquare className="w-5 h-5 text-green-600" />
                                        ) : (
                                            <Square className="w-5 h-5 text-gray-400" />
                                        )}
                                    </button>
                                    <span className={`flex-1 text-sm ${isLoaded ? 'text-green-700 line-through' : 'text-gray-900'}`}>{tool.name}</span>
                                    <span className="text-xs text-gray-400">{tool.category}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Prep audit info */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-600 space-y-1">
                    {pkg.preparedByName && (
                        <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /> Prepped by <strong>{pkg.preparedByName}</strong></div>
                    )}
                    {pkg.prepCompletedAt && (
                        <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /> Completed {formatDateTime(pkg.prepCompletedAt)}</div>
                    )}
                    {pkg.verifiedByName && (
                        <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-500" /> Verified by <strong>{pkg.verifiedByName}</strong></div>
                    )}
                </div>

                {/* Special Instructions */}
                {pkg.specialInstructions && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <h4 className="font-semibold text-amber-800 flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4" />
                            Special Instructions
                        </h4>
                        <p className="text-sm text-amber-900">{pkg.specialInstructions}</p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col gap-2">
                    {pkg.status === 'ready' && (
                        <div className="w-full">
                            <button
                                onClick={() => markAsLoaded(pkg)}
                                disabled={!allLoaded}
                                className="w-full flex items-center justify-center gap-2 px-6 py-4 text-base font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all"
                            >
                                <ShieldCheck className="w-5 h-5" />
                                Verify & Mark as Loaded on Truck
                            </button>
                            {!allLoaded && (
                                <p className="text-center text-xs text-amber-600 font-semibold mt-1">
                                    ⚠️ Please check off all items to verify they are loaded on the truck.
                                </p>
                            )}
                        </div>
                    )}
                    {pkg.status === 'loaded' && (
                        <button
                            onClick={() => markAsDispatched(pkg)}
                            className="w-full flex items-center justify-center gap-2 px-6 py-4 text-base font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 shadow-lg hover:shadow-xl transition-all"
                        >
                            <Truck className="w-5 h-5" />
                            Mark as Dispatched
                        </button>
                    )}
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════
    //  PRINT LAYOUT
    // ═══════════════════════════════════════════════════════════════
    const renderPrintLayout = (pkg: JobPrepPackage) => {
        const orgName = organization?.name || 'Company';
        return (
            <div ref={printRef} className="print-only p-8 bg-white text-black text-sm" style={{ fontFamily: 'system-ui, sans-serif' }}>
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-4">
                    <div>
                        <h1 className="text-2xl font-bold">{orgName}</h1>
                        <p className="text-lg font-semibold mt-1">Job Prep Packet</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-gray-600">Printed: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                        {pkg.preparedByName && <p className="text-sm">Prepped by: {pkg.preparedByName}</p>}
                        <p className={`text-sm font-semibold mt-1 ${pkg.status === 'ready' ? 'text-green-700' : ''}`}>
                            Status: {STATUS_CONFIG[pkg.status].label}
                        </p>
                    </div>
                </div>

                {/* Customer Info */}
                <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded border">
                    <div>
                        <p className="font-bold text-base">{pkg.customerName}</p>
                        {pkg.customerAddress && <p className="mt-1">{pkg.customerAddress}</p>}
                        {pkg.customerPhone && <p>📞 {pkg.customerPhone}</p>}
                    </div>
                    <div className="text-right">
                        <p className="font-semibold">📅 {formatDateTime(pkg.scheduledAt)}</p>
                        {pkg.assignedTechName && <p>👤 Tech: {pkg.assignedTechName}</p>}
                        {pkg.estimatedDuration && <p>⏱ Est: {Math.round(pkg.estimatedDuration / 60)}h {pkg.estimatedDuration % 60 > 0 ? `${pkg.estimatedDuration % 60}m` : ''}</p>}
                        {pkg.jobCategory && <p>📋 {pkg.jobCategory}</p>}
                    </div>
                </div>

                {/* Job Description */}
                {pkg.jobDescription && (
                    <div className="mb-6">
                        <h2 className="text-base font-bold border-b pb-1 mb-2">Job Description</h2>
                        <p>{pkg.jobDescription}</p>
                    </div>
                )}

                {/* Materials Table */}
                {pkg.materials.length > 0 && (
                    <div className="mb-6">
                        <h2 className="text-base font-bold border-b pb-1 mb-2">📦 Materials ({pkg.materials.length})</h2>
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="border p-2 text-left w-8">✓</th>
                                    <th className="border p-2 text-left">Material</th>
                                    <th className="border p-2 text-left">SKU</th>
                                    <th className="border p-2 text-center">Qty</th>
                                    <th className="border p-2 text-left">Bin Location</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...pkg.materials].sort((a, b) => binSortKey(a).localeCompare(binSortKey(b))).map((mat, i) => (
                                    <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                                        <td className="border p-2 text-center">☐</td>
                                        <td className="border p-2 font-medium">{mat.name}</td>
                                        <td className="border p-2 text-gray-600">{mat.sku || '—'}</td>
                                        <td className="border p-2 text-center font-bold">{mat.quantityNeeded}</td>
                                        <td className="border p-2 font-mono font-semibold">{mat.binLocation || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Tools Table */}
                {pkg.tools.length > 0 && (
                    <div className="mb-6">
                        <h2 className="text-base font-bold border-b pb-1 mb-2">🔧 Tools ({pkg.tools.length})</h2>
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="border p-2 text-left w-8">✓</th>
                                    <th className="border p-2 text-left">Tool</th>
                                    <th className="border p-2 text-left">Category</th>
                                    <th className="border p-2 text-left">Location</th>
                                    <th className="border p-2 text-left">Condition</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pkg.tools.map((tool, i) => (
                                    <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                                        <td className="border p-2 text-center">☐</td>
                                        <td className="border p-2 font-medium">{tool.name}</td>
                                        <td className="border p-2 text-gray-600">{tool.category || '—'}</td>
                                        <td className="border p-2">{tool.currentLocation || '—'}</td>
                                        <td className="border p-2">{tool.condition || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Special Instructions */}
                {pkg.specialInstructions && (
                    <div className="mb-6 p-3 border-2 border-dashed border-gray-400 rounded bg-yellow-50">
                        <h2 className="text-base font-bold mb-1">⚠️ Special Instructions</h2>
                        <p>{pkg.specialInstructions}</p>
                    </div>
                )}

                {/* Footer Signature Line */}
                <div className="mt-8 pt-4 border-t-2 border-black">
                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <p className="text-sm text-gray-600 mb-6">Loaded by: ___________________________</p>
                            <p className="text-sm text-gray-600">Date/Time: ___________________________</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 mb-6">Verified by: ___________________________</p>
                            <p className="text-sm text-gray-600">Date/Time: ___________________________</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════
    //  ADD MATERIAL MODAL
    // ═══════════════════════════════════════════════════════════════
    const renderAddMaterialModal = () => {
        if (!showAddMaterial || !addingToPackage) return null;
        return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowAddMaterial(false)}>
                <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Add Material</h3>
                        <button onClick={() => setShowAddMaterial(false)} className="text-gray-400 hover:text-gray-600">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-4 border-b border-gray-200">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search materials by name, SKU..."
                                value={materialSearch}
                                onChange={e => setMaterialSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                        {filteredAddMaterials.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">No materials found</div>
                        ) : (
                            filteredAddMaterials.map(mat => (
                                <button
                                    key={mat.id}
                                    onClick={() => {
                                        addMaterialToPackage(mat, addingToPackage);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                                >
                                    <Package className="w-5 h-5 text-blue-500 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900 text-sm">{mat.name}</div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            {mat.sku && <span>SKU: {mat.sku}</span>}
                                            {mat.binLocation && <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">{mat.binLocation}</span>}
                                            <span>Qty: {mat.quantity}</span>
                                        </div>
                                    </div>
                                    <Plus className="w-4 h-4 text-blue-500" />
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════
    //  ADD TOOL MODAL
    // ═══════════════════════════════════════════════════════════════
    const renderAddToolModal = () => {
        if (!showAddTool || !addingToPackage) return null;
        return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowAddTool(false)}>
                <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Add Tool</h3>
                        <button onClick={() => setShowAddTool(false)} className="text-gray-400 hover:text-gray-600">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-4 border-b border-gray-200">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search tools by name, category..."
                                value={toolSearch}
                                onChange={e => setToolSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                        {filteredAddTools.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">No tools found</div>
                        ) : (
                            filteredAddTools.map(tool => (
                                <button
                                    key={tool.id}
                                    onClick={() => {
                                        addToolToPackage(tool, addingToPackage);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                                >
                                    <Wrench className="w-5 h-5 text-purple-500 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900 text-sm">{tool.name}</div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            {tool.category && <span>{tool.category}</span>}
                                            {tool.location && <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">{tool.location}</span>}
                                            {tool.condition && <span>Condition: {tool.condition}</span>}
                                        </div>
                                    </div>
                                    <Plus className="w-4 h-4 text-purple-500" />
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════
    //  STAGING LOCATION MODAL
    // ═══════════════════════════════════════════════════════════════
    const renderStagingModal = () => {
        if (!showStagingModal || !stagingPackage) return null;
        return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowStagingModal(false)}>
                <div 
                    className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300 border border-gray-100" 
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between text-white">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-white" />
                            <h3 className="font-bold text-lg">Staging Location</h3>
                        </div>
                        <button onClick={() => setShowStagingModal(false)} className="text-white/80 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        <p className="text-sm text-gray-600 mb-4">
                            Please specify where the prepped materials and tools are staged (e.g., <span className="font-mono bg-gray-100 px-1 py-0.5 rounded">Shelf 4A</span> or <span className="font-mono bg-gray-100 px-1 py-0.5 rounded">Bin S1</span>).
                        </p>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Staging Area</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Shelf 4A, Bin S1, Bay 2"
                                    value={stagingInput}
                                    onChange={e => setStagingInput(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    autoFocus
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 bg-gray-50 flex gap-3 border-t border-gray-100">
                        <button
                            onClick={() => setShowStagingModal(false)}
                            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmStaging}
                            disabled={isSubmitting}
                            className="flex-1 px-4 py-2.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors text-sm shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4" />
                            )}
                            Confirm & Stage
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════
    //  MAIN RENDER
    // ═══════════════════════════════════════════════════════════════

    const tabs = [
        { id: 'upcoming' as TabId, label: 'Upcoming Jobs', icon: Calendar, count: upcomingJobs.length },
        { id: 'picking' as TabId, label: 'Picking List', icon: ListChecks, count: preppingPackages.length },
        { id: 'ready' as TabId, label: 'Ready', icon: Truck, count: readyPackages.length },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <>
            {/* Print-only layout */}
            {printMode && selectedPackage && (
                <style>{`
                    @media print {
                        body > *:not(.print-only) { display: none !important; }
                        .print-only { display: block !important; }
                        .no-print { display: none !important; }
                    }
                `}</style>
            )}
            {printMode && selectedPackage && renderPrintLayout(selectedPackage)}

            {/* Normal UI */}
            <div className="no-print max-w-5xl mx-auto px-4 sm:px-6 py-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <PackageCheck className="w-8 h-8 text-blue-600" />
                        Job Prep
                    </h1>
                    <p className="text-gray-500 mt-1">Prepare materials and tools for upcoming jobs</p>
                </div>

                {/* Tab Bar */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setSelectedPackage(null); }}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === tab.id
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="hidden sm:inline">{tab.label}</span>
                                {tab.count > 0 && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-gray-200 text-gray-600'
                                        }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                {activeTab === 'upcoming' && renderUpcomingJobs()}
                {activeTab === 'picking' && renderPickingList()}
                {activeTab === 'ready' && renderReady()}
            </div>

            {/* Modals */}
            {renderAddMaterialModal()}
            {renderAddToolModal()}
            {renderStagingModal()}
        </>
    );
};
