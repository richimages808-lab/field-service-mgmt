import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { CustomerAsset } from '../types';

interface AddAssetModalProps {
    isOpen: boolean;
    onClose: () => void;
    customerId: string;
    onSuccess?: (asset: CustomerAsset) => void;
}

export const AddAssetModal: React.FC<AddAssetModalProps> = ({ isOpen, onClose, customerId, onSuccess }) => {
    const [name, setName] = useState('');
    const [make, setMake] = useState('');
    const [model, setModel] = useState('');
    const [serialNumber, setSerialNumber] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Equipment name is required");
            return;
        }

        setIsSubmitting(true);
        try {
            const assetData = {
                customerId,
                name,
                type: 'equipment',
                make,
                model,
                serialNumber,
                notes,
                status: 'active',
                installDate: serverTimestamp()
            };

            const docRef = await addDoc(collection(db, 'assets'), assetData);
            
            toast.success("Equipment added successfully");
            if (onSuccess) {
                onSuccess({ id: docRef.id, ...assetData } as any);
            }
            onClose();
        } catch (error) {
            console.error("Error adding equipment:", error);
            toast.error("Failed to add equipment");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold">Add Equipment</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition">
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Name *</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. RTU-1, Main Compressor" className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none transition" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Make</label>
                            <input type="text" value={make} onChange={e => setMake(e.target.value)} placeholder="e.g. Trane" className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                            <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="Model #" className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                        <input type="text" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="S/N" className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Location details, filter sizes, etc." className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition resize-none"></textarea>
                    </div>

                    <div className="pt-4 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition font-medium disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium disabled:opacity-50 min-w-[120px] shadow-sm">
                            {isSubmitting ? 'Saving...' : 'Add Equipment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
