import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase';
import { addDoc, collection, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { JobSignature } from '../types';
import { PenTool, RotateCcw, Check, X, User } from 'lucide-react';

interface SignatureCaptureProps {
    jobId: string;
    onSignatureComplete?: (signature: JobSignature) => void;
    existingSignature?: JobSignature | null;
    readOnly?: boolean;
}

const SIGNER_ROLES = [
    { value: 'customer', label: 'Customer' },
    { value: 'property_manager', label: 'Property Manager' },
    { value: 'tenant', label: 'Tenant' },
    { value: 'other', label: 'Other' }
] as const;

export const SignatureCapture: React.FC<SignatureCaptureProps> = ({
    jobId,
    onSignatureComplete,
    existingSignature,
    readOnly = false
}) => {
    const { user } = useAuth();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);
    const [signerName, setSignerName] = useState('');
    const [signerRole, setSignerRole] = useState<JobSignature['signerRole']>('customer');
    const [saving, setSaving] = useState(false);
    const [showModal, setShowModal] = useState(false);

    const orgId = (user as any)?.org_id || 'demo-org';

    // Initialize canvas
    useEffect(() => {
        if (!canvasRef.current || !showModal) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set up canvas
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;

        // Fill with white background
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, [showModal]);

    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();

        if ('touches' in e) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }

        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (readOnly) return;
        e.preventDefault();

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCoordinates(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
        setHasSignature(true);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing || readOnly) return;
        e.preventDefault();

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCoordinates(e);
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
    };

    const handleSave = async () => {
        if (!hasSignature || !signerName.trim() || !user) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        setSaving(true);

        try {
            const signatureDataUrl = canvas.toDataURL('image/png');

            const signatureData = {
                job_id: jobId,
                org_id: orgId,
                signatureDataUrl,
                signerName: signerName.trim(),
                signerRole,
                signedAt: serverTimestamp(),
                deviceInfo: navigator.userAgent
            };

            // Save to Firestore
            const docRef = await addDoc(collection(db, 'job_signatures'), signatureData);

            // Update job with signature reference
            await updateDoc(doc(db, 'jobs', jobId), {
                signature: {
                    dataUrl: signatureDataUrl,
                    signerName: signerName.trim(),
                    signedAt: new Date()
                }
            });

            if (onSignatureComplete) {
                onSignatureComplete({
                    id: docRef.id,
                    ...signatureData,
                    signedAt: new Date()
                } as JobSignature);
            }

            setShowModal(false);
        } catch (error) {
            console.error('Error saving signature:', error);
            alert('Failed to save signature');
        }

        setSaving(false);
    };

    // If there's an existing signature, show it
    if (existingSignature) {
        return (
            <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 mb-3">
                    <PenTool className="w-5 h-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900">Customer Signature</h3>
                    <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Signed</span>
                </div>

                <div className="border rounded-lg p-2 bg-gray-50">
                    <img
                        src={existingSignature.signatureDataUrl}
                        alt="Customer signature"
                        className="max-h-32 mx-auto"
                    />
                </div>

                <div className="mt-3 text-sm text-gray-600">
                    <p><strong>Signed by:</strong> {existingSignature.signerName}</p>
                    <p><strong>Role:</strong> {SIGNER_ROLES.find(r => r.value === existingSignature.signerRole)?.label}</p>
                    <p><strong>Date:</strong> {existingSignature.signedAt?.toDate?.().toLocaleString() || 'Recently'}</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <PenTool className="w-5 h-5 text-gray-600" />
                        <h3 className="font-semibold text-gray-900">Customer Signature</h3>
                    </div>
                    {!readOnly && (
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                        >
                            Capture Signature
                        </button>
                    )}
                </div>

                <p className="text-sm text-gray-500">
                    No signature captured yet. Have the customer sign to confirm job completion.
                </p>
            </div>

            {/* Signature Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="font-semibold text-gray-900">Capture Signature</h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4">
                            {/* Signer Info */}
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <User className="w-4 h-4 inline mr-1" />
                                        Signer Name
                                    </label>
                                    <input
                                        type="text"
                                        value={signerName}
                                        onChange={(e) => setSignerName(e.target.value)}
                                        placeholder="Enter full name"
                                        className="w-full p-2 border rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Role
                                    </label>
                                    <select
                                        value={signerRole}
                                        onChange={(e) => setSignerRole(e.target.value as JobSignature['signerRole'])}
                                        className="w-full p-2 border rounded"
                                    >
                                        {SIGNER_ROLES.map(role => (
                                            <option key={role.value} value={role.value}>{role.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Signature Canvas */}
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Sign Below
                                    </label>
                                    <button
                                        onClick={clearCanvas}
                                        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        Clear
                                    </button>
                                </div>
                                <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
                                    <canvas
                                        ref={canvasRef}
                                        width={450}
                                        height={200}
                                        className="w-full touch-none cursor-crosshair"
                                        onMouseDown={startDrawing}
                                        onMouseMove={draw}
                                        onMouseUp={stopDrawing}
                                        onMouseLeave={stopDrawing}
                                        onTouchStart={startDrawing}
                                        onTouchMove={draw}
                                        onTouchEnd={stopDrawing}
                                    />
                                </div>
                                <p className="text-xs text-gray-400 mt-1 text-center">
                                    Draw your signature using mouse or touch
                                </p>
                            </div>

                            {/* Legal text */}
                            <p className="text-xs text-gray-500 mb-4">
                                By signing above, you confirm that the work described has been completed to your satisfaction.
                                This electronic signature has the same legal effect as a handwritten signature.
                            </p>
                        </div>

                        {/* Footer */}
                        <div className="flex gap-2 p-4 border-t bg-gray-50">
                            <button
                                onClick={handleSave}
                                disabled={saving || !hasSignature || !signerName.trim()}
                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Check className="w-4 h-4" />
                                {saving ? 'Saving...' : 'Confirm Signature'}
                            </button>
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
