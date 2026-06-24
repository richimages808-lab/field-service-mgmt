import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, Timestamp, doc, getDoc, onSnapshot } from 'firebase/firestore';
import {
    FileText, Clock, CheckCircle, XCircle, DollarSign, Eye, AlertTriangle,
    Edit, MessageSquare, Send, ChevronDown, ChevronUp, ArrowRight, Plus,
    User, Wrench, Bot, History, Loader2
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QuoteJobTimeline, buildTimeline } from '../components/QuoteJobTimeline';

interface QuoteNote {
    text: string;
    author: string;
    createdAt: string;
    type?: string;
    waitingFor?: string;
}

interface Quote {
    id: string;
    jobId: string;
    job_id: string;
    quoteNumber?: string;
    version?: number;
    customer: {
        name: string;
        email: string;
    };
    lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
    }>;
    subtotal: number;
    tax: number;
    total: number;
    status: string;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
    validUntil?: Timestamp;
    sentAt?: Timestamp;
    approvedAt?: Timestamp;
    customerNotes?: QuoteNote[];
    createdBy?: string;
}

const STATUS_TABS = ['all', 'tech_review', 'sent', 'viewed', 'draft', 'approved', 'declined'] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; textColor: string; dotColor: string; icon: React.ReactNode; priority: number }> = {
    tech_review: { label: 'Needs Review', color: 'text-amber-800', bgColor: 'bg-amber-100', textColor: 'text-amber-700', dotColor: 'bg-amber-500', icon: <AlertTriangle className="w-4 h-4" />, priority: 0 },
    draft: { label: 'Draft', color: 'text-gray-800', bgColor: 'bg-gray-100', textColor: 'text-gray-600', dotColor: 'bg-gray-400', icon: <Clock className="w-4 h-4" />, priority: 1 },
    sent: { label: 'Sent', color: 'text-blue-800', bgColor: 'bg-blue-100', textColor: 'text-blue-700', dotColor: 'bg-blue-500', icon: <Send className="w-4 h-4" />, priority: 2 },
    viewed: { label: 'Viewed', color: 'text-purple-800', bgColor: 'bg-purple-100', textColor: 'text-purple-700', dotColor: 'bg-purple-500', icon: <Eye className="w-4 h-4" />, priority: 3 },
    approved: { label: 'Approved', color: 'text-green-800', bgColor: 'bg-green-100', textColor: 'text-green-700', dotColor: 'bg-green-500', icon: <CheckCircle className="w-4 h-4" />, priority: 4 },
    declined: { label: 'Declined', color: 'text-red-800', bgColor: 'bg-red-100', textColor: 'text-red-700', dotColor: 'bg-red-500', icon: <XCircle className="w-4 h-4" />, priority: 5 },
    rejected: { label: 'Declined', color: 'text-red-800', bgColor: 'bg-red-100', textColor: 'text-red-700', dotColor: 'bg-red-500', icon: <XCircle className="w-4 h-4" />, priority: 5 },
};
// ── Imported Timeline components from QuoteJobTimeline ───────────────────────

// ── Expandable Quote Row ──────────────────────────────────────────────────────
const QuoteRow: React.FC<{
    quote: Quote;
    isExpanded: boolean;
    onToggle: () => void;
    onNavigate: (path: string) => void;
}> = ({ quote, isExpanded, onToggle, onNavigate }) => {
    const config = STATUS_CONFIG[quote.status] || STATUS_CONFIG.draft;
    const [jobData, setJobData] = useState<any>(null);
    const [invoicesData, setInvoicesData] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        if (!isExpanded || (!quote.job_id && !quote.id)) return;
        
        const fetchDetails = async () => {
            setLoadingDetails(true);
            try {
                // Fetch Job
                if (quote.job_id) {
                    const jobDoc = await getDoc(doc(db, 'jobs', quote.job_id));
                    if (jobDoc.exists()) {
                        setJobData({ id: jobDoc.id, ...jobDoc.data() });
                    }
                }
                
                // Fetch Invoices
                const invoicesRef = collection(db, 'invoices');
                const q = quote.job_id 
                    ? query(invoicesRef, where('job_id', '==', quote.job_id))
                    : query(invoicesRef, where('quote_id', '==', quote.id));
                const invoicesSnap = await getDocs(q);
                setInvoicesData(invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (err) {
                console.warn('[QuoteRow] Error fetching job/invoice details:', err);
            } finally {
                setLoadingDetails(false);
            }
        };
        
        fetchDetails();
    }, [isExpanded, quote.job_id, quote.id]);

    const timeline = useMemo(() => buildTimeline(quote, jobData, invoicesData), [quote, jobData, invoicesData]);
    const isReview = quote.status === 'tech_review';
    const messageCount = timeline.filter(e => e.type === 'message').length;
    const lastCustomerMsg = [...timeline].reverse().find(e => e.type === 'message' && e.author === 'customer');
    const lastTechMsg = [...timeline].reverse().find(e => e.type === 'message' && e.author === 'tech');

    // Build a one-line summary of the latest interaction
    const summaryText = useMemo(() => {
        if (isReview && lastCustomerMsg) return `Customer requested changes: "${lastCustomerMsg.text.substring(0, 60)}${lastCustomerMsg.text.length > 60 ? '…' : ''}"`;
        if (lastTechMsg && quote.status === 'sent') return `You sent a revised quote`;
        if (quote.status === 'approved') return 'Customer approved this quote';
        if (quote.status === 'declined' || quote.status === 'rejected') return 'Customer declined this quote';
        if (quote.status === 'viewed') return 'Customer is viewing this quote';
        if (quote.status === 'sent') return 'Waiting for customer response';
        if (quote.status === 'draft') return 'Draft — not yet sent';
        return '';
    }, [quote, lastCustomerMsg, lastTechMsg, isReview]);

    return (
        <li className={`${isReview ? 'bg-amber-50/40' : ''} transition-all duration-200`}>
            {/* ── Main row ── */}
            <div className="px-4 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                    {/* Status dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${config.dotColor} ${
                        (quote.status === 'tech_review' || quote.status === 'viewed') ? 'animate-pulse' : ''
                    }`} />

                    {/* Customer info — clickable to view */}
                    <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => onNavigate(`/quote/${quote.id}`)}
                    >
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                                {quote.customer?.name || 'Unknown Customer'}
                            </p>
                            {quote.quoteNumber && (
                                <span className="text-[11px] text-gray-400 font-mono">{quote.quoteNumber}</span>
                            )}
                            {quote.version && quote.version > 1 && (
                                <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                                    v{quote.version}
                                </span>
                            )}
                        </div>
                        {/* One-line summary */}
                        {summaryText && (
                            <p className={`text-xs mt-0.5 truncate ${
                                isReview ? 'text-amber-700 font-medium' : 'text-gray-500'
                            }`}>
                                {summaryText}
                            </p>
                        )}
                    </div>

                    {/* Price + status + expand toggle */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Message count badge */}
                        {messageCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                <MessageSquare className="w-3 h-3" />
                                {messageCount}
                            </span>
                        )}

                        {/* Total */}
                        <div className="text-right">
                            <p className="text-sm font-bold text-gray-900 flex items-center gap-0.5">
                                <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                                {quote.total?.toFixed(2) || '0.00'}
                            </p>
                            <p className="text-[10px] text-gray-400">
                                {quote.createdAt?.toDate?.().toLocaleDateString()}
                            </p>
                        </div>

                        {/* Status badge */}
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.bgColor} ${config.color}`}>
                            {config.icon}
                            {config.label}
                        </span>

                        {/* Expand/collapse toggle */}
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggle(); }}
                            className={`p-1.5 rounded-lg transition-all duration-200 ${
                                isExpanded
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                            }`}
                            title={isExpanded ? 'Collapse timeline' : 'Expand timeline'}
                        >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* ── Expanded: Communication Timeline ── */}
                {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-150">
                        <QuoteJobTimeline
                            quoteId={quote.id}
                            isInternal={true}
                            initialQuote={quote}
                            initialJob={jobData}
                            initialInvoices={invoicesData}
                        />

                        {/* Quick action buttons */}
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                            <button
                                onClick={(e) => { e.stopPropagation(); onNavigate(`/quote/${quote.id}`); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs rounded-lg font-medium hover:bg-gray-50 transition-colors"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                View Quote
                            </button>
                            {(isReview || quote.status === 'draft') && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onNavigate(`/quotes/${quote.id}/edit`); }}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                                        isReview
                                            ? 'bg-amber-600 text-white hover:bg-amber-700'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                >
                                    <Edit className="w-3.5 h-3.5" />
                                    {isReview ? 'Revise Quote' : 'Edit Draft'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </li>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────
export const QuotesList: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();
    const statusParam = searchParams.get('status') || 'all';
    const filter = statusParam;
    const setFilter = (newFilter: string) => {
        setSearchParams(newFilter === 'all' ? {} : { status: newFilter });
    };
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!user?.org_id) {
            setLoading(false);
            return;
        }

        const quotesRef = collection(db, 'quotes');
        const q = query(
            quotesRef,
            where('org_id', '==', user.org_id),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log(`[QuotesList] Loaded ${snapshot.docs.length} quotes for org: ${user.org_id}`);
            const quotesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Quote[];
            setQuotes(quotesData);
            setLoading(false);
        }, (error) => {
            console.error('Error loading quotes:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    // Auto-expand quotes that need attention (tech_review)
    useEffect(() => {
        const reviewIds = quotes.filter(q => q.status === 'tech_review').map(q => q.id);
        if (reviewIds.length > 0 && reviewIds.length <= 3) {
            setExpandedIds(new Set(reviewIds));
        }
    }, [quotes]);

    const filteredQuotes = filter === 'all'
        ? quotes
        : quotes.filter(q => q.status === filter || (filter === 'declined' && q.status === 'rejected'));

    const needsReviewCount = quotes.filter(q => q.status === 'tech_review').length;

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
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="px-4 sm:px-5 lg:px-6 py-6">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Quotes</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        Manage all customer quotes and proposals
                    </p>
                </div>
                <button
                    onClick={() => navigate('/quotes/new')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                    <Plus className="w-4 h-4" />
                    New Quote
                </button>
            </div>

            {/* Needs Review Banner */}
            {needsReviewCount > 0 && filter !== 'tech_review' && (
                <div
                    className="mb-6 bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-amber-100 transition-colors"
                    onClick={() => setFilter('tech_review')}
                >
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                    <div className="flex-1">
                        <p className="font-semibold text-amber-900">
                            {needsReviewCount} quote{needsReviewCount > 1 ? 's' : ''} need{needsReviewCount === 1 ? 's' : ''} your review
                        </p>
                        <p className="text-sm text-amber-700">
                            Customer{needsReviewCount > 1 ? 's have' : ' has'} requested changes — click to review
                        </p>
                    </div>
                    <span className="bg-amber-600 text-white text-sm font-bold px-3 py-1 rounded-full">{needsReviewCount}</span>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="mb-4 border-b border-gray-200">
                <nav className="-mb-px flex space-x-6 overflow-x-auto">
                    {STATUS_TABS.map((status) => {
                        const count = status === 'all'
                            ? quotes.length
                            : status === 'declined'
                                ? quotes.filter(q => q.status === 'declined' || q.status === 'rejected').length
                                : quotes.filter(q => q.status === status).length;
                        const cfg = status === 'all' ? null : STATUS_CONFIG[status];
                        return (
                            <button
                                key={status}
                                onClick={() => setFilter(status)}
                                className={`
                                    py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center gap-2
                                    ${filter === status
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }
                                `}
                            >
                                {status === 'tech_review' ? 'Needs Review' : status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                    status === 'tech_review' && count > 0 ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-600'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Expand/Collapse All */}
            {filteredQuotes.length > 1 && (
                <div className="flex justify-end mb-2">
                    <div className="flex gap-2">
                        <button
                            onClick={expandAll}
                            className="text-[11px] text-gray-500 hover:text-blue-600 font-medium flex items-center gap-1 transition-colors"
                        >
                            <ChevronDown className="w-3 h-3" /> Expand all
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                            onClick={collapseAll}
                            className="text-[11px] text-gray-500 hover:text-blue-600 font-medium flex items-center gap-1 transition-colors"
                        >
                            <ChevronUp className="w-3 h-3" /> Collapse all
                        </button>
                    </div>
                </div>
            )}

            {/* Quotes List */}
            {filteredQuotes.length === 0 ? (
                <div className="text-center py-12">
                    <FileText className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No quotes</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        {filter === 'all'
                            ? 'Get started by creating a quote for a job.'
                            : `No ${filter === 'tech_review' ? 'quotes needing review' : filter} quotes found.`}
                    </p>
                </div>
            ) : (
                <div className="bg-white shadow-sm border border-gray-200 overflow-hidden rounded-xl">
                    <ul className="divide-y divide-gray-100">
                        {filteredQuotes.map((quote) => (
                            <QuoteRow
                                key={quote.id}
                                quote={quote}
                                isExpanded={expandedIds.has(quote.id)}
                                onToggle={() => toggleExpand(quote.id)}
                                onNavigate={navigate}
                            />
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
