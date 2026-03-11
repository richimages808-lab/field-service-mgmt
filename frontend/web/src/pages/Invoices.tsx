import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Invoice } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { generateInvoicesForLastMonth } from '../lib/billing';
import { CreateInvoiceModal } from '../components/invoices/CreateInvoiceModal';
import { Plus } from 'lucide-react';

export const Invoices: React.FC = () => {
    const { user } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [viewMode, setViewMode] = useState<'individual' | 'grouped'>('individual');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    useEffect(() => {
        if (!user) return;
        const orgId = 'demo-org'; // Mocked

        const q = query(
            collection(db, 'invoices'),
            where('org_id', '==', orgId)
            // orderBy('createdAt', 'desc') // Removed to avoid index issues
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
            // Client-side sort
            list.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
                return dateB.getTime() - dateA.getTime(); // Descending
            });
            setInvoices(list);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            await generateInvoicesForLastMonth('demo-org');
        } catch (e) {
            console.error(e);
        } finally {
            setGenerating(false);
        }
    };

    const handleMarkPaid = async (invoiceId: string) => {
        if (!confirm('Mark this invoice as PAID?')) return;
        try {
            await updateDoc(doc(db, 'invoices', invoiceId), { status: 'paid' });
        } catch (e) {
            console.error("Error updating invoice:", e);
            alert("Failed to update invoice");
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Invoices</h1>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Create Invoice
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
                    >
                        {generating ? 'Generating...' : 'Generate Monthly Invoices'}
                    </button>
                </div>
            </div>

            <div className="mb-4 flex justify-end">
                <div className="bg-gray-200 p-1 rounded inline-flex">
                    <button
                        onClick={() => setViewMode('individual')}
                        className={`px-4 py-1 rounded text-sm font-medium ${viewMode === 'individual' ? 'bg-white shadow text-gray-800' : 'text-gray-600 hover:text-gray-800'}`}
                    >
                        Individual
                    </button>
                    <button
                        onClick={() => setViewMode('grouped')}
                        className={`px-4 py-1 rounded text-sm font-medium ${viewMode === 'grouped' ? 'bg-white shadow text-gray-800' : 'text-gray-600 hover:text-gray-800'}`}
                    >
                        Rolled Up (By Customer)
                    </button>
                </div>
            </div>

            <div className="bg-white rounded shadow overflow-hidden">
                <table className="min-w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {viewMode === 'individual' ? (
                            invoices.map(invoice => (
                                <tr key={invoice.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {invoice.createdAt?.toDate ? invoice.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">{invoice.customer?.name || 'Unknown'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">${invoice.total?.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${invoice.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                            }`}>
                                            {invoice.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        <Link to={`/invoices/${invoice.id}`} className="text-indigo-600 hover:text-indigo-900">View</Link>
                                        {invoice.status !== 'paid' && (
                                            <button
                                                onClick={() => handleMarkPaid(invoice.id)}
                                                className="text-green-600 hover:text-green-900"
                                            >
                                                Mark Paid
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            Object.values(invoices.reduce((acc, inv) => {
                                const name = inv.customer?.name || 'Unknown';
                                if (!acc[name]) {
                                    acc[name] = {
                                        id: `group-${name}`,
                                        customerName: name,
                                        count: 0,
                                        total: 0,
                                        status: 'mixed' as any
                                    };
                                }
                                acc[name].count++;
                                acc[name].total += inv.total || 0;
                                return acc;
                            }, {} as Record<string, { id: string, customerName: string, count: number, total: number, status: string }>)).map(group => (
                                <tr key={group.id} className="bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-500">
                                        Various
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap font-bold">{group.customerName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap font-bold">${group.total.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                            {group.count} Invoices
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <span className="text-gray-400 cursor-not-allowed">View Details</span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                {invoices.length === 0 && (
                    <div className="p-6 text-center text-gray-500">No invoices found.</div>
                )}
            </div>

            <CreateInvoiceModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onCreated={() => {
                    // Start generating/refreshing or just let onSnapshot handle it?
                    // onSnapshot will handle it automatically
                }}
            />
        </div>
    );
};
