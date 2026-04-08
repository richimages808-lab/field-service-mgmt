import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { MileageEntry } from '../types';
import { Car, Plus, Trash2, Edit2, X, Check, Calendar, MapPin, DollarSign } from 'lucide-react';

interface MileageTrackerProps {
    jobId?: string; // If provided, shows only mileage for this job
    techId?: string;
    compact?: boolean;
    showSummary?: boolean;
}

const MILEAGE_PURPOSES = [
    { value: 'job', label: 'Job Site Visit', deductible: true },
    { value: 'parts_run', label: 'Parts Pickup', deductible: true },
    { value: 'personal', label: 'Personal', deductible: false },
    { value: 'other', label: 'Other Business', deductible: true }
] as const;

const IRS_MILEAGE_RATE = 0.67; // 2024 rate

export const MileageTracker: React.FC<MileageTrackerProps> = ({
    jobId,
    techId,
    compact = false,
    showSummary = true
}) => {
    const { user } = useAuth();
    const [entries, setEntries] = useState<MileageEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingEntry, setEditingEntry] = useState<MileageEntry | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formStartLocation, setFormStartLocation] = useState('');
    const [formEndLocation, setFormEndLocation] = useState('');
    const [formDistance, setFormDistance] = useState(0);
    const [formPurpose, setFormPurpose] = useState<MileageEntry['purpose']>('job');
    const [formNotes, setFormNotes] = useState('');

    // Date filter
    const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

    const orgId = (user as any)?.org_id || 'demo-org';
    const currentTechId = techId || user?.uid;

    useEffect(() => {
        let mileageQuery;

        if (jobId) {
            mileageQuery = query(
                collection(db, 'mileage_entries'),
                where('job_id', '==', jobId),
                orderBy('date', 'desc')
            );
        } else {
            mileageQuery = query(
                collection(db, 'mileage_entries'),
                where('org_id', '==', orgId),
                where('tech_id', '==', currentTechId),
                orderBy('date', 'desc')
            );
        }

        const unsubscribe = onSnapshot(mileageQuery, (snapshot) => {
            const entriesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as MileageEntry));
            setEntries(entriesData);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching mileage entries:', error);
            setLoading(false);
        });

        return unsubscribe;
    }, [orgId, currentTechId, jobId]);

    // Filter entries by month
    const filteredEntries = entries.filter(entry => {
        if (!filterMonth) return true;
        const entryDate = entry.date?.toDate?.() || new Date(entry.date);
        const entryMonth = entryDate.toISOString().slice(0, 7);
        return entryMonth === filterMonth;
    });

    // Calculate summary
    const summary = filteredEntries.reduce((acc, entry) => {
        acc.totalMiles += entry.distance;
        if (entry.isDeductible) {
            acc.deductibleMiles += entry.distance;
        }
        return acc;
    }, { totalMiles: 0, deductibleMiles: 0 });

    const resetForm = () => {
        setFormDate(new Date().toISOString().split('T')[0]);
        setFormStartLocation('');
        setFormEndLocation('');
        setFormDistance(0);
        setFormPurpose('job');
        setFormNotes('');
        setEditingEntry(null);
        setShowAddForm(false);
    };

    const handleEdit = (entry: MileageEntry) => {
        setEditingEntry(entry);
        const entryDate = entry.date?.toDate?.() || new Date(entry.date);
        setFormDate(entryDate.toISOString().split('T')[0]);
        setFormStartLocation(entry.startLocation);
        setFormEndLocation(entry.endLocation);
        setFormDistance(entry.distance);
        setFormPurpose(entry.purpose);
        setFormNotes(entry.notes || '');
        setShowAddForm(true);
    };

    const handleSave = async () => {
        if (!formStartLocation.trim() || !formEndLocation.trim() || formDistance <= 0 || !user) return;

        setSaving(true);
        const purposeConfig = MILEAGE_PURPOSES.find(p => p.value === formPurpose);

        try {
            const entryData = {
                org_id: orgId,
                tech_id: currentTechId,
                job_id: jobId || null,
                date: Timestamp.fromDate(new Date(formDate)),
                startLocation: formStartLocation.trim(),
                endLocation: formEndLocation.trim(),
                distance: formDistance,
                purpose: formPurpose,
                isDeductible: purposeConfig?.deductible ?? true,
                notes: formNotes.trim() || null
            };

            if (editingEntry) {
                await updateDoc(doc(db, 'mileage_entries', editingEntry.id), {
                    ...entryData,
                    updatedAt: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, 'mileage_entries'), {
                    ...entryData,
                    createdAt: serverTimestamp()
                });
            }
            resetForm();
        } catch (error) {
            console.error('Error saving mileage entry:', error);
            alert('Failed to save entry');
        }
        setSaving(false);
    };

    const handleDelete = async (entryId: string) => {
        if (!confirm('Delete this mileage entry?')) return;
        try {
            await deleteDoc(doc(db, 'mileage_entries', entryId));
        } catch (error) {
            console.error('Error deleting entry:', error);
        }
    };

    if (compact) {
        return (
            <div className="bg-white rounded-lg shadow p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Car className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold">Mileage</span>
                    </div>
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                    >
                        + Add
                    </button>
                </div>
                {jobId && filteredEntries.length > 0 ? (
                    <div className="text-sm">
                        <p className="text-gray-600">{summary.totalMiles.toFixed(1)} miles</p>
                        <p className="text-xs text-gray-500">
                            ${(summary.deductibleMiles * IRS_MILEAGE_RATE).toFixed(2)} deduction
                        </p>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">No mileage recorded</p>
                )}

                {/* Quick Add Modal for compact */}
                {showAddForm && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-4 max-w-md w-full mx-4">
                            <h4 className="font-medium mb-3">Add Mileage</h4>
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    value={formStartLocation}
                                    onChange={(e) => setFormStartLocation(e.target.value)}
                                    placeholder="Start location"
                                    className="w-full p-2 border rounded"
                                />
                                <input
                                    type="text"
                                    value={formEndLocation}
                                    onChange={(e) => setFormEndLocation(e.target.value)}
                                    placeholder="End location"
                                    className="w-full p-2 border rounded"
                                />
                                <input
                                    type="number"
                                    value={formDistance}
                                    onChange={(e) => setFormDistance(parseFloat(e.target.value) || 0)}
                                    placeholder="Miles"
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded"
                                >
                                    Save
                                </button>
                                <button onClick={resetForm} className="px-3 py-2 border rounded">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Car className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Mileage Tracker</h3>
                </div>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                    <Plus className="w-4 h-4" />
                    Add Entry
                </button>
            </div>

            {/* Month Filter */}
            {!jobId && (
                <div className="flex items-center gap-2 mb-4">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <input
                        type="month"
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        className="p-2 border rounded"
                    />
                </div>
            )}

            {/* Summary Cards */}
            {showSummary && (
                <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-blue-600 mb-1">Total Miles</p>
                        <p className="text-xl font-bold text-blue-900">{summary.totalMiles.toFixed(1)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-xs text-green-600 mb-1">Deductible</p>
                        <p className="text-xl font-bold text-green-900">{summary.deductibleMiles.toFixed(1)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                        <p className="text-xs text-amber-600 mb-1">Tax Value</p>
                        <p className="text-xl font-bold text-amber-900">
                            ${(summary.deductibleMiles * IRS_MILEAGE_RATE).toFixed(2)}
                        </p>
                    </div>
                </div>
            )}

            {/* Add/Edit Form */}
            {showAddForm && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{editingEntry ? 'Edit Entry' : 'New Mileage Entry'}</h4>
                        <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                                type="date"
                                value={formDate}
                                onChange={(e) => setFormDate(e.target.value)}
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                            <select
                                value={formPurpose}
                                onChange={(e) => setFormPurpose(e.target.value as MileageEntry['purpose'])}
                                className="w-full p-2 border rounded"
                            >
                                {MILEAGE_PURPOSES.map(p => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Distance (miles)</label>
                            <input
                                type="number"
                                value={formDistance}
                                onChange={(e) => setFormDistance(parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.1"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Location</label>
                            <input
                                type="text"
                                value={formStartLocation}
                                onChange={(e) => setFormStartLocation(e.target.value)}
                                placeholder="e.g., Home, Office"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Location</label>
                            <input
                                type="text"
                                value={formEndLocation}
                                onChange={(e) => setFormEndLocation(e.target.value)}
                                placeholder="e.g., 123 Main St"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                            <input
                                type="text"
                                value={formNotes}
                                onChange={(e) => setFormNotes(e.target.value)}
                                placeholder="Optional"
                                className="w-full p-2 border rounded"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={handleSave}
                            disabled={saving || !formStartLocation.trim() || !formEndLocation.trim() || formDistance <= 0}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            {saving ? 'Saving...' : 'Save Entry'}
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

            {/* Entries List */}
            {loading ? (
                <p className="text-gray-500 text-sm">Loading entries...</p>
            ) : filteredEntries.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                    No mileage entries for this period.
                </p>
            ) : (
                <div className="space-y-2">
                    {filteredEntries.map(entry => {
                        const entryDate = entry.date?.toDate?.() || new Date(entry.date);
                        const purposeConfig = MILEAGE_PURPOSES.find(p => p.value === entry.purpose);

                        return (
                            <div
                                key={entry.id}
                                className="p-3 rounded-lg border bg-white flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3 flex-1">
                                    <div className={`p-2 rounded ${
                                        entry.isDeductible ? 'bg-green-100' : 'bg-gray-100'
                                    }`}>
                                        <Car className={`w-4 h-4 ${
                                            entry.isDeductible ? 'text-green-600' : 'text-gray-600'
                                        }`} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-gray-900">
                                                {entry.distance.toFixed(1)} miles
                                            </p>
                                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                                {purposeConfig?.label}
                                            </span>
                                            {entry.isDeductible && (
                                                <span className="text-xs text-green-600">
                                                    ${(entry.distance * IRS_MILEAGE_RATE).toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" />
                                            {entry.startLocation} → {entry.endLocation}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {entryDate.toLocaleDateString()}
                                            {entry.notes && ` | ${entry.notes}`}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleEdit(entry)}
                                        className="p-1 text-gray-400 hover:text-blue-600"
                                        title="Edit"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(entry.id)}
                                        className="p-1 text-gray-400 hover:text-red-600"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
