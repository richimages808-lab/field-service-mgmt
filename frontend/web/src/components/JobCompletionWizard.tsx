
import React, { useState, useEffect } from 'react';
import {
    X, Camera, Loader2, CheckCircle2, ChevronRight, AlertTriangle, Plus, Package,
    Upload, Trash2, ArrowLeft, Save, PenTool
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp, increment, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadPhotos, identifyMaterials, matchInventoryItems } from '../lib/aiMaterialsService';
import { SignatureCapture } from './SignatureCapture';
import toast from 'react-hot-toast';
import { Job, MaterialItem } from '../types';

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
    const [signatureData, setSignatureData] = useState<{ dataUrl: string, name: string } | null>(null);

    useEffect(() => {
        if (isOpen && user?.org_id) {
            loadInventory();
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

            // 2. Inventory Deductions (Batch Operations)
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
                        // Note: quantity_after is hard to get in a batch without reading. 
                        // We can skip it or use a cloud function. For now, we'll omit it or estimate.
                        // Let's omit quantity_after for batch speed, or rely on client state (risky but acceptable for v1)
                        quantity_after: (inventory.find(i => i.id === part.material_id)?.quantity || 0) - part.quantity,
                        reference_id: job.id,
                        notes: `Used in Job #${job.id.slice(0, 5)}`,
                        performed_by: user?.uid,
                        createdAt: serverTimestamp()
                    });
                }
            }

            // 3. Update Job Status
            batch.update(jobRef, {
                status: 'completed',
                completedAt: serverTimestamp(),
                signature: signatureData ? {
                    signedAt: new Date().toISOString(),
                    signerName: signatureData.name,
                    dataUrl: signatureData.dataUrl
                } : null,
                'costs.parts': {
                    estimated: 0,
                    actual: finalParts.reduce((sum, p) => sum + (p.unitCost * p.quantity), 0),
                    items: finalParts
                }
            });

            // 4. Commit All Changes
            await batch.commit();

            toast.success('Job Completed & Inventory Updated!');
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
                    {[1, 2, 3].map(s => (
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

                {/* Step 3: Signature */}
                {step === 3 && (
                    <div className="flex-1 p-6 overflow-y-auto">
                        <h3 className="text-lg font-semibold mb-4">3. Customer Sign-off</h3>
                        <div className="h-64 border rounded-lg overflow-hidden">
                            <SignatureCapture
                                jobId={job.id}
                                onSignatureComplete={(data) => setSignatureData({
                                    dataUrl: data.signatureDataUrl,
                                    name: data.signerName
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

                    {step === 2 && (
                        <button
                            onClick={() => setStep(3)}
                            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            Confirm Parts
                        </button>
                    )}

                    {step === 3 && (
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
