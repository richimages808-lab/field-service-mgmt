import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { X, Save, Loader2 } from 'lucide-react';

interface AddCustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdded: () => void;
    customerToEdit?: any;
}

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ isOpen, onClose, onAdded, customerToEdit }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    
    // Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [terms, setTerms] = useState('net30');

    React.useEffect(() => {
        if (customerToEdit) {
            setName(customerToEdit.name || '');
            setEmail(customerToEdit.email === 'N/A' ? '' : customerToEdit.email || '');
            setPhone(customerToEdit.phone === 'N/A' ? '' : customerToEdit.phone || '');
            setAddress(customerToEdit.address === 'N/A' ? '' : customerToEdit.address || '');
            setTerms(customerToEdit.billingTerms || 'net30');
        } else {
            setName(''); setEmail(''); setPhone(''); setAddress(''); setTerms('net30');
        }
    }, [customerToEdit, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.org_id) return;
        
        setLoading(true);
        try {
            const data = {
                org_id: user.org_id,
                name: name,
                email: email,
                phone: phone,
                address: address,
                billing: { terms: terms }
            };

            if (customerToEdit && customerToEdit.id && customerToEdit.id !== customerToEdit.name) {
                // Update real customer record
                await updateDoc(doc(db, 'customers', customerToEdit.id), {
                    ...data,
                    updatedAt: serverTimestamp()
                });
            } else {
                // Create new record
                await addDoc(collection(db, 'customers'), {
                    ...data,
                    createdAt: serverTimestamp()
                });
            }
            onAdded();
            onClose();
            // Reset
            setName(''); setEmail(''); setPhone(''); setAddress(''); setTerms('net30');
        } catch (error) {
            console.error("Error adding customer:", error);
            alert("Failed to add customer");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800">{customerToEdit ? 'Edit Customer' : 'Add New Customer'}</h2>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required 
                               className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} 
                                   className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} 
                                   className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Primary Address</label>
                        <input type="text" value={address} onChange={e => setAddress(e.target.value)} 
                               className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500" />
                    </div>
                    
                    <div className="border-t pt-4 mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Billing Terms *</label>
                        <select value={terms} onChange={e => setTerms(e.target.value)} required
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500">
                            <option value="due_on_receipt">Due on Receipt</option>
                            <option value="net15">Net 15</option>
                            <option value="net30">Net 30</option>
                            <option value="net60">Net 60</option>
                            <option value="net90">Net 90</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">This will be used to automatically set the invoice due dates for this customer.</p>
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
                        <button type="button" onClick={onClose} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="flex-1 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium flex justify-center items-center">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Save Customer</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
