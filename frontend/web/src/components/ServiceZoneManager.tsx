import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { ServiceZone } from '../types';
import { MapPin, Plus, Trash2, Edit2, X, Check, Map } from 'lucide-react';

interface ServiceZoneManagerProps {
    onZoneSelect?: (zone: ServiceZone) => void;
    compact?: boolean;
}

const ZONE_COLORS = [
    { value: '#3B82F6', label: 'Blue' },
    { value: '#10B981', label: 'Green' },
    { value: '#F59E0B', label: 'Orange' },
    { value: '#EF4444', label: 'Red' },
    { value: '#8B5CF6', label: 'Purple' },
    { value: '#EC4899', label: 'Pink' },
    { value: '#06B6D4', label: 'Cyan' },
    { value: '#84CC16', label: 'Lime' }
];

export const ServiceZoneManager: React.FC<ServiceZoneManagerProps> = ({ onZoneSelect, compact = false }) => {
    const { user } = useAuth();
    const [zones, setZones] = useState<ServiceZone[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingZone, setEditingZone] = useState<ServiceZone | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formColor, setFormColor] = useState(ZONE_COLORS[0].value);
    const [formZipCodes, setFormZipCodes] = useState('');
    const [formTravelBuffer, setFormTravelBuffer] = useState(15);
    const [formIsActive, setFormIsActive] = useState(true);

    const orgId = (user as any)?.org_id || 'demo-org';

    useEffect(() => {
        const zonesQuery = query(
            collection(db, 'service_zones'),
            where('org_id', '==', orgId)
        );

        const unsubscribe = onSnapshot(zonesQuery, (snapshot) => {
            const zonesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as ServiceZone));
            setZones(zonesData.sort((a, b) => a.name.localeCompare(b.name)));
            setLoading(false);
        }, (error) => {
            console.error('Error fetching service zones:', error);
            setLoading(false);
        });

        return unsubscribe;
    }, [orgId]);

    const resetForm = () => {
        setFormName('');
        setFormColor(ZONE_COLORS[0].value);
        setFormZipCodes('');
        setFormTravelBuffer(15);
        setFormIsActive(true);
        setEditingZone(null);
        setShowAddForm(false);
    };

    const handleEdit = (zone: ServiceZone) => {
        setEditingZone(zone);
        setFormName(zone.name);
        setFormColor(zone.color);
        setFormZipCodes(zone.zipCodes?.join(', ') || '');
        setFormTravelBuffer(zone.travelTimeBuffer);
        setFormIsActive(zone.isActive);
        setShowAddForm(true);
    };

    const handleSave = async () => {
        if (!formName.trim() || !user) return;

        setSaving(true);
        const zipCodesArray = formZipCodes
            .split(',')
            .map(z => z.trim())
            .filter(z => z.length > 0);

        try {
            if (editingZone) {
                await updateDoc(doc(db, 'service_zones', editingZone.id), {
                    name: formName.trim(),
                    color: formColor,
                    zipCodes: zipCodesArray,
                    travelTimeBuffer: formTravelBuffer,
                    isActive: formIsActive,
                    updatedAt: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, 'service_zones'), {
                    org_id: orgId,
                    name: formName.trim(),
                    color: formColor,
                    zipCodes: zipCodesArray,
                    travelTimeBuffer: formTravelBuffer,
                    isActive: formIsActive,
                    createdAt: serverTimestamp()
                });
            }
            resetForm();
        } catch (error) {
            console.error('Error saving zone:', error);
            alert('Failed to save zone');
        }
        setSaving(false);
    };

    const handleDelete = async (zoneId: string) => {
        if (!confirm('Delete this service zone?')) return;
        try {
            await deleteDoc(doc(db, 'service_zones', zoneId));
        } catch (error) {
            console.error('Error deleting zone:', error);
        }
    };

    const handleToggleActive = async (zone: ServiceZone) => {
        try {
            await updateDoc(doc(db, 'service_zones', zone.id), {
                isActive: !zone.isActive,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Error toggling zone:', error);
        }
    };

    if (compact) {
        return (
            <div className="bg-white rounded-lg shadow p-3">
                <div className="flex items-center gap-2 mb-2">
                    <Map className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold">Service Zones</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {zones.filter(z => z.isActive).map(zone => (
                        <button
                            key={zone.id}
                            onClick={() => onZoneSelect?.(zone)}
                            className="px-2 py-1 text-xs rounded-full text-white"
                            style={{ backgroundColor: zone.color }}
                        >
                            {zone.name}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Map className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Service Zones</h3>
                </div>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                    <Plus className="w-4 h-4" />
                    Add Zone
                </button>
            </div>

            {/* Add/Edit Form */}
            {showAddForm && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{editingZone ? 'Edit Zone' : 'New Zone'}</h4>
                        <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Zone Name</label>
                            <input
                                type="text"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder="e.g., Downtown, North Side"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                            <div className="flex gap-2">
                                {ZONE_COLORS.map(color => (
                                    <button
                                        key={color.value}
                                        type="button"
                                        onClick={() => setFormColor(color.value)}
                                        className={`w-8 h-8 rounded-full border-2 ${
                                            formColor === color.value ? 'border-gray-800' : 'border-transparent'
                                        }`}
                                        style={{ backgroundColor: color.value }}
                                        title={color.label}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Codes</label>
                            <input
                                type="text"
                                value={formZipCodes}
                                onChange={(e) => setFormZipCodes(e.target.value)}
                                placeholder="96801, 96802, 96803"
                                className="w-full p-2 border rounded"
                            />
                            <p className="text-xs text-gray-500 mt-1">Comma-separated list</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Travel Buffer (min)</label>
                            <input
                                type="number"
                                value={formTravelBuffer}
                                onChange={(e) => setFormTravelBuffer(parseInt(e.target.value) || 0)}
                                min="0"
                                max="60"
                                className="w-full p-2 border rounded"
                            />
                            <p className="text-xs text-gray-500 mt-1">Extra time between jobs</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                        <input
                            type="checkbox"
                            id="zoneActive"
                            checked={formIsActive}
                            onChange={(e) => setFormIsActive(e.target.checked)}
                            className="rounded"
                        />
                        <label htmlFor="zoneActive" className="text-sm text-gray-700">Zone is active</label>
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={handleSave}
                            disabled={saving || !formName.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            {saving ? 'Saving...' : 'Save Zone'}
                        </button>
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Zones List */}
            {loading ? (
                <p className="text-gray-500 text-sm">Loading zones...</p>
            ) : zones.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                    No service zones defined yet. Add zones to organize your service areas.
                </p>
            ) : (
                <div className="space-y-2">
                    {zones.map(zone => (
                        <div
                            key={zone.id}
                            className={`p-3 rounded-lg border flex items-center justify-between ${
                                zone.isActive ? 'bg-white' : 'bg-gray-50 opacity-60'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-4 h-4 rounded-full"
                                    style={{ backgroundColor: zone.color }}
                                />
                                <div>
                                    <p className="font-medium text-gray-900">{zone.name}</p>
                                    <p className="text-xs text-gray-500">
                                        {zone.zipCodes?.length || 0} ZIP codes | +{zone.travelTimeBuffer} min buffer
                                        {!zone.isActive && ' | Inactive'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleToggleActive(zone)}
                                    className={`px-2 py-1 text-xs rounded ${
                                        zone.isActive
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-600'
                                    }`}
                                >
                                    {zone.isActive ? 'Active' : 'Inactive'}
                                </button>
                                <button
                                    onClick={() => handleEdit(zone)}
                                    className="p-1 text-gray-400 hover:text-blue-600"
                                    title="Edit"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(zone.id)}
                                    className="p-1 text-gray-400 hover:text-red-600"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
