import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { CustomerContact } from '../types';

interface AddContactModalProps {
    isOpen: boolean;
    onClose: () => void;
    contactToEdit?: CustomerContact | null;
    onSave: (contact: CustomerContact) => Promise<void>;
}

export const AddContactModal: React.FC<AddContactModalProps> = ({
    isOpen,
    onClose,
    contactToEdit,
    onSave
}) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<'primary' | 'billing' | 'technical' | 'other'>('other');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [isDefault, setIsDefault] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (contactToEdit) {
            setName(contactToEdit.name || '');
            setType(contactToEdit.type || 'other');
            setEmail(contactToEdit.email || '');
            setPhone(contactToEdit.phone || '');
            setNotes(contactToEdit.notes || '');
            setIsDefault(contactToEdit.isDefault || false);
        } else {
            setName('');
            setType('other');
            setEmail('');
            setPhone('');
            setNotes('');
            setIsDefault(false);
        }
    }, [contactToEdit, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            const contactData: CustomerContact = {
                id: contactToEdit?.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
                name: name.trim(),
                type,
                email: email.trim(),
                phone: phone.trim(),
                notes: notes.trim(),
                isDefault
            };
            await onSave(contactData);
            onClose();
        } catch (error) {
            console.error("Error saving contact:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold">{contactToEdit ? 'Edit Contact' : 'Add Contact'}</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition">
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            required 
                            placeholder="e.g. Jane Doe" 
                            className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-gray-900" 
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Type</label>
                        <select 
                            value={type} 
                            onChange={e => setType(e.target.value as any)} 
                            className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none bg-white transition text-gray-900"
                        >
                            <option value="primary">Primary</option>
                            <option value="billing">Billing</option>
                            <option value="technical">Technical / On-Site</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email(s)</label>
                        <input 
                            type="text" 
                            value={email} 
                            onChange={e => setEmail(e.target.value)} 
                            placeholder="e.g. jane@company.com, office@company.com" 
                            className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition bg-white text-gray-900" 
                        />
                        <p className="text-xs text-gray-400 mt-1">Separate multiple emails with commas.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number(s)</label>
                        <input 
                            type="text" 
                            value={phone} 
                            onChange={e => setPhone(e.target.value)} 
                            placeholder="e.g. 555-123-4567, 555-987-6543" 
                            className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition bg-white text-gray-900" 
                        />
                        <p className="text-xs text-gray-400 mt-1">Separate multiple phone numbers with commas.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)} 
                            rows={3} 
                            placeholder="Availability, role, or preferred contact times..." 
                            className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition resize-none bg-white text-gray-900"
                        ></textarea>
                    </div>

                    <div className="flex items-center">
                        <input 
                            type="checkbox" 
                            id="isDefaultContact"
                            checked={isDefault} 
                            onChange={e => setIsDefault(e.target.checked)} 
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" 
                        />
                        <label htmlFor="isDefaultContact" className="ml-2 block text-sm text-gray-900">
                            Set as primary default contact
                        </label>
                    </div>

                    <div className="pt-4 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition font-medium">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium flex items-center shadow-sm">
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    Save Contact
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
