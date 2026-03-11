import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Invoice } from '../types';

import { RecordPaymentModal } from '../components/invoices/RecordPaymentModal';
import { toast } from 'react-hot-toast';
import { Check, Loader2 } from 'lucide-react';

export const InvoiceDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentModalProps, setPaymentModalProps] = useState<{ initialAmount?: number; initialNotes?: string }>({});

    const [quote, setQuote] = useState<any>(null);

    useEffect(() => {
        if (!id) return;
        const fetchInvoice = async () => {
            const docRef = doc(db, 'invoices', id);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const invoiceData = { id: snap.id, ...snap.data() } as Invoice;
                setInvoice(invoiceData);

                // Fetch linked quote if exists
                if ((invoiceData as any).source_quote_id) {
                    const quoteSnap = await getDoc(doc(db, 'quotes', (invoiceData as any).source_quote_id));
                    if (quoteSnap.exists()) {
                        setQuote({ id: quoteSnap.id, ...quoteSnap.data() } as any);
                    }
                }
            }
            setLoading(false);
        };
        fetchInvoice();
    }, [id]);

    const handleSendInvoice = async () => {
        if (!invoice || !id) return;
        if (!window.confirm('Sending this invoice will LOCK it from further editing. Continue?')) return;

        setLoading(true); // Re-using loading state for processing
        try {
            await updateDoc(doc(db, 'invoices', id), {
                status: 'sent',
                is_locked: true,
                sentAt: serverTimestamp()
            });
            toast.success('Invoice sent and locked.');
            // Refresh
            const snap = await getDoc(doc(db, 'invoices', id));
            if (snap.exists()) setInvoice({ id: snap.id, ...snap.data() } as Invoice);
        } catch (err) {
            console.error(err);
            toast.error('Failed to send invoice');
        } finally {
            setLoading(false);
        }
    };

    const handleVoidInvoice = async () => {
        if (!invoice || !id) return;
        if (!window.confirm('Are you sure you want to VOID this invoice? This action cannot be undone.')) return;

        setLoading(true);
        try {
            await updateDoc(doc(db, 'invoices', id), {
                status: 'void',
                voidedAt: serverTimestamp()
            });
            toast.success('Invoice voided.');
            // Refresh
            const snap = await getDoc(doc(db, 'invoices', id));
            if (snap.exists()) setInvoice({ id: snap.id, ...snap.data() } as Invoice);
        } catch (err) {
            console.error(err);
            toast.error('Failed to void invoice');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-8 h-8 text-blue-600" /></div>;
    if (!invoice) return <div>Invoice not found</div>;

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="mb-6 flex justify-between items-center">
                <Link to="/invoices" className="text-blue-600 hover:underline">&larr; Back to Invoices</Link>
                {invoice.status === 'void' && (
                    <span className="bg-red-100 text-red-800 px-4 py-2 rounded-full font-bold border border-red-200">
                        VOIDED
                    </span>
                )}
                {invoice.is_locked && invoice.status !== 'void' && (
                    <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-semibold border border-gray-300 flex items-center gap-1">
                        <Check className="w-3 h-3" /> LOCKED
                    </span>
                )}
            </div>

            <div className={`bg-white shadow rounded-lg p-8 ${invoice.status === 'void' ? 'opacity-75 grayscale' : ''}`}>
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-800">INVOICE</h1>
                        <p className="text-gray-500 mt-1">#{invoice.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-gray-600 font-semibold">Amount Due</div>
                        <div className="text-3xl font-bold text-gray-900">${invoice.total?.toFixed(2)}</div>
                        <div className={`mt-2 inline-block px-3 py-1 rounded-full text-sm font-semibold ${invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                            invoice.status === 'void' ? 'bg-red-100 text-red-800 line-through' :
                                'bg-yellow-100 text-yellow-800'
                            }`}>
                            {invoice.status?.toUpperCase()}
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-200 py-6">
                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-gray-600 font-semibold mb-2">Bill To:</h3>
                            <p className="text-gray-900">{invoice.customer?.name}</p>
                            <p className="text-gray-600 whitespace-pre-line">{invoice.customer?.address}</p>
                        </div>
                        <div className="text-right">
                            <h3 className="text-gray-600 font-semibold mb-2">Details:</h3>
                            <p><span className="text-gray-600">Date:</span> {invoice.createdAt?.toDate ? invoice.createdAt.toDate().toLocaleDateString() : 'N/A'}</p>
                            <p><span className="text-gray-600">Due Date:</span> {invoice.dueDate?.toDate ? invoice.dueDate.toDate().toLocaleDateString() : 'N/A'}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-8">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-200">
                                <th className="text-left py-3 text-gray-600">Description</th>
                                <th className="text-right py-3 text-gray-600">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.items?.map((item: any, idx: number) => (
                                <tr key={idx} className="border-b border-gray-100">
                                    <td className="py-4">{item.description}</td>
                                    <td className="py-4 text-right">${item.amount?.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td className="pt-4 text-right font-semibold">Total</td>
                                <td className="pt-4 text-right font-bold">${invoice.total?.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="mt-8 border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Payment History</h3>
                    {invoice.payments_applied ? (
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="flex justify-between text-sm text-gray-600 mb-2">
                                <span>Total Paid:</span>
                                <span className="font-medium text-green-600">${invoice.payments_applied.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Balance Due:</span>
                                <span className="font-bold text-red-600">${(invoice.balance_due ?? 0).toFixed(2)}</span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm">No payments recorded yet.</p>
                    )}
                </div>

                <div className="mt-8 flex justify-end gap-3 no-print">
                    {invoice.status !== 'void' && invoice.status !== 'paid' && (
                        <>
                            {quote?.agreement?.requiresDeposit && (invoice.payments_applied || 0) < (quote.agreement.depositAmount || 0) && (
                                <button
                                    onClick={() => {
                                        setPaymentModalProps({
                                            initialAmount: quote.agreement.depositAmount,
                                            initialNotes: 'Deposit Payment'
                                        });
                                        setIsPaymentModalOpen(true);
                                    }}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
                                >
                                    Record Deposit
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setPaymentModalProps({});
                                    setIsPaymentModalOpen(true);
                                }}
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                                disabled={invoice.status === 'paid' as any}
                            >
                                Record Payment
                            </button>
                        </>
                    )}

                    <button className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50">
                        Download PDF
                    </button>

                    {!invoice.is_locked && (
                        <button
                            onClick={handleSendInvoice}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                        >
                            Send & Lock
                        </button>
                    )}

                    {invoice.is_locked && invoice.status !== 'void' && (
                        <button
                            onClick={handleVoidInvoice}
                            className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded font-medium"
                        >
                            Void Invoice
                        </button>
                    )}
                </div>
            </div>
            {invoice && (
                <RecordPaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    invoice={invoice}
                    onPaymentRecorded={() => window.location.reload()}
                    initialAmount={paymentModalProps.initialAmount}
                    initialNotes={paymentModalProps.initialNotes}
                />
            )}
        </div>
    );
};
