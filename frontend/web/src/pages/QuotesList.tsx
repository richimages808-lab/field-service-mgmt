import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { FileText, Clock, CheckCircle, XCircle, DollarSign, Eye, AlertTriangle, Edit, MessageSquare, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Quote {
    id: string;
    jobId: string;
    job_id: string;
    quoteNumber?: string;
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
    customerNotes?: Array<{ text: string; author: string; createdAt: string }>;
}

const STATUS_TABS = ['all', 'tech_review', 'sent', 'viewed', 'draft', 'approved', 'declined'] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode; priority: number }> = {
    tech_review: { label: 'Needs Review', color: 'text-amber-800', bgColor: 'bg-amber-100', icon: <AlertTriangle className="w-5 h-5 text-amber-500" />, priority: 0 },
    draft: { label: 'Draft', color: 'text-gray-800', bgColor: 'bg-gray-100', icon: <Clock className="w-5 h-5 text-gray-500" />, priority: 1 },
    sent: { label: 'Sent', color: 'text-blue-800', bgColor: 'bg-blue-100', icon: <Send className="w-5 h-5 text-blue-500" />, priority: 2 },
    viewed: { label: 'Viewed', color: 'text-purple-800', bgColor: 'bg-purple-100', icon: <Eye className="w-5 h-5 text-purple-500" />, priority: 3 },
    approved: { label: 'Approved', color: 'text-green-800', bgColor: 'bg-green-100', icon: <CheckCircle className="w-5 h-5 text-green-500" />, priority: 4 },
    declined: { label: 'Declined', color: 'text-red-800', bgColor: 'bg-red-100', icon: <XCircle className="w-5 h-5 text-red-500" />, priority: 5 },
    rejected: { label: 'Declined', color: 'text-red-800', bgColor: 'bg-red-100', icon: <XCircle className="w-5 h-5 text-red-500" />, priority: 5 },
};

export const QuotesList: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');

    useEffect(() => {
        loadQuotes();
    }, [user]);

    const loadQuotes = async () => {
        if (!user?.org_id) return;

        try {
            const quotesRef = collection(db, 'quotes');
            const q = query(
                quotesRef,
                where('org_id', '==', user.org_id),
                orderBy('createdAt', 'desc')
            );

            const snapshot = await getDocs(q);
            console.log(`[QuotesList] Loaded ${snapshot.docs.length} quotes for org: ${user.org_id}`);
            const quotesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Quote[];

            setQuotes(quotesData);
        } catch (error: any) {
            console.error('Error loading quotes:', error);
            if (error?.message?.includes('index')) {
                console.error('Firestore index may be missing. Check the Firebase console for index creation links.');
            }
        } finally {
            setLoading(false);
        }
    };

    const getStatusConfig = (status: string) => {
        return STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    };

    const filteredQuotes = filter === 'all'
        ? quotes
        : quotes.filter(q => q.status === filter || (filter === 'declined' && q.status === 'rejected'));

    const needsReviewCount = quotes.filter(q => q.status === 'tech_review').length;

    const getLastCustomerNote = (quote: Quote): string | null => {
        if (!quote.customerNotes?.length) return null;
        const customerNotes = quote.customerNotes.filter(n => n.author === 'customer');
        return customerNotes.length > 0 ? customerNotes[customerNotes.length - 1].text : null;
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
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Quotes</h1>
                <p className="mt-2 text-sm text-gray-600">
                    Manage all customer quotes and proposals
                </p>
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
            <div className="mb-6 border-b border-gray-200">
                <nav className="-mb-px flex space-x-6 overflow-x-auto">
                    {STATUS_TABS.map((status) => {
                        const count = status === 'all'
                            ? quotes.length
                            : status === 'declined'
                                ? quotes.filter(q => q.status === 'declined' || q.status === 'rejected').length
                                : quotes.filter(q => q.status === status).length;
                        const config = status === 'all' ? null : getStatusConfig(status);
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
                <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                    <ul className="divide-y divide-gray-200">
                        {filteredQuotes.map((quote) => {
                            const config = getStatusConfig(quote.status);
                            const lastNote = getLastCustomerNote(quote);
                            const isReview = quote.status === 'tech_review';

                            return (
                                <li key={quote.id} className={isReview ? 'bg-amber-50/50' : ''}>
                                    <div className="px-4 py-4 sm:px-6 hover:bg-gray-50 cursor-pointer transition-colors">
                                        <div
                                            className="flex items-center justify-between"
                                            onClick={() => navigate(`/quote/${quote.id}`)}
                                        >
                                            <div className="flex items-center min-w-0">
                                                {config.icon}
                                                <div className="ml-3 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-medium text-gray-900 truncate">
                                                            {quote.customer.name}
                                                        </p>
                                                        {quote.quoteNumber && (
                                                            <span className="text-xs text-gray-400">{quote.quoteNumber}</span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-500 truncate">
                                                        {quote.customer.email}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-4 ml-4">
                                                <div className="text-right">
                                                    <p className="text-sm font-semibold text-gray-900 flex items-center">
                                                        <DollarSign className="w-4 h-4" />
                                                        {quote.total?.toFixed(2) || '0.00'}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {quote.createdAt?.toDate?.().toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                                                    {config.label}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Customer Change Request Preview */}
                                        {isReview && lastNote && (
                                            <div className="mt-3 ml-8">
                                                <div className="flex items-start gap-2 bg-amber-100 rounded-lg p-3 border border-amber-200">
                                                    <MessageSquare className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-semibold text-amber-800">Customer Change Request:</p>
                                                        <p className="text-sm text-amber-900 mt-0.5 line-clamp-2">"{lastNote}"</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 mt-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/quotes/${quote.id}/edit`);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg font-medium hover:bg-amber-700 transition-colors"
                                                    >
                                                        <Edit className="w-3.5 h-3.5" />
                                                        Revise Quote
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/quote/${quote.id}`);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 text-amber-700 text-xs rounded-lg font-medium hover:bg-amber-50 transition-colors"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        View Details
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Line items summary */}
                                        {!isReview && (
                                            <div className="mt-2 ml-8">
                                                <p className="text-sm text-gray-600">
                                                    {quote.lineItems?.length || 0} line item{(quote.lineItems?.length || 0) !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};
