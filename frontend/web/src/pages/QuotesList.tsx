import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, Timestamp, doc, getDoc, onSnapshot } from 'firebase/firestore';
import {
    FileText, Clock, CheckCircle, XCircle, DollarSign, Eye, AlertTriangle,
    Edit, MessageSquare, Send, ChevronDown, ChevronUp, ArrowRight, Plus,
    User, Wrench, Bot, History, Loader2, Search, MapPin, Calendar,
    Sparkles, Clipboard, ArrowRightCircle, CheckCircle2, TrendingUp,
    Briefcase, AlertCircle
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { QuoteJobTimeline, buildTimeline } from '../components/QuoteJobTimeline';
import { DeleteReasonModal } from '../components/DeleteReasonModal';
import { canUserDelete, deleteQuoteWithAudit } from '../lib/deletionService';
import { Trash2 } from 'lucide-react';
import { Job } from '../types';

interface QuoteNote {
    text: string;
    author: string;
    createdAt: string;
    type?: string;
    waitingFor?: string;
}

interface Quote {
    id: string;
    jobId?: string;
    job_id?: string;
    quoteNumber?: string;
    version?: number;
    customer?: {
        name: string;
        email?: string;
        phone?: string;
        address?: string;
    };
    lineItems?: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
        type?: string;
    }>;
    scopeOfWork?: string;
    subtotal: number;
    tax?: number;
    taxAmount?: number;
    total: number;
    status: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    createdAt: Timestamp;
    updatedAt?: Timestamp;
    validUntil?: Timestamp;
    sentAt?: Timestamp;
    approvedAt?: Timestamp;
    customerNotes?: QuoteNote[];
    createdBy?: string;
}

const STATUS_TABS = ['all', 'tech_review', 'sent', 'viewed', 'draft', 'approved', 'declined'] as const;

const STATUS_CONFIG: Record<string, {
    label: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    cardBorder: string;
    cardHover: string;
    dotColor: string;
    icon: React.ReactNode;
}> = {
    tech_review: {
        label: 'Needs Review',
        badgeBg: 'bg-amber-100',
        badgeText: 'text-amber-800',
        badgeBorder: 'border-amber-200',
        cardBorder: 'border-amber-200 bg-amber-50/20',
        cardHover: 'hover:border-amber-400',
        dotColor: 'bg-amber-500',
        icon: <AlertTriangle className="w-3.5 h-3.5" />
    },
    draft: {
        label: 'Draft',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-700',
        badgeBorder: 'border-slate-200',
        cardBorder: 'border-gray-200 bg-white',
        cardHover: 'hover:border-slate-400',
        dotColor: 'bg-slate-400',
        icon: <Clock className="w-3.5 h-3.5" />
    },
    sent: {
        label: 'Sent',
        badgeBg: 'bg-blue-100',
        badgeText: 'text-blue-800',
        badgeBorder: 'border-blue-200',
        cardBorder: 'border-gray-200 bg-white',
        cardHover: 'hover:border-blue-400',
        dotColor: 'bg-blue-500',
        icon: <Send className="w-3.5 h-3.5" />
    },
    viewed: {
        label: 'Viewed',
        badgeBg: 'bg-purple-100',
        badgeText: 'text-purple-800',
        badgeBorder: 'border-purple-200',
        cardBorder: 'border-purple-100 bg-purple-50/10',
        cardHover: 'hover:border-purple-400',
        dotColor: 'bg-purple-500',
        icon: <Eye className="w-3.5 h-3.5" />
    },
    approved: {
        label: 'Approved',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-800',
        badgeBorder: 'border-emerald-200',
        cardBorder: 'border-emerald-100 bg-emerald-50/10',
        cardHover: 'hover:border-emerald-400',
        dotColor: 'bg-emerald-500',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />
    },
    declined: {
        label: 'Declined',
        badgeBg: 'bg-rose-100',
        badgeText: 'text-rose-800',
        badgeBorder: 'border-rose-200',
        cardBorder: 'border-gray-200 bg-white',
        cardHover: 'hover:border-rose-300',
        dotColor: 'bg-rose-500',
        icon: <XCircle className="w-3.5 h-3.5" />
    },
    rejected: {
        label: 'Declined',
        badgeBg: 'bg-rose-100',
        badgeText: 'text-rose-800',
        badgeBorder: 'border-rose-200',
        cardBorder: 'border-gray-200 bg-white',
        cardHover: 'hover:border-rose-300',
        dotColor: 'bg-rose-500',
        icon: <XCircle className="w-3.5 h-3.5" />
    },
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    critical: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
    high: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' },
    low: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
};

// ── Quote Card Item ───────────────────────────────────────────────────────────
const QuoteCard: React.FC<{
    quote: Quote;
    job?: Job;
    isExpanded: boolean;
    onToggle: () => void;
    onNavigate: (path: string) => void;
    canDelete?: boolean;
    onDelete?: (quote: Quote) => void;
}> = ({ quote, job, isExpanded, onToggle, onNavigate, canDelete, onDelete }) => {
    const config = STATUS_CONFIG[quote.status] || STATUS_CONFIG.draft;
    const [invoicesData, setInvoicesData] = useState<any[]>([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);

    useEffect(() => {
        if (!isExpanded) return;
        const fetchInvoices = async () => {
            setLoadingInvoices(true);
            try {
                const invoicesRef = collection(db, 'invoices');
                const q = (quote.job_id || quote.jobId)
                    ? query(invoicesRef, where('job_id', '==', quote.job_id || quote.jobId))
                    : query(invoicesRef, where('quote_id', '==', quote.id));
                const invoicesSnap = await getDocs(q);
                setInvoicesData(invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (err) {
                console.warn('[QuoteCard] Error fetching invoices:', err);
            } finally {
                setLoadingInvoices(false);
            }
        };
        fetchInvoices();
    }, [isExpanded, quote.job_id, quote.jobId, quote.id]);

    const timeline = useMemo(() => {
        try {
            return buildTimeline(quote, job, invoicesData) || [];
        } catch (err) {
            console.warn('[QuoteCard] Error building timeline:', err);
            return [];
        }
    }, [quote, job, invoicesData]);
    const isReview = quote.status === 'tech_review';
    const messageCount = timeline.filter(e => e.type === 'message').length;
    const lastCustomerMsg = [...timeline].reverse().find(e => e.type === 'message' && e.author === 'customer');
    const lastTechMsg = [...timeline].reverse().find(e => e.type === 'message' && e.author === 'tech');

    // Customer Name & Initials
    const customerName = quote.customer?.name || job?.customer?.name || 'Unknown Customer';
    const initials = customerName
        .split(' ')
        .map(n => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'Q';

    // Requested Date (from job creation or quote creation)
    const requestDate = useMemo(() => {
        const raw = job?.createdAt || (job?.request as any)?.submittedAt || quote.createdAt;
        if (!raw) return null;
        if (raw instanceof Timestamp) return raw.toDate();
        if (typeof raw === 'object' && 'seconds' in raw) return new Date((raw as any).seconds * 1000);
        const parsed = new Date(raw);
        return isNaN(parsed.getTime()) ? null : parsed;
    }, [job, quote]);

    const requestDateFormatted = requestDate ? format(requestDate, 'MMM d, yyyy') : null;
    const requestAge = requestDate ? formatDistanceToNowStrict(requestDate, { addSuffix: true }) : null;

    // Actual Request Text (from job request or quote scope of work or line items)
    const requestDescription = useMemo(() => {
        if (job?.request?.description && job.request.description.trim()) {
            return job.request.description.trim();
        }
        if (quote.scopeOfWork && quote.scopeOfWork.trim()) {
            return quote.scopeOfWork.trim();
        }
        if (quote.lineItems && quote.lineItems.length > 0) {
            return quote.lineItems.map(item => item.description).filter(Boolean).join(', ');
        }
        return 'No specific request description provided.';
    }, [job, quote]);

    // Trade category / type
    const tradeType = job?.request?.type || (job as any)?.category || job?.type || null;

    // Service Address
    const serviceAddress = quote.customer?.address || job?.customer?.address || null;

    // Last & Next Steps Workflow Definition
    const workflowSteps = useMemo(() => {
        let lastAction = 'Draft generated';
        let nextStep = 'Finalize line items & send to customer';
        let lastIcon = <FileText className="w-3.5 h-3.5 text-slate-500" />;
        let nextIcon = <Send className="w-3.5 h-3.5 text-blue-600" />;

        if (quote.status === 'tech_review') {
            lastAction = lastCustomerMsg
                ? `Customer requested changes: "${lastCustomerMsg.text.substring(0, 45)}${lastCustomerMsg.text.length > 45 ? '…' : ''}"`
                : 'Customer requested revisions';
            nextStep = 'Dispatcher/Tech review changes & send updated quote';
            lastIcon = <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />;
            nextIcon = <Edit className="w-3.5 h-3.5 text-amber-600" />;
        } else if (quote.status === 'viewed') {
            lastAction = 'Customer opened and viewed proposal online';
            nextStep = 'Awaiting customer signature / Follow up if needed';
            lastIcon = <Eye className="w-3.5 h-3.5 text-purple-600" />;
            nextIcon = <Clock className="w-3.5 h-3.5 text-purple-600" />;
        } else if (quote.status === 'sent') {
            lastAction = lastTechMsg ? 'Sent revised proposal to customer' : 'Sent quote to customer via SMS / Email';
            nextStep = 'Waiting for customer to view and approve';
            lastIcon = <Send className="w-3.5 h-3.5 text-blue-600" />;
            nextIcon = <Clock className="w-3.5 h-3.5 text-blue-600" />;
        } else if (quote.status === 'approved') {
            lastAction = quote.approvedAt ? `Customer approved on ${format(quote.approvedAt.toDate ? quote.approvedAt.toDate() : new Date(), 'MMM d')}` : 'Customer approved proposal';
            nextStep = job?.status === 'scheduled'
                ? 'Job is scheduled on timeline'
                : 'Collect deposit & auto-schedule technician';
            lastIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
            nextIcon = <Calendar className="w-3.5 h-3.5 text-emerald-600" />;
        } else if (quote.status === 'declined' || quote.status === 'rejected') {
            lastAction = 'Customer declined quote';
            nextStep = 'Follow up with customer or archive record';
            lastIcon = <XCircle className="w-3.5 h-3.5 text-rose-600" />;
            nextIcon = <History className="w-3.5 h-3.5 text-gray-500" />;
        }

        return { lastAction, nextStep, lastIcon, nextIcon };
    }, [quote, job, lastCustomerMsg, lastTechMsg]);

    const priority = quote.priority || job?.priority;
    const priorityStyle = priority ? PRIORITY_STYLES[priority] : null;

    return (
        <div className={`bg-white rounded-xl border ${config.cardBorder} ${config.cardHover} shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden`}>
            {/* Top Primary Bar */}
            <div className="p-4 sm:p-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Customer & Quote Identity */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm ${
                            isReview ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white' :
                            quote.status === 'approved' ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white' :
                            quote.status === 'viewed' ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white' :
                            quote.status === 'sent' ? 'bg-gradient-to-br from-blue-500 to-cyan-600 text-white' :
                            'bg-gradient-to-br from-slate-600 to-gray-700 text-white'
                        }`}>
                            {initials}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3
                                    onClick={() => onNavigate(`/quotes/${quote.id}/edit`)}
                                    className="text-base font-bold text-gray-900 hover:text-blue-600 cursor-pointer transition-colors truncate"
                                >
                                    {customerName}
                                </h3>

                                {quote.quoteNumber && (
                                    <span className="text-xs font-mono font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200">
                                        {quote.quoteNumber}
                                    </span>
                                )}

                                {quote.version && quote.version > 1 && (
                                    <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">
                                        v{quote.version}
                                    </span>
                                )}

                                {priority && priorityStyle && (
                                    <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${priorityStyle.bg} ${priorityStyle.text} ${priorityStyle.border}`}>
                                        {priority}
                                    </span>
                                )}

                                {tradeType && (
                                    <span className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md flex items-center gap-1">
                                        <Wrench className="w-3 h-3 text-slate-500" />
                                        {tradeType}
                                    </span>
                                )}
                            </div>

                            {/* Address & Contact Subline */}
                            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 mt-1.5 text-xs text-gray-500">
                                {serviceAddress && (
                                    <span className="flex items-center gap-1 truncate max-w-md">
                                        <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                        <span className="truncate">{serviceAddress}</span>
                                    </span>
                                )}

                                {requestDateFormatted && (
                                    <span className="flex items-center gap-1 text-gray-600 font-medium">
                                        <Calendar className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                                        Requested: {requestDateFormatted} ({requestAge})
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Pricing, Status Badge & Action Controls */}
                    <div className="flex items-center justify-between lg:justify-end gap-3.5 flex-shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                        {messageCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">
                                <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                                {messageCount}
                            </span>
                        )}

                        {/* Price */}
                        <div className="text-right">
                            <div className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight">
                                ${(quote.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {quote.subtotal != null && quote.total !== quote.subtotal && (
                                <div className="text-[11px] text-gray-400 font-medium">
                                    Subtotal: ${quote.subtotal.toFixed(2)}
                                </div>
                            )}
                        </div>

                        {/* Status Badge */}
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-xs ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}>
                            {config.icon}
                            {config.label}
                        </span>

                        {/* Expand / Collapse Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggle(); }}
                            className={`p-2 rounded-xl border transition-all duration-200 ${
                                isExpanded
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-inner'
                                    : 'border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-700'
                            }`}
                            title={isExpanded ? 'Collapse quote details' : 'Expand full details & timeline'}
                        >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* ── Actual Job Request Description ── */}
                <div className="mt-3.5 p-3 bg-gray-50/90 rounded-xl border border-gray-150 flex items-start gap-2.5 text-xs text-gray-700">
                    <Clipboard className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <span className="font-semibold text-gray-900 mr-1.5">Request / Scope:</span>
                        <span className="text-gray-700 leading-relaxed line-clamp-2">{requestDescription}</span>
                    </div>
                </div>

                {/* ── Last Action > Next Step Workflow Progression ── */}
                <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {/* Last Action */}
                    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200/60">
                        <span className="flex-shrink-0">{workflowSteps.lastIcon}</span>
                        <div className="flex-1 min-w-0">
                            <span className="font-bold text-gray-700 mr-1 text-[11px] uppercase tracking-wider">Last:</span>
                            <span className="text-gray-800 truncate font-medium">{workflowSteps.lastAction}</span>
                        </div>
                    </div>

                    {/* Next Step */}
                    <div className="flex items-center gap-2 p-2 bg-blue-50/60 rounded-lg border border-blue-100">
                        <span className="flex-shrink-0">{workflowSteps.nextIcon}</span>
                        <div className="flex-1 min-w-0">
                            <span className="font-bold text-blue-900 mr-1 text-[11px] uppercase tracking-wider">Next:</span>
                            <span className="text-blue-950 font-semibold truncate">{workflowSteps.nextStep}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Expanded: Full Details & Communication Timeline ── */}
            {isExpanded && (
                <div className="px-5 pb-5 pt-3 bg-gray-50/50 border-t border-gray-200 space-y-4 animate-fadeIn">
                    {/* Linked Job Meta */}
                    {job && (
                        <div className="p-3 bg-white rounded-xl border border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                                <Briefcase className="w-4 h-4 text-indigo-600" />
                                <span className="font-bold text-gray-900">Linked Job #{job.id?.substring(0, 8)}</span>
                                <span className="text-gray-500">• Status: <strong className="text-gray-700 capitalize">{job.status}</strong></span>
                                {job.assigned_tech_name && (
                                    <span className="text-gray-500">• Tech: <strong className="text-indigo-600">{job.assigned_tech_name}</strong></span>
                                )}
                            </div>
                            <button
                                onClick={() => onNavigate(`/jobs/${job.id}`)}
                                className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 hover:underline"
                            >
                                Open Job File <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Quote Line Items Summary */}
                    {quote.lineItems && quote.lineItems.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
                            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                                <span>Quote Items Breakdown ({quote.lineItems.length})</span>
                                <span>Total: ${(quote.total || 0).toFixed(2)}</span>
                            </div>
                            <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                {quote.lineItems.map((item, idx) => (
                                    <div key={idx} className="px-4 py-2 flex items-center justify-between text-xs">
                                        <div className="flex-1 pr-4">
                                            <p className="font-semibold text-gray-800">{item.description}</p>
                                            <p className="text-[11px] text-gray-400">Qty: {item.quantity} × ${item.unitPrice?.toFixed(2)}</p>
                                        </div>
                                        <span className="font-bold text-gray-900">${(item.total || item.quantity * item.unitPrice || 0).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Communication Timeline */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-2xs">
                        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <History className="w-4 h-4 text-indigo-600" />
                            Communication & Audit Timeline
                        </h4>
                        <QuoteJobTimeline
                            quoteId={quote.id}
                            isInternal={true}
                            initialQuote={quote}
                            initialJob={job}
                            initialInvoices={invoicesData}
                        />
                    </div>

                    {/* Quick Action Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onNavigate(`/quotes/${quote.id}/edit`)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-xl font-bold shadow-sm transition-colors"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                View / Edit Full Quote
                            </button>

                            {(isReview || quote.status === 'draft') && (
                                <button
                                    onClick={() => onNavigate(`/quotes/${quote.id}/edit`)}
                                    className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs rounded-xl font-bold shadow-sm text-white transition-colors ${
                                        isReview ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                                >
                                    <Edit className="w-3.5 h-3.5" />
                                    {isReview ? 'Revise Customer Quote' : 'Edit Draft'}
                                </button>
                            )}
                        </div>

                        {canDelete && onDelete && (
                            <button
                                onClick={() => onDelete(quote)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs rounded-xl font-bold transition-colors"
                                title="Delete Quote"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete Quote
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Main QuotesList Component ─────────────────────────────────────────────────
export const QuotesList: React.FC = () => {
    const { user, organization } = useAuth();
    const canDelete = canUserDelete(user, organization, 'quote');
    const [deleteTargetQuote, setDeleteTargetQuote] = useState<Quote | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const navigate = useNavigate();

    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [jobsMap, setJobsMap] = useState<Record<string, Job>>({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const [searchParams, setSearchParams] = useSearchParams();
    const statusParam = searchParams.get('status') || 'all';
    const filter = statusParam;
    const setFilter = (newFilter: string) => {
        setSearchParams(newFilter === 'all' ? {} : { status: newFilter });
    };

    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const handleConfirmDeleteQuote = async (reasonCategory: string, reasonDetails: string) => {
        if (!deleteTargetQuote || !user) return;
        await deleteQuoteWithAudit(deleteTargetQuote.id, deleteTargetQuote, user, reasonCategory, reasonDetails);
        setDeleteTargetQuote(null);
    };

    // Load Quotes & Jobs in real-time
    useEffect(() => {
        if (!user?.org_id) {
            setLoading(false);
            return;
        }

        const orgId = user.org_id;

        // Quotes listener
        const quotesRef = collection(db, 'quotes');
        const q = query(
            quotesRef,
            where('org_id', '==', orgId),
            orderBy('createdAt', 'desc')
        );

        const unsubQuotes = onSnapshot(q, (snapshot) => {
            const quotesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Quote[];
            setQuotes(quotesData);
            setLoading(false);
        }, (error) => {
            console.error('[QuotesList] Error loading quotes:', error);
            setLoading(false);
        });

        // Jobs listener (for real-time request text, customer addresses, schedule dates)
        const jobsRef = collection(db, 'jobs');
        const jobsQuery = query(jobsRef, where('org_id', '==', orgId));
        const unsubJobs = onSnapshot(jobsQuery, (snapshot) => {
            const map: Record<string, Job> = {};
            snapshot.docs.forEach(d => {
                map[d.id] = { id: d.id, ...d.data() } as Job;
            });
            setJobsMap(map);
        }, (err) => {
            console.warn('[QuotesList] Error listening to jobs:', err);
        });

        return () => {
            unsubQuotes();
            unsubJobs();
        };
    }, [user]);

    // Auto-expand quotes needing review
    useEffect(() => {
        const reviewIds = quotes.filter(q => q.status === 'tech_review').map(q => q.id);
        if (reviewIds.length > 0 && reviewIds.length <= 3) {
            setExpandedIds(new Set(reviewIds));
        }
    }, [quotes]);

    // Filter & Search Logic
    const filteredQuotes = useMemo(() => {
        return quotes.filter(q => {
            // Status Tab Filter
            const matchesStatus = filter === 'all'
                ? true
                : filter === 'declined'
                    ? (q.status === 'declined' || q.status === 'rejected')
                    : q.status === filter;

            if (!matchesStatus) return false;

            // Search Keyword Filter
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            const job = jobsMap[q.job_id || q.jobId || ''];

            const customerName = (q.customer?.name || job?.customer?.name || '').toLowerCase();
            const quoteNumber = (q.quoteNumber || '').toLowerCase();
            const address = (q.customer?.address || job?.customer?.address || '').toLowerCase();
            const requestText = (job?.request?.description || q.scopeOfWork || '').toLowerCase();
            const trade = (job?.request?.type || (job as any)?.category || '').toLowerCase();

            return (
                customerName.includes(term) ||
                quoteNumber.includes(term) ||
                address.includes(term) ||
                requestText.includes(term) ||
                trade.includes(term)
            );
        });
    }, [quotes, jobsMap, filter, searchTerm]);

    // KPI Metrics calculation
    const metrics = useMemo(() => {
        let activePipelineTotal = 0;
        let approvedTotal = 0;
        let needsReviewCount = 0;
        let sentCount = 0;
        let viewedCount = 0;
        let approvedCount = 0;

        quotes.forEach(q => {
            const total = Number(q.total) || 0;
            if (q.status === 'tech_review') {
                needsReviewCount++;
                activePipelineTotal += total;
            } else if (q.status === 'sent') {
                sentCount++;
                activePipelineTotal += total;
            } else if (q.status === 'viewed') {
                viewedCount++;
                activePipelineTotal += total;
            } else if (q.status === 'draft') {
                activePipelineTotal += total;
            } else if (q.status === 'approved') {
                approvedCount++;
                approvedTotal += total;
            }
        });

        return {
            activePipelineTotal,
            approvedTotal,
            needsReviewCount,
            sentCount,
            viewedCount,
            approvedCount,
            totalQuotes: quotes.length
        };
    }, [quotes]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const expandAll = () => {
        setExpandedIds(new Set(filteredQuotes.map(q => q.id)));
    };

    const collapseAll = () => {
        setExpandedIds(new Set());
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                    <p className="text-sm font-semibold text-gray-600">Loading quotes & proposals...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-xl shadow-md shadow-blue-500/20">
                            <FileText className="w-6 h-6" />
                        </div>
                        Quotes & Proposals
                    </h1>
                    <p className="mt-1 text-sm text-gray-600 ml-13">
                        Track, review, and convert customer estimates into booked service appointments
                    </p>
                </div>
                <button
                    onClick={() => navigate('/quotes/new')}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                    <Plus className="w-4 h-4" />
                    New Quote
                </button>
            </div>

            {/* Top KPI Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Active Pipeline */}
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex items-center gap-3.5">
                    <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 rounded-xl border border-blue-100">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Pipeline</p>
                        <p className="text-xl font-black text-gray-900 mt-0.5">
                            ${metrics.activePipelineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            Across {metrics.totalQuotes - metrics.approvedCount} open proposal{metrics.totalQuotes - metrics.approvedCount === 1 ? '' : 's'}
                        </p>
                    </div>
                </div>

                {/* Needs Review */}
                <div
                    onClick={() => setFilter('tech_review')}
                    className={`rounded-xl p-4 border shadow-xs flex items-center gap-3.5 cursor-pointer transition-all ${
                        metrics.needsReviewCount > 0
                            ? 'bg-amber-50/50 border-amber-300 hover:border-amber-400 hover:bg-amber-50'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                >
                    <div className={`p-3 rounded-xl border ${
                        metrics.needsReviewCount > 0
                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Needs Review</p>
                        <p className={`text-xl font-black mt-0.5 ${metrics.needsReviewCount > 0 ? 'text-amber-900' : 'text-gray-900'}`}>
                            {metrics.needsReviewCount}
                        </p>
                        <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                            {metrics.needsReviewCount > 0 ? 'Customer requested changes' : 'All reviews clear'}
                        </p>
                    </div>
                </div>

                {/* Sent & Viewed */}
                <div
                    onClick={() => setFilter('sent')}
                    className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex items-center gap-3.5 cursor-pointer hover:border-blue-300 transition-all"
                >
                    <div className="p-3 bg-gradient-to-br from-purple-50 to-blue-50 text-purple-600 rounded-xl border border-purple-100">
                        <Send className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sent & Viewed</p>
                        <p className="text-xl font-black text-gray-900 mt-0.5">
                            {metrics.sentCount + metrics.viewedCount}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            {metrics.viewedCount} viewed online by customer
                        </p>
                    </div>
                </div>

                {/* Approved & Booked */}
                <div
                    onClick={() => setFilter('approved')}
                    className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex items-center gap-3.5 cursor-pointer hover:border-emerald-300 transition-all"
                >
                    <div className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 rounded-xl border border-emerald-100">
                        <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Approved & Booked</p>
                        <p className="text-xl font-black text-emerald-800 mt-0.5">
                            ${metrics.approvedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">
                            {metrics.approvedCount} quote{metrics.approvedCount === 1 ? '' : 's'} accepted
                        </p>
                    </div>
                </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-xs space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Status Tabs */}
                    <div className="flex space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                        {STATUS_TABS.map((status) => {
                            const count = status === 'all'
                                ? quotes.length
                                : status === 'declined'
                                    ? quotes.filter(q => q.status === 'declined' || q.status === 'rejected').length
                                    : quotes.filter(q => q.status === status).length;

                            const isActive = filter === status;

                            return (
                                <button
                                    key={status}
                                    onClick={() => setFilter(status)}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all ${
                                        isActive
                                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200/60'
                                    }`}
                                >
                                    <span>
                                        {status === 'tech_review' ? 'Needs Review' : status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                                    </span>
                                    <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                                        isActive
                                            ? 'bg-white/20 text-white'
                                            : status === 'tech_review' && count > 0
                                                ? 'bg-amber-500 text-white'
                                                : 'bg-gray-200 text-gray-700'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Search Input */}
                    <div className="relative min-w-[260px] md:w-80">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search customer, quote #, address..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold"
                            >
                                ×
                            </button>
                        )}
                    </div>
                </div>

                {/* Subheader Toolbar: Match Count & Expand/Collapse */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
                    <div>
                        Showing <strong className="text-gray-800">{filteredQuotes.length}</strong> quote{filteredQuotes.length === 1 ? '' : 's'}
                        {searchTerm && <span> matching "<strong className="text-gray-800">{searchTerm}</strong>"</span>}
                    </div>

                    {filteredQuotes.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={expandAll}
                                className="text-xs text-gray-500 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors"
                            >
                                <ChevronDown className="w-3.5 h-3.5" /> Expand all
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                                onClick={collapseAll}
                                className="text-xs text-gray-500 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors"
                            >
                                <ChevronUp className="w-3.5 h-3.5" /> Collapse all
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Quotes List Cards */}
            {filteredQuotes.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-xs">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-sm">
                        <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-base font-bold text-gray-900">No quotes found</h3>
                    <p className="mt-1.5 text-xs text-gray-500 max-w-sm mx-auto">
                        {searchTerm
                            ? `No quotes matched "${searchTerm}". Try adjusting your search query or status filter.`
                            : filter === 'all'
                                ? 'No customer quotes exist yet. Create your first quote proposal to get started.'
                                : `No quotes are currently in ${filter.replace('_', ' ')} status.`}
                    </p>
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors"
                        >
                            Clear Search
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-3.5">
                    {filteredQuotes.map((quote) => (
                        <QuoteCard
                            key={quote.id}
                            quote={quote}
                            job={jobsMap[quote.job_id || quote.jobId || '']}
                            isExpanded={expandedIds.has(quote.id)}
                            onToggle={() => toggleExpand(quote.id)}
                            onNavigate={navigate}
                            canDelete={canDelete}
                            onDelete={(q) => {
                                setDeleteTargetQuote(q);
                                setIsDeleteModalOpen(true);
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Delete Reason Modal */}
            <DeleteReasonModal
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setDeleteTargetQuote(null);
                }}
                onConfirm={handleConfirmDeleteQuote}
                itemType="quote"
                itemIdentifier={deleteTargetQuote ? `Quote ${deleteTargetQuote.quoteNumber || deleteTargetQuote.id} (${deleteTargetQuote.customer?.name || 'Customer'})` : 'Quote'}
            />
        </div>
    );
};
