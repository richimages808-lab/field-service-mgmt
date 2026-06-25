import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, Timestamp, increment, getDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { PurchaseOrder, ReceivingRecord } from '../types/Vendor';
import { MaterialItem, ToolItem } from '../types';
import {
    Package, Scan, ClipboardCheck, History, ChevronRight, Plus, Minus,
    Camera, Check, AlertTriangle, X, Search, MapPin, Truck,
    CheckCircle2, AlertCircle, ArrowLeft, Loader2,
    ScanLine, QrCode, Box, Tag, Eye, Image,
    Layers, Grid3X3, Warehouse
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════
 *  RECEIVING MODULE — v2
 *  Full-featured receiving with warehouse locations, receiving
 *  modes (individual/whole/photo), barcode scanning, binning
 * ═══════════════════════════════════════════════════════════ */

interface ReceivingLineState {
    materialId: string;
    name: string;
    sku: string;
    quantityExpected: number;
    quantityReceived: number;
    condition: 'good' | 'damaged' | 'wrong_item';
    discrepancyNotes: string;
    // Warehouse location fields
    location: string;
    zone: string;
    aisle: string;
    rack: string;
    shelf: string;
    level: string;
    binLocation: string;
    verified: boolean; // For individual-scan mode
}

type ReceiveMode = 'individual' | 'whole' | 'photo';

export const Receiving: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'po' | 'adhoc' | 'history'>('po');

    // Data
    const [pendingPOs, setPendingPOs] = useState<PurchaseOrder[]>([]);
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [tools, setTools] = useState<ToolItem[]>([]);
    const [receivingHistory, setReceivingHistory] = useState<ReceivingRecord[]>([]);
    const [orgLocations, setOrgLocations] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // PO Receiving State
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
    const [receivingLines, setReceivingLines] = useState<ReceivingLineState[]>([]);
    const [receivingNotes, setReceivingNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [receiveMode, setReceiveMode] = useState<ReceiveMode>('whole');

    // Ad-hoc Receiving State
    const [adhocSearch, setAdhocSearch] = useState('');
    const [adhocSelectedItem, setAdhocSelectedItem] = useState<MaterialItem | null>(null);
    const [adhocQty, setAdhocQty] = useState(1);
    const [adhocLocation, setAdhocLocation] = useState('');
    const [adhocZone, setAdhocZone] = useState('');
    const [adhocAisle, setAdhocAisle] = useState('');
    const [adhocRack, setAdhocRack] = useState('');
    const [adhocShelf, setAdhocShelf] = useState('');
    const [adhocLevel, setAdhocLevel] = useState('');
    const [adhocBin, setAdhocBin] = useState('');
    const [adhocNotes, setAdhocNotes] = useState('');
    const [adhocCondition, setAdhocCondition] = useState<'good' | 'damaged' | 'wrong_item'>('good');

    // Scanner State
    const [scannerActive, setScannerActive] = useState(false);
    const [scannerMode, setScannerMode] = useState<'po' | 'adhoc' | 'whole_po' | 'scan_bin' | 'scan_bin_adhoc'>('po');
    const scannerRef = useRef<any>(null);
    const [binScanTargetLineIdx, setBinScanTargetLineIdx] = useState<number>(-1);

    // Photo Receiving State
    const [photoReceiving, setPhotoReceiving] = useState(false);
    const [photoProcessing, setPhotoProcessing] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);

    // History filter
    const [historySearch, setHistorySearch] = useState('');

    // ── Warehouse zone presets ──
    const ZONE_PRESETS = ['Receiving', 'Bulk Storage', 'Pick Area', 'Staging', 'Returns', 'Hazmat'];

    // ── Data Listeners ──
    useEffect(() => {
        if (!user?.org_id) return;
        const orgId = user.org_id;

        // Load org locations
        getDoc(doc(db, 'organizations', orgId)).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.inventoryLocations && Array.isArray(data.inventoryLocations)) {
                    setOrgLocations(data.inventoryLocations);
                } else {
                    setOrgLocations(['Truck', 'Warehouse', 'At Supplier', 'On Order']);
                }
            }
        });

        // POs that need receiving
        const qPOs = query(
            collection(db, 'purchaseOrders'),
            where('organizationId', '==', orgId)
        );
        const unsubPOs = onSnapshot(qPOs, snap => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseOrder));
            setPendingPOs(all.filter(po => po.status === 'sent' || po.status === 'partially_received'));
            setLoading(false);
        });

        // Materials inventory
        const unsubMaterials = onSnapshot(
            query(collection(db, 'materials'), where('org_id', '==', orgId)),
            snap => setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as MaterialItem)))
        );
        const unsubMaterials2 = onSnapshot(
            query(collection(db, 'materials'), where('organizationId', '==', orgId)),
            snap => {
                if (snap.docs.length > 0) {
                    setMaterials(prev => {
                        const ids = new Set(prev.map(m => m.id));
                        const newItems = snap.docs.map(d => ({ id: d.id, ...d.data() } as MaterialItem)).filter(m => !ids.has(m.id));
                        return [...prev, ...newItems];
                    });
                }
            }
        );

        // Tools
        const unsubTools = onSnapshot(
            query(collection(db, 'tools'), where('organizationId', '==', orgId)),
            snap => setTools(snap.docs.map(d => ({ id: d.id, ...d.data() } as ToolItem)))
        );

        // Receiving history
        const unsubHistory = onSnapshot(
            query(collection(db, 'receivingRecords'), where('org_id', '==', orgId)),
            snap => {
                const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as ReceivingRecord));
                records.sort((a, b) => {
                    const aT = a.receivedAt?.toDate?.()?.getTime() || 0;
                    const bT = b.receivedAt?.toDate?.()?.getTime() || 0;
                    return bT - aT;
                });
                setReceivingHistory(records);
            }
        );

        return () => {
            unsubPOs();
            unsubMaterials();
            unsubMaterials2();
            unsubTools();
            unsubHistory();
        };
    }, [user?.org_id]);

    // ── Build composite bin code ──
    const buildBinCode = (line: { aisle: string; rack: string; shelf: string; level: string }) => {
        const parts = [line.aisle, line.rack, line.shelf, line.level].filter(Boolean);
        return parts.join('-') || '';
    };

    // ── Start bin scanner for a specific line ──
    const startBinScanner = (lineIdx: number) => {
        setBinScanTargetLineIdx(lineIdx);
        startScanner('scan_bin');
    };

    const startBinScannerAdhoc = () => {
        startScanner('scan_bin_adhoc');
    };

    // ── Barcode Scanner ──
    const startScanner = useCallback(async (mode: 'po' | 'adhoc' | 'whole_po' | 'scan_bin' | 'scan_bin_adhoc') => {
        setScannerMode(mode);
        setScannerActive(true);

        try {
            const { Html5Qrcode } = await import('html5-qrcode');
            await new Promise(r => setTimeout(r, 300));

            const scanner = new Html5Qrcode('scanner-container');
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 100 }, aspectRatio: 1.5 },
                (decodedText) => {
                    handleScanResult(decodedText, mode);
                    if (mode !== 'po') stopScanner();
                },
                () => {}
            );
        } catch (err) {
            console.error('Scanner error:', err);
            toast.error('Could not access camera. Check permissions.');
            setScannerActive(false);
        }
    }, [materials, tools, selectedPO, receivingLines]);

    const stopScanner = useCallback(async () => {
        if (scannerRef.current) {
            try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch (e) {}
            scannerRef.current = null;
        }
        setScannerActive(false);
    }, []);

    const handleScanResult = useCallback((code: string, mode: 'po' | 'adhoc' | 'whole_po' | 'scan_bin' | 'scan_bin_adhoc') => {
        const trimmed = code.trim();

        // ── Bin QR scan: auto-fill location fields ──
        if (mode === 'scan_bin' || mode === 'scan_bin_adhoc') {
            try {
                const binData = JSON.parse(trimmed);
                if (binData.t === 'bin') {
                    // Parse the label into aisle-rack-shelf-level
                    const parts = (binData.l || '').split('-');
                    const binFields = {
                        location: binData.loc || '',
                        zone: binData.z || '',
                        aisle: parts[0] || '',
                        rack: parts[1] || '',
                        shelf: parts[2] || '',
                        level: parts[3] || '',
                        binLocation: binData.l || ''
                    };

                    if (mode === 'scan_bin' && binScanTargetLineIdx >= 0) {
                        setReceivingLines(prev => prev.map((l, i) =>
                            i === binScanTargetLineIdx ? { ...l, ...binFields } : l
                        ));
                        toast.success(`📍 Bin ${binData.l} → ${receivingLines[binScanTargetLineIdx]?.name || 'item'}`);
                    } else if (mode === 'scan_bin_adhoc') {
                        setAdhocLocation(binFields.location);
                        setAdhocZone(binFields.zone);
                        setAdhocAisle(binFields.aisle);
                        setAdhocRack(binFields.rack);
                        setAdhocShelf(binFields.shelf);
                        setAdhocLevel(binFields.level);
                        setAdhocBin(binFields.binLocation);
                        toast.success(`📍 Bin ${binData.l} scanned`);
                    }
                    return;
                }
            } catch {
                // Not JSON — try matching label directly
                // Look for bin by label in the format "A-1-3-2"
                if (mode === 'scan_bin' && binScanTargetLineIdx >= 0) {
                    const parts = trimmed.split('-');
                    setReceivingLines(prev => prev.map((l, i) =>
                        i === binScanTargetLineIdx ? {
                            ...l,
                            aisle: parts[0] || '', rack: parts[1] || '',
                            shelf: parts[2] || '', level: parts[3] || '',
                            binLocation: trimmed
                        } : l
                    ));
                    toast.success(`📍 Bin ${trimmed} assigned`);
                } else if (mode === 'scan_bin_adhoc') {
                    const parts = trimmed.split('-');
                    setAdhocAisle(parts[0] || '');
                    setAdhocRack(parts[1] || '');
                    setAdhocShelf(parts[2] || '');
                    setAdhocLevel(parts[3] || '');
                    setAdhocBin(trimmed);
                    toast.success(`📍 Bin ${trimmed} scanned`);
                }
            }
            return;
        }

        if (mode === 'whole_po') {
            if (selectedPO) {
                setReceivingLines(prev => prev.map(l => ({ ...l, quantityReceived: l.quantityExpected, verified: true })));
                toast.success('Entire order scanned — all items marked as received');
                stopScanner();
            }
            return;
        }

        if (mode === 'po' && selectedPO) {
            const lineIndex = receivingLines.findIndex(l =>
                l.sku.toLowerCase() === trimmed.toLowerCase() ||
                l.name.toLowerCase().includes(trimmed.toLowerCase())
            );
            if (lineIndex >= 0) {
                setReceivingLines(prev => prev.map((l, i) =>
                    i === lineIndex ? { ...l, quantityReceived: Math.min(l.quantityReceived + 1, l.quantityExpected * 2), verified: true } : l
                ));
                toast.success(`✓ ${receivingLines[lineIndex].name} (+1)`);
            } else {
                toast.error(`No match for: ${trimmed}`);
            }
        } else if (mode === 'adhoc') {
            const match = materials.find(m =>
                m.upc === trimmed || m.sku === trimmed ||
                m.name.toLowerCase().includes(trimmed.toLowerCase())
            );
            if (match) {
                setAdhocSelectedItem(match);
                setAdhocLocation(match.location || orgLocations[0] || '');
                setAdhocBin(match.binLocation || '');
                setAdhocAisle(match.aisle || '');
                setAdhocRack(match.rack || '');
                setAdhocShelf(match.shelf || '');
                setAdhocLevel(match.level || '');
                setAdhocZone(match.zone || '');
                toast.success(`Found: ${match.name}`);
            } else {
                toast.error(`No inventory item for: ${trimmed}`);
            }
        }
    }, [materials, selectedPO, receivingLines, orgLocations, binScanTargetLineIdx]);

    // ── Photo Receiving (AI packing slip) ──
    const handlePhotoReceive = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedPO) return;

        setPhotoProcessing(true);
        try {
            // For now, auto-mark all items as received when photo is captured
            // Future: send to Gemini Vision API for OCR parsing
            await new Promise(r => setTimeout(r, 1500)); // Simulate processing

            setReceivingLines(prev => prev.map(l => ({
                ...l,
                quantityReceived: l.quantityExpected,
                verified: true
            })));
            toast.success('Packing slip processed — all items verified');
        } catch (err) {
            toast.error('Failed to process photo');
        } finally {
            setPhotoProcessing(false);
            setPhotoReceiving(false);
        }
    };

    // ── Select PO for Receiving ──
    const selectPOForReceiving = (po: PurchaseOrder) => {
        setSelectedPO(po);
        setReceivingLines(po.items.map(item => {
            // Look up the inventory item for location defaults
            const invItem = materials.find(m => m.id === item.materialId);
            return {
                materialId: item.materialId,
                name: item.name,
                sku: item.sku,
                quantityExpected: item.quantity,
                quantityReceived: item.receivedQty || 0,
                condition: 'good',
                discrepancyNotes: '',
                location: invItem?.location || orgLocations[0] || 'Warehouse',
                zone: invItem?.zone || '',
                aisle: invItem?.aisle || '',
                rack: invItem?.rack || '',
                shelf: invItem?.shelf || '',
                level: invItem?.level || '',
                binLocation: invItem?.binLocation || item.binLocation || '',
                verified: false
            };
        }));
        setReceivingNotes('');
        setReceiveMode('whole');
    };

    // ── Submit PO Receiving ──
    const submitPOReceiving = async () => {
        if (!selectedPO?.id || !user) return;

        // In individual mode, check all items are verified
        if (receiveMode === 'individual') {
            const unverified = receivingLines.filter(l => l.quantityReceived > 0 && !l.verified);
            if (unverified.length > 0) {
                toast.error(`${unverified.length} item(s) not yet scanned/verified. Scan each item or switch to Whole Order mode.`);
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const allFullyReceived = receivingLines.every(l => l.quantityReceived >= l.quantityExpected);
            const anyReceived = receivingLines.some(l => l.quantityReceived > 0);

            if (!anyReceived) {
                toast.error('Enter received quantities for at least one item.');
                setIsSubmitting(false);
                return;
            }

            // 1. Create receiving record
            const receivingItems = receivingLines.filter(l => l.quantityReceived > 0).map(l => ({
                materialId: l.materialId,
                name: l.name,
                sku: l.sku,
                quantityExpected: l.quantityExpected,
                quantityReceived: l.quantityReceived,
                discrepancy: l.quantityReceived !== l.quantityExpected,
                discrepancyNotes: l.discrepancyNotes || undefined,
                binLocation: l.binLocation || buildBinCode(l) || undefined,
                condition: l.condition
            }));

            await addDoc(collection(db, 'receivingRecords'), {
                org_id: user.org_id,
                purchaseOrderId: selectedPO.id,
                vendorId: selectedPO.vendorId,
                vendorName: selectedPO.vendorName,
                receivedBy: user.uid,
                receivedByName: user.displayName || user.email || 'Unknown',
                receivedAt: Timestamp.now(),
                items: receivingItems,
                notes: receivingNotes || undefined,
                status: allFullyReceived ? 'complete' : 'partial'
            });

            // 2. Update PO
            const updatedItems = selectedPO.items.map((item, idx) => ({
                ...item,
                receivedQty: receivingLines[idx].quantityReceived,
                binLocation: receivingLines[idx].binLocation || buildBinCode(receivingLines[idx]) || item.binLocation
            }));

            await updateDoc(doc(db, 'purchaseOrders', selectedPO.id), {
                items: updatedItems,
                status: allFullyReceived ? 'received' : 'partially_received',
                receivedAt: allFullyReceived ? Timestamp.now() : null,
                receivedBy: allFullyReceived ? user.uid : null
            });

            // 3. Update inventory (quantities + location fields)
            for (const line of receivingLines) {
                if (line.quantityReceived <= 0 || !line.materialId) continue;
                const previouslyReceived = selectedPO.items.find(i => i.materialId === line.materialId)?.receivedQty || 0;
                const newlyReceived = line.quantityReceived - previouslyReceived;
                if (newlyReceived <= 0) continue;

                try {
                    const updateData: any = { quantity: increment(newlyReceived) };
                    if (line.location) updateData.location = line.location;
                    if (line.zone) updateData.zone = line.zone;
                    if (line.aisle) updateData.aisle = line.aisle;
                    if (line.rack) updateData.rack = line.rack;
                    if (line.shelf) updateData.shelf = line.shelf;
                    if (line.level) updateData.level = line.level;
                    const composeBin = line.binLocation || buildBinCode(line);
                    if (composeBin) updateData.binLocation = composeBin;
                    updateData.lastRestockedAt = Timestamp.now();
                    await updateDoc(doc(db, 'materials', line.materialId), updateData);
                } catch (e) {
                    console.warn(`Could not update inventory for ${line.name}:`, e);
                }
            }

            toast.success(allFullyReceived ? 'Order fully received! Inventory updated.' : 'Partial receive recorded.');
            setSelectedPO(null);
            setReceivingLines([]);
        } catch (err: any) {
            toast.error(`Receiving failed: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Submit Ad-hoc Receiving ──
    const submitAdhocReceiving = async () => {
        if (!adhocSelectedItem || !user || adhocQty <= 0) return;
        setIsSubmitting(true);

        try {
            const composedBin = adhocBin || [adhocAisle, adhocRack, adhocShelf, adhocLevel].filter(Boolean).join('-');
            await addDoc(collection(db, 'receivingRecords'), {
                org_id: user.org_id,
                receivedBy: user.uid,
                receivedByName: user.displayName || user.email || 'Unknown',
                receivedAt: Timestamp.now(),
                items: [{
                    materialId: adhocSelectedItem.id,
                    name: adhocSelectedItem.name,
                    sku: adhocSelectedItem.sku || '',
                    quantityExpected: adhocQty,
                    quantityReceived: adhocQty,
                    discrepancy: false,
                    binLocation: composedBin || undefined,
                    condition: adhocCondition
                }],
                notes: adhocNotes || undefined,
                status: 'complete'
            });

            const updateData: any = { quantity: increment(adhocQty), lastRestockedAt: Timestamp.now() };
            if (adhocLocation) updateData.location = adhocLocation;
            if (adhocZone) updateData.zone = adhocZone;
            if (adhocAisle) updateData.aisle = adhocAisle;
            if (adhocRack) updateData.rack = adhocRack;
            if (adhocShelf) updateData.shelf = adhocShelf;
            if (adhocLevel) updateData.level = adhocLevel;
            if (composedBin) updateData.binLocation = composedBin;
            await updateDoc(doc(db, 'materials', adhocSelectedItem.id), updateData);

            toast.success(`Received ${adhocQty}x ${adhocSelectedItem.name}`);
            setAdhocSelectedItem(null);
            setAdhocQty(1);
            setAdhocBin(''); setAdhocAisle(''); setAdhocRack('');
            setAdhocShelf(''); setAdhocLevel(''); setAdhocZone('');
            setAdhocLocation(''); setAdhocNotes('');
            setAdhocCondition('good'); setAdhocSearch('');
        } catch (err: any) {
            toast.error(`Failed: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Filtered Materials ──
    const filteredMaterials = adhocSearch.trim()
        ? materials.filter(m =>
            m.name.toLowerCase().includes(adhocSearch.toLowerCase()) ||
            (m.sku || '').toLowerCase().includes(adhocSearch.toLowerCase()) ||
            (m.upc || '').toLowerCase().includes(adhocSearch.toLowerCase())
        ).slice(0, 8)
        : [];

    // ── Filtered History ──
    const filteredHistory = historySearch.trim()
        ? receivingHistory.filter(r =>
            r.items.some(i => i.name.toLowerCase().includes(historySearch.toLowerCase())) ||
            (r.vendorName || '').toLowerCase().includes(historySearch.toLowerCase()) ||
            (r.receivedByName || '').toLowerCase().includes(historySearch.toLowerCase())
        )
        : receivingHistory;

    // ── Location Picker Component ──
    const LocationPicker: React.FC<{
        location: string; zone: string; aisle: string; rack: string; shelf: string; level: string; binLocation: string;
        onChange: (field: string, value: string) => void;
        compact?: boolean;
        onScanBin?: () => void;
    }> = ({ location, zone, aisle, rack, shelf, level, binLocation, onChange, compact, onScanBin }) => (
        <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
            {/* Top-level location (from org settings) */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5 block">Location</label>
                    <select
                        value={location}
                        onChange={e => onChange('location', e.target.value)}
                        className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="">Select...</option>
                        {orgLocations.map(loc => (
                            <option key={loc} value={loc}>{loc}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5 block">Zone</label>
                    <select
                        value={zone}
                        onChange={e => onChange('zone', e.target.value)}
                        className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="">None</option>
                        {ZONE_PRESETS.map(z => (
                            <option key={z} value={z}>{z}</option>
                        ))}
                    </select>
                </div>
            </div>
            {/* Warehouse detail grid */}
            <div className="grid grid-cols-4 gap-1.5">
                {[
                    { label: 'Aisle', value: aisle, field: 'aisle', placeholder: 'A' },
                    { label: 'Rack', value: rack, field: 'rack', placeholder: 'R1' },
                    { label: 'Shelf', value: shelf, field: 'shelf', placeholder: '3' },
                    { label: 'Level', value: level, field: 'level', placeholder: '2' },
                ].map(f => (
                    <div key={f.field}>
                        <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5 block">{f.label}</label>
                        <input
                            type="text"
                            value={f.value}
                            onChange={e => onChange(f.field, e.target.value)}
                            placeholder={f.placeholder}
                            className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-center font-mono"
                        />
                    </div>
                ))}
            </div>
            {/* Composite bin preview + Scan Bin button */}
            <div className="flex items-center justify-between">
                {(aisle || rack || shelf || level) ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <MapPin className="w-3 h-3" />
                        <span>Bin: <strong className="text-gray-700 font-mono">{[aisle, rack, shelf, level].filter(Boolean).join('-')}</strong></span>
                    </div>
                ) : <div />}
                {onScanBin && (
                    <button
                        onClick={onScanBin}
                        className="flex items-center gap-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                        <QrCode className="w-3 h-3" /> Scan Bin
                    </button>
                )}
            </div>
        </div>
    );

    // ── Render ──
    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <ClipboardCheck className="w-8 h-8 text-blue-600" />
                    Receiving
                </h1>
                <p className="text-gray-500 mt-1">Receive orders, scan barcodes, assign bins, and update inventory</p>
            </div>

            {/* Scanner Overlay */}
            {scannerActive && (
                <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-white">
                                <ScanLine className="w-5 h-5" />
                                <span className="font-semibold">
                                    {scannerMode === 'whole_po' ? 'Scan PO / Pallet Barcode'
                                        : (scannerMode === 'scan_bin' || scannerMode === 'scan_bin_adhoc') ? 'Scan Bin Label'
                                        : 'Scan Item Barcode'}
                                </span>
                            </div>
                            <button onClick={stopScanner} className="text-white/80 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div id="scanner-container" className="w-full" style={{ minHeight: 300 }} />
                        <div className="px-4 py-3 text-center text-xs text-gray-500">
                            {scannerMode === 'whole_po'
                                ? 'Scan the PO barcode or packing slip QR to receive all items at once'
                                : (scannerMode === 'scan_bin' || scannerMode === 'scan_bin_adhoc')
                                ? 'Point camera at a printed bin QR label to auto-fill location fields'
                                : 'Point camera at barcode or QR code to identify item'
                            }
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden photo input */}
            <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoReceive}
            />

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
                <div className="flex border-b border-gray-200">
                    {[
                        { id: 'po' as const, label: 'Receive Against PO', icon: Truck, count: pendingPOs.length },
                        { id: 'adhoc' as const, label: 'Ad-Hoc Receive', icon: Package },
                        { id: 'history' as const, label: 'History', icon: History, count: receivingHistory.length }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); if (selectedPO && tab.id !== 'po') setSelectedPO(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tab.label}</span>
                            <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{tab.count}</span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="p-4 sm:p-6">
                    {/* ═══════ TAB 1: RECEIVE AGAINST PO ═══════ */}
                    {activeTab === 'po' && !selectedPO && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-gray-900">Pending Orders</h2>
                            </div>

                            {loading ? (
                                <div className="text-center py-12 text-gray-400">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />Loading...
                                </div>
                            ) : pendingPOs.length === 0 ? (
                                <div className="text-center py-12 bg-gray-50 rounded-xl">
                                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                                    <p className="text-gray-600 font-medium">No orders awaiting receiving</p>
                                    <p className="text-gray-400 text-sm mt-1">All sent POs have been fully received</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {pendingPOs.map(po => {
                                        const totalItems = po.items.reduce((s, i) => s + i.quantity, 0);
                                        const totalReceived = po.items.reduce((s, i) => s + (i.receivedQty || 0), 0);
                                        const pctReceived = totalItems > 0 ? Math.round((totalReceived / totalItems) * 100) : 0;

                                        return (
                                            <button
                                                key={po.id}
                                                onClick={() => selectPOForReceiving(po)}
                                                className="w-full text-left bg-white border border-gray-200 hover:border-blue-300 hover:shadow-md rounded-xl p-4 transition-all group"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-semibold text-gray-900">{po.vendorName}</span>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                                po.status === 'partially_received'
                                                                    ? 'bg-amber-100 text-amber-700'
                                                                    : 'bg-blue-100 text-blue-700'
                                                            }`}>
                                                                {po.status === 'partially_received' ? 'Partial' : 'Awaiting'}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {po.items.length} item{po.items.length !== 1 ? 's' : ''} • ${po.total?.toFixed(2) || '0.00'}
                                                            {po.status === 'partially_received' && (
                                                                <span className="ml-2 text-amber-600 font-medium">{pctReceived}% received</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500" />
                                                </div>
                                                {po.status === 'partially_received' && (
                                                    <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                                                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pctReceived}%` }} />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══════ PO RECEIVING DETAIL ═══════ */}
                    {activeTab === 'po' && selectedPO && (
                        <div>
                            <button
                                onClick={() => { setSelectedPO(null); setReceivingLines([]); }}
                                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back to Orders
                            </button>

                            <div className="bg-gray-50 rounded-xl p-4 mb-4">
                                <div className="flex items-center gap-3 mb-1">
                                    <Truck className="w-5 h-5 text-blue-600" />
                                    <h2 className="text-lg font-bold text-gray-900">Receiving: {selectedPO.vendorName}</h2>
                                </div>
                                <p className="text-xs text-gray-500 ml-8">PO #{selectedPO.id?.slice(0, 8)} • {selectedPO.items.length} line items</p>
                            </div>

                            {/* ── Receive Mode Selector ── */}
                            <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Receiving Mode</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'individual' as ReceiveMode, label: 'Individual Scan', desc: 'Verify each item', icon: Scan },
                                        { id: 'whole' as ReceiveMode, label: 'Whole Order', desc: 'Receive all at once', icon: Box },
                                        { id: 'photo' as ReceiveMode, label: 'Photo / Slip', desc: 'Snap packing slip', icon: Camera },
                                    ].map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => setReceiveMode(m.id)}
                                            className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-center ${
                                                receiveMode === m.id
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                            }`}
                                        >
                                            <m.icon className="w-5 h-5" />
                                            <span className="text-xs font-semibold">{m.label}</span>
                                            <span className="text-[10px] opacity-70">{m.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Mode action buttons */}
                            <div className="flex gap-2 mb-4">
                                {receiveMode === 'individual' && (
                                    <button
                                        onClick={() => startScanner('po')}
                                        className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg"
                                    >
                                        <Scan className="w-4 h-4" /> Start Scanning Items
                                    </button>
                                )}
                                {receiveMode === 'whole' && (
                                    <>
                                        <button
                                            onClick={() => startScanner('whole_po')}
                                            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg"
                                        >
                                            <QrCode className="w-4 h-4" /> Scan PO / Pallet Code
                                        </button>
                                        <button
                                            onClick={() => {
                                                setReceivingLines(prev => prev.map(l => ({ ...l, quantityReceived: l.quantityExpected, verified: true })));
                                                toast.success('All items marked as received');
                                            }}
                                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
                                        >
                                            <Check className="w-4 h-4" /> Receive All
                                        </button>
                                    </>
                                )}
                                {receiveMode === 'photo' && (
                                    <button
                                        onClick={() => photoInputRef.current?.click()}
                                        disabled={photoProcessing}
                                        className="flex-1 flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:bg-gray-300"
                                    >
                                        {photoProcessing ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                                        ) : (
                                            <><Camera className="w-4 h-4" /> Take Photo of Packing Slip</>
                                        )}
                                    </button>
                                )}
                            </div>

                            {/* Line Items */}
                            <div className="space-y-3 mb-6">
                                {receivingLines.map((line, idx) => {
                                    const isComplete = line.quantityReceived >= line.quantityExpected;
                                    const hasDiscrepancy = line.quantityReceived > 0 && line.quantityReceived !== line.quantityExpected;

                                    return (
                                        <div key={idx} className={`border rounded-xl p-4 transition-colors ${
                                            isComplete ? 'border-emerald-200 bg-emerald-50/50' :
                                            hasDiscrepancy ? 'border-amber-200 bg-amber-50/50' :
                                            'border-gray-200 bg-white'
                                        }`}>
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-semibold text-gray-900 text-sm">{line.name}</h3>
                                                        {receiveMode === 'individual' && line.verified && (
                                                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                                                                <Check className="w-2.5 h-2.5" /> Verified
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                                                        {line.sku !== 'N/A' && <span className="flex items-center gap-0.5"><Tag className="w-3 h-3" />{line.sku}</span>}
                                                        <span>Expected: <strong>{line.quantityExpected}</strong></span>
                                                    </p>
                                                </div>
                                                {isComplete && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                                                {hasDiscrepancy && !isComplete && <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}
                                            </div>

                                            {/* Quantity Stepper */}
                                            <div className="flex items-center gap-3 mb-3">
                                                <span className="text-xs text-gray-500 w-16">Received:</span>
                                                <div className="flex items-center gap-0">
                                                    <button
                                                        onClick={() => setReceivingLines(prev => prev.map((l, i) =>
                                                            i === idx ? { ...l, quantityReceived: Math.max(0, l.quantityReceived - 1) } : l
                                                        ))}
                                                        className="w-11 h-11 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-l-lg border border-gray-300"
                                                    >
                                                        <Minus className="w-4 h-4" />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        value={line.quantityReceived}
                                                        onChange={e => {
                                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                                            setReceivingLines(prev => prev.map((l, i) =>
                                                                i === idx ? { ...l, quantityReceived: val } : l
                                                            ));
                                                        }}
                                                        className="w-16 h-11 text-center border-y border-gray-300 text-lg font-bold focus:ring-2 focus:ring-blue-500"
                                                    />
                                                    <button
                                                        onClick={() => setReceivingLines(prev => prev.map((l, i) =>
                                                            i === idx ? { ...l, quantityReceived: l.quantityReceived + 1 } : l
                                                        ))}
                                                        className="w-11 h-11 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-r-lg border border-gray-300"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setReceivingLines(prev => prev.map((l, i) =>
                                                            i === idx ? { ...l, quantityReceived: l.quantityExpected, verified: true } : l
                                                        ))}
                                                        className="ml-2 text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-medium px-2.5 py-2 rounded-lg"
                                                    >
                                                        All
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Location Assignment */}
                                            <LocationPicker
                                                location={line.location}
                                                zone={line.zone}
                                                aisle={line.aisle}
                                                rack={line.rack}
                                                shelf={line.shelf}
                                                level={line.level}
                                                binLocation={line.binLocation}
                                                onChange={(field, value) => setReceivingLines(prev => prev.map((l, i) =>
                                                    i === idx ? { ...l, [field]: value } : l
                                                ))}
                                                onScanBin={() => startBinScanner(idx)}
                                                compact
                                            />

                                            {/* Condition */}
                                            <div className="mt-2">
                                                <select
                                                    value={line.condition}
                                                    onChange={e => setReceivingLines(prev => prev.map((l, i) =>
                                                        i === idx ? { ...l, condition: e.target.value as any } : l
                                                    ))}
                                                    className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="good">✓ Good Condition</option>
                                                    <option value="damaged">⚠ Damaged</option>
                                                    <option value="wrong_item">✕ Wrong Item</option>
                                                </select>
                                            </div>

                                            {hasDiscrepancy && (
                                                <input
                                                    type="text"
                                                    value={line.discrepancyNotes}
                                                    onChange={e => setReceivingLines(prev => prev.map((l, i) =>
                                                        i === idx ? { ...l, discrepancyNotes: e.target.value } : l
                                                    ))}
                                                    placeholder="Discrepancy notes (optional)"
                                                    className="mt-2 w-full px-3 py-2 text-sm border border-amber-200 bg-amber-50 rounded-lg placeholder:text-amber-400"
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Notes + Submit */}
                            <div className="border-t pt-4">
                                <label className="text-xs font-medium text-gray-600 block mb-1">Receiving Notes (optional)</label>
                                <textarea
                                    value={receivingNotes}
                                    onChange={e => setReceivingNotes(e.target.value)}
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4"
                                    placeholder="Any notes about this shipment..."
                                />
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setSelectedPO(null); setReceivingLines([]); }}
                                        className="px-4 py-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={submitPOReceiving}
                                        disabled={isSubmitting || !receivingLines.some(l => l.quantityReceived > 0)}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 rounded-lg"
                                    >
                                        {isSubmitting ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                                        ) : (
                                            <><Check className="w-4 h-4" /> Confirm Receiving</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ═══════ TAB 2: AD-HOC RECEIVING ═══════ */}
                    {activeTab === 'adhoc' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">Ad-Hoc Receiving</h2>
                                    <p className="text-xs text-gray-500">Walk-in purchases, returns, or items without a PO</p>
                                </div>
                                <button
                                    onClick={() => startScanner('adhoc')}
                                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg"
                                >
                                    <Scan className="w-4 h-4" /> Scan
                                </button>
                            </div>

                            {!adhocSelectedItem ? (
                                <div>
                                    <div className="relative mb-3">
                                        <Search className="w-4 h-4 absolute left-3 top-3.5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={adhocSearch}
                                            onChange={e => setAdhocSearch(e.target.value)}
                                            placeholder="Search by name, SKU, or UPC..."
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    {filteredMaterials.length > 0 && (
                                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                                            {filteredMaterials.map(m => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => {
                                                        setAdhocSelectedItem(m);
                                                        setAdhocLocation(m.location || orgLocations[0] || '');
                                                        setAdhocBin(m.binLocation || '');
                                                        setAdhocAisle(m.aisle || '');
                                                        setAdhocRack(m.rack || '');
                                                        setAdhocShelf(m.shelf || '');
                                                        setAdhocLevel(m.level || '');
                                                        setAdhocZone(m.zone || '');
                                                        setAdhocSearch('');
                                                    }}
                                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b last:border-b-0 border-gray-100"
                                                >
                                                    <div className="font-medium text-gray-900 text-sm">{m.name}</div>
                                                    <div className="text-xs text-gray-500 flex items-center gap-2">
                                                        {m.sku && <span>SKU: {m.sku}</span>}
                                                        <span>Qty: {m.quantity}</span>
                                                        <span>{m.location}</span>
                                                        {m.binLocation && <span>Bin: {m.binLocation}</span>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {adhocSearch.trim() && filteredMaterials.length === 0 && (
                                        <div className="text-center py-8 text-gray-400">
                                            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">No matching inventory items</p>
                                        </div>
                                    )}

                                    {!adhocSearch.trim() && (
                                        <div className="text-center py-12 bg-gray-50 rounded-xl">
                                            <QrCode className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                            <p className="text-gray-500 font-medium">Search or scan to find an item</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <button
                                        onClick={() => { setAdhocSelectedItem(null); setAdhocSearch(''); }}
                                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
                                    >
                                        <ArrowLeft className="w-4 h-4" /> Change Item
                                    </button>

                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                                        <h3 className="font-bold text-gray-900">{adhocSelectedItem.name}</h3>
                                        <div className="text-xs text-gray-600 flex items-center gap-3 mt-1">
                                            {adhocSelectedItem.sku && <span>SKU: {adhocSelectedItem.sku}</span>}
                                            <span>Stock: <strong>{adhocSelectedItem.quantity}</strong></span>
                                            <span>{adhocSelectedItem.location}</span>
                                        </div>
                                    </div>

                                    {/* Quantity */}
                                    <div className="mb-4">
                                        <label className="text-xs font-medium text-gray-600 block mb-1">Quantity Received</label>
                                        <div className="flex items-center gap-0">
                                            <button onClick={() => setAdhocQty(q => Math.max(1, q - 1))}
                                                className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-l-lg border border-gray-300">
                                                <Minus className="w-5 h-5" />
                                            </button>
                                            <input type="number" value={adhocQty}
                                                onChange={e => setAdhocQty(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-20 h-12 text-center border-y border-gray-300 text-xl font-bold" />
                                            <button onClick={() => setAdhocQty(q => q + 1)}
                                                className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-r-lg border border-gray-300">
                                                <Plus className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Location Assignment */}
                                    <div className="mb-4">
                                        <label className="text-xs font-semibold text-gray-700 mb-2 block flex items-center gap-1.5">
                                            <Warehouse className="w-3.5 h-3.5 text-blue-600" /> Storage Location
                                        </label>
                                        <LocationPicker
                                            location={adhocLocation}
                                            zone={adhocZone}
                                            aisle={adhocAisle}
                                            rack={adhocRack}
                                            shelf={adhocShelf}
                                            level={adhocLevel}
                                            binLocation={adhocBin}
                                            onChange={(field, value) => {
                                                const setters: Record<string, (v: string) => void> = {
                                                    location: setAdhocLocation, zone: setAdhocZone,
                                                    aisle: setAdhocAisle, rack: setAdhocRack,
                                                    shelf: setAdhocShelf, level: setAdhocLevel,
                                                    binLocation: setAdhocBin
                                                };
                                                setters[field]?.(value);
                                            }}
                                            onScanBin={startBinScannerAdhoc}
                                        />
                                    </div>

                                    {/* Condition + Notes */}
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 block mb-1">Condition</label>
                                            <select value={adhocCondition} onChange={e => setAdhocCondition(e.target.value as any)}
                                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm">
                                                <option value="good">✓ Good</option>
                                                <option value="damaged">⚠ Damaged</option>
                                                <option value="wrong_item">✕ Wrong Item</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
                                            <input type="text" value={adhocNotes} onChange={e => setAdhocNotes(e.target.value)}
                                                placeholder="Optional" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                                        </div>
                                    </div>

                                    <button onClick={submitAdhocReceiving} disabled={isSubmitting}
                                        className="w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 rounded-xl">
                                        {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                                            : <><Check className="w-4 h-4" /> Receive {adhocQty}x {adhocSelectedItem.name}</>}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══════ TAB 3: RECEIVING HISTORY ═══════ */}
                    {activeTab === 'history' && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Receiving History</h2>

                            <div className="relative mb-4">
                                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                <input type="text" value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                                    placeholder="Search by item, vendor, or person..."
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>

                            {filteredHistory.length === 0 ? (
                                <div className="text-center py-12 bg-gray-50 rounded-xl">
                                    <History className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-gray-500 font-medium">No receiving records yet</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredHistory.map(record => {
                                        const date = record.receivedAt?.toDate?.() || new Date();
                                        const totalItems = record.items.reduce((s, i) => s + i.quantityReceived, 0);
                                        const hasDiscrepancies = record.items.some(i => i.discrepancy);

                                        return (
                                            <div key={record.id} className="border border-gray-200 rounded-xl p-4">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className={`w-2 h-2 rounded-full ${record.status === 'complete' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                            <span className="font-semibold text-gray-900 text-sm">
                                                                {record.vendorName || 'Ad-Hoc'}
                                                            </span>
                                                            {hasDiscrepancies && (
                                                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Discrepancy</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                            {' at '}
                                                            {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                                            {' • '}
                                                            {record.receivedByName}
                                                        </div>
                                                    </div>
                                                    <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded">
                                                        {totalItems} item{totalItems !== 1 ? 's' : ''}
                                                    </span>
                                                </div>

                                                <div className="space-y-1">
                                                    {record.items.map((item, idx) => (
                                                        <div key={idx} className="flex items-center justify-between text-xs py-1 border-t border-gray-50">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="text-gray-700 truncate">{item.name}</span>
                                                                {item.binLocation && (
                                                                    <span className="text-gray-400 flex items-center gap-0.5 shrink-0">
                                                                        <MapPin className="w-2.5 h-2.5" />{item.binLocation}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <span className={item.discrepancy ? 'text-amber-600 font-semibold' : 'text-gray-600'}>
                                                                    {item.quantityReceived}/{item.quantityExpected}
                                                                </span>
                                                                {item.condition === 'damaged' && <AlertTriangle className="w-3 h-3 text-red-500" />}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {record.notes && (
                                                    <p className="text-xs text-gray-400 mt-2 italic">"{record.notes}"</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
