import React, { useState, useEffect } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, RefreshCw, AlertCircle, History } from 'lucide-react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { format } from 'date-fns';

interface Transaction {
    id: string;
    type: 'restock' | 'correction' | 'job_usage' | 'return';
    quantity_change: number;
    quantity_after: number;
    performed_by: string; // User ID
    notes?: string;
    reference_id?: string; // Job ID or other ref
    createdAt: any;
}

interface TransactionHistoryModalProps {
    itemId: string;
    itemName: string;
    isOpen: boolean;
    onClose: () => void;
}

export const TransactionHistoryModal: React.FC<TransactionHistoryModalProps> = ({
    itemId, itemName, isOpen, onClose
}) => {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && itemId) {
            loadHistory();
        }
    }, [isOpen, itemId]);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'inventory_transactions'),
                where('item_id', '==', itemId),
                orderBy('createdAt', 'desc'),
                limit(50)
            );
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Transaction));
            setTransactions(data);
        } catch (error) {
            console.error("Error loading history:", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'restock': return <ArrowUpRight className="w-4 h-4 text-green-600" />;
            case 'job_usage': return <ArrowDownLeft className="w-4 h-4 text-blue-600" />;
            case 'return': return <RefreshCw className="w-4 h-4 text-amber-600" />;
            case 'correction': return <AlertCircle className="w-4 h-4 text-amber-600" />;
            default: return <History className="w-4 h-4 text-gray-500" />;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'restock': return 'Restock';
            case 'job_usage': return 'Job Usage';
            case 'return': return 'Return';
            case 'correction': return 'Correction';
            default: return type;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <History className="w-5 h-5 text-gray-500" />
                        History: {itemName}
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="text-center py-8 text-gray-500">Loading history...</div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed">
                            No transaction history found for this item.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {transactions.map(tx => (
                                <div key={tx.id} className="border rounded-lg p-3 flex justify-between items-start hover:bg-gray-50 transition-colors">
                                    <div className="flex gap-3">
                                        <div className={`mt-1 p-1.5 rounded-full bg-gray-100`}>
                                            {getTypeIcon(tx.type)}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-gray-900 flex items-center gap-2">
                                                {getTypeLabel(tx.type)}
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${tx.quantity_change > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                    {tx.quantity_change > 0 ? '+' : ''}{tx.quantity_change}
                                                </span>
                                            </div>
                                            <div className="text-sm text-gray-600 mt-0.5">
                                                {tx.notes || 'No notes provided'}
                                            </div>
                                            {tx.reference_id && (
                                                <div className="text-xs text-blue-600 mt-1">
                                                    Ref: {tx.reference_id}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-gray-500">
                                            {tx.createdAt?.toDate ? format(tx.createdAt.toDate(), 'MMM d, yyyy h:mm a') : 'Just now'}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            Stock after: {tx.quantity_after ?? 'N/A'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
