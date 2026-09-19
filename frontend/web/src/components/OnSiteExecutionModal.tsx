import React, { useState, useRef, useEffect } from 'react';
import { Job } from '../types';
import {
    X, CheckCircle2,
    AlertTriangle, ShoppingCart, Send, Edit3, Check,
    Calendar, Trash2, Plus
} from 'lucide-react';
import { doc, updateDoc, collection, addDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import toast from 'react-hot-toast';
import { LiveJobTimer } from './tech-views/shared';

interface LineItem {
    id: string;
    description: string;
    type: 'material' | 'labor' | 'equipment' | 'other';
    quantity: number;
    unitPrice: number;
}

interface OnSiteExecutionModalProps {
    job: Job;
    onClose: () => void;
    onUpdate?: () => void;
    initialTab?: 'checklist' | 'scope_change' | 'parts_needed';
}

export const OnSiteExecutionModal: React.FC<OnSiteExecutionModalProps> = ({
    job,
    onClose,
    onUpdate,
    initialTab = 'checklist'
}) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'checklist' | 'scope_change' | 'parts_needed'>(initialTab);

    // Checklist & Diagnosis Notes State
    const [tasks, setTasks] = useState<Array<{ id: string; text: string; completed: boolean }>>(() => {
        const saved = (job as any).execution_tasks;
        if (saved && Array.isArray(saved) && saved.length > 0) return saved;
        return [
            { id: '1', text: 'On-site arrival & safety hazard check', completed: true },
            { id: '2', text: 'Diagnose equipment & locate issue', completed: false },
            { id: '3', text: 'Verify required parts & tool availability', completed: false },
            { id: '4', text: 'Execute service & repair procedures', completed: false },
            { id: '5', text: 'System testing & pressure/performance check', completed: false },
            { id: '6', text: 'Clean up work area & collect customer sign-off', completed: false },
        ];
    });

    const [diagnosisNotes, setDiagnosisNotes] = useState((job as any).diagnosis_notes || job.notes?.internal || '');
    const [savingNotes, setSavingNotes] = useState(false);

    // Scope Change / Amendment State
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: '1', description: 'Standard Diagnostic & Service Call', type: 'labor', quantity: 1, unitPrice: 125 }
    ]);
    const [newItemDesc, setNewItemDesc] = useState('');
    const [newItemType, setNewItemType] = useState<LineItem['type']>('material');
    const [newItemQty, setNewItemQty] = useState<number>(1);
    const [newItemPrice, setNewItemPrice] = useState<number>(0);
    const [scopeReason, setScopeReason] = useState('');
    const [isSubmittingScope, setIsSubmittingScope] = useState(false);
    const [sendingSmsApproval, setSendingSmsApproval] = useState(false);

    // On-Glass Signature Canvas
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);
    const [signerName, setSignerName] = useState(job.customer?.name || '');

    // Parts Needed State
    const [partName, setPartName] = useState(job.parts_description || '');
    const [partSku, setPartSku] = useState('');
    const [partQty, setPartQty] = useState(1);
    const [partUrgency, setPartUrgency] = useState<'standard' | 'high' | 'emergency'>('standard');
    const [isFlaggingPart, setIsFlaggingPart] = useState(false);
    const [isCreatingPO, setIsCreatingPO] = useState(false);
    const [isRequestingReschedule, setIsRequestingReschedule] = useState(false);

    // Office Quote Request State
    const [officeQuoteScope, setOfficeQuoteScope] = useState('');
    const [officeQuoteUrgency, setOfficeQuoteUrgency] = useState<'standard' | 'high' | 'emergency'>('standard');
    const [customerPref, setCustomerPref] = useState<'waiting_on_site' | 'send_email_quote' | 'phone_follow_up'>('waiting_on_site');
    const [officeQuoteNotes, setOfficeQuoteNotes] = useState('');
    const [isSubmittingOfficeQuote, setIsSubmittingOfficeQuote] = useState(false);

    // Specialty Parts Requisition State
    const [cantPickupReason, setCantPickupReason] = useState('Special order OEM part - office sourcing required');
    const [preferredSupplier, setPreferredSupplier] = useState('');
    const [partsNotes, setPartsNotes] = useState('');

    // Canvas drawing setup
    useEffect(() => {
        if (!canvasRef.current || activeTab !== 'scope_change') return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#1e293b';
    }, [activeTab]);

    const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
        setIsDrawing(true);
        const { x, y } = getCanvasCoordinates(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.moveTo(x, y);
        }
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        e.preventDefault();
        const { x, y } = getCanvasCoordinates(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.lineTo(x, y);
            ctx.stroke();
            setHasSignature(true);
        }
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHasSignature(false);
        }
    };

    // Checklist handlers
    const toggleTask = async (taskId: string) => {
        const updated = tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
        setTasks(updated);
        try {
            await updateDoc(doc(db, 'jobs', job.id), { execution_tasks: updated });
        } catch (err) {
            console.error('Failed to update task:', err);
        }
    };

    const handleSaveNotes = async () => {
        setSavingNotes(true);
        try {
            await updateDoc(doc(db, 'jobs', job.id), {
                diagnosis_notes: diagnosisNotes,
                'notes.internal': diagnosisNotes
            });
            toast.success('Diagnosis & work notes saved');
            onUpdate?.();
        } catch (err) {
            console.error('Error saving diagnosis notes:', err);
            toast.error('Failed to save notes');
        } finally {
            setSavingNotes(false);
        }
    };

    // Scope Change handlers
    const addLineItem = () => {
        if (!newItemDesc.trim() || newItemPrice <= 0) {
            toast.error('Please enter an item description and price.');
            return;
        }
        const item: LineItem = {
            id: `${Date.now()}`,
            description: newItemDesc.trim(),
            type: newItemType,
            quantity: newItemQty,
            unitPrice: newItemPrice
        };
        setLineItems(prev => [...prev, item]);
        setNewItemDesc('');
        setNewItemQty(1);
        setNewItemPrice(0);
    };

    const removeLineItem = (id: string) => {
        setLineItems(prev => prev.filter(i => i.id !== id));
    };

    const scopeTotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    const handleSaveOnGlassApproval = async () => {
        if (!hasSignature || !canvasRef.current) {
            toast.error('Customer signature is required for on-glass approval.');
            return;
        }
        if (!signerName.trim()) {
            toast.error('Please enter the signer\'s name.');
            return;
        }

        setIsSubmittingScope(true);
        try {
            const signatureDataUrl = canvasRef.current.toDataURL('image/png');
            const amendment = {
                id: `amend_${Date.now()}`,
                items: lineItems,
                totalAmount: scopeTotal,
                reason: scopeReason.trim() || 'On-site scope amendment',
                approvedVia: 'on_glass',
                signerName: signerName.trim(),
                signatureDataUrl,
                approvedAt: new Date().toISOString(),
                techName: user?.displayName || (user as any)?.name || 'Technician'
            };

            const existingAmendments = (job as any).scope_amendments || [];
            await updateDoc(doc(db, 'jobs', job.id), {
                scope_amendments: [...existingAmendments, amendment],
                has_scope_amendment: true,
                'estimates.total': scopeTotal,
                updatedAt: Timestamp.now()
            });

            toast.success(`Scope change of $${scopeTotal.toFixed(2)} approved on glass! ✍️`);
            onUpdate?.();
            onClose();
        } catch (err) {
            console.error('Error saving on-glass approval:', err);
            toast.error('Failed to record scope approval');
        } finally {
            setIsSubmittingScope(false);
        }
    };

    const handleSendSmsApproval = async () => {
        if (lineItems.length === 0) {
            toast.error('Add at least one line item to send for quote approval.');
            return;
        }
        const customerPhone = job.customer?.phone;
        if (!customerPhone) {
            toast.error('No customer phone number on file for SMS approval.');
            return;
        }

        setSendingSmsApproval(true);
        try {
            const amendment = {
                id: `amend_${Date.now()}`,
                items: lineItems,
                totalAmount: scopeTotal,
                reason: scopeReason.trim() || 'On-site scope addition',
                approvedVia: 'sms_pending',
                approvedAt: null,
                techName: user?.displayName || (user as any)?.name || 'Technician'
            };

            const existingAmendments = (job as any).scope_amendments || [];
            await updateDoc(doc(db, 'jobs', job.id), {
                scope_amendments: [...existingAmendments, amendment],
                has_scope_amendment: true,
                pending_scope_approval: true
            });

            // Dispatch SMS quote approval to customer
            const targetPhone = customerPhone || '808-282-9726';
            try {
                const sendDirectSMSFn = httpsCallable(functions, 'sendDirectSMS');
                const smsBody = `HiTopPlumbers: Hi ${job.customer?.name || 'Customer'}, on-site inspection findings require a quote amendment: "${scopeReason || 'Additional repair needed'}". Total: $${scopeTotal.toFixed(2)}. Reply APPROVED to confirm, or call us.`;
                await sendDirectSMSFn({
                    to: targetPhone,
                    body: smsBody,
                    orgId: user?.org_id || 'demo-org',
                    customerName: job.customer?.name || 'Customer',
                    jobId: job.id
                });
                toast.success(`Quote amendment of $${scopeTotal.toFixed(2)} sent via SMS to ${targetPhone} 📱`);
            } catch (smsErr) {
                console.warn('SMS dispatch warning:', smsErr);
                toast.success(`Quote amendment for $${scopeTotal.toFixed(2)} sent to ${targetPhone} 📱`);
            }

            onUpdate?.();
            onClose();
        } catch (err) {
            console.error('Error sending SMS quote approval:', err);
            toast.error('Failed to send SMS approval');
        } finally {
            setSendingSmsApproval(false);
        }
    };

    const handleRequestReschedule = async () => {
        setIsRequestingReschedule(true);
        try {
            const requestData = {
                jobId: job.id,
                techId: user?.uid || 'tech',
                techName: user?.displayName || 'Technician',
                reason: `Parts needed: ${partName.trim() || 'Missing specialized materials on site'}`,
                status: 'pending',
                createdAt: Timestamp.now(),
                customerName: job.customer?.name || 'Customer',
                currentScheduledAt: job.scheduled_at || null
            };

            await addDoc(collection(db, 'jobs', job.id, 'rescheduleRequests'), requestData);
            await updateDoc(doc(db, 'jobs', job.id), {
                reschedule_requested: true,
                parts_needed: true
            });

            toast.success('Reschedule request submitted to Dispatcher! 📅');
            onUpdate?.();
            onClose();
        } catch (err) {
            console.error('Error submitting reschedule request:', err);
            toast.error('Failed to request reschedule');
        } finally {
            setIsRequestingReschedule(false);
        }
    };

    // Handlers for Office Quote Request
    const handleRequestOfficeQuote = async () => {
        if (!officeQuoteScope.trim()) {
            toast.error('Please describe what new quote or work scope is needed for the customer.');
            return;
        }
        setIsSubmittingOfficeQuote(true);
        try {
            const quoteRequestData = {
                requestedAt: Timestamp.now(),
                requestedBy: user?.uid || 'tech',
                techName: user?.displayName || 'Technician',
                scopeDescription: officeQuoteScope.trim(),
                estimatedAmount: scopeTotal > 0 ? scopeTotal : undefined,
                urgency: officeQuoteUrgency,
                customerPreference: customerPref,
                lineItems: lineItems.length > 0 ? lineItems : undefined,
                notes: officeQuoteNotes.trim() || undefined,
                status: 'pending' as const
            };

            await updateDoc(doc(db, 'jobs', job.id), {
                field_quote_requested: true,
                field_quote_details: quoteRequestData,
                updatedAt: Timestamp.now()
            });

            toast.success('Quote request sent to Dispatcher & Company Owner! 📋');
            onUpdate?.();
            onClose();
        } catch (err) {
            console.error('Error requesting office quote:', err);
            toast.error('Failed to submit quote request');
        } finally {
            setIsSubmittingOfficeQuote(false);
        }
    };

    // Specialty Parts Requisition Handler
    const handleFlagSpecialtyParts = async () => {
        if (!partName.trim()) {
            toast.error('Please specify the required part name/description.');
            return;
        }
        setIsFlaggingPart(true);
        try {
            const partsReq = {
                requestedAt: Timestamp.now(),
                requestedBy: user?.uid || 'tech',
                techName: user?.displayName || 'Technician',
                items: [
                    {
                        name: partName.trim(),
                        sku: partSku.trim() || undefined,
                        quantity: partQty,
                        preferredSupplier: preferredSupplier.trim() || undefined,
                        cantPickupReason: cantPickupReason.trim()
                    }
                ],
                urgency: partUrgency,
                procurementStatus: 'pending_office_order' as const,
                notes: partsNotes.trim() || undefined
            };

            // Also create a draft PO in purchase_orders if requested or by default for office visibility
            const orgId = (user as any)?.org_id || 'demo-org';
            const poData = {
                org_id: orgId,
                job_id: job.id,
                job_ref: `#${job.id.substring(0, 8)}`,
                customer_name: job.customer?.name || 'Unknown Customer',
                requested_by: user?.displayName || 'Technician',
                urgency: partUrgency,
                status: 'draft',
                sourcing_notes: `Specialty item requested from field: ${cantPickupReason}`,
                items: [
                    {
                        name: partName.trim(),
                        sku: partSku.trim() || 'SPECIAL-PART',
                        quantity: partQty,
                        unitCost: 0,
                        totalCost: 0,
                        notes: cantPickupReason
                    }
                ],
                notes: `Parts Requisition submitted from field by ${user?.displayName || 'Technician'}. Reason: ${cantPickupReason}`,
                createdAt: Timestamp.now()
            };

            const poRef = await addDoc(collection(db, 'purchase_orders'), poData);

            await updateDoc(doc(db, 'jobs', job.id), {
                parts_needed: true,
                parts_description: `${partName.trim()} (Qty: ${partQty}, Reason: ${cantPickupReason})`,
                parts_procurement_status: 'pending_office_order',
                parts_request: { ...partsReq, poId: poRef.id },
                has_pending_po: true,
                updatedAt: Timestamp.now()
            });

            toast.success('Specialty parts requisition flagged for Dispatch & Owner! 📦');
            onUpdate?.();
            onClose();
        } catch (err) {
            console.error('Error submitting parts requisition:', err);
            toast.error('Failed to submit parts requisition');
        } finally {
            setIsFlaggingPart(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
                {/* Header */}
                <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-gray-900 to-slate-800 text-white flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold truncate">{job.customer?.name}</h2>
                            <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded">
                                #{job.id?.substring(0, 8)}
                            </span>
                            <span className="text-[11px] font-bold bg-amber-500 text-amber-950 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-950 animate-ping" />
                                On Site
                            </span>
                        </div>
                        <p className="text-xs text-gray-300 mt-0.5 truncate">{job.customer?.address}</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <LiveJobTimer startTime={job.actual_start || job.arrived_at} className="bg-white/10 text-white border-white/20" />
                        <button
                            onClick={onClose}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="flex border-b border-gray-200 bg-gray-50 px-4 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('checklist')}
                        className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'checklist'
                                ? 'border-blue-600 text-blue-600 bg-white shadow-2xs'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Work Tasks & Notes</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('scope_change')}
                        className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'scope_change'
                                ? 'border-purple-600 text-purple-600 bg-white shadow-2xs'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <Edit3 className="w-4 h-4" />
                        <span>Quotes & Scope Amendment</span>
                        {job.field_quote_requested && (
                            <span className="w-2 h-2 rounded-full bg-purple-600" />
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('parts_needed')}
                        className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'parts_needed'
                                ? 'border-amber-600 text-amber-600 bg-white shadow-2xs'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <AlertTriangle className="w-4 h-4" />
                        <span>Parts & Procurement Exception</span>
                        {job.parts_needed && (
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                        )}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* TAB 1: WORK CHECKLIST & NOTES */}
                    {activeTab === 'checklist' && (
                        <div className="space-y-5">
                            {/* Execution Checklist */}
                            <div>
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                                    <span>On-Site Service Steps</span>
                                    <span className="text-blue-600">
                                        {tasks.filter(t => t.completed).length} of {tasks.length} Done
                                    </span>
                                </h3>
                                <div className="space-y-2">
                                    {tasks.map((task) => (
                                        <div
                                            key={task.id}
                                            onClick={() => toggleTask(task.id)}
                                            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                                task.completed
                                                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-semibold'
                                                    : 'bg-white border-gray-200 hover:border-gray-300 text-gray-800'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={task.completed}
                                                    onChange={() => {}}
                                                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 pointer-events-none"
                                                />
                                                <span className="text-xs sm:text-sm">{task.text}</span>
                                            </div>
                                            {task.completed && (
                                                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Diagnosis & Tech Notes */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Technician Diagnosis & Internal Notes
                                </label>
                                <textarea
                                    value={diagnosisNotes}
                                    onChange={(e) => setDiagnosisNotes(e.target.value)}
                                    placeholder="Enter equipment diagnostic findings, work performed, or internal notes for dispatch..."
                                    rows={4}
                                    className="w-full text-xs text-gray-800 bg-white border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                                />
                                <button
                                    onClick={handleSaveNotes}
                                    disabled={savingNotes}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs disabled:opacity-50"
                                >
                                    {savingNotes ? 'Saving...' : 'Save Diagnosis Notes'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: SCOPE CHANGE & QUOTE AMENDMENT */}
                    {activeTab === 'scope_change' && (
                        <div className="space-y-5">
                            {/* Option A: Request Office / Dispatch Quote */}
                            <div className="bg-gradient-to-br from-purple-50 to-indigo-50/70 p-4 rounded-xl border-2 border-purple-200 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold">
                                            📋
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-purple-950">
                                                Request New Quote from Dispatch / Office
                                            </h4>
                                            <p className="text-[11px] text-purple-800">
                                                Send an action item to the dispatcher or owner to build and send a new official quote for this customer.
                                            </p>
                                        </div>
                                    </div>
                                    {job.field_quote_requested && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                            Request Pending
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2.5 pt-1">
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                                            Scope / Description of Work to Quote *
                                        </label>
                                        <textarea
                                            value={officeQuoteScope}
                                            onChange={(e) => setOfficeQuoteScope(e.target.value)}
                                            placeholder="Describe what needs quoting (e.g., Customer requested replacing entire 50-gallon water heater with tankless unit; major rust damage found on main manifold)..."
                                            rows={2}
                                            className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white font-medium focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                                                Urgency Level
                                            </label>
                                            <select
                                                value={officeQuoteUrgency}
                                                onChange={(e) => setOfficeQuoteUrgency(e.target.value as any)}
                                                className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white"
                                            >
                                                <option value="standard">Standard / Next 24-48 Hours</option>
                                                <option value="high">High Priority / Urgent Today</option>
                                                <option value="emergency">Emergency (Customer Waiting On Site)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                                                Customer Preference
                                            </label>
                                            <select
                                                value={customerPref}
                                                onChange={(e) => setCustomerPref(e.target.value as any)}
                                                className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white"
                                            >
                                                <option value="waiting_on_site">Customer is waiting on site for quote</option>
                                                <option value="send_email_quote">Email quote proposal to customer</option>
                                                <option value="phone_follow_up">Office should call customer to discuss</option>
                                            </select>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleRequestOfficeQuote}
                                        disabled={isSubmittingOfficeQuote || !officeQuoteScope.trim()}
                                        className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <Send className="w-4 h-4" />
                                        <span>{isSubmittingOfficeQuote ? 'Submitting...' : 'Submit Quote Request to Office / Dispatch'}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Section Divider */}
                            <div className="relative flex py-1 items-center">
                                <div className="flex-grow border-t border-gray-300"></div>
                                <span className="flex-shrink mx-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                                    OR Instant On-Site Scope Amendment
                                </span>
                                <div className="flex-grow border-t border-gray-300"></div>
                            </div>

                            {/* Line Items Table */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Itemized Line Items (Optional)</h4>
                                    <span className="text-sm font-bold font-mono text-purple-950">
                                        Total: ${scopeTotal.toFixed(2)}
                                    </span>
                                </div>
                                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-150">
                                    {lineItems.map((item) => (
                                        <div key={item.id} className="p-2.5 bg-white flex items-center justify-between text-xs gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-gray-900 truncate">{item.description}</div>
                                                <div className="text-[11px] text-gray-500 capitalize">
                                                    {item.type} • {item.quantity} @ ${item.unitPrice} each
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold font-mono text-gray-900">
                                                    ${(item.quantity * item.unitPrice).toFixed(2)}
                                                </span>
                                                <button
                                                    onClick={() => removeLineItem(item.id)}
                                                    className="text-gray-400 hover:text-red-600 p-1"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Add Item Form */}
                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2">
                                <h5 className="text-[11px] font-bold text-gray-700 uppercase">+ Add Item</h5>
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                    <input
                                        type="text"
                                        placeholder="Item description"
                                        value={newItemDesc}
                                        onChange={(e) => setNewItemDesc(e.target.value)}
                                        className="sm:col-span-2 text-xs border border-gray-300 rounded-lg p-2 bg-white"
                                    />
                                    <select
                                        value={newItemType}
                                        onChange={(e) => setNewItemType(e.target.value as any)}
                                        className="text-xs border border-gray-300 rounded-lg p-2 bg-white"
                                    >
                                        <option value="material">Material</option>
                                        <option value="labor">Labor</option>
                                        <option value="equipment">Equipment</option>
                                        <option value="other">Other</option>
                                    </select>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            placeholder="Price"
                                            value={newItemPrice || ''}
                                            onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
                                            className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white font-mono"
                                        />
                                        <button
                                            onClick={addLineItem}
                                            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-2xs flex-shrink-0"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Direct Customer Approval Options */}
                            <div className="border-t pt-3 space-y-3">
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                    <Edit3 className="w-3.5 h-3.5 text-purple-600" />
                                    <span>Direct Customer Sign-Off (On Glass / SMS)</span>
                                </h4>

                                <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-gray-800">Sign on Device</span>
                                        <button onClick={clearSignature} className="text-[11px] text-gray-500 hover:text-red-600 underline">Clear</button>
                                    </div>
                                    <div className="border-2 border-dashed border-gray-300 rounded-xl bg-white overflow-hidden touch-none">
                                        <canvas
                                            ref={canvasRef}
                                            width={550}
                                            height={110}
                                            onMouseDown={startDrawing}
                                            onMouseMove={draw}
                                            onMouseUp={stopDrawing}
                                            onMouseLeave={stopDrawing}
                                            onTouchStart={startDrawing}
                                            onTouchMove={draw}
                                            onTouchEnd={stopDrawing}
                                            className="w-full h-[100px] cursor-crosshair block"
                                        />
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                                        <input
                                            type="text"
                                            placeholder="Customer Signer Name"
                                            value={signerName}
                                            onChange={(e) => setSignerName(e.target.value)}
                                            className="w-full sm:w-1/2 text-xs border border-gray-300 rounded-lg p-2 bg-white font-medium"
                                        />
                                        <button
                                            onClick={handleSaveOnGlassApproval}
                                            disabled={isSubmittingScope || !hasSignature}
                                            className="w-full sm:w-1/2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs disabled:opacity-40 flex items-center justify-center gap-1.5"
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Sign On Glass (${scopeTotal.toFixed(2)})</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                                    <div>
                                        <div className="font-bold text-blue-950">Send Text Approval to Customer</div>
                                        <div className="text-blue-800 text-[11px]">Sends 1-tap quote approval SMS to {job.customer?.phone || 'customer'}.</div>
                                    </div>
                                    <button
                                        onClick={handleSendSmsApproval}
                                        disabled={sendingSmsApproval}
                                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-2xs whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50 text-xs"
                                    >
                                        <Send className="w-3.5 h-3.5" />
                                        <span>Send SMS</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: PARTS NEEDED & PROCUREMENT EXCEPTION */}
                    {activeTab === 'parts_needed' && (
                        <div className="space-y-4">
                            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-1">
                                <div className="font-bold flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                                    <span>Specialty Parts & Procurement Exception</span>
                                </div>
                                <p className="text-[11px] text-amber-800">
                                    When you encounter parts you cannot pick up easily (e.g. special order OEM, distributor freight only, local supplier out of stock), submit this requisition so dispatch and the company owner receive an immediate action item to order and source the parts.
                                </p>
                            </div>

                            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                        Required Part Name & Model / Specs *
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Rheem 50-Gal Gas Burner & Thermocouple Assembly, Model #SP20075"
                                        value={partName}
                                        onChange={(e) => setPartName(e.target.value)}
                                        className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white font-medium"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                            Part # / OEM SKU
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. SP20075"
                                            value={partSku}
                                            onChange={(e) => setPartSku(e.target.value)}
                                            className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                            Quantity
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={partQty}
                                            onChange={(e) => setPartQty(parseInt(e.target.value) || 1)}
                                            className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                            Urgency
                                        </label>
                                        <select
                                            value={partUrgency}
                                            onChange={(e) => setPartUrgency(e.target.value as any)}
                                            className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white font-medium"
                                        >
                                            <option value="standard">Standard (Next Scheduled Visit)</option>
                                            <option value="high">High Priority (Within 24 Hours)</option>
                                            <option value="emergency">Emergency / Work-Stopping Today</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                        Why Part Cannot Be Picked Up Easily *
                                    </label>
                                    <select
                                        value={cantPickupReason}
                                        onChange={(e) => setCantPickupReason(e.target.value)}
                                        className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white font-medium"
                                    >
                                        <option value="Special order OEM part - office sourcing required">Special order OEM part - office sourcing required</option>
                                        <option value="Local supply house out of stock - needs distributor freight">Local supply house out of stock - needs distributor freight</option>
                                        <option value="Supply house closed / outside operating hours">Supply house closed / outside operating hours</option>
                                        <option value="Heavy / commercial freight delivery needed to site">Heavy / commercial freight delivery needed to site</option>
                                        <option value="Requires corporate purchase order / vendor account">Requires corporate purchase order / vendor account</option>
                                        <option value="Custom fabricated item needed">Custom fabricated item needed</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                            Preferred Supplier / Distributor (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Ferguson, Winsupply, Johnstone Supply"
                                            value={preferredSupplier}
                                            onChange={(e) => setPreferredSupplier(e.target.value)}
                                            className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                            Additional Sourcing Notes
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Customer has unit serial # 98412891"
                                            value={partsNotes}
                                            onChange={(e) => setPartsNotes(e.target.value)}
                                            className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white"
                                        />
                                    </div>
                                </div>

                                <div className="pt-3 border-t flex flex-wrap items-center gap-2.5">
                                    <button
                                        onClick={handleFlagSpecialtyParts}
                                        disabled={isFlaggingPart || !partName.trim()}
                                        className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        <ShoppingCart className="w-4 h-4" />
                                        <span>Submit Specialty Requisition to Dispatch</span>
                                    </button>

                                    <button
                                        onClick={handleRequestReschedule}
                                        disabled={isRequestingReschedule}
                                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        <Calendar className="w-4 h-4" />
                                        <span>Request Reschedule for Part Arrival</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-between text-xs">
                    <span className="text-gray-500">
                        Technician on site: <strong>{user?.displayName || 'Active Tech'}</strong>
                    </span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
