import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../auth/AuthProvider';
import { MaterialItem, InventoryCount, InventoryCountLine } from '../../types';
import { WarehouseBin } from '../../pages/WarehouseManager';
import {
    ClipboardCheck, Plus, Play, CheckCircle2, XCircle, AlertTriangle,
    Search, Filter, ArrowUpDown, Eye, EyeOff, Camera, ScanLine,
    Package, MapPin, Layers, BarChart3, Check, X, Loader2,
    ChevronDown, ChevronRight, Clock, FileText, Trash2, RefreshCcw,
    ArrowLeft, Save, Hash, Tag, Box, Zap, History, QrCode
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

/* ═══════════════════════════════════════════════════════════
 *  INVENTORY COUNTS TAB
 *  Full physical counts & product cycle counts.
 *  Supports barcode gun input, camera QR scanning, and manual entry.
 *  Inspired by Fishbowl cycle counting and NetSuite Smart Count.
 * ═══════════════════════════════════════════════════════════ */

interface InventoryCountsTabProps {
    bins: WarehouseBin[];
    materials: MaterialItem[];
    orgLocations: string[];
}

type CountView = 'list' | 'create' | 'execute' | 'review';
type ScanMode = 'gun' | 'camera' | 'manual';

export const InventoryCountsTab: React.FC<InventoryCountsTabProps> = ({ bins, materials, orgLocations }) => {
    const { user } = useAuth();
    const [counts, setCounts] = useState<InventoryCount[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<CountView>('list');
    const [selectedCount, setSelectedCount] = useState<InventoryCount | null>(null);
    const [countLines, setCountLines] = useState<InventoryCountLine[]>([]);
    const [linesLoading, setLinesLoading] = useState(false);

    // Create form
    const [createForm, setCreateForm] = useState({
        name: '',
        type: 'full' as 'full' | 'cycle',
        scopeLocation: '',
        scopeZone: '',
        blindCount: false,
    });

    // Execution state
    const [scanMode, setScanMode] = useState<ScanMode>('gun');
    const [scanInput, setScanInput] = useState('');
    const [activeLineIdx, setActiveLineIdx] = useState<number | null>(null);
    const [quantityInput, setQuantityInput] = useState('');
    const scanInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [saving, setSaving] = useState(false);

    // Review state
    const [createAuditTrail, setCreateAuditTrail] = useState(true);
    const [varianceFilter, setVarianceFilter] = useState<'all' | 'variance' | 'match'>('all');

    // ── Data: Load existing counts ──
    useEffect(() => {
        if (!user?.org_id) return;
        const q = query(collection(db, 'inventoryCounts'), where('org_id', '==', user.org_id));
        const unsub = onSnapshot(q, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryCount));
            list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setCounts(list);
            setLoading(false);
        });
        return () => unsub();
    }, [user?.org_id]);

    // ── Load count lines when a count is selected ──
    const loadCountLines = useCallback(async (countId: string) => {
        setLinesLoading(true);
        const snap = await getDocs(collection(db, 'inventoryCounts', countId, 'lines'));
        const lines = snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryCountLine));
        // Sort by pick-path: zone → aisle → rack → shelf
        lines.sort((a, b) => {
            const pathA = [a.zone || '', a.aisle || '', a.rack || '', a.shelf || ''].join('-');
            const pathB = [b.zone || '', b.aisle || '', b.rack || '', b.shelf || ''].join('-');
            return pathA.localeCompare(pathB);
        });
        setCountLines(lines);
        setLinesLoading(false);
    }, []);

    // ── Create a new count session ──
    const handleCreateCount = async () => {
        if (!user?.org_id || !createForm.name.trim()) {
            toast.error('Count name is required');
            return;
        }
        setSaving(true);
        try {
            // Determine materials in scope
            let scopedMaterials = materials.filter(m => m.quantity > 0 || m.binLocation);

            if (createForm.scopeLocation) {
                scopedMaterials = scopedMaterials.filter(m => m.location === createForm.scopeLocation);
            }
            if (createForm.scopeZone) {
                scopedMaterials = scopedMaterials.filter(m => m.zone === createForm.scopeZone);
            }

            if (scopedMaterials.length === 0) {
                toast.error('No materials found in the selected scope');
                setSaving(false);
                return;
            }

            // Create the count document
            const countData = {
                org_id: user.org_id,
                type: createForm.type,
                name: createForm.name.trim(),
                status: 'draft',
                scope: {
                    ...(createForm.scopeLocation ? { location: createForm.scopeLocation } : {}),
                    ...(createForm.scopeZone ? { zone: createForm.scopeZone } : {}),
                },
                blindCount: createForm.blindCount,
                createdBy: user.uid,
                createdByName: user.displayName || user.email || '',
                createdAt: Timestamp.now(),
                totalItems: scopedMaterials.length,
                countedItems: 0,
                varianceItems: 0,
                totalVarianceValue: 0,
            };

            const countRef = await addDoc(collection(db, 'inventoryCounts'), countData);

            // Create line items
            const batch = writeBatch(db);
            scopedMaterials.forEach(m => {
                const lineRef = doc(collection(db, 'inventoryCounts', countRef.id, 'lines'));
                batch.set(lineRef, {
                    materialId: m.id,
                    materialName: m.name,
                    sku: m.sku || '',
                    binLocation: m.binLocation || '',
                    location: m.location || '',
                    zone: m.zone || '',
                    aisle: m.aisle || '',
                    rack: m.rack || '',
                    shelf: m.shelf || '',
                    expectedQty: m.quantity || 0,
                    status: 'pending',
                    unitCost: m.unitCost || 0,
                });
            });
            await batch.commit();

            toast.success(`Count "${createForm.name}" created with ${scopedMaterials.length} items`);
            setCreateForm({ name: '', type: 'full', scopeLocation: '', scopeZone: '', blindCount: false });
            setView('list');
        } catch (err: any) {
            toast.error(`Failed to create count: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ── Start counting ──
    const handleStartCount = async (count: InventoryCount) => {
        await updateDoc(doc(db, 'inventoryCounts', count.id), {
            status: 'in_progress',
            startedAt: Timestamp.now(),
        });
        setSelectedCount({ ...count, status: 'in_progress' });
        await loadCountLines(count.id);
        setView('execute');
    };

    // ── Resume counting ──
    const handleResumeCount = async (count: InventoryCount) => {
        setSelectedCount(count);
        await loadCountLines(count.id);
        setView(count.status === 'review' ? 'review' : 'execute');
    };

    // ── Record a count for a line ──
    const handleRecordCount = async (lineIdx: number, qty: number) => {
        if (!selectedCount) return;
        const line = countLines[lineIdx];
        if (!line.id) return;

        const variance = qty - line.expectedQty;
        const varianceValue = variance * (line.unitCost || 0);

        await updateDoc(doc(db, 'inventoryCounts', selectedCount.id, 'lines', line.id), {
            countedQty: qty,
            variance,
            varianceValue,
            status: Math.abs(variance) > 0 ? 'counted' : 'counted',
            countedBy: user?.uid || '',
            countedAt: Timestamp.now(),
        });

        // Update local state
        const updated = [...countLines];
        updated[lineIdx] = { ...line, countedQty: qty, variance, varianceValue, status: 'counted' };
        setCountLines(updated);

        // Update count summary
        const countedCount = updated.filter(l => l.status === 'counted' || l.status === 'approved').length;
        const varianceCount = updated.filter(l => l.variance && l.variance !== 0).length;
        const totalVarValue = updated.reduce((sum, l) => sum + Math.abs(l.varianceValue || 0), 0);

        await updateDoc(doc(db, 'inventoryCounts', selectedCount.id), {
            countedItems: countedCount,
            varianceItems: varianceCount,
            totalVarianceValue: totalVarValue,
        });

        toast.success(`Counted: ${line.materialName} = ${qty}`);
        setActiveLineIdx(null);
        setQuantityInput('');

        // Auto-advance to next uncounted line
        const nextIdx = updated.findIndex((l, i) => i > lineIdx && l.status === 'pending');
        if (nextIdx >= 0) {
            setActiveLineIdx(nextIdx);
            if (scanMode === 'gun') setTimeout(() => scanInputRef.current?.focus(), 100);
        }
    };

    // ── Handle barcode scan input (gun mode) ──
    const handleScanSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!scanInput.trim()) return;
        const input = scanInput.trim();

        // Try to match by SKU or bin label
        let matchIdx = countLines.findIndex(l => l.sku === input || l.binLocation === input);

        // Try to parse as QR JSON (from bin QR code)
        if (matchIdx < 0) {
            try {
                const parsed = JSON.parse(input);
                if (parsed.l) {
                    matchIdx = countLines.findIndex(l => l.binLocation === parsed.l);
                }
            } catch { /* not JSON */ }
        }

        // Try partial match on name
        if (matchIdx < 0) {
            matchIdx = countLines.findIndex(l =>
                l.materialName.toLowerCase().includes(input.toLowerCase()) && l.status === 'pending'
            );
        }

        if (matchIdx >= 0) {
            setActiveLineIdx(matchIdx);
            toast.success(`Found: ${countLines[matchIdx].materialName}`);
        } else {
            toast.error(`No match for "${input}"`);
        }
        setScanInput('');
    };

    // ── Camera scanning ──
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
                setCameraActive(true);
            }
        } catch (err) {
            toast.error('Camera access denied');
        }
    };

    const stopCamera = () => {
        if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
        setCameraActive(false);
    };

    // ── Move to review ──
    const handleMoveToReview = async () => {
        if (!selectedCount) return;
        await updateDoc(doc(db, 'inventoryCounts', selectedCount.id), { status: 'review' });
        setSelectedCount({ ...selectedCount, status: 'review' });
        setView('review');
    };

    // ── Apply adjustments ──
    const handleApplyAdjustments = async () => {
        if (!selectedCount || !user?.org_id) return;
        setSaving(true);
        try {
            const batch = writeBatch(db);
            const varianceLines = countLines.filter(l => l.variance && l.variance !== 0 && l.countedQty !== undefined);

            for (const line of varianceLines) {
                // Update material quantity
                const matRef = doc(db, 'materials', line.materialId);
                batch.update(matRef, {
                    quantity: line.countedQty,
                    lastCountedAt: Timestamp.now(),
                    lastCountVariance: line.variance,
                    updatedAt: Timestamp.now(),
                });

                // Optionally create audit trail
                if (createAuditTrail) {
                    const auditRef = doc(collection(db, 'materialUsage'));
                    batch.set(auditRef, {
                        org_id: user.org_id,
                        job_id: '',
                        material_id: line.materialId,
                        materialName: line.materialName,
                        quantity: Math.abs(line.variance!),
                        type: (line.variance || 0) > 0 ? 'adjustment_gain' : 'adjustment_loss',
                        notes: `Inventory count adjustment: "${selectedCount.name}". Expected: ${line.expectedQty}, Counted: ${line.countedQty}`,
                        createdAt: Timestamp.now(),
                        createdBy: user.uid,
                    });
                }

                // Update line status
                if (line.id) {
                    batch.update(doc(db, 'inventoryCounts', selectedCount.id, 'lines', line.id), {
                        status: 'approved'
                    });
                }
            }

            // Mark count as completed
            batch.update(doc(db, 'inventoryCounts', selectedCount.id), {
                status: 'completed',
                completedAt: Timestamp.now(),
            });

            await batch.commit();
            toast.success(`Applied ${varianceLines.length} adjustments${createAuditTrail ? ' with audit trail' : ''}`);
            setView('list');
            setSelectedCount(null);
        } catch (err: any) {
            toast.error(`Failed to apply: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ── Delete count ──
    const handleDeleteCount = async (count: InventoryCount) => {
        if (!window.confirm(`Delete "${count.name}"? This cannot be undone.`)) return;
        try {
            // Delete lines subcollection
            const lineSnap = await getDocs(collection(db, 'inventoryCounts', count.id, 'lines'));
            const batch = writeBatch(db);
            lineSnap.docs.forEach(d => batch.delete(d.ref));
            batch.delete(doc(db, 'inventoryCounts', count.id));
            await batch.commit();
            toast.success('Count deleted');
        } catch (err: any) {
            toast.error(`Delete failed: ${err.message}`);
        }
    };

    // Derived
    const usedZones = [...new Set(materials.map(m => m.zone).filter(Boolean))];
    const filteredReviewLines = useMemo(() => {
        if (varianceFilter === 'all') return countLines;
        if (varianceFilter === 'variance') return countLines.filter(l => l.variance && l.variance !== 0);
        return countLines.filter(l => l.variance === 0 || l.countedQty === undefined);
    }, [countLines, varianceFilter]);

    // ═══════════════ RENDER ═══════════════

    // ── COUNT LIST VIEW ──
    if (view === 'list') {
        return (
            <div className="space-y-4">
                {/* Actions */}
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <ClipboardCheck className="w-5 h-5 text-blue-600" />
                        Inventory Counts
                    </h3>
                    <button
                        onClick={() => setView('create')}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" /> New Count
                    </button>
                </div>

                {/* Counts list */}
                {loading ? (
                    <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" /></div>
                ) : counts.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                        <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600 font-medium">No inventory counts yet</p>
                        <p className="text-gray-400 text-sm mt-1">Create a full count or cycle count to get started</p>
                        <button onClick={() => setView('create')} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                            Create First Count
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {counts.map(count => {
                            const progress = count.totalItems > 0 ? (count.countedItems / count.totalItems) * 100 : 0;
                            const statusColors: Record<string, string> = {
                                draft: 'bg-gray-100 text-gray-700',
                                in_progress: 'bg-blue-100 text-blue-700',
                                review: 'bg-amber-100 text-amber-700',
                                completed: 'bg-emerald-100 text-emerald-700',
                                cancelled: 'bg-red-100 text-red-700',
                            };
                            return (
                                <div key={count.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-gray-900">{count.name}</h4>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${statusColors[count.status]}`}>
                                                    {count.status.replace('_', ' ')}
                                                </span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${count.type === 'full' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'}`}>
                                                    {count.type === 'full' ? 'Full Count' : 'Cycle Count'}
                                                </span>
                                                {count.blindCount && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold flex items-center gap-1">
                                                        <EyeOff className="w-2.5 h-2.5" /> Blind
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 flex items-center gap-3">
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{count.createdAt?.toDate ? format(count.createdAt.toDate(), 'MMM d, yyyy h:mm a') : 'Unknown'}</span>
                                                {count.createdByName && <span>by {count.createdByName}</span>}
                                                {count.scope?.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{count.scope.location}</span>}
                                                {count.scope?.zone && <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{count.scope.zone}</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {(count.status === 'draft') && (
                                                <button onClick={() => handleStartCount(count)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg">
                                                    <Play className="w-3 h-3" /> Start
                                                </button>
                                            )}
                                            {(count.status === 'in_progress' || count.status === 'review') && (
                                                <button onClick={() => handleResumeCount(count)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg">
                                                    <Play className="w-3 h-3" /> {count.status === 'review' ? 'Review' : 'Continue'}
                                                </button>
                                            )}
                                            {count.status !== 'completed' && (
                                                <button onClick={() => handleDeleteCount(count)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Progress bar */}
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                                style={{ width: `${progress}%` }} />
                                        </div>
                                        <span className="text-xs text-gray-500 w-20 text-right">
                                            {count.countedItems}/{count.totalItems}
                                        </span>
                                    </div>

                                    {/* Stats row */}
                                    {count.countedItems > 0 && (
                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> {count.countedItems} counted</span>
                                            {count.varianceItems > 0 && (
                                                <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3 h-3" /> {count.varianceItems} variances</span>
                                            )}
                                            {count.totalVarianceValue > 0 && (
                                                <span className="flex items-center gap-1 text-red-600"><BarChart3 className="w-3 h-3" /> ${count.totalVarianceValue.toFixed(2)} impact</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // ── CREATE COUNT VIEW ──
    if (view === 'create') {
        const usedZonesForScope = createForm.scopeLocation
            ? [...new Set(materials.filter(m => m.location === createForm.scopeLocation).map(m => m.zone).filter(Boolean))]
            : usedZones;

        const scopedCount = materials.filter(m => {
            if (createForm.scopeLocation && m.location !== createForm.scopeLocation) return false;
            if (createForm.scopeZone && m.zone !== createForm.scopeZone) return false;
            return m.quantity > 0 || m.binLocation;
        }).length;

        return (
            <div className="space-y-6 max-w-2xl">
                <div className="flex items-center gap-3">
                    <button onClick={() => setView('list')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h3 className="text-lg font-bold text-gray-900">Create Inventory Count</h3>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                    {/* Count Type */}
                    <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-2">Count Type</label>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { value: 'full', label: 'Full Physical Count', desc: 'Wall-to-wall inventory snapshot', icon: ClipboardCheck, color: 'purple' },
                                { value: 'cycle', label: 'Cycle Count', desc: 'Targeted subset of inventory', icon: RefreshCcw, color: 'teal' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setCreateForm({ ...createForm, type: opt.value as any })}
                                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                                        createForm.type === opt.value
                                            ? `border-${opt.color}-500 bg-${opt.color}-50`
                                            : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    <opt.icon className={`w-5 h-5 mb-2 ${createForm.type === opt.value ? `text-${opt.color}-600` : 'text-gray-400'}`} />
                                    <p className="font-bold text-sm text-gray-900">{opt.label}</p>
                                    <p className="text-xs text-gray-500">{opt.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Count Name *</label>
                        <input
                            type="text" value={createForm.name}
                            onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                            placeholder={createForm.type === 'full' ? 'e.g., Q2 2026 Annual Count' : 'e.g., Aisle A Cycle Count'}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Scope */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Scope: Location</label>
                            <select value={createForm.scopeLocation} onChange={e => setCreateForm({ ...createForm, scopeLocation: e.target.value, scopeZone: '' })}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                                <option value="">All Locations</option>
                                {orgLocations.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Scope: Zone</label>
                            <select value={createForm.scopeZone} onChange={e => setCreateForm({ ...createForm, scopeZone: e.target.value })}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                                <option value="">All Zones</option>
                                {usedZonesForScope.map(z => <option key={z} value={z}>{z}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Blind Count Toggle */}
                    <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                        <div>
                            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                <EyeOff className="w-4 h-4 text-gray-600" /> Blind Count
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">Hide expected quantities so counters must physically count</p>
                        </div>
                        <button
                            onClick={() => setCreateForm({ ...createForm, blindCount: !createForm.blindCount })}
                            className={`w-12 h-6 rounded-full transition-colors flex items-center ${createForm.blindCount ? 'bg-blue-600' : 'bg-gray-300'}`}
                        >
                            <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${createForm.blindCount ? 'translate-x-6' : 'translate-x-0.5'}`} />
                        </button>
                    </div>

                    {/* Preview */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-blue-700 font-medium">
                            This count will include <strong>{scopedCount}</strong> material{scopedCount !== 1 ? 's' : ''} to count
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button onClick={() => setView('list')} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                            Cancel
                        </button>
                        <button onClick={handleCreateCount} disabled={saving || !createForm.name.trim()}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-lg">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Create Count
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── EXECUTE COUNT VIEW ──
    if (view === 'execute' && selectedCount) {
        const countedCount = countLines.filter(l => l.status !== 'pending').length;
        const progress = countLines.length > 0 ? (countedCount / countLines.length) * 100 : 0;

        return (
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => { setView('list'); stopCamera(); }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h3 className="font-bold text-gray-900">{selectedCount.name}</h3>
                            <p className="text-xs text-gray-500">{countedCount} of {countLines.length} items counted</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-xs font-mono text-gray-500">{Math.round(progress)}%</span>
                        {countedCount > 0 && (
                            <button onClick={handleMoveToReview}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg ml-2">
                                <CheckCircle2 className="w-3 h-3" /> Review
                            </button>
                        )}
                    </div>
                </div>

                {/* Scan Mode Selector */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-semibold text-gray-600 uppercase">Input Mode:</span>
                        {[
                            { mode: 'gun' as ScanMode, label: 'Barcode Gun', icon: ScanLine },
                            { mode: 'camera' as ScanMode, label: 'Camera QR', icon: Camera },
                            { mode: 'manual' as ScanMode, label: 'Manual', icon: Hash },
                        ].map(opt => (
                            <button
                                key={opt.mode}
                                onClick={() => {
                                    setScanMode(opt.mode);
                                    if (opt.mode === 'camera') startCamera();
                                    else stopCamera();
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    scanMode === opt.mode ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                <opt.icon className="w-3.5 h-3.5" />
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Barcode Gun Input */}
                    {scanMode === 'gun' && (
                        <form onSubmit={handleScanSubmit} className="flex gap-2">
                            <div className="flex-1 relative">
                                <ScanLine className="w-4 h-4 absolute left-3 top-3 text-blue-500" />
                                <input
                                    ref={scanInputRef}
                                    type="text"
                                    value={scanInput}
                                    onChange={e => setScanInput(e.target.value)}
                                    placeholder="Scan barcode or QR code..."
                                    className="w-full pl-10 pr-3 py-2.5 border-2 border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 font-mono"
                                    autoFocus
                                />
                            </div>
                            <button type="submit" className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                                Find
                            </button>
                        </form>
                    )}

                    {/* Camera View */}
                    {scanMode === 'camera' && (
                        <div className="relative rounded-xl overflow-hidden bg-black">
                            <video ref={videoRef} className="w-full max-h-48 object-cover" playsInline muted />
                            {!cameraActive && (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                                    <button onClick={startCamera} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                                        <Camera className="w-4 h-4" /> Start Camera
                                    </button>
                                </div>
                            )}
                            <p className="text-xs text-gray-400 text-center mt-2">Point camera at bin QR code or product barcode</p>
                        </div>
                    )}
                </div>

                {/* Count Lines */}
                {linesLoading ? (
                    <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" /></div>
                ) : (
                    <div className="space-y-2">
                        {countLines.map((line, idx) => {
                            const isActive = activeLineIdx === idx;
                            const isCounted = line.status === 'counted' || line.status === 'approved';
                            const hasVariance = isCounted && line.variance !== 0;

                            return (
                                <div
                                    key={line.id || idx}
                                    className={`bg-white rounded-xl border-2 p-4 transition-all ${
                                        isActive ? 'border-blue-500 shadow-lg ring-2 ring-blue-200' :
                                        isCounted && hasVariance ? 'border-amber-300 bg-amber-50/30' :
                                        isCounted ? 'border-emerald-300 bg-emerald-50/30' :
                                        'border-gray-200'
                                    }`}
                                    onClick={() => !isCounted && setActiveLineIdx(idx)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 flex-1">
                                            {/* Status icon */}
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                                isCounted && hasVariance ? 'bg-amber-100 text-amber-600' :
                                                isCounted ? 'bg-emerald-100 text-emerald-600' :
                                                isActive ? 'bg-blue-100 text-blue-600' :
                                                'bg-gray-100 text-gray-400'
                                            }`}>
                                                {isCounted ? <Check className="w-4 h-4" /> :
                                                 isActive ? <ScanLine className="w-4 h-4" /> :
                                                 <Package className="w-4 h-4" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-sm text-gray-900 truncate">{line.materialName}</p>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    {line.sku && <span className="font-mono">{line.sku}</span>}
                                                    {line.binLocation && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{line.binLocation}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Quantities */}
                                        <div className="text-right shrink-0 ml-4">
                                            {!selectedCount.blindCount && (
                                                <p className="text-xs text-gray-400">Expected: {line.expectedQty}</p>
                                            )}
                                            {isCounted && (
                                                <p className={`text-lg font-bold ${hasVariance ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                    {line.countedQty}
                                                    {hasVariance && (
                                                        <span className="text-xs ml-1">({line.variance! > 0 ? '+' : ''}{line.variance})</span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Active counting input */}
                                    {isActive && !isCounted && (
                                        <div className="mt-3 pt-3 border-t border-blue-200 flex items-center gap-3">
                                            <label className="text-xs font-semibold text-gray-600">Actual Qty:</label>
                                            <input
                                                type="number"
                                                value={quantityInput}
                                                onChange={e => setQuantityInput(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && quantityInput !== '') {
                                                        handleRecordCount(idx, parseInt(quantityInput) || 0);
                                                    }
                                                }}
                                                placeholder="Enter count"
                                                className="w-32 px-3 py-2 border-2 border-blue-300 rounded-lg text-lg font-bold text-center focus:ring-2 focus:ring-blue-500"
                                                autoFocus
                                                min={0}
                                            />
                                            <button
                                                onClick={() => quantityInput !== '' && handleRecordCount(idx, parseInt(quantityInput) || 0)}
                                                disabled={quantityInput === ''}
                                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium flex items-center gap-1"
                                            >
                                                <Check className="w-4 h-4" /> Confirm
                                            </button>
                                            {!selectedCount.blindCount && (
                                                <button
                                                    onClick={() => handleRecordCount(idx, line.expectedQty)}
                                                    className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-xs font-medium"
                                                    title="Confirm expected quantity matches"
                                                >
                                                    ✓ Matches ({line.expectedQty})
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // ── REVIEW VIEW ──
    if (view === 'review' && selectedCount) {
        const varianceLines = countLines.filter(l => l.variance && l.variance !== 0);
        const totalVarianceValue = varianceLines.reduce((sum, l) => sum + Math.abs(l.varianceValue || 0), 0);
        const uncountedLines = countLines.filter(l => l.status === 'pending');

        return (
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => { setView('execute'); }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h3 className="font-bold text-gray-900">Review: {selectedCount.name}</h3>
                            <p className="text-xs text-gray-500">Review variances and apply adjustments</p>
                        </div>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-4 gap-3">
                    {[
                        { label: 'Total Items', value: countLines.length, color: 'text-gray-900 bg-gray-50' },
                        { label: 'Counted', value: countLines.filter(l => l.status !== 'pending').length, color: 'text-blue-700 bg-blue-50' },
                        { label: 'Variances', value: varianceLines.length, color: varianceLines.length > 0 ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50' },
                        { label: 'Impact', value: `$${totalVarianceValue.toFixed(2)}`, color: totalVarianceValue > 0 ? 'text-red-700 bg-red-50' : 'text-emerald-700 bg-emerald-50' },
                    ].map(s => (
                        <div key={s.label} className={`rounded-xl border border-gray-200 p-4 text-center ${s.color}`}>
                            <p className="text-2xl font-bold">{s.value}</p>
                            <p className="text-xs uppercase tracking-wide opacity-70">{s.label}</p>
                        </div>
                    ))}
                </div>

                {uncountedLines.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-amber-800">{uncountedLines.length} items not yet counted</p>
                            <p className="text-xs text-amber-600">Go back to continue counting, or proceed with partial results.</p>
                        </div>
                        <button onClick={() => setView('execute')} className="ml-auto px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700">
                            Continue Counting
                        </button>
                    </div>
                )}

                {/* Filter */}
                <div className="flex items-center gap-2">
                    {[
                        { value: 'all', label: `All (${countLines.length})` },
                        { value: 'variance', label: `Variances (${varianceLines.length})` },
                        { value: 'match', label: `Matches (${countLines.length - varianceLines.length})` },
                    ].map(f => (
                        <button key={f.value} onClick={() => setVarianceFilter(f.value as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                varianceFilter === f.value ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>{f.label}</button>
                    ))}
                </div>

                {/* Variance Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b">
                                <th className="text-left p-3 text-xs text-gray-500 font-semibold">Material</th>
                                <th className="text-center p-3 text-xs text-gray-500 font-semibold">Bin</th>
                                <th className="text-center p-3 text-xs text-gray-500 font-semibold">Expected</th>
                                <th className="text-center p-3 text-xs text-gray-500 font-semibold">Counted</th>
                                <th className="text-center p-3 text-xs text-gray-500 font-semibold">Variance</th>
                                <th className="text-right p-3 text-xs text-gray-500 font-semibold">$ Impact</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredReviewLines.map((line, i) => (
                                <tr key={line.id || i} className={`border-b last:border-0 ${
                                    line.variance && line.variance !== 0 ? 'bg-amber-50/50' : ''
                                }`}>
                                    <td className="p-3">
                                        <p className="font-medium text-gray-900">{line.materialName}</p>
                                        {line.sku && <p className="text-xs text-gray-500 font-mono">{line.sku}</p>}
                                    </td>
                                    <td className="p-3 text-center font-mono text-xs text-gray-600">{line.binLocation || '—'}</td>
                                    <td className="p-3 text-center text-gray-600">{line.expectedQty}</td>
                                    <td className="p-3 text-center font-bold">
                                        {line.countedQty !== undefined ? line.countedQty : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className={`p-3 text-center font-bold ${
                                        !line.variance || line.variance === 0 ? 'text-emerald-600' :
                                        line.variance > 0 ? 'text-blue-600' : 'text-red-600'
                                    }`}>
                                        {line.variance !== undefined ? (line.variance > 0 ? `+${line.variance}` : line.variance === 0 ? '✓' : line.variance) : '—'}
                                    </td>
                                    <td className="p-3 text-right text-xs font-mono">
                                        {line.varianceValue ? `$${Math.abs(line.varianceValue).toFixed(2)}` : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Apply Adjustments */}
                {varianceLines.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-blue-600" />
                            Apply Adjustments
                        </h4>
                        <p className="text-sm text-gray-600 mb-4">
                            This will update {varianceLines.length} material{varianceLines.length !== 1 ? 's' : ''} to match counted quantities.
                        </p>

                        {/* Audit Trail Toggle */}
                        <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 mb-4">
                            <div>
                                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                    <History className="w-4 h-4 text-gray-600" /> Create Audit Trail
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">Record each adjustment as a material usage entry for historical tracking</p>
                            </div>
                            <button
                                onClick={() => setCreateAuditTrail(!createAuditTrail)}
                                className={`w-12 h-6 rounded-full transition-colors flex items-center ${createAuditTrail ? 'bg-blue-600' : 'bg-gray-300'}`}
                            >
                                <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${createAuditTrail ? 'translate-x-6' : 'translate-x-0.5'}`} />
                            </button>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setView('list')} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                                Save for Later
                            </button>
                            <button onClick={handleApplyAdjustments} disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-lg">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Apply {varianceLines.length} Adjustment{varianceLines.length !== 1 ? 's' : ''} {createAuditTrail ? '+ Audit Trail' : ''}
                            </button>
                        </div>
                    </div>
                )}

                {varianceLines.length === 0 && countLines.filter(l => l.status !== 'pending').length > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                        <p className="font-bold text-emerald-800">All counts match! No adjustments needed.</p>
                        <button onClick={async () => {
                            await updateDoc(doc(db, 'inventoryCounts', selectedCount.id), { status: 'completed', completedAt: Timestamp.now() });
                            toast.success('Count completed');
                            setView('list');
                        }} className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                            Complete Count
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return null;
};
