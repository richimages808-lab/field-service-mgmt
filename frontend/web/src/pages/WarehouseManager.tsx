import React, { useEffect, useState, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import {
    Warehouse, Plus, Trash2, Edit2, Check, X, Search, Printer,
    QrCode, MapPin, Layers, Grid3X3, Tag, Package, Loader2,
    ChevronRight, ChevronDown, Filter, Copy, Download
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════
 *  WAREHOUSE MANAGER
 *  Create, manage, and print labels for warehouse bin locations.
 *  Supports zone/aisle/rack/shelf/level hierarchy.
 * ═══════════════════════════════════════════════════════════ */

export interface WarehouseBin {
    id?: string;
    org_id: string;
    label: string;          // Human-readable: "A-R1-3-2" (auto-generated)
    zone: string;           // e.g., "Receiving", "Bulk Storage"
    aisle: string;          // e.g., "A", "1"
    rack: string;           // e.g., "R1", "Bay 3"
    shelf: string;          // e.g., "3", "Top"
    level: string;          // e.g., "2", "Left"
    location: string;       // Parent location: "Warehouse", "Truck"
    description?: string;   // Free notes
    itemCount?: number;     // How many SKUs stored here
    maxCapacity?: number;   // Max items this bin can hold
    binType?: 'standard' | 'bulk' | 'pick' | 'hazmat' | 'returns' | 'staging';
    active: boolean;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
}

const ZONE_PRESETS = ['Receiving', 'Bulk Storage', 'Pick Area', 'Staging', 'Returns', 'Hazmat', 'Cold Storage', 'Overflow'];
const BIN_TYPES: Array<{ value: WarehouseBin['binType']; label: string; color: string }> = [
    { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700' },
    { value: 'bulk', label: 'Bulk', color: 'bg-purple-100 text-purple-700' },
    { value: 'pick', label: 'Pick', color: 'bg-emerald-100 text-emerald-700' },
    { value: 'hazmat', label: 'Hazmat', color: 'bg-red-100 text-red-700' },
    { value: 'returns', label: 'Returns', color: 'bg-amber-100 text-amber-700' },
    { value: 'staging', label: 'Staging', color: 'bg-gray-100 text-gray-700' },
];

export const WarehouseManager: React.FC = () => {
    const { user } = useAuth();
    const [bins, setBins] = useState<WarehouseBin[]>([]);
    const [orgLocations, setOrgLocations] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterZone, setFilterZone] = useState<string>('');
    const [filterLocation, setFilterLocation] = useState<string>('');

    // Create/Edit modal
    const [showForm, setShowForm] = useState(false);
    const [editingBin, setEditingBin] = useState<WarehouseBin | null>(null);
    const [form, setForm] = useState({
        location: '', zone: '', aisle: '', rack: '', shelf: '', level: '',
        description: '', binType: 'standard' as WarehouseBin['binType'], maxCapacity: 0
    });
    const [saving, setSaving] = useState(false);

    // Batch create
    const [showBatchCreate, setShowBatchCreate] = useState(false);
    const [batchConfig, setBatchConfig] = useState({
        location: 'Warehouse', zone: '', aisleStart: 'A', aisleEnd: 'C',
        racksPerAisle: 4, shelvesPerRack: 4, levelsPerShelf: 1, binType: 'standard' as WarehouseBin['binType']
    });
    const [batchCreating, setBatchCreating] = useState(false);

    // Print selection
    const [selectedBinIds, setSelectedBinIds] = useState<Set<string>>(new Set());
    const [showPrintPreview, setShowPrintPreview] = useState(false);

    // ── Data ──
    useEffect(() => {
        if (!user?.org_id) return;

        // Load org locations
        const loadLocations = async () => {
            const { getDoc } = await import('firebase/firestore');
            const snap = await getDoc(doc(db, 'organizations', user.org_id));
            if (snap.exists()) {
                const data = snap.data();
                setOrgLocations(data.inventoryLocations || ['Truck', 'Warehouse', 'At Supplier', 'On Order']);
            }
        };
        loadLocations();

        // Listen to bins
        const q = query(collection(db, 'warehouseBins'), where('org_id', '==', user.org_id));
        const unsub = onSnapshot(q, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as WarehouseBin));
            list.sort((a, b) => a.label.localeCompare(b.label));
            setBins(list);
            setLoading(false);
        });

        return () => unsub();
    }, [user?.org_id]);

    // ── Generate label ──
    const generateLabel = (aisle: string, rack: string, shelf: string, level: string) =>
        [aisle, rack, shelf, level].filter(Boolean).join('-');

    // ── Create / Update Bin ──
    const handleSaveBin = async () => {
        if (!user?.org_id) return;
        if (!form.aisle && !form.rack) {
            toast.error('At least Aisle or Rack is required');
            return;
        }
        setSaving(true);
        try {
            const label = generateLabel(form.aisle, form.rack, form.shelf, form.level);
            const binData: Omit<WarehouseBin, 'id'> = {
                org_id: user.org_id,
                label,
                location: form.location || orgLocations[0] || 'Warehouse',
                zone: form.zone,
                aisle: form.aisle,
                rack: form.rack,
                shelf: form.shelf,
                level: form.level,
                description: form.description,
                binType: form.binType,
                maxCapacity: form.maxCapacity || undefined,
                active: true,
                createdAt: editingBin?.createdAt || Timestamp.now(),
                updatedAt: Timestamp.now()
            };

            if (editingBin?.id) {
                await updateDoc(doc(db, 'warehouseBins', editingBin.id), binData);
                toast.success(`Bin ${label} updated`);
            } else {
                await addDoc(collection(db, 'warehouseBins'), binData);
                toast.success(`Bin ${label} created`);
            }

            setShowForm(false);
            setEditingBin(null);
            setForm({ location: '', zone: '', aisle: '', rack: '', shelf: '', level: '', description: '', binType: 'standard', maxCapacity: 0 });
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ── Batch Create ──
    const handleBatchCreate = async () => {
        if (!user?.org_id) return;
        setBatchCreating(true);

        try {
            const aisles: string[] = [];
            const startCode = batchConfig.aisleStart.toUpperCase().charCodeAt(0);
            const endCode = batchConfig.aisleEnd.toUpperCase().charCodeAt(0);
            for (let c = startCode; c <= endCode; c++) {
                aisles.push(String.fromCharCode(c));
            }

            let count = 0;
            for (const aisle of aisles) {
                for (let r = 1; r <= batchConfig.racksPerAisle; r++) {
                    for (let s = 1; s <= batchConfig.shelvesPerRack; s++) {
                        for (let l = 1; l <= batchConfig.levelsPerShelf; l++) {
                            const rack = `${r}`;
                            const shelf = `${s}`;
                            const level = batchConfig.levelsPerShelf > 1 ? `${l}` : '';
                            const label = generateLabel(aisle, rack, shelf, level);

                            // Check if already exists
                            const exists = bins.some(b => b.label === label && b.location === batchConfig.location);
                            if (exists) continue;

                            await addDoc(collection(db, 'warehouseBins'), {
                                org_id: user.org_id,
                                label,
                                location: batchConfig.location,
                                zone: batchConfig.zone,
                                aisle,
                                rack,
                                shelf,
                                level,
                                binType: batchConfig.binType,
                                active: true,
                                createdAt: Timestamp.now()
                            });
                            count++;
                        }
                    }
                }
            }

            toast.success(`Created ${count} bins`);
            setShowBatchCreate(false);
        } catch (err: any) {
            toast.error(`Batch create failed: ${err.message}`);
        } finally {
            setBatchCreating(false);
        }
    };

    // ── Delete Bin ──
    const handleDeleteBin = async (bin: WarehouseBin) => {
        if (!bin.id || !window.confirm(`Delete bin ${bin.label}?`)) return;
        try {
            await deleteDoc(doc(db, 'warehouseBins', bin.id));
            toast.success(`Bin ${bin.label} deleted`);
        } catch (err: any) {
            toast.error(`Delete failed: ${err.message}`);
        }
    };

    // ── Print Labels ──
    const handlePrintLabels = () => {
        const binsToPrint = selectedBinIds.size > 0
            ? bins.filter(b => selectedBinIds.has(b.id!))
            : filteredBins;

        if (binsToPrint.length === 0) {
            toast.error('No bins to print');
            return;
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('Pop-up blocked. Allow pop-ups for this site.');
            return;
        }

        const orgName = (user as any)?.orgName || 'DispatchBox';

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bin Labels</title>
                <style>
                    @page { size: auto; margin: 0.25in; }
                    body { font-family: -apple-system, sans-serif; margin: 0; padding: 0; }
                    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
                    .label {
                        border: 2px solid #000; border-radius: 8px; padding: 12px; text-align: center;
                        page-break-inside: avoid; min-height: 140px; display: flex; flex-direction: column;
                        align-items: center; justify-content: center; gap: 4px;
                    }
                    .label-code { font-size: 28px; font-weight: 900; font-family: 'Courier New', monospace; letter-spacing: 2px; }
                    .label-loc { font-size: 11px; color: #666; font-weight: 600; }
                    .label-zone { font-size: 10px; color: #999; }
                    .label-type { font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #f0f0f0; font-weight: 600; text-transform: uppercase; }
                    .qr { width: 80px; height: 80px; }
                    @media print { .no-print { display: none; } }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"><\/script>
            </head>
            <body>
                <div class="no-print" style="padding:12px;text-align:center;border-bottom:1px solid #ddd;margin-bottom:12px;">
                    <button onclick="window.print()" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600;">
                        🖨️ Print Labels
                    </button>
                    <span style="margin-left:12px;color:#666;font-size:13px;">${binsToPrint.length} labels</span>
                </div>
                <div class="grid" id="labels-grid"></div>
                <script>
                    const bins = ${JSON.stringify(binsToPrint.map(b => ({
                        label: b.label, location: b.location, zone: b.zone, binType: b.binType, id: b.id
                    })))};
                    const grid = document.getElementById('labels-grid');
                    bins.forEach(async (bin) => {
                        const div = document.createElement('div');
                        div.className = 'label';
                        
                        const qrData = JSON.stringify({ t:'bin', id: bin.id, l: bin.label, loc: bin.location, z: bin.zone });
                        const canvas = document.createElement('canvas');
                        await QRCode.toCanvas(canvas, qrData, { width: 80, margin: 1 });
                        
                        div.innerHTML = \`
                            <div class="label-loc">\${bin.location}</div>
                            <div class="label-code">\${bin.label}</div>
                            \${bin.zone ? '<div class="label-zone">' + bin.zone + '</div>' : ''}
                            <div class="label-type">\${bin.binType || 'standard'}</div>
                        \`;
                        div.insertBefore(canvas, div.querySelector('.label-type'));
                        grid.appendChild(div);
                    });
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    // ── Filtered bins ──
    const filteredBins = bins.filter(b => {
        if (searchTerm && !b.label.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !b.zone.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !(b.description || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (filterZone && b.zone !== filterZone) return false;
        if (filterLocation && b.location !== filterLocation) return false;
        return true;
    });

    // ── Unique zones from bins ──
    const usedZones = [...new Set(bins.map(b => b.zone).filter(Boolean))];
    const usedLocations = [...new Set(bins.map(b => b.location).filter(Boolean))];

    // ── Stats ──
    const stats = {
        total: bins.length,
        zones: usedZones.length,
        locations: usedLocations.length,
    };

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <Warehouse className="w-8 h-8 text-blue-600" />
                        Warehousing
                    </h1>
                    <p className="text-gray-500 mt-1">Manage bin locations, print labels, and optimize put-away & picking</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowBatchCreate(true)}
                        className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                        <Grid3X3 className="w-4 h-4" /> Batch Create
                    </button>
                    <button
                        onClick={handlePrintLabels}
                        className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                        <Printer className="w-4 h-4" /> Print Labels {selectedBinIds.size > 0 && `(${selectedBinIds.size})`}
                    </button>
                    <button
                        onClick={() => { setEditingBin(null); setForm({ location: orgLocations[0] || 'Warehouse', zone: '', aisle: '', rack: '', shelf: '', level: '', description: '', binType: 'standard', maxCapacity: 0 }); setShowForm(true); }}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Add Bin
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                    { label: 'Total Bins', value: stats.total, icon: Package, color: 'text-blue-600 bg-blue-50' },
                    { label: 'Zones', value: stats.zones, icon: Layers, color: 'text-purple-600 bg-purple-50' },
                    { label: 'Locations', value: stats.locations, icon: MapPin, color: 'text-emerald-600 bg-emerald-50' },
                ].map(s => (
                    <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                            <s.icon className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                            <p className="text-xs text-gray-500">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search + Filters */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search bins..."
                            className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <select
                        value={filterLocation}
                        onChange={e => setFilterLocation(e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white"
                    >
                        <option value="">All Locations</option>
                        {usedLocations.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select
                        value={filterZone}
                        onChange={e => setFilterZone(e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white"
                    >
                        <option value="">All Zones</option>
                        {usedZones.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                    {selectedBinIds.size > 0 && (
                        <button onClick={() => setSelectedBinIds(new Set())} className="text-xs text-gray-500 hover:text-gray-700 px-2">
                            Clear selection ({selectedBinIds.size})
                        </button>
                    )}
                </div>
            </div>

            {/* Bins Grid */}
            {loading ? (
                <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" /></div>
            ) : filteredBins.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                    <Warehouse className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">No bins found</p>
                    <p className="text-gray-400 text-sm mt-1">Create bins individually or use Batch Create to set up your warehouse</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredBins.map(bin => {
                        const typeInfo = BIN_TYPES.find(t => t.value === bin.binType) || BIN_TYPES[0];
                        const isSelected = selectedBinIds.has(bin.id!);

                        return (
                            <div
                                key={bin.id}
                                className={`bg-white rounded-xl border-2 p-4 transition-all cursor-pointer hover:shadow-md ${
                                    isSelected ? 'border-blue-500 bg-blue-50/30 shadow-sm' : 'border-gray-200'
                                }`}
                                onClick={() => {
                                    setSelectedBinIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(bin.id!)) next.delete(bin.id!);
                                        else next.add(bin.id!);
                                        return next;
                                    });
                                }}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-xl font-black text-gray-900 font-mono tracking-wider">{bin.label}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${typeInfo.color}`}>
                                                {typeInfo.label}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                            <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{bin.location}</span>
                                            {bin.zone && <span className="flex items-center gap-0.5"><Layers className="w-3 h-3" />{bin.zone}</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => {
                                                setEditingBin(bin);
                                                setForm({
                                                    location: bin.location, zone: bin.zone, aisle: bin.aisle,
                                                    rack: bin.rack, shelf: bin.shelf, level: bin.level,
                                                    description: bin.description || '', binType: bin.binType || 'standard',
                                                    maxCapacity: bin.maxCapacity || 0
                                                });
                                                setShowForm(true);
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteBin(bin)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                {bin.description && (
                                    <p className="text-xs text-gray-400 mt-1 truncate">{bin.description}</p>
                                )}
                                <div className="text-[10px] text-gray-400 mt-2 font-mono">
                                    {[
                                        bin.aisle && `Aisle ${bin.aisle}`,
                                        bin.rack && `Rack ${bin.rack}`,
                                        bin.shelf && `Shelf ${bin.shelf}`,
                                        bin.level && `Lvl ${bin.level}`
                                    ].filter(Boolean).join(' • ')}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══════ CREATE/EDIT MODAL ═══════ */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-5 border-b">
                            <h2 className="text-lg font-bold text-gray-900">
                                {editingBin ? `Edit Bin ${editingBin.label}` : 'Create Bin'}
                            </h2>
                            <button onClick={() => { setShowForm(false); setEditingBin(null); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Location + Zone */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Location *</label>
                                    <select value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                                        {orgLocations.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Zone</label>
                                    <select value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                                        <option value="">None</option>
                                        {ZONE_PRESETS.map(z => <option key={z} value={z}>{z}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Aisle / Rack / Shelf / Level */}
                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-1">Bin Address</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { label: 'Aisle', key: 'aisle', placeholder: 'A' },
                                        { label: 'Rack', key: 'rack', placeholder: '1' },
                                        { label: 'Shelf', key: 'shelf', placeholder: '3' },
                                        { label: 'Level', key: 'level', placeholder: '2' },
                                    ].map(f => (
                                        <div key={f.key}>
                                            <span className="text-[10px] text-gray-400 block mb-0.5">{f.label}</span>
                                            <input
                                                type="text"
                                                value={(form as any)[f.key]}
                                                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                                                placeholder={f.placeholder}
                                                className="w-full px-2 py-2 text-center font-mono text-sm border border-gray-200 rounded-lg"
                                            />
                                        </div>
                                    ))}
                                </div>
                                {(form.aisle || form.rack) && (
                                    <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                                        <Tag className="w-3 h-3" />
                                        Label: <strong className="font-mono text-gray-800">{generateLabel(form.aisle, form.rack, form.shelf, form.level)}</strong>
                                    </div>
                                )}
                            </div>

                            {/* Type + Capacity */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Bin Type</label>
                                    <select value={form.binType} onChange={e => setForm({ ...form, binType: e.target.value as any })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                                        {BIN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Max Capacity</label>
                                    <input type="number" value={form.maxCapacity || ''} onChange={e => setForm({ ...form, maxCapacity: parseInt(e.target.value) || 0 })}
                                        placeholder="∞" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
                                <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="e.g., Plumbing fittings, copper pipe" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                            </div>
                        </div>
                        <div className="p-5 border-t flex gap-3">
                            <button onClick={() => { setShowForm(false); setEditingBin(null); }}
                                className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                            <button onClick={handleSaveBin} disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-lg">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                {editingBin ? 'Update Bin' : 'Create Bin'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ BATCH CREATE MODAL ═══════ */}
            {showBatchCreate && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
                        <div className="flex items-center justify-between p-5 border-b">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Grid3X3 className="w-5 h-5 text-blue-600" /> Batch Create Bins
                            </h2>
                            <button onClick={() => setShowBatchCreate(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-gray-500">Generate bins for a range of aisles with racks and shelves.</p>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Location</label>
                                    <select value={batchConfig.location} onChange={e => setBatchConfig({ ...batchConfig, location: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                                        {orgLocations.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Zone</label>
                                    <select value={batchConfig.zone} onChange={e => setBatchConfig({ ...batchConfig, zone: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                                        <option value="">None</option>
                                        {ZONE_PRESETS.map(z => <option key={z} value={z}>{z}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Aisle Start</label>
                                    <input type="text" maxLength={1} value={batchConfig.aisleStart}
                                        onChange={e => setBatchConfig({ ...batchConfig, aisleStart: e.target.value.toUpperCase() })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-center font-mono" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Aisle End</label>
                                    <input type="text" maxLength={1} value={batchConfig.aisleEnd}
                                        onChange={e => setBatchConfig({ ...batchConfig, aisleEnd: e.target.value.toUpperCase() })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-center font-mono" />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Racks/Aisle</label>
                                    <input type="number" min={1} max={50} value={batchConfig.racksPerAisle}
                                        onChange={e => setBatchConfig({ ...batchConfig, racksPerAisle: parseInt(e.target.value) || 1 })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-center" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Shelves/Rack</label>
                                    <input type="number" min={1} max={20} value={batchConfig.shelvesPerRack}
                                        onChange={e => setBatchConfig({ ...batchConfig, shelvesPerRack: parseInt(e.target.value) || 1 })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-center" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Levels/Shelf</label>
                                    <input type="number" min={1} max={10} value={batchConfig.levelsPerShelf}
                                        onChange={e => setBatchConfig({ ...batchConfig, levelsPerShelf: parseInt(e.target.value) || 1 })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-center" />
                                </div>
                            </div>

                            {/* Preview count */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                                <span className="text-sm text-blue-700 font-medium">
                                    Will create up to{' '}
                                    <strong>
                                        {(batchConfig.aisleEnd.charCodeAt(0) - batchConfig.aisleStart.charCodeAt(0) + 1) *
                                            batchConfig.racksPerAisle * batchConfig.shelvesPerRack * batchConfig.levelsPerShelf}
                                    </strong>
                                    {' '}bins
                                </span>
                            </div>
                        </div>
                        <div className="p-5 border-t flex gap-3">
                            <button onClick={() => setShowBatchCreate(false)}
                                className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg">Cancel</button>
                            <button onClick={handleBatchCreate} disabled={batchCreating}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-lg">
                                {batchCreating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                                    : <><Grid3X3 className="w-4 h-4" /> Create Bins</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
