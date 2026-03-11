import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { CustomerNote } from '../types';
import { StickyNote, Pin, Trash2, Plus, AlertTriangle, Key, CreditCard, Heart, MessageSquare } from 'lucide-react';

interface CustomerNotesProps {
    customerId: string; // Could be email or a unique customer ID
    customerName?: string;
    compact?: boolean; // For inline display in job review
}

const NOTE_CATEGORIES = [
    { value: 'general', label: 'General', icon: MessageSquare, color: 'blue' },
    { value: 'access', label: 'Access Info', icon: Key, color: 'green' },
    { value: 'billing', label: 'Billing', icon: CreditCard, color: 'purple' },
    { value: 'preferences', label: 'Preferences', icon: Heart, color: 'pink' },
    { value: 'warning', label: 'Warning', icon: AlertTriangle, color: 'red' }
] as const;

export const CustomerNotes: React.FC<CustomerNotesProps> = ({ customerId, customerName, compact = false }) => {
    const { user } = useAuth();
    const [notes, setNotes] = useState<CustomerNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newNote, setNewNote] = useState('');
    const [newCategory, setNewCategory] = useState<CustomerNote['category']>('general');
    const [saving, setSaving] = useState(false);

    const orgId = (user as any)?.org_id || 'demo-org';

    useEffect(() => {
        if (!customerId) return;

        const notesQuery = query(
            collection(db, 'customer_notes'),
            where('customer_id', '==', customerId),
            where('org_id', '==', orgId),
            orderBy('isPinned', 'desc'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(notesQuery, (snapshot) => {
            const notesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as CustomerNote));
            setNotes(notesData);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching customer notes:', error);
            setLoading(false);
        });

        return unsubscribe;
    }, [customerId, orgId]);

    const handleAddNote = async () => {
        if (!newNote.trim() || !user) return;

        setSaving(true);
        try {
            await addDoc(collection(db, 'customer_notes'), {
                customer_id: customerId,
                org_id: orgId,
                note: newNote.trim(),
                category: newCategory,
                isPinned: false,
                createdAt: serverTimestamp(),
                createdBy: user.uid
            });
            setNewNote('');
            setNewCategory('general');
            setShowAddForm(false);
        } catch (error) {
            console.error('Error adding note:', error);
            alert('Failed to add note');
        }
        setSaving(false);
    };

    const handleTogglePin = async (note: CustomerNote) => {
        try {
            await updateDoc(doc(db, 'customer_notes', note.id), {
                isPinned: !note.isPinned,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Error updating note:', error);
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        if (!confirm('Delete this note?')) return;
        try {
            await deleteDoc(doc(db, 'customer_notes', noteId));
        } catch (error) {
            console.error('Error deleting note:', error);
        }
    };

    const getCategoryConfig = (category: CustomerNote['category']) => {
        return NOTE_CATEGORIES.find(c => c.value === category) || NOTE_CATEGORIES[0];
    };

    if (compact) {
        // Compact view for embedding in job review
        const pinnedNotes = notes.filter(n => n.isPinned);
        const warningNotes = notes.filter(n => n.category === 'warning');
        const importantNotes = [...new Set([...pinnedNotes, ...warningNotes])];

        if (importantNotes.length === 0 && notes.length === 0) {
            return null;
        }

        return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                    <StickyNote className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-semibold text-yellow-800">
                        Customer Notes ({notes.length})
                    </span>
                </div>
                <div className="space-y-2">
                    {importantNotes.slice(0, 3).map(note => {
                        const config = getCategoryConfig(note.category);
                        return (
                            <div key={note.id} className={`text-sm p-2 rounded bg-${config.color}-100 text-${config.color}-800`}>
                                {note.isPinned && <Pin className="w-3 h-3 inline mr-1" />}
                                {note.note}
                            </div>
                        );
                    })}
                    {notes.length > 3 && (
                        <p className="text-xs text-yellow-600">+{notes.length - 3} more notes</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <StickyNote className="w-5 h-5 text-gray-600" />
                    <h3 className="font-semibold text-gray-900">
                        Customer Notes {customerName && `- ${customerName}`}
                    </h3>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                    <Plus className="w-4 h-4" />
                    Add Note
                </button>
            </div>

            {/* Add Note Form */}
            {showAddForm && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                    <div className="mb-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <div className="flex flex-wrap gap-2">
                            {NOTE_CATEGORIES.map(cat => {
                                const Icon = cat.icon;
                                return (
                                    <button
                                        key={cat.value}
                                        type="button"
                                        onClick={() => setNewCategory(cat.value)}
                                        className={`flex items-center gap-1 px-2 py-1 rounded text-sm ${
                                            newCategory === cat.value
                                                ? `bg-${cat.color}-100 text-${cat.color}-700 border-2 border-${cat.color}-400`
                                                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        <Icon className="w-3 h-3" />
                                        {cat.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Enter note..."
                        rows={3}
                        className="w-full p-2 border rounded mb-2"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleAddNote}
                            disabled={saving || !newNote.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Note'}
                        </button>
                        <button
                            onClick={() => { setShowAddForm(false); setNewNote(''); }}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Notes List */}
            {loading ? (
                <p className="text-gray-500 text-sm">Loading notes...</p>
            ) : notes.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No notes yet for this customer.</p>
            ) : (
                <div className="space-y-2">
                    {notes.map(note => {
                        const config = getCategoryConfig(note.category);
                        const Icon = config.icon;
                        return (
                            <div
                                key={note.id}
                                className={`p-3 rounded-lg border ${
                                    note.isPinned ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'
                                }`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-2 flex-1">
                                        <div className={`p-1 rounded bg-${config.color}-100`}>
                                            <Icon className={`w-4 h-4 text-${config.color}-600`} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-800">{note.note}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {note.createdAt?.toDate?.().toLocaleDateString() || 'Recently'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleTogglePin(note)}
                                            className={`p-1 rounded hover:bg-gray-100 ${note.isPinned ? 'text-yellow-600' : 'text-gray-400'}`}
                                            title={note.isPinned ? 'Unpin' : 'Pin'}
                                        >
                                            <Pin className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteNote(note.id)}
                                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
