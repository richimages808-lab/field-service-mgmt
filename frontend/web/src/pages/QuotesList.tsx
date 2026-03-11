import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { FileText, Clock, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Quote {
    id: string;
    jobId: string;
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
    status: 'draft' | 'sent' | 'approved' | 'rejected';
    createdAt: Timestamp;
    validUntil?: Timestamp;
}

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
            const quotesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Quote[];

            setQuotes(quotesData);
        } catch (error) {
            console.error('Error loading quotes:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'draft':
                return <Clock className="w-5 h-5 text-gray-500" />;
            case 'sent':
                return <FileText className="w-5 h-5 text-blue-500" />;
            case 'approved':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'rejected':
                return <XCircle className="w-5 h-5 text-red-500" />;
            default:
                return <FileText className="w-5 h-5 text-gray-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'draft':
                return 'bg-gray-100 text-gray-800';
            case 'sent':
                return 'bg-blue-100 text-blue-800';
            case 'approved':
                return 'bg-green-100 text-green-800';
            case 'rejected':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const filteredQuotes = filter === 'all'
        ? quotes
        : quotes.filter(q => q.status === filter);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Quotes</h1>
                <p className="mt-2 text-sm text-gray-600">
                    Manage all customer quotes and proposals
                </p>
            </div>

            {/* Filter Tabs */}
            <div className="mb-6 border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    {['all', 'draft', 'sent', 'approved', 'rejected'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`
                py-4 px-1 border-b-2 font-medium text-sm
                ${filter === status
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }
              `}
                        >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                            {status === 'all' && ` (${quotes.length})`}
                            {status !== 'all' && ` (${quotes.filter(q => q.status === status).length})`}
                        </button>
                    ))}
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
                            : `No ${filter} quotes found.`}
                    </p>
                </div>
            ) : (
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <ul className="divide-y divide-gray-200">
                        {filteredQuotes.map((quote) => (
                            <li key={quote.id}>
                                <div
                                    className="px-4 py-4 sm:px-6 hover:bg-gray-50 cursor-pointer"
                                    onClick={() => navigate(`/quote/${quote.id}`)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            {getStatusIcon(quote.status)}
                                            <div className="ml-3">
                                                <p className="text-sm font-medium text-gray-900">
                                                    {quote.customer.name}
                                                </p>
                                                <p className="text-sm text-gray-500">
                                                    {quote.customer.email}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-4">
                                            <div className="text-right">
                                                <p className="text-sm font-semibold text-gray-900 flex items-center">
                                                    <DollarSign className="w-4 h-4" />
                                                    {quote.total.toFixed(2)}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {quote.createdAt?.toDate?.().toLocaleDateString()}
                                                </p>
                                            </div>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                                                {quote.status}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-2">
                                        <p className="text-sm text-gray-600">
                                            {quote.lineItems.length} line item{quote.lineItems.length !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
