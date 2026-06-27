
import React, { useState, useEffect } from 'react';
import {
    X, Camera, Loader2, CheckCircle2, ChevronRight, AlertTriangle, Plus, Package,
    Upload, Trash2, ArrowLeft, Save, PenTool, MapPin, Undo2
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp, increment, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadPhotos, identifyMaterials, matchInventoryItems } from '../lib/aiMaterialsService';
import { SignatureCapture } from './SignatureCapture';
import toast from 'react-hot-toast';
import { Job, MaterialItem, JobPrepPackage } from '../types';

interface JobCompletionWizardProps {
    job: Job;
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
}

export const JobCompletionWizard: React.FC<JobCompletionWizardProps> = ({
    job, isOpen, onClose, onComplete
}) => {
    const { user } = useAuth();
    const [step, setStep] = useState(1);
    const [processing, setProcessing] = useState(false);

    // Step 1: Photos
    const [photos, setPhotos] = useState<File[]>([]);
    const [photoUrls, setPhotoUrls] = useState<string[]>([]);
    const [isScanning, setIsScanning] = useState(false);

    // Step 2: Parts
    const [inventory, setInventory] = useState<MaterialItem[]>([]);
    const [identifiedParts, setIdentifiedParts] = useState<any[]>([]);
    const [loadingInventory, setLoadingInventory] = useState(false);

    // Step 3: Signature & Final
    const [signatureData, setSignatureData] = useState<{ dataUrl: string, name: string, consentText?: string } | null>(() => {
        if (job.signature) {
            return {
                dataUrl: job.signature.dataUrl,
                name: job.signature.signerName,
                consentText: job.signature.consentText
            };
        }
        return null;
    });

    // Prep Package verification
    const [prepPackage, setPrepPackage] = useState<JobPrepPackage | null>(null);
    const [prepVerification, setPrepVerification] = useState<Record<string, { used: boolean; qtyUsed: number }>>({});
    const [loadingPrep, setLoadingPrep] = useState(false);
    const hasPrepPackage = prepPackage !== null && (prepPackage.materials.length > 0 || prepPackage.tools.length > 0);
    const totalSteps = hasPrepPackage ? 4 : 3;

    useEffect(() => {
        if (isOpen && user?.org_id) {
            loadInventory();
            loadPrepPackage();
        }
    }, [isOpen, user?.org_id]);

    const loadInventory = async () => {
        setLoadingInventory(true);
        try {
            const q = query(
                collection(db, 'materials'),
                where('org_id', '==', user?.org_id)
            );
            const snapshot = await getDocs(q);
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as MaterialItem));
            setInventory(items);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingInventory(false);
        }
    };

    const loadPrepPackage = async () => {
        if (!user?.org_id) return;
        setLoadingPrep(true);
        try {
            const q = query(
                collection(db, 'jobPrepPackages'),
                where('org_id', '==', user.org_id),
                where('job_id', '==', job.id)
            );
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                const pkg = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as JobPrepPackage;
                setPrepPackage(pkg);
                // Initialize verification state — default all picked materials to "used"
                const verState: Record<string, { used: boolean; qtyUsed: number }> = {};
                pkg.materials.forEach(m => {
                    verState[m.materialId] = { used: true, qtyUsed: m.quantityNeeded };
                });
                setPrepVerification(verState);
            }
        } catch (e) {
            console.warn('Could not load prep package:', e);
        } finally {
            setLoadingPrep(false);
        }
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            setPhotos([...photos, ...newFiles]);
        }
    };

    const runAIScan = async () => {
        if (photos.length === 0) return;
        setIsScanning(true);
        try {
            const urls = await uploadPhotos(photos, user?.org_id || 'unknown', 'materials');
            setPhotoUrls(urls);

            const aiResults = await identifyMaterials(urls, user?.org_id || 'unknown', 'materials');
            const matched = matchInventoryItems(aiResults, inventory);

            setIdentifiedParts(matched.map(item => ({
                ...item,
                selectedInventoryId: item.matchedInventoryItem?.id || '',
                quantity: item.quantity || 1,
                source: item.matchedInventoryItem ? 'stock' : 'purchased'
            })));

            setStep(2);
        } catch (err: any) {
            console.error('AI Scan error:', err);
            const msg = err?.message || err?.code || 'Unknown error';
            toast.error(`AI Scan failed: ${msg}. You can skip and add parts manually.`);
        } finally {
            setIsScanning(false);
        }
    };

    const skipAIScan = () => {
        setIdentifiedParts([]);
        setStep(2);
    };

    const handleCompleteJob = async () => {
        setProcessing(true);
        try {
            const batch = writeBatch(db);
            const jobRef = doc(db, 'jobs', job.id);
            const orgId = user?.org_id || user?.uid || 'unknown';

            // 1. Prepare Final Parts List
            const finalParts = [
                ...(job.costs?.parts && typeof job.costs.parts === 'object' ? job.costs.parts.items || [] : []),
                ...identifiedParts.filter(p => p.selectedInventoryId).map(p => ({
                    name: p.name,
                    quantity: p.quantity,
                    material_id: p.selectedInventoryId,
                    unitCost: inventory.find(i => i.id === p.selectedInventoryId)?.unitCost || 0,
                    source: p.source
                })),
                ...identifiedParts.filter(p => !p.selectedInventoryId).map(p => ({
                    name: p.name,
                    quantity: p.quantity,
                    material_id: null,
                    unitCost: 0, // Manual parts likely have 0 cost unless we add field
                    source: p.source || 'purchased'
                }))
            ];

            // 2. Inventory Deductions (Batch Operations) — for parts identified at completion
            for (const part of finalParts) {
                if (part.material_id && part.source === 'stock') {
                    const materialRef = doc(db, 'materials', part.material_id);
                    const transactionRef = doc(collection(db, 'inventory_transactions'));

                    // Decrement Inventory
                    batch.update(materialRef, {
                        quantity: increment(-part.quantity),
                        updatedAt: serverTimestamp(),
                        lastUsedAt: serverTimestamp()
                    });

                    // Log Transaction
                    batch.set(transactionRef, {
                        id: transactionRef.id,
                        org_id: orgId,
                        item_id: part.material_id,
                        type: 'job_usage',
                        quantity_change: -part.quantity,
                        quantity_after: (inventory.find(i => i.id === part.material_id)?.quantity || 0) - part.quantity,
                        reference_id: job.id,
                        notes: `Used in Job #${job.id.slice(0, 5)}`,
                        performed_by: user?.uid,
                        createdAt: serverTimestamp()
                    });
                }
            }

            // 2b. Prep Package — restore inventory for unused prepped materials
            if (prepPackage && hasPrepPackage) {
                for (const mat of prepPackage.materials) {
                    const ver = prepVerification[mat.materialId];
                    if (!ver) continue;

                    const qtyPrepped = mat.quantityNeeded;
                    const qtyUsed = ver.used ? ver.qtyUsed : 0;
                    const qtyToReturn = qtyPrepped - qtyUsed;

                    if (qtyToReturn > 0 && mat.materialId) {
                        // Restore unused quantity back to inventory
                        const materialRef = doc(db, 'materials', mat.materialId);
                        batch.update(materialRef, {
                            quantity: increment(qtyToReturn),
                            updatedAt: serverTimestamp(),
                        });

                        // Log the return transaction
                        const returnTransRef = doc(collection(db, 'inventory_transactions'));
                        batch.set(returnTransRef, {
                            id: returnTransRef.id,
                            org_id: orgId,
                            item_id: mat.materialId,
                            type: 'job_return',
                            quantity_change: qtyToReturn,
                            reference_id: job.id,
                            notes: `Returned unused from Job #${job.id.slice(0, 5)} — ${mat.name}`,
                            performed_by: user?.uid,
                            createdAt: serverTimestamp()
                        });
                    }
                }

                // Update the prep package status
                const prepRef = doc(db, 'jobPrepPackages', prepPackage.id);
                batch.update(prepRef, {
                    status: 'dispatched',
                    updatedAt: serverTimestamp(),
                });
            }

            // 3. Update Job Status
            batch.update(jobRef, {
                status: 'completed',
                completedAt: serverTimestamp(),
                signature: signatureData ? {
                    signedAt: new Date().toISOString(),
                    signerName: signatureData.name,
                    dataUrl: signatureData.dataUrl,
                    consentText: signatureData.consentText || "By signing above, you confirm that the work described has been completed to your satisfaction. This electronic signature has the same legal effect as a handwritten signature."
                } : null,
                'costs.parts': {
                    estimated: 0,
                    actual: finalParts.reduce((sum, p) => sum + (p.unitCost * p.quantity), 0),
                    items: finalParts
                }
            });

            // 4. Commit All Changes
            await batch.commit();

            // 5. Auto-Generate Draft Invoice
            try {
                const invoiceItems: { description: string; quantity: number; unit_price: number; amount: number; total: number }[] = [];

                // Add parts as invoice line items
                for (const part of finalParts) {
                    if (part.unitCost > 0 || part.name) {
                        const unitPrice = inventory.find(i => i.id === part.material_id)?.unitPrice || part.unitCost || 0;
                        const lineTotal = unitPrice * part.quantity;
                        invoiceItems.push({
                            description: `Part: ${part.name}`,
                            quantity: part.quantity,
                            unit_price: unitPrice,
                            amount: lineTotal,
                            total: lineTotal
                        });
                    }
                }

                // Add labor if tracked on the job
                const laborCosts = job.costs?.labor;
                if (laborCosts && typeof laborCosts === 'object' && 'actualMinutes' in laborCosts) {
                    const laborTotal = (laborCosts as any).total || ((laborCosts as any).actualMinutes / 60) * ((laborCosts as any).hourlyRate || 0);
                    if (laborTotal > 0) {
                        invoiceItems.push({
                            description: `Labor: ${Math.round((laborCosts as any).actualMinutes)} min @ $${((laborCosts as any).hourlyRate || 0).toFixed(2)}/hr`,
                            quantity: 1,
                            unit_price: laborTotal,
                            amount: laborTotal,
                            total: laborTotal
                        });
                    }
                } else if (typeof laborCosts === 'number' && laborCosts > 0) {
                    invoiceItems.push({
                        description: 'Labor',
                        quantity: 1,
                        unit_price: laborCosts,
                        amount: laborCosts,
                        total: laborCosts
                    });
                }

                // Add mileage if tracked
                const mileageCosts = job.costs?.mileage;
                if (mileageCosts && typeof mileageCosts === 'object' && 'total' in mileageCosts && (mileageCosts as any).total > 0) {
                    invoiceItems.push({
                        description: `Mileage: ${(mileageCosts as any).miles || 0} miles`,
                        quantity: 1,
                        unit_price: (mileageCosts as any).total,
                        amount: (mileageCosts as any).total,
                        total: (mileageCosts as any).total
                    });
                }

                // Add other costs
                const otherCosts = job.costs?.other;
                if (otherCosts && Array.isArray(otherCosts)) {
                    for (const item of otherCosts) {
                        if ((item as any).amount > 0) {
                            invoiceItems.push({
                                description: (item as any).description || 'Additional Charge',
                                quantity: 1,
                                unit_price: (item as any).amount,
                                amount: (item as any).amount,
                                total: (item as any).amount
                            });
                        }
                    }
                }

                const invoiceTotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);

                if (invoiceTotal > 0) {
                    const invoiceData = {
                        org_id: orgId,
                        customer_id: job.customer_id || '',
                        customer: job.customer,
                        items: invoiceItems,
                        subtotal: invoiceTotal,
                        tax_amount: 0,
                        total: invoiceTotal,
                        balance_due: invoiceTotal,
                        payments_applied: 0,
                        status: 'draft',
                        createdAt: serverTimestamp(),
                        source_job_id: job.id,
                        job_id: job.id
                    };

                    const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);

                    // Link invoice back to the job
                    await updateDoc(doc(db, 'jobs', job.id), {
                        invoice_id: invoiceRef.id
                    });

                    toast.success('Job Completed & Draft Invoice Created!');
                } else {
                    toast.success('Job Completed & Inventory Updated!');
                }
            } catch (invoiceErr) {
                console.error('Auto-invoice generation failed (job still completed):', invoiceErr);
                toast.success('Job Completed! (Invoice could not be auto-generated)');
            }

            onComplete();
            onClose();

        } catch (error) {
            console.error(error);
            toast.error('Failed to complete job');
        } finally {
            setProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Complete Job</h2>
                    <button onClick={onClose}><X className="w-6 h-6" /></button>
                </div>

                {/* Progress */}
                <div className="flex p-4 gap-2">
                    {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
                        <div key={s} className={`flex-1 h-2 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
                    ))}
                </div>

                {/* Step 1: Evidence */}
                {step === 1 && (
                    <div className="flex-1 p-6 overflow-y-auto">
                        <h3 className="text-lg font-semibold mb-4">1. Job Photos & Evidence</h3>

                        <div className="border-2 border-dashed rounded-lg p-8 text-center bg-gray-50 mb-6">
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                onChange={handlePhotoUpload}
                                className="hidden"
                                id="photo-upload"
                            />
                            <label htmlFor="photo-upload" className="cursor-pointer flex flex-col items-center">
                                <Camera className="w-12 h-12 text-gray-400 mb-2" />
                                <span className="text-blue-600 font-medium">Take Photos or Upload</span>
                                <span className="text-sm text-gray-500">Capture finished work and parts used</span>
                            </label>
                        </div>

                        {photos.length > 0 && (
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                {photos.map((p, i) => (
                                    <div key={i} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                                        <img src={URL.createObjectURL(p)} className="object-cover w-full h-full" />
                                        <button
                                            onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                                <h4 className="font-medium text-blue-900">AI Parts Detection</h4>
                                <p className="text-sm text-blue-700">We will scan these photos to automatically identify parts and materials used.</p>
                                <p className="text-xs text-blue-500 mt-1">You can also skip this step and add parts manually.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Parts Review */}
                {step === 2 && (
                    <div className="flex-1 p-6 overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">2. Review Parts Used</h3>
                            <button
                                onClick={() => {
                                    setIdentifiedParts([
                                        ...identifiedParts,
                                        {
                                            name: 'Manual Part',
                                            quantity: 1,
                                            category: 'parts',
                                            confidence: 100,
                                            photoUrl: '', // No photo for manual entry
                                            selectedInventoryId: '',
                                            source: 'purchased'
                                        } as any
                                    ]);
                                }}
                                className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-full hover:bg-blue-100 flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" />
                                Add Part
                            </button>
                        </div>

                        {identifiedParts.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg dashed-border">
                                <p className="mb-2">No parts detected/added.</p>
                                <button
                                    onClick={() => {
                                        setIdentifiedParts([
                                            ...identifiedParts,
                                            {
                                                name: 'Manual Part',
                                                quantity: 1,
                                                category: 'parts',
                                                confidence: 100,
                                                photoUrl: '',
                                                selectedInventoryId: '',
                                                source: 'purchased'
                                            } as any
                                        ]);
                                    }}
                                    className="text-blue-600 font-medium hover:underline"
                                >
                                    + Add Part Manually
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {identifiedParts.map((item, idx) => (
                                    <div key={idx} className="border rounded-lg p-4 flex gap-4 items-start relative group">
                                        <button
                                            onClick={() => {
                                                const newParts = [...identifiedParts];
                                                newParts.splice(idx, 1);
                                                setIdentifiedParts(newParts);
                                            }}
                                            className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                                            title="Remove Item"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>

                                        {item.photoUrl ? (
                                            <img src={item.photoUrl} className="w-16 h-16 object-cover rounded" />
                                        ) : (
                                            <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-gray-400">
                                                <Package className="w-8 h-8" />
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <div className="flex justify-between pr-8">
                                                <h4 className="font-medium">{item.name}</h4>
                                                {item.confidence < 100 && (
                                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">AI Detected</span>
                                                )}
                                                {item.confidence === 100 && (
                                                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">Manual</span>
                                                )}
                                            </div>

                                            <div className="mt-2 grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-xs text-gray-500 block">Matched Inventory</label>
                                                    <select
                                                        className="w-full text-sm border rounded p-1"
                                                        value={item.selectedInventoryId || ''}
                                                        onChange={(e) => {
                                                            const upd = [...identifiedParts];
                                                            const selectedInv = inventory.find(i => i.id === e.target.value);
                                                            upd[idx].selectedInventoryId = e.target.value;
                                                            if (selectedInv) {
                                                                upd[idx].name = selectedInv.name; // Auto-update name
                                                            }
                                                            setIdentifiedParts(upd);
                                                        }}
                                                    >
                                                        <option value="">Select Item...</option>
                                                        {inventory.map(inv => (
                                                            <option key={inv.id} value={inv.id}>
                                                                {inv.name} (Stock: {inv.quantity})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-gray-500 block">Source</label>
                                                    <select
                                                        className="w-full text-sm border rounded p-1"
                                                        value={item.source || 'stock'}
                                                        onChange={(e) => {
                                                            const upd = [...identifiedParts];
                                                            upd[idx].source = e.target.value;
                                                            setIdentifiedParts(upd);
                                                        }}
                                                    >
                                                        <option value="stock">From Stock</option>
                                                        <option value="purchased">Purchased for Job</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-gray-500 block">Quantity</label>
                                                    <input
                                                        type="number"
                                                        className="w-full text-sm border rounded p-1"
                                                        value={item.quantity}
                                                        min={1}
                                                        onChange={(e) => {
                                                            const upd = [...identifiedParts];
                                                            upd[idx].quantity = Number(e.target.value);
                                                            setIdentifiedParts(upd);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Step: Verify Prep Materials (conditionally inserted as step 2 when prep package exists) */}
                {hasPrepPackage && step === 2 && (
                    <div className="flex-1 p-6 overflow-y-auto">
                        <h3 className="text-lg font-semibold mb-1">2. Verify Prepped Materials</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Review which materials from the prep package were actually used on this job. Unused items will be returned to inventory.
                        </p>

                        {prepPackage!.materials.length > 0 && (
                            <div className="space-y-2 mb-6">
                                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                    <Package className="w-4 h-4 text-blue-600" />
                                    Materials ({prepPackage!.materials.length})
                                </h4>
                                {prepPackage!.materials.map((mat, idx) => {
                                    const ver = prepVerification[mat.materialId] || { used: true, qtyUsed: mat.quantityNeeded };
                                    const invItem = inventory.find(i => i.id === mat.materialId);
                                    return (
                                        <div
                                            key={mat.materialId}
                                            className={`border rounded-lg p-4 transition-colors ${
                                                ver.used ? 'border-green-200 bg-green-50/30' : 'border-amber-200 bg-amber-50/30'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                {/* Used toggle */}
                                                <button
                                                    onClick={() => {
                                                        setPrepVerification(prev => ({
                                                            ...prev,
                                                            [mat.materialId]: {
                                                                ...prev[mat.materialId],
                                                                used: !ver.used,
                                                                qtyUsed: !ver.used ? mat.quantityNeeded : 0,
                                                            }
                                                        }));
                                                    }}
                                                    className={`shrink-0 mt-0.5 w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-colors ${
                                                        ver.used
                                                            ? 'border-green-500 bg-green-100 text-green-700'
                                                            : 'border-gray-300 bg-white text-gray-400'
                                                    }`}
                                                >
                                                    {ver.used ? (
                                                        <CheckCircle2 className="w-5 h-5" />
                                                    ) : (
                                                        <Undo2 className="w-5 h-5" />
                                                    )}
                                                </button>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-medium ${
                                                            ver.used ? 'text-gray-900' : 'text-gray-500 line-through'
                                                        }`}>
                                                            {mat.name}
                                                        </span>
                                                        {!ver.used && (
                                                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                                                Returning
                                                            </span>
                                                        )}
                                                    </div>

                                                    {ver.used ? (
                                                        <div className="flex items-center gap-3 mt-2">
                                                            <label className="text-xs text-gray-500">Qty used:</label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={mat.quantityNeeded}
                                                                value={ver.qtyUsed}
                                                                onChange={e => {
                                                                    const newQty = Math.min(mat.quantityNeeded, Math.max(0, Number(e.target.value)));
                                                                    setPrepVerification(prev => ({
                                                                        ...prev,
                                                                        [mat.materialId]: { ...prev[mat.materialId], qtyUsed: newQty }
                                                                    }));
                                                                }}
                                                                className="w-16 text-sm border rounded px-2 py-1 text-center"
                                                            />
                                                            <span className="text-xs text-gray-400">of {mat.quantityNeeded} prepped</span>
                                                            {ver.qtyUsed < mat.quantityNeeded && ver.qtyUsed > 0 && (
                                                                <span className="text-xs text-amber-600">
                                                                    ({mat.quantityNeeded - ver.qtyUsed} to return)
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        /* Show return location for unused materials */
                                                        <div className="mt-2 flex items-center gap-2 text-sm">
                                                            <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                                            <span className="text-amber-800">
                                                                Return to:
                                                                <strong className="font-mono ml-1">
                                                                    {mat.binLocation
                                                                        || invItem?.binLocation
                                                                        || invItem?.location
                                                                        || 'Main Warehouse'}
                                                                </strong>
                                                                {(mat.zone || invItem?.zone) && (
                                                                    <span className="text-amber-600 ml-2">
                                                                        (Zone: {mat.zone || invItem?.zone})
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Summary */}
                        {(() => {
                            const totalPrepped = prepPackage!.materials.length;
                            const usedCount = Object.values(prepVerification).filter(v => v.used && v.qtyUsed > 0).length;
                            const returningCount = totalPrepped - usedCount;
                            return returningCount > 0 ? (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                                    <Undo2 className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                    <div className="text-sm text-amber-800">
                                        <strong>{returningCount} material{returningCount !== 1 ? 's' : ''}</strong> will be returned to inventory.
                                        Stock levels will be automatically restored.
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                    <div className="text-sm text-green-800">
                                        All prepped materials were used. No returns needed.
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Step: Customer Signature (step 3 or 4 depending on prep) */}
                {step === totalSteps && (
                    <div className="flex-1 p-6 overflow-y-auto">
                        <h3 className="text-lg font-semibold mb-4">{totalSteps}. Customer Sign-off</h3>
                        <div className="h-64 border rounded-lg overflow-hidden">
                            <SignatureCapture
                                jobId={job.id}
                                existingSignature={signatureData ? {
                                    id: '',
                                    job_id: job.id,
                                    org_id: job.org_id || '',
                                    signatureDataUrl: signatureData.dataUrl,
                                    signerName: signatureData.name,
                                    signerRole: 'customer',
                                    signedAt: new Date(),
                                    consentText: signatureData.consentText
                                } : undefined}
                                onSignatureComplete={(data) => setSignatureData({
                                    dataUrl: data.signatureDataUrl,
                                    name: data.signerName,
                                    consentText: data.consentText
                                })}
                            />
                        </div>
                    </div>
                )}

                {/* Footer Actions */}
                <div className="p-4 border-t flex justify-end gap-3 bg-gray-50 rounded-b-xl">
                    {step > 1 && (
                        <button
                            onClick={() => setStep(step - 1)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded"
                        >
                            Back
                        </button>
                    )}

                    {step === 1 && (
                        <>
                            <button
                                onClick={skipAIScan}
                                disabled={isScanning}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded"
                            >
                                Skip
                            </button>
                            <button
                                onClick={runAIScan}
                                disabled={photos.length === 0 || isScanning}
                                className="px-6 py-2 bg-blue-600 text-white rounded flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isScanning ? <Loader2 className="animate-spin" /> : <ChevronRight />}
                                Scan & Continue
                            </button>
                        </>
                    )}

                    {step > 1 && step < totalSteps && (
                        <button
                            onClick={() => setStep(step + 1)}
                            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            {step === 2 && hasPrepPackage ? 'Confirm Verification' : 'Confirm Parts'}
                        </button>
                    )}

                    {step === totalSteps && (
                        <button
                            onClick={handleCompleteJob}
                            disabled={!signatureData || processing}
                            className="px-6 py-2 bg-green-600 text-white rounded flex items-center gap-2 hover:bg-green-700 disabled:opacity-50"
                        >
                            {processing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                            Complete Job
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
