import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { CustomerAddress } from '../types';

interface AddLocationModalProps {
    isOpen: boolean;
    onClose: () => void;
    locationToEdit?: CustomerAddress | null;
    onSave: (address: CustomerAddress) => Promise<void>;
}

export const AddLocationModal: React.FC<AddLocationModalProps> = ({
    isOpen,
    onClose,
    locationToEdit,
    onSave
}) => {
    const [label, setLabel] = useState('');
    const [type, setType] = useState<'primary' | 'billing' | 'service'>('service');
    const [street, setStreet] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [zip, setZip] = useState('');
    const [country, setCountry] = useState('US');
    const [accessNotes, setAccessNotes] = useState('');
    const [isDefault, setIsDefault] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (locationToEdit) {
            setLabel(locationToEdit.label || '');
            setType(locationToEdit.type || 'service');
            setStreet(locationToEdit.street || '');
            setCity(locationToEdit.city || '');
            setState(locationToEdit.state || '');
            setZip(locationToEdit.zip || '');
            setCountry(locationToEdit.country || 'US');
            setAccessNotes(locationToEdit.accessNotes || '');
            setIsDefault(locationToEdit.isDefault || false);
        } else {
            setLabel('');
            setType('service');
            setStreet('');
            setCity('');
            setState('');
            setZip('');
            setCountry('US');
            setAccessNotes('');
            setIsDefault(false);
        }
    }, [locationToEdit, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!street.trim() || !city.trim() || !state.trim() || !zip.trim()) return;

        setIsSubmitting(true);
        try {
            const addressData: CustomerAddress = {
                id: locationToEdit?.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
                label: label.trim() || undefined,
                type,
                street: street.trim(),
                city: city.trim(),
                state: state.trim(),
                zip: zip.trim(),
                country: country.trim(),
                accessNotes: accessNotes.trim() || undefined,
                isDefault
            };
            await onSave(addressData);
            onClose();
        } catch (error) {
            console.error("Error saving location:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold">{locationToEdit ? 'Edit Location' : 'Add Location'}</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition">
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Location Label</label>
                        <input 
                            type="text" 
                            value={label} 
                            onChange={e => setLabel(e.target.value)} 
                            placeholder="e.g. Main Office, Warehouse, Residence" 
                            className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-gray-900" 
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address Type</label>
                        <select 
                            value={type} 
                            onChange={e => setType(e.target.value as any)} 
                            className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none bg-white transition text-gray-900"
                        >
                            <option value="primary">Primary</option>
                            <option value="billing">Billing</option>
                            <option value="service">Service Site</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
                        <input 
                            type="text" 
                            value={street} 
                            onChange={e => setStreet(e.target.value)} 
                            required
                            placeholder="e.g. 123 Main St" 
                            className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition bg-white text-gray-900" 
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                            <input 
                                type="text" 
                                value={city} 
                                onChange={e => setCity(e.target.value)} 
                                required
                                placeholder="e.g. Honolulu" 
                                className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition bg-white text-gray-900" 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                            <input 
                                type="text" 
                                value={state} 
                                onChange={e => setState(e.target.value)} 
                                required
                                placeholder="e.g. HI" 
                                className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition bg-white text-gray-900" 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code *</label>
                            <input 
                                type="text" 
                                value={zip} 
                                onChange={e => setZip(e.target.value)} 
                                required
                                placeholder="e.g. 96813" 
                                className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition bg-white text-gray-900" 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                            <input 
                                type="text" 
                                value={country} 
                                onChange={e => setCountry(e.target.value)} 
                                placeholder="e.g. US" 
                                className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition bg-white text-gray-900" 
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Access Notes</label>
                        <textarea 
                            value={accessNotes} 
                            onChange={e => setAccessNotes(e.target.value)} 
                            rows={2} 
                            placeholder="Gate code, directions, parking instructions..." 
                            className="w-full px-3 py-2 border rounded-md outline-none focus:ring-blue-500 focus:border-blue-500 transition resize-none bg-white text-gray-900"
                        ></textarea>
                    </div>

                    <div className="flex items-center">
                        <input 
                            type="checkbox" 
                            id="isDefaultLocation"
                            checked={isDefault} 
                            onChange={e => setIsDefault(e.target.checked)} 
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" 
                        />
                        <label htmlFor="isDefaultLocation" className="ml-2 block text-sm text-gray-900">
                            Set as primary default location
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
                                    Save Location
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
