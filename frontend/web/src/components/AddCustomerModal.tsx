import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { X, Save, Loader2 } from 'lucide-react';

interface AddCustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdded: () => void;
    customerToEdit?: any;
    prefill?: any;
}

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ isOpen, onClose, onAdded, customerToEdit, prefill }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    
    // Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [terms, setTerms] = useState('net30');
    const [contactType, setContactType] = useState('Customer');

    React.useEffect(() => {
        if (customerToEdit) {
            setName(customerToEdit.name || '');
            setEmail(customerToEdit.email === 'N/A' ? '' : customerToEdit.email || '');
            setPhone(customerToEdit.phone === 'N/A' ? '' : customerToEdit.phone || '');
            setAddress(customerToEdit.address === 'N/A' ? '' : customerToEdit.address || '');
            setTerms(customerToEdit.billingTerms || 'net30');
            setContactType(customerToEdit.contactType || 'Customer');
        } else if (prefill) {
            setName(prefill.name || '');
            setEmail(prefill.email === 'N/A' ? '' : prefill.email || '');
            setPhone(prefill.phone === 'N/A' ? '' : prefill.phone || '');
            setAddress(prefill.address === 'N/A' ? '' : prefill.address || '');
            setTerms('net30');
            setContactType(prefill.contactType || 'Customer');
        } else {
            setName(''); setEmail(''); setPhone(''); setAddress(''); setTerms('net30'); setContactType('Customer');
        }
    }, [customerToEdit, prefill, isOpen]);

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
                contactType: contactType,
                billing: { terms: terms }
            };

            let customerId = '';
            let customerName = name;

            if (customerToEdit && customerToEdit.id && customerToEdit.id !== customerToEdit.name) {
                // Update real customer record
                customerId = customerToEdit.id;
                
                const docRef = doc(db, 'customers', customerId);
                const docSnap = await getDoc(docRef);
                const existingData: any = docSnap.exists() ? docSnap.data() : {};
                
                let updatedAddresses = existingData.addresses ? [...existingData.addresses] : [];
                let updatedContacts = existingData.contacts ? [...existingData.contacts] : [];
                
                if (address) {
                    const primaryAddrIndex = updatedAddresses.findIndex((a: any) => a.isDefault || a.type === 'primary');
                    if (primaryAddrIndex >= 0) {
                        updatedAddresses[primaryAddrIndex] = {
                            ...updatedAddresses[primaryAddrIndex],
                            street: address
                        };
                    } else {
                        updatedAddresses.push({
                            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
                            type: 'primary',
                            label: 'Primary Address',
                            street: address,
                            city: '',
                            state: '',
                            zip: '',
                            country: 'US',
                            isDefault: true
                        });
                    }
                }
                
                if (email || phone) {
                    const primaryContactIndex = updatedContacts.findIndex((c: any) => c.isDefault || c.type === 'primary');
                    if (primaryContactIndex >= 0) {
                        updatedContacts[primaryContactIndex] = {
                            ...updatedContacts[primaryContactIndex],
                            name: name,
                            email: email || '',
                            phone: phone || ''
                        };
                    } else {
                        updatedContacts.push({
                            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
                            name: name,
                            type: 'primary',
                            email: email || '',
                            phone: phone || '',
                            isDefault: true
                        });
                    }
                }

                await updateDoc(docRef, {
                    ...data,
                    addresses: updatedAddresses,
                    contacts: updatedContacts,
                    updatedAt: serverTimestamp()
                });
            } else {
                // Create new record
                const defaultAddressId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
                const defaultContactId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

                const docRef = await addDoc(collection(db, 'customers'), {
                    ...data,
                    addresses: address ? [
                        {
                            id: defaultAddressId,
                            type: 'primary',
                            label: 'Primary Address',
                            street: address,
                            city: '',
                            state: '',
                            zip: '',
                            country: 'US',
                            isDefault: true
                        }
                    ] : [],
                    primaryAddressId: address ? defaultAddressId : null,
                    contacts: (email || phone) ? [
                        {
                            id: defaultContactId,
                            name: name,
                            type: 'primary',
                            email: email || '',
                            phone: phone || '',
                            isDefault: true
                        }
                    ] : [],
                    createdAt: serverTimestamp()
                });
                customerId = docRef.id;
            }

            // If this customer was created/edited from a portal ticket inquiry, link them back to the ticket
            if (prefill?.sourceTicketId) {
                try {
                    await updateDoc(doc(db, 'portal_tickets', prefill.sourceTicketId), {
                        customerRef: {
                            id: customerId,
                            name: customerName
                        },
                        // Optionally update the requestorName so the UI updates
                        requestorName: customerName
                    });
                } catch (ticketErr) {
                    console.error("Failed to link customer to ticket:", ticketErr);
                }
            }

            onAdded();
            onClose();
            // Reset
            setName(''); setEmail(''); setPhone(''); setAddress(''); setTerms('net30'); setContactType('Customer');
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
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} required 
                                   className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Type</label>
                            <input type="text" value={contactType} onChange={e => setContactType(e.target.value)} placeholder="Customer, Lead, Vendor..."
                                   className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email(s)</label>
                            <input type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. email1@abc.com, email2@abc.com"
                                   className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white" />
                            <p className="text-[10px] text-gray-400 mt-1">Separate multiple emails with commas.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number(s)</label>
                            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 555-123-4567, 555-987-6543"
                                   className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white" />
                            <p className="text-[10px] text-gray-400 mt-1">Separate multiple phone numbers with commas.</p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Primary Address</label>
                        <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. 123 Main St, City, ST 12345"
                               className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white" />
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
