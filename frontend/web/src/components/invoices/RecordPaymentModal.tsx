import React, { useState } from 'react';
import { db } from '../../firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp, increment } from 'firebase/firestore';
import { Invoice, Payment } from '../../types';
import { X, Check, Loader2, CreditCard, Banknote, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../auth/AuthProvider';

interface RecordPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: Invoice;
    onPaymentRecorded: () => void;
    initialAmount?: number;
    initialNotes?: string;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({ isOpen, onClose, invoice, onPaymentRecorded, initialAmount, initialNotes }) => {
    const { user } = useAuth();
    const [amount, setAmount] = useState(initialAmount || invoice.balance_due || invoice.total);
    const [method, setMethod] = useState<Payment['method']>('check');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState(initialNotes || '');
    const [processing, setProcessing] = useState(false);

    React.useEffect(() => {
        if (isOpen) {
            setAmount(initialAmount || invoice.balance_due || invoice.total);
            setNotes(initialNotes || '');
        }
    }, [isOpen, initialAmount, initialNotes, invoice]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !amount) return;

        setProcessing(true);
        try {
            // 1. Create Payment Record (The Ledger Entry)
            const paymentData: Omit<Payment, 'id'> = {
                invoice_id: invoice.id,
                amount: Number(amount),
                method,
                reference_number: reference,
                date: serverTimestamp(),
                notes,
                recorded_by: user.uid
            };

            await addDoc(collection(db, 'payments'), paymentData);

            // 2. Update Invoice Status & Balance
            const newBalance = (invoice.balance_due || invoice.total) - Number(amount);
            const newStatus = newBalance <= 0 ? 'paid' : 'partial';

            await updateDoc(doc(db, 'invoices', invoice.id), {
                payments_applied: increment(Number(amount)),
                balance_due: newBalance,
                status: newStatus,
                // If paid in full, maybe set paidAt?
            });

            toast.success('Payment recorded successfully');
            onPaymentRecorded();
            onClose();

        } catch (error) {
            console.error(error);
            toast.error('Failed to record payment');
        } finally {
            setProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="text-lg font-bold text-gray-800">Record Payment</h2>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="bg-blue-50 p-3 rounded-lg flex justify-between items-center">
                        <span className="text-sm text-blue-700">Balance Due:</span>
                        <span className="text-lg font-bold text-blue-900">${(invoice.balance_due || invoice.total).toFixed(2)}</span>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                        <input
                            type="number"
                            step="0.01"
                            required
                            max={invoice.balance_due || invoice.total}
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setMethod('card')}
                                className={`flex flex-col items-center justify-center p-3 rounded border ${method === 'card' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'hover:bg-gray-50'}`}
                            >
                                <CreditCard className="w-5 h-5 mb-1" />
                                <span className="text-xs">Card</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMethod('check')}
                                className={`flex flex-col items-center justify-center p-3 rounded border ${method === 'check' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'hover:bg-gray-50'}`}
                            >
                                <FileText className="w-5 h-5 mb-1" />
                                <span className="text-xs">Check</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMethod('cash')}
                                className={`flex flex-col items-center justify-center p-3 rounded border ${method === 'cash' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'hover:bg-gray-50'}`}
                            >
                                <Banknote className="w-5 h-5 mb-1" />
                                <span className="text-xs">Cash</span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reference # (Optional)</label>
                        <input
                            type="text"
                            placeholder="Check # or Transaction ID"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            rows={2}
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border text-gray-600 rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={processing}
                            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {processing ? <Loader2 className="animate-spin w-4 h-4" /> : <Check className="w-4 h-4" />}
                            Record Payment
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
