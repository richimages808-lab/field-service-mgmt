import React, { useState, useMemo } from 'react';
import { Job, FieldQuoteRequest, PartsRequisitionRequest } from '../../types';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, functions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import {
    X, AlertTriangle, ShoppingCart, FileText, CheckCircle2,
    Search, User, Phone, ExternalLink, Calendar, Sparkles, Check, Package,
    ShieldAlert, Send, Eye, Edit3
} from 'lucide-react';

interface FieldActionItemsModalProps {
    isOpen: boolean;
    onClose: () => void;
    jobs: Job[];
    onUpdate?: () => void;
    initialTab?: TabFilter;
}

export type TabFilter = 'all' | 'approvals' | 'quotes' | 'parts' | 'reschedules';

export const FieldActionItemsModal: React.FC<FieldActionItemsModalProps> = ({
    isOpen,
    onClose,
    jobs,
    onUpdate,
    initialTab = 'all'
}) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<TabFilter>(initialTab);
    const [searchQuery, setSearchQuery] = useState('');
    const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'emergency' | 'high' | 'standard'>('all');
    const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
    const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null);

    // Synchronize initialTab if changed from parent
    React.useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    // Extract action items from jobs
    const scopeApprovalItems = useMemo(() => {
        return jobs.filter(j => (j.pending_scope_approval || j.has_scope_amendment) && !j.archived);
    }, [jobs]);

    const partsItems = useMemo(() => {
        return jobs.filter(j => j.parts_needed && !j.archived);
    }, [jobs]);

    const quoteItems = useMemo(() => {
        return jobs.filter(j => j.field_quote_requested && !j.archived);
    }, [jobs]);

    const rescheduleItems = useMemo(() => {
        return jobs.filter(j => (j as any).reschedule_requested && !j.archived);
    }, [jobs]);

    const totalCount = scopeApprovalItems.length + quoteItems.length + partsItems.length + rescheduleItems.length;

    // Filter by active tab, search, and urgency
    const filteredItems = useMemo(() => {
        let list: Array<{
            id: string;
            type: 'approval' | 'quote' | 'parts' | 'reschedule';
            job: Job;
            techName: string;
            urgency: string;
            createdAt?: any;
            title: string;
            details: string;
            partsRequest?: PartsRequisitionRequest;
            quoteRequest?: FieldQuoteRequest;
            scopeAmendment?: any;
        }> = [];

        // Scope Approvals (Priority 1)
        if (activeTab === 'all' || activeTab === 'approvals') {
            scopeApprovalItems.forEach(j => {
                const latestAmend = j.scope_amendments && j.scope_amendments.length > 0
                    ? j.scope_amendments[j.scope_amendments.length - 1]
                    : null;
                const isPending = j.pending_scope_approval;
                list.push({
                    id: `approval_${j.id}`,
                    type: 'approval',
                    job: j,
                    techName: latestAmend?.techName || j.assigned_tech_name || 'Field Tech',
                    urgency: isPending ? 'emergency' : 'high',
                    createdAt: (j as any).updatedAt || j.createdAt,
                    title: `Scope Amendment: ${latestAmend ? `$${latestAmend.totalAmount.toFixed(2)} (${latestAmend.approvedVia.replace(/_/g, ' ')})` : 'On-site findings'}`,
                    details: latestAmend ? `Reason: "${latestAmend.reason}" • Items: ${latestAmend.items.map(i => `${i.description} ($${i.unitPrice * i.quantity})`).join(', ')}` : 'On-site scope change awaiting review',
                    scopeAmendment: latestAmend
                });
            });
        }

        // Quote Requests (Priority 2)
        if (activeTab === 'all' || activeTab === 'quotes') {
            quoteItems.forEach(j => {
                const req = j.field_quote_details;
                list.push({
                    id: `quote_${j.id}`,
                    type: 'quote',
                    job: j,
                    techName: req?.techName || j.assigned_tech_name || 'Field Tech',
                    urgency: req?.urgency || 'standard',
                    createdAt: req?.requestedAt,
                    title: `Field Quote Request (${req?.customerPreference === 'waiting_on_site' ? 'Customer Waiting on Site' : req?.customerPreference === 'send_email_quote' ? 'Email Proposal' : 'Phone Follow-up'})`,
                    details: req?.scopeDescription || j.request?.description || '',
                    quoteRequest: req
                });
            });
        }

        // Parts Procurement (Priority 3)
        if (activeTab === 'all' || activeTab === 'parts') {
            partsItems.forEach(j => {
                const req = j.parts_request;
                list.push({
                    id: `part_${j.id}`,
                    type: 'parts',
                    job: j,
                    techName: req?.techName || j.assigned_tech_name || 'Field Tech',
                    urgency: req?.urgency || (j.priority === 'critical' ? 'emergency' : j.priority === 'high' ? 'high' : 'standard'),
                    createdAt: req?.requestedAt,
                    title: `Parts Procurement: ${j.parts_description || 'Specialty items needed'}`,
                    details: req?.notes || (req?.items && req.items.length > 0 ? req.items.map(i => `${i.name} (Qty: ${i.quantity})${i.cantPickupReason ? ` — ${i.cantPickupReason}` : ''}`).join(' • ') : j.parts_description || ''),
                    partsRequest: req
                });
            });
        }

        // Reschedule Requests (Priority 4)
        if (activeTab === 'all' || activeTab === 'reschedules') {
            rescheduleItems.forEach(j => {
                list.push({
                    id: `resched_${j.id}`,
                    type: 'reschedule',
                    job: j,
                    techName: j.assigned_tech_name || 'Field Tech',
                    urgency: j.priority === 'critical' ? 'emergency' : j.priority === 'high' ? 'high' : 'standard',
                    createdAt: (j as any).updatedAt || j.createdAt,
                    title: 'Reschedule Requested by Tech',
                    details: (j as any).reschedule_reason || 'Technician requested schedule adjustment from job site.',
                });
            });
        }

        if (urgencyFilter !== 'all') {
            list = list.filter(item => item.urgency === urgencyFilter);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(item =>
                item.job.customer?.name?.toLowerCase().includes(q) ||
                item.job.id.toLowerCase().includes(q) ||
                item.techName.toLowerCase().includes(q) ||
                item.title.toLowerCase().includes(q) ||
                item.details.toLowerCase().includes(q)
            );
        }

        // Priority sorting: emergency first, then approvals, quotes, parts, reschedules
        const urgencyWeight: Record<string, number> = { emergency: 3, high: 2, standard: 1 };
        const typeWeight: Record<string, number> = { approval: 4, quote: 3, parts: 2, reschedule: 1 };

        return list.sort((a, b) => {
            const weightA = (urgencyWeight[a.urgency] || 1) * 10 + (typeWeight[a.type] || 1);
            const weightB = (urgencyWeight[b.urgency] || 1) * 10 + (typeWeight[b.type] || 1);
            return weightB - weightA;
        });
    }, [activeTab, scopeApprovalItems, quoteItems, partsItems, rescheduleItems, urgencyFilter, searchQuery]);

    // Handlers for Scope Approval Actions
    const handleApproveScopeAmendment = async (job: Job) => {
        setActionInProgressId(job.id);
        try {
            const existingAmendments = job.scope_amendments || [];
            const updatedAmendments = existingAmendments.map(a => ({
                ...a,
                approvedVia: a.approvedVia === 'sms_pending' ? 'sms_approved' : a.approvedVia,
                approvedAt: a.approvedAt || new Date().toISOString()
            }));

            await updateDoc(doc(db, 'jobs', job.id), {
                pending_scope_approval: false,
                scope_amendments: updatedAmendments,
                updatedAt: Timestamp.now()
            });

            toast.success(`Scope amendment approved for ${job.customer?.name || 'Customer'}! ✍️`);
            onUpdate?.();
        } catch (err) {
            console.error('Failed to approve scope amendment:', err);
            toast.error('Failed to approve scope amendment');
        } finally {
            setActionInProgressId(null);
        }
    };

    const handleResendScopeSms = async (job: Job) => {
        setActionInProgressId(job.id);
        try {
            const targetPhone = '808-282-9726';
            const latestAmend = job.scope_amendments?.[job.scope_amendments.length - 1];
            const total = latestAmend ? latestAmend.totalAmount : (job as any).estimates?.total || 0;
            const sendDirectSMSFn = httpsCallable(functions, 'sendDirectSMS');
            await sendDirectSMSFn({
                to: targetPhone,
                body: `HiTopPlumbers Reminder: Please confirm your on-site scope amendment of $${Number(total).toFixed(2)}. Reply APPROVED to confirm, or call us.`,
                orgId: (job as any).org_id || 'demo-org',
                customerName: job.customer?.name || 'Customer',
                jobId: job.id
            });
            toast.success(`Reminder SMS sent to ${targetPhone} 📱`);
        } catch (err) {
            console.error('Failed to resend SMS:', err);
            toast.error('Failed to resend SMS');
        } finally {
            setActionInProgressId(null);
        }
    };

    // Handlers for Quote Actions
    const handleCreateQuoteForJob = (job: Job) => {
        onClose();
        navigate(`/jobs/${job.id}/quote`);
    };

    const handleResolveQuoteRequest = async (job: Job) => {
        setActionInProgressId(job.id);
        try {
            await updateDoc(doc(db, 'jobs', job.id), {
                field_quote_requested: false,
                'field_quote_details.status': 'resolved',
                updatedAt: Timestamp.now()
            });
            toast.success(`Quote request for ${job.customer?.name} marked resolved!`);
            onUpdate?.();
        } catch (err) {
            console.error('Failed to resolve quote request:', err);
            toast.error('Failed to resolve quote request');
        } finally {
            setActionInProgressId(null);
        }
    };

    // Handlers for Parts Procurement Actions
    const handleCreatePOForJob = (job?: Job) => {
        onClose();
        const params = new URLSearchParams();
        params.set('openPO', 'true');
        params.set('prefill', 'true');
        if (job?.id) params.set('jobId', job.id);
        if (job?.customer?.name || job?.title) params.set('jobTitle', job.customer?.name || job.title || '');
        navigate(`/purchase-orders?${params.toString()}`);
    };

    const handleUpdatePartsProcurementStatus = async (job: Job, newStatus: 'ordered' | 'ready_for_pickup' | 'resolved') => {
        setActionInProgressId(job.id);
        try {
            if (newStatus === 'resolved') {
                await updateDoc(doc(db, 'jobs', job.id), {
                    parts_needed: false,
                    parts_procurement_status: 'resolved',
                    'parts_request.procurementStatus': 'resolved',
                    updatedAt: Timestamp.now()
                });
                toast.success(`Parts procurement resolved for #${job.id.substring(0, 8)}!`);
            } else {
                await updateDoc(doc(db, 'jobs', job.id), {
                    parts_procurement_status: newStatus,
                    'parts_request.procurementStatus': newStatus,
                    updatedAt: Timestamp.now()
                });
                toast.success(`Parts status updated to "${newStatus.replace(/_/g, ' ')}"`);
            }
            onUpdate?.();
        } catch (err) {
            console.error('Failed to update procurement status:', err);
            toast.error('Failed to update status');
        } finally {
            setActionInProgressId(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-gray-900 to-slate-800 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold">Field Tech Action Items &amp; Exceptions</h2>
                                <span className="bg-amber-500 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-full">
                                    {totalCount} Total
                                </span>
                            </div>
                            <p className="text-xs text-gray-300">
                                On-site quote requests, scope amendments, parts requisitions, and tech exceptions requiring immediate action.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Filter and Navigation Bar */}
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row items-center justify-between gap-3">
                    {/* Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                activeTab === 'all'
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                        >
                            <span>All Items</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">{totalCount}</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('approvals')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                activeTab === 'approvals'
                                    ? 'bg-emerald-700 text-white shadow-xs'
                                    : 'bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200'
                            }`}
                        >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Scope Approvals</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 font-black">{scopeApprovalItems.length}</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('quotes')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                activeTab === 'quotes'
                                    ? 'bg-purple-600 text-white shadow-xs'
                                    : 'bg-white text-purple-800 hover:bg-purple-50 border border-purple-200'
                            }`}
                        >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Quotes Needed</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-900 font-black">{quoteItems.length}</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('parts')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                activeTab === 'parts'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
                            }`}
                        >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Parts Needed</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 font-black">{partsItems.length}</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('reschedules')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                activeTab === 'reschedules'
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200'
                            }`}
                        >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Reschedules</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-900 font-black">{rescheduleItems.length}</span>
                        </button>
                    </div>

                    {/* Search & Urgency Filter */}
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-60">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search customer, tech, part..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                            />
                        </div>

                        <select
                            value={urgencyFilter}
                            onChange={(e) => setUrgencyFilter(e.target.value as any)}
                            className="text-xs bg-white border border-gray-300 rounded-lg py-1.5 px-2 font-medium"
                        >
                            <option value="all">All Urgency</option>
                            <option value="emergency">🚨 Emergency</option>
                            <option value="high">⚡ High Priority</option>
                            <option value="standard">Standard</option>
                        </select>
                    </div>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {filteredItems.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <CheckCircle2 className="w-16 h-16 mx-auto mb-3 text-emerald-400/80" />
                            <h3 className="text-base font-bold text-gray-700">All Field Action Items Resolved</h3>
                            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                                No pending quote requests, scope amendments, or parts procurement exceptions from technicians on site.
                            </p>
                        </div>
                    ) : (
                        filteredItems.map(item => {
                            const isEmergency = item.urgency === 'emergency';
                            const isApproval = item.type === 'approval';
                            const isParts = item.type === 'parts';
                            const isQuote = item.type === 'quote';

                            return (
                                <div
                                    key={item.id}
                                    className={`bg-white rounded-xl border p-4 shadow-xs hover:shadow-md transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${
                                        isEmergency ? 'border-red-300 bg-red-50/20 ring-1 ring-red-200' :
                                        isApproval ? 'border-emerald-300 bg-emerald-50/15 ring-1 ring-emerald-200' :
                                        isQuote ? 'border-purple-300 bg-purple-50/10' :
                                        isParts ? 'border-amber-300 bg-amber-50/10' :
                                        'border-blue-200 bg-blue-50/10'
                                    }`}
                                >
                                    {/* Left: Info Details */}
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {/* Type Badge */}
                                            {isApproval && (
                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                                                    <ShieldAlert className="w-3 h-3 text-emerald-700" />
                                                    SCOPE APPROVAL
                                                </span>
                                            )}
                                            {isQuote && (
                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1">
                                                    <FileText className="w-3 h-3 text-purple-700" />
                                                    FIELD QUOTE REQUEST
                                                </span>
                                            )}
                                            {isParts && (
                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                                    <ShoppingCart className="w-3 h-3 text-amber-700" />
                                                    PARTS PROCUREMENT
                                                </span>
                                            )}
                                            {!isApproval && !isParts && !isQuote && (
                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-900 border border-blue-300 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3 text-blue-700" />
                                                    RESCHEDULE REQUEST
                                                </span>
                                            )}

                                            {/* Urgency Badge */}
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                                isEmergency ? 'bg-red-500 text-white animate-pulse' :
                                                item.urgency === 'high' ? 'bg-orange-500 text-white' :
                                                'bg-slate-200 text-slate-800'
                                            }`}>
                                                {item.urgency}
                                            </span>

                                            {/* Status Badge */}
                                            {isParts && item.job.parts_procurement_status && (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-200 text-amber-950 uppercase">
                                                    Status: {item.job.parts_procurement_status.replace(/_/g, ' ')}
                                                </span>
                                            )}
                                            {isApproval && item.job.pending_scope_approval && (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-red-100 text-red-800 uppercase animate-pulse border border-red-200">
                                                    ⏳ Pending Customer Approval
                                                </span>
                                            )}

                                            <span className="text-[11px] font-mono font-bold text-gray-500">
                                                Job #{item.job.id.substring(0, 8)}
                                            </span>
                                        </div>

                                        {/* Customer and Tech Context */}
                                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs">
                                            <span className="font-bold text-gray-900 text-sm">
                                                {item.job.customer?.name || 'Customer'}
                                            </span>
                                            <span className="text-gray-600 flex items-center gap-1">
                                                <User className="w-3 h-3 text-blue-600" />
                                                Tech: <strong className="text-gray-800">{item.techName}</strong>
                                            </span>
                                            {item.job.customer?.phone && (
                                                <a href={`tel:${item.job.customer.phone}`} className="text-gray-600 hover:text-blue-600 flex items-center gap-1">
                                                    <Phone className="w-3 h-3 text-emerald-600" />
                                                    {item.job.customer.phone}
                                                </a>
                                            )}
                                        </div>

                                        {/* Description Card */}
                                        <div className="p-3 bg-white/90 rounded-xl border border-gray-200 text-xs text-gray-800 leading-relaxed font-medium">
                                            <div className="font-bold text-gray-900 mb-0.5">{item.title}</div>
                                            <p>{item.details}</p>
                                        </div>

                                        {/* Signature snippet if present */}
                                        {isApproval && item.scopeAmendment?.signatureDataUrl && (
                                            <div className="flex items-center gap-2 pt-1">
                                                <span className="text-[11px] font-bold text-gray-600">On-Glass Signature:</span>
                                                <button
                                                    onClick={() => setSignaturePreviewUrl(item.scopeAmendment.signatureDataUrl)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 border rounded text-[11px] font-semibold text-blue-700"
                                                >
                                                    <Eye className="w-3 h-3" /> View Signature ({item.scopeAmendment.signerName || 'Customer'})
                                                </button>
                                            </div>
                                        )}

                                        {/* Quote Request Line Items (if present) */}
                                        {isQuote && item.quoteRequest?.lineItems && item.quoteRequest.lineItems.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                {item.quoteRequest.lineItems.map((li, idx) => (
                                                    <span key={idx} className="text-[11px] bg-purple-50 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-md font-medium">
                                                        {li.description} ({li.quantity}x {li.unitPrice ? `@ $${li.unitPrice}` : ''})
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: Quick Action Buttons */}
                                    <div className="flex flex-wrap lg:flex-col items-center lg:items-stretch gap-2 w-full lg:w-48 flex-shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-150">
                                        {isApproval && (
                                            <>
                                                {item.job.pending_scope_approval && (
                                                    <button
                                                        onClick={() => handleResendScopeSms(item.job)}
                                                        disabled={actionInProgressId === item.job.id}
                                                        className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                    >
                                                        <Send className="w-3.5 h-3.5" />
                                                        <span>Resend SMS Approval</span>
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => handleApproveScopeAmendment(item.job)}
                                                    disabled={actionInProgressId === item.job.id}
                                                    className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                    <span>{item.job.pending_scope_approval ? 'Override & Approve' : 'Confirm Scope Change'}</span>
                                                </button>
                                            </>
                                        )}

                                        {isQuote && (
                                            <>
                                                <button
                                                    onClick={() => handleCreateQuoteForJob(item.job)}
                                                    className="w-full py-2 px-3 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    <span>Open Quote Builder</span>
                                                </button>

                                                <button
                                                    onClick={() => handleResolveQuoteRequest(item.job)}
                                                    disabled={actionInProgressId === item.job.id}
                                                    className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                    <span>Mark Resolved</span>
                                                </button>
                                            </>
                                        )}

                                        {isParts && (
                                            <>
                                                <button
                                                    onClick={() => handleCreatePOForJob(item.job)}
                                                    className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5"
                                                >
                                                    <ShoppingCart className="w-3.5 h-3.5" />
                                                    <span>Create PO / Sourcing</span>
                                                </button>

                                                {item.job.parts_procurement_status !== 'ordered' && (
                                                    <button
                                                        onClick={() => handleUpdatePartsProcurementStatus(item.job, 'ordered')}
                                                        disabled={actionInProgressId === item.job.id}
                                                        className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                    >
                                                        <Package className="w-3.5 h-3.5" />
                                                        <span>Mark Ordered</span>
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => handleUpdatePartsProcurementStatus(item.job, 'resolved')}
                                                    disabled={actionInProgressId === item.job.id}
                                                    className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                    <span>Parts Ready / Resolved</span>
                                                </button>
                                            </>
                                        )}

                                        <button
                                            onClick={() => {
                                                onClose();
                                                navigate(`/jobs/${item.job.id}`);
                                            }}
                                            className="w-full py-1.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
                                        >
                                            <span>View Job Dossier</span>
                                            <ExternalLink className="w-3 h-3 text-gray-500" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Signature Preview Modal */}
                {signaturePreviewUrl && (
                    <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4" onClick={() => setSignaturePreviewUrl(null)}>
                        <div className="bg-white rounded-xl p-4 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-bold text-sm text-gray-800">Customer On-Glass Signature</h4>
                                <button onClick={() => setSignaturePreviewUrl(null)} className="p-1 rounded hover:bg-gray-100">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="border rounded-lg p-2 bg-gray-50 flex items-center justify-center">
                                <img src={signaturePreviewUrl} alt="Signature" className="max-h-48 object-contain" />
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-medium">
                        Showing {filteredItems.length} of {totalCount} field action items
                    </span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold transition-colors"
                    >
                        Close Drawer
                    </button>
                </div>
            </div>
        </div>
    );
};
