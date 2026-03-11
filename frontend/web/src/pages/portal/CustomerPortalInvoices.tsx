/**
 * CustomerPortalInvoices - Customer's invoices with payment integration
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePortalContext } from './CustomerPortalLayout';
import { db } from '../../firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { Invoice } from '../../types';
import toast from 'react-hot-toast';

// Invoice List Component
export const CustomerPortalInvoices: React.FC = () => {
    const { customer } = usePortalContext();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'open' | 'paid'>('all');

    useEffect(() => {
        const fetchInvoices = async () => {
            if (!customer) {
                setLoading(false);
                return;
            }

            try {
                const invoicesQuery = query(
                    collection(db, 'invoices'),
                    where('customer_id', '==', customer.id),
                    orderBy('createdAt', 'desc')
                );
                const snapshot = await getDocs(invoicesQuery);
                setInvoices(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
            } catch (error) {
                console.error('Error fetching invoices:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchInvoices();
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

    const getStatusInfo = (status: string) => {
        const info: Record<string, { color: string; icon: string }> = {
            draft: { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: '📝' },
            sent: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: '📤' },
            paid: { color: 'bg-green-100 text-green-800 border-green-200', icon: '✅' },
            overdue: { color: 'bg-red-100 text-red-800 border-red-200', icon: '⚠️' }
        };
        return info[status] || info.draft;
    };

    const filteredInvoices = invoices.filter(inv => {
        if (filter === 'open') {
            return ['sent', 'overdue'].includes(inv.status);
        }
        if (filter === 'paid') {
            return inv.status === 'paid';
        }
        return true;
    });

    const totalOutstanding = invoices
        .filter(inv => ['sent', 'overdue'].includes(inv.status))
        .reduce((sum, inv) => sum + (inv.total || inv.amount || 0), 0);

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
                    <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
                    <p className="text-gray-600">View and pay your invoices</p>
                </div>

                {/* Summary Card */}
                {totalOutstanding > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
                        <p className="text-sm text-orange-600">Outstanding Balance</p>
                        <p className="text-xl font-bold text-orange-700">${totalOutstanding.toLocaleString()}</p>
                    </div>
                )}
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
                {[
                    { key: 'all', label: 'All' },
                    { key: 'open', label: 'Open' },
                    { key: 'paid', label: 'Paid' }
                ].map((f) => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key as any)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition ${filter === f.key
                                ? 'bg-white shadow text-gray-900'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Invoice List */}
            {filteredInvoices.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                    <p className="text-gray-500">
                        {filter === 'all'
                            ? 'No invoices found'
                            : filter === 'open'
                                ? 'No open invoices'
                                : 'No paid invoices'}
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Invoice
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Date
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Due Date
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Amount
                                    </th>
                                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Action
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredInvoices.map((invoice) => {
                                    const statusInfo = getStatusInfo(invoice.status);
                                    return (
                                        <tr key={invoice.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4">
                                                <Link
                                                    to={`/portal/invoices/${invoice.id}`}
                                                    className="font-medium text-blue-600 hover:text-blue-800"
                                                >
                                                    #{invoice.id.substring(0, 8).toUpperCase()}
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {formatDate(invoice.createdAt)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {formatDate(invoice.dueDate)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${statusInfo.color}`}>
                                                    <span>{statusInfo.icon}</span>
                                                    {invoice.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-semibold text-gray-900">
                                                ${(invoice.total || invoice.amount || 0).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {['sent', 'overdue'].includes(invoice.status) ? (
                                                    <Link
                                                        to={`/portal/invoices/${invoice.id}`}
                                                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                                                    >
                                                        Pay Now
                                                    </Link>
                                                ) : (
                                                    <Link
                                                        to={`/portal/invoices/${invoice.id}`}
                                                        className="text-sm text-gray-500 hover:text-gray-700"
                                                    >
                                                        View
                                                    </Link>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// Invoice Detail Component
export const CustomerPortalInvoiceDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { customer, organization } = usePortalContext();
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [paymentLoading, setPaymentLoading] = useState(false);

    useEffect(() => {
        const fetchInvoice = async () => {
            if (!id) {
                setLoading(false);
                return;
            }

            try {
                const invoiceDoc = await getDoc(doc(db, 'invoices', id));
                if (invoiceDoc.exists()) {
                    const invoiceData = { id: invoiceDoc.id, ...invoiceDoc.data() } as Invoice;
                    // Verify customer owns this invoice
                    if (invoiceData.customer_id === customer?.id) {
                        setInvoice(invoiceData);
                    }
                }
            } catch (error) {
                console.error('Error fetching invoice:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchInvoice();
    }, [id, customer]);

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const handlePayment = async () => {
        setPaymentLoading(true);

        // In production, this would redirect to Stripe or a payment processor
        try {
            // Simulate payment process
            toast.success('Redirecting to payment...');

            // TODO: Integrate with Stripe
            // const response = await createPaymentSession(invoice.id);
            // window.location.href = response.checkoutUrl;

            setTimeout(() => {
                toast.error('Payment integration coming soon!');
                setPaymentLoading(false);
            }, 1500);
        } catch (error) {
            toast.error('Failed to initiate payment');
            setPaymentLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!invoice) {
        return (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Invoice Not Found</h2>
                <p className="text-gray-600 mb-4">This invoice doesn't exist or you don't have access to it.</p>
                <Link to="/portal/invoices" className="text-blue-600 hover:text-blue-800">
                    ← Back to Invoices
                </Link>
            </div>
        );
    }

    const isPaid = invoice.status === 'paid';
    const isOverdue = invoice.status === 'overdue';

    return (
        <div className="space-y-6">
            {/* Back Link */}
            <Link to="/portal/invoices" className="inline-flex items-center text-gray-600 hover:text-gray-900">
                ← Back to Invoices
            </Link>

            {/* Invoice Header */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                {/* Status Banner */}
                {isPaid && (
                    <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center gap-2">
                        <span className="text-green-600">✅</span>
                        <span className="text-green-800 font-medium">This invoice has been paid</span>
                    </div>
                )}
                {isOverdue && (
                    <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-2">
                        <span className="text-red-600">⚠️</span>
                        <span className="text-red-800 font-medium">This invoice is overdue</span>
                    </div>
                )}

                <div className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                        {/* Company Info */}
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-1">
                                Invoice #{invoice.id.substring(0, 8).toUpperCase()}
                            </h1>
                            <p className="text-gray-600">
                                {organization?.branding?.companyName || organization?.name || 'Service Provider'}
                            </p>
                        </div>

                        {/* Payment CTA */}
                        {!isPaid && (
                            <div className="bg-gray-50 rounded-xl p-6 text-center lg:text-right">
                                <p className="text-sm text-gray-500 mb-1">Amount Due</p>
                                <p className="text-3xl font-bold text-gray-900 mb-4">
                                    ${(invoice.total || invoice.amount || 0).toLocaleString()}
                                </p>
                                <button
                                    onClick={handlePayment}
                                    disabled={paymentLoading}
                                    className="w-full lg:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                                >
                                    {paymentLoading ? 'Processing...' : 'Pay Now'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Invoice Details */}
                    <div className="grid sm:grid-cols-3 gap-6 mt-6 pt-6 border-t">
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Invoice Date</p>
                            <p className="font-medium text-gray-900">{formatDate(invoice.createdAt)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Due Date</p>
                            <p className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                                {formatDate(invoice.dueDate)}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Status</p>
                            <p className="font-medium text-gray-900">{invoice.status.toUpperCase()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-6 border-b">
                    <h2 className="font-semibold text-gray-900">Line Items</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                                    Description
                                </th>
                                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                                    Qty
                                </th>
                                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                                    Unit Price
                                </th>
                                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                                    Total
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {invoice.items?.map((item, idx) => (
                                <tr key={idx}>
                                    <td className="px-6 py-4 text-gray-900">
                                        {item.description}
                                    </td>
                                    <td className="px-6 py-4 text-right text-gray-600">
                                        {item.quantity || 1}
                                    </td>
                                    <td className="px-6 py-4 text-right text-gray-600">
                                        ${(item.unit_price || item.amount || 0).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                                        ${(item.total || item.amount || 0).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t">
                            <tr>
                                <td colSpan={3} className="px-6 py-4 text-right font-semibold text-gray-900">
                                    Total
                                </td>
                                <td className="px-6 py-4 text-right text-xl font-bold text-gray-900">
                                    ${(invoice.total || invoice.amount || 0).toLocaleString()}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Payment Methods */}
            {!isPaid && (
                <div className="bg-blue-50 rounded-xl p-6">
                    <h3 className="font-semibold text-blue-900 mb-4">Payment Methods</h3>
                    <div className="grid sm:grid-cols-3 gap-4">
                        <div className="bg-white rounded-lg p-4 text-center">
                            <span className="text-2xl mb-2 block">💳</span>
                            <p className="font-medium text-gray-900">Credit Card</p>
                            <p className="text-sm text-gray-500">Pay online securely</p>
                        </div>
                        <div className="bg-white rounded-lg p-4 text-center">
                            <span className="text-2xl mb-2 block">🏦</span>
                            <p className="font-medium text-gray-900">Bank Transfer</p>
                            <p className="text-sm text-gray-500">ACH / Wire</p>
                        </div>
                        <div className="bg-white rounded-lg p-4 text-center">
                            <span className="text-2xl mb-2 block">📨</span>
                            <p className="font-medium text-gray-900">Check</p>
                            <p className="text-sm text-gray-500">Mail to office</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
