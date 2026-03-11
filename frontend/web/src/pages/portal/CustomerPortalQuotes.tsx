/**
 * CustomerPortalQuotes - Customer's quotes listing and status
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortalContext } from './CustomerPortalLayout';
import { db } from '../../firebase';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { Quote } from '../../types';
import { FileText, CheckCircle, XCircle, Clock, DollarSign, Calendar, AlertTriangle } from 'lucide-react';

export const CustomerPortalQuotes: React.FC = () => {
    const { customer } = usePortalContext();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'declined'>('all');

    useEffect(() => {
        const fetchQuotes = async () => {
            if (!customer) {
                setLoading(false);
                return;
            }

            try {
                const quotesQuery = query(
                    collection(db, 'quotes'),
                    where('customer_id', '==', customer.id),
                    orderBy('createdAt', 'desc')
                );
                const snapshot = await getDocs(quotesQuery);
                setQuotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quote)));
            } catch (error) {
                console.error('Error fetching quotes:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchQuotes();
    }, [customer]);

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getStatusInfo = (status: Quote['status']) => {
        const statusMap = {
            draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800 border-gray-200', icon: FileText },
            sent: { label: 'Sent', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: FileText },
            viewed: { label: 'Viewed', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: Clock },
            approved: { label: 'Approved', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
            declined: { label: 'Declined', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
            expired: { label: 'Expired', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertTriangle },
            superseded: { label: 'Superseded', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: FileText },
            completed: { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
        };
        return statusMap[status] || statusMap.draft;
    };

    const isExpired = (quote: Quote) => {
        if (!quote.validUntil) return false;
        const validUntil = quote.validUntil.toDate ? quote.validUntil.toDate() : new Date(quote.validUntil);
        return new Date() > validUntil;
    };

    const isPending = (quote: Quote) => {
        return ['sent', 'viewed'].includes(quote.status) && !isExpired(quote);
    };

    const filteredQuotes = quotes.filter(quote => {
        if (filter === 'pending') return isPending(quote);
        if (filter === 'approved') return quote.status === 'approved';
        if (filter === 'declined') return quote.status === 'declined';
        return true;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Quotes</h1>
                    <p className="text-gray-600">View and respond to service quotes</p>
                </div>

                {/* Filter Tabs */}
                <div className="flex bg-gray-100 rounded-lg p-1">
                    {[
                        { value: 'all', label: 'All' },
                        { value: 'pending', label: 'Pending' },
                        { value: 'approved', label: 'Approved' },
                        { value: 'declined', label: 'Declined' }
                    ].map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setFilter(f.value as any)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition ${filter === f.value
                                ? 'bg-white shadow text-gray-900'
                                : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Quote Cards */}
            {filteredQuotes.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-2">
                        {filter === 'all'
                            ? 'No quotes found'
                            : filter === 'pending'
                                ? 'No pending quotes'
                                : filter === 'approved'
                                    ? 'No approved quotes yet'
                                    : 'No declined quotes'}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredQuotes.map((quote) => {
                        const statusInfo = getStatusInfo(quote.status);
                        const StatusIcon = statusInfo.icon;
                        const needsResponse = isPending(quote);
                        const expired = isExpired(quote);

                        return (
                            <Link
                                key={quote.id}
                                to={`/quote/${quote.id}`}
                                className="block bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition"
                            >
                                <div className="p-6">
                                    {/* Header with Status */}
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <FileText className="w-5 h-5 text-gray-400" />
                                                <h3 className="font-semibold text-gray-900 text-lg">
                                                    {quote.quoteNumber}
                                                </h3>
                                                {needsResponse && (
                                                    <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                                                        Action Required
                                                    </span>
                                                )}
                                                {expired && (
                                                    <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                                                        Expired
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-gray-600 text-sm line-clamp-2">
                                                {quote.scopeOfWork}
                                            </p>
                                        </div>
                                        <span className={`px-3 py-1 text-sm font-medium rounded-full border whitespace-nowrap flex items-center gap-1.5 ${statusInfo.color}`}>
                                            <StatusIcon className="w-4 h-4" />
                                            {statusInfo.label}
                                        </span>
                                    </div>

                                    {/* Quote Details */}
                                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                                        <div className="flex items-center gap-1.5">
                                            <DollarSign className="w-4 h-4" />
                                            <span className="font-semibold text-gray-900">${quote.total.toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="w-4 h-4" />
                                            <span>Created {formatDate(quote.createdAt)}</span>
                                        </div>
                                        {quote.validUntil && (
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="w-4 h-4" />
                                                <span>Valid until {formatDate(quote.validUntil)}</span>
                                            </div>
                                        )}
                                        {quote.estimatedDuration && (
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="w-4 h-4" />
                                                <span>{Math.floor(quote.estimatedDuration / 60)}h {quote.estimatedDuration % 60}m</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Line Items Preview */}
                                    {quote.lineItems && quote.lineItems.length > 0 && (
                                        <div className="mt-4 pt-4 border-t">
                                            <p className="text-xs text-gray-500 mb-2">
                                                {quote.lineItems.length} item{quote.lineItems.length !== 1 ? 's' : ''}:
                                            </p>
                                            <div className="space-y-1">
                                                {quote.lineItems.slice(0, 3).map((item, idx) => (
                                                    <div key={idx} className="flex justify-between text-sm">
                                                        <span className="text-gray-700 truncate">{item.description}</span>
                                                        <span className="text-gray-900 ml-2">${item.total.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                                {quote.lineItems.length > 3 && (
                                                    <p className="text-xs text-gray-400">+{quote.lineItems.length - 3} more</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Action Footer */}
                                {needsResponse && (
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t px-6 py-3 flex items-center justify-between">
                                        <span className="text-sm text-blue-900 font-medium">
                                            Click to review and respond to this quote
                                        </span>
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                )}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
