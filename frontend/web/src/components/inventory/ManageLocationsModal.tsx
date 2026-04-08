import React, { useState, useEffect } from 'react';
import { X, MapPin, Plus, Trash2, ShieldCheck, Loader2 } from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../auth/AuthProvider';
import { toast } from 'react-hot-toast';

export const DEFAULT_LOCATIONS = ['Truck', 'Warehouse', 'At Supplier', 'On Order'];

interface ManageLocationsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLocationsUpdated?: (newLocations: string[]) => void;
}

export const ManageLocationsModal: React.FC<ManageLocationsModalProps> = ({ isOpen, onClose, onLocationsUpdated }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [locations, setLocations] = useState<string[]>([]);
    const [newLocation, setNewLocation] = useState('');

    useEffect(() => {
        if (!isOpen || !user?.org_id) return;

        const loadLocations = async () => {
            setLoading(true);
            try {
                const docRef = doc(db, 'organizations', user.org_id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.inventoryLocations && Array.isArray(data.inventoryLocations)) {
                        setLocations(data.inventoryLocations);
                    } else {
                        // Initialize with defaults if not exists
                        setLocations(DEFAULT_LOCATIONS);
                    }
                }
            } catch (error) {
                console.error("Error loading locations:", error);
                toast.error("Failed to load locations.");
            } finally {
                setLoading(false);
            }
        };

        loadLocations();
    }, [isOpen, user]);

    const handleAdd = () => {
        const trimmed = newLocation.trim();
        if (!trimmed) return;
        
        if (locations.map(l => l.toLowerCase()).includes(trimmed.toLowerCase())) {
            toast.error("This location already exists.");
            return;
        }

        setLocations([...locations, trimmed]);
        setNewLocation('');
    };

    const handleRemove = (index: number) => {
        const newArr = [...locations];
        newArr.splice(index, 1);
        setLocations(newArr);
    };

    const handleSave = async () => {
        if (!user?.org_id) return;
        
        if (locations.length === 0) {
            toast.error("You must have at least one location.");
            return;
        }

        setSaving(true);
        try {
            const docRef = doc(db, 'organizations', user.org_id);
            await updateDoc(docRef, {
                inventoryLocations: locations
            });
            toast.success("Locations saved successfully!");
            if (onLocationsUpdated) {
                onLocationsUpdated(locations);
            }
            onClose();
        } catch (error) {
            console.error("Error saving locations:", error);
            toast.error("Failed to save locations.");
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-blue-600" />
                        <h2 className="text-xl font-semibold text-gray-900">Manage Locations</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-500 mb-4">
                                Define the physical or virtual locations where inventory can be stored. The first location in this list will be the default for new items.
                            </p>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newLocation}
                                    onChange={(e) => setNewLocation(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                    placeholder="e.g. Truck 2, Offsite Storage"
                                    className="flex-1 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <button
                                    onClick={handleAdd}
                                    disabled={!newLocation.trim()}
                                    className="px-4 py-2 bg-blue-50 text-blue-600 font-medium rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4" /> Add
                                </button>
                            </div>

                            <ul className="mt-4 border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-60 overflow-y-auto">
                                {locations.map((loc, idx) => (
                                    <li key={idx} className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 group">
                                        <div className="flex items-center gap-3">
                                            <span className="text-gray-400 font-mono text-xs w-4">{idx + 1}.</span>
                                            <span className="font-medium text-gray-800">{loc}</span>
                                            {idx === 0 && (
                                                <span className="text-[10px] uppercase tracking-wider font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Default</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleRemove(idx)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                            title="Remove Location"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {locations.length === 0 && (
                                <p className="text-sm text-red-500 font-medium mt-2">You must add at least one location.</p>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 font-medium text-gray-700 hover:bg-gray-200 bg-white border border-gray-300 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || locations.length === 0}
                        className="px-4 py-2 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        {saving ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                        ) : (
                            <><ShieldCheck className="w-4 h-4" /> Save Locations</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
