import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { X, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../auth/AuthProvider';
import { Invoice } from '../../types';

interface CreateInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
}

interface InvoiceItemDraft {
    description: string;
    quantity: number;
    unitPrice: number;
}

export const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({ isOpen, onClose, onCreated }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState<{ id: string, name: string, address: string, email?: string }[]>([]);

    // Form State
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [items, setItems] = useState<InvoiceItemDraft[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
    const [dueDate, setDueDate] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (isOpen && user?.org_id) {
            loadCustomers();
        }
    }, [isOpen, user?.org_id]);

    const loadCustomers = async () => {
        try {
            // In a real app, this might search dynamically. For now, fetch all (or top 50)
            // Assuming we have a customers collection. If not, we might need to mock or fetch from jobs?
            // Let's assume a 'customers' collection exists as per types.
            const q = query(collection(db, 'customers'), where('org_id', '==', user?.org_id));
            const snapshot = await getDocs(q);
            setCustomers(snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as any)));
        } catch (err) {
            console.error("Error loading customers:", err);
            // Fallback: If no customers collection, maybe allow free text or fetch from jobs?
            // For now, let's just toast if empty
        }
    };

    const handleAddItem = () => {
        setItems([...items, { description: '', quantity: 1, unitPrice: 0 }]);
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof InvoiceItemDraft, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const calculateTotal = () => {
        return items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.org_id || !selectedCustomerId) {
            toast.error('Please select a customer');
            return;
        }

        setLoading(true);
        try {
            const customer = customers.find(c => c.id === selectedCustomerId);
            const total = calculateTotal();

            const defaultTaxRate = (user as any).organization?.settings?.defaultTaxRate || 0;
            const taxAmount = total * (defaultTaxRate / 100);
            const grandTotal = total + taxAmount;

            const invoiceData: Omit<Invoice, 'id'> = {
                org_id: user.org_id,
                customer_id: selectedCustomerId,
                customer: {
                    name: customer?.name || 'Unknown',
                    address: customer?.address || '',
                    email: customer?.email
                },
                items: items.map(item => ({
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    amount: item.quantity * item.unitPrice, // Individual line total
                    total: item.quantity * item.unitPrice   // Redundant but matches type
                })),
                total: grandTotal,
                subtotal: total,
                tax_amount: taxAmount,
                balance_due: grandTotal,
                status: 'draft',
                createdAt: serverTimestamp(),
                dueDate: dueDate ? new Date(dueDate) : null,
                payments_applied: 0
            };

            await addDoc(collection(db, 'invoices'), invoiceData);
            toast.success('Invoice created successfully');
            onCreated();
            onClose();

            // Reset form
            setItems([{ description: '', quantity: 1, unitPrice: 0 }]);
            setSelectedCustomerId('');
            setDueDate('');

        } catch (err) {
            console.error(err);
            toast.error('Failed to create invoice');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-xl font-bold text-gray-800">Create New Invoice</h2>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Customer Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                        <select
                            value={selectedCustomerId}
                            onChange={(e) => setSelectedCustomerId(e.target.value)}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                            required
                        >
                            <option value="">Select a Customer</option>
                            {customers.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        {customers.length === 0 && (
                            <p className="text-xs text-amber-600 mt-1">No customers found. (Ensure customers exist in database)</p>
                        )}
                    </div>

                    {/* Dates */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Line Items */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-gray-700">Line Items</label>
                            <button
                                type="button"
                                onClick={handleAddItem}
                                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" /> Add Item
                            </button>
                        </div>

                        <div className="space-y-3">
                            {items.map((item, index) => (
                                <div key={index} className="flex gap-3 items-start p-3 bg-gray-50 rounded-lg">
                                    <div className="flex-grow">
                                        <input
                                            type="text"
                                            placeholder="Description"
                                            value={item.description}
                                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                                            className="w-full p-2 border rounded mb-2 text-sm"
                                            required
                                        />
                                        <div className="flex gap-2">
                                            <div className="w-24">
                                                <input
                                                    type="number"
                                                    placeholder="Qty"
                                                    value={item.quantity}
                                                    onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value))}
                                                    className="w-full p-2 border rounded text-sm"
                                                    min="0.1"
                                                    step="0.1"
                                                    required
                                                />
                                            </div>
                                            <div className="w-32">
                                                <input
                                                    type="number"
                                                    placeholder="Price"
                                                    value={item.unitPrice}
                                                    onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value))}
                                                    className="w-full p-2 border rounded text-sm"
                                                    min="0"
                                                    step="0.01"
                                                    required
                                                />
                                            </div>
                                            <div className="flex-grow flex items-center justify-end text-sm font-medium text-gray-700">
                                                ${(item.quantity * item.unitPrice).toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                    {items.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveItem(index)}
                                            className="p-2 text-red-500 hover:bg-red-50 rounded"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Total */}
                    <div className="flex justify-end pt-4 border-t">
                        <div className="text-right">
                            <span className="text-gray-600 mr-4">Total Amount:</span>
                            <span className="text-2xl font-bold text-gray-900">${calculateTotal().toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                            Create Invoice
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
