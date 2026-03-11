import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { useAIAnalysis } from '../hooks/useAIAnalysis';
import { Camera, Package, Trash2, Edit2, Save, X, Loader } from 'lucide-react';

interface InventoryItem {
    id: string;
    name: string;
    category: 'part' | 'tool' | 'equipment';
    quantity: number;
    condition: 'new' | 'used' | 'unknown';
    imageUrl?: string;
    catalogedAt?: any;
    catalogedBy?: string;
    techId: string;
}

export const InventoryManager: React.FC = () => {
    const { user } = useAuth();
    const { catalogInventory, loading } = useAIAnalysis();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<InventoryItem>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    const techId = user?.uid || '';

    // Fetch inventory items
    useEffect(() => {
        if (!techId) return;

        const itemsQuery = query(
            collection(db, 'inventory'),
            where('techId', '==', techId)
        );

        const unsubscribe = onSnapshot(itemsQuery, (snapshot) => {
            const itemsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as InventoryItem));

            // Sort by category then name
            itemsData.sort((a, b) => {
                if (a.category !== b.category) {
                    return a.category.localeCompare(b.category);
                }
                return a.name.localeCompare(b.name);
            });

            setItems(itemsData);
        });

        return unsubscribe;
    }, [techId]);

    // Handle photo upload
    const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !techId) return;

        try {
            // Upload to Firebase Storage
            const storageRef = ref(storage, `inventory/${techId}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const imageUrl = await getDownloadURL(storageRef);

            // Convert to base64 for AI processing
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Image = e.target?.result as string;

                // Call AI cataloging
                const catalogedItems = await catalogInventory(base64Image, techId);

                if (catalogedItems) {
                    console.log(`AI cataloged ${catalogedItems.length} items from photo`);
                    alert(`✅ Successfully cataloged ${catalogedItems.length} items!`);
                } else {
                    alert('⚠️ Failed to catalog items. Please try again.');
                }
            };
            reader.readAsDataURL(file);

            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error('Failed to upload photo:', error);
            alert('Failed to upload photo');
        }
    };

    // Delete item
    const handleDelete = async (itemId: string) => {
        if (!confirm('Are you sure you want to delete this item?')) return;

        try {
            await deleteDoc(doc(db, 'inventory', itemId));
            console.log('Item deleted:', itemId);
        } catch (error) {
            console.error('Failed to delete item:', error);
            alert('Failed to delete item');
        }
    };

    // Start editing
    const startEdit = (item: InventoryItem) => {
        setEditingId(item.id);
        setEditForm({
            name: item.name,
            quantity: item.quantity,
            category: item.category,
            condition: item.condition,
        });
    };

    // Save edit
    const saveEdit = async (itemId: string) => {
        try {
            await updateDoc(doc(db, 'inventory', itemId), editForm);
            setEditingId(null);
            setEditForm({});
        } catch (error) {
            console.error('Failed to update item:', error);
            alert('Failed to update item');
        }
    };

    // Cancel edit
    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    // Group by category
    const itemsByCategory = items.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, InventoryItem[]>);

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'part': return '🔧';
            case 'tool': return '🛠️';
            case 'equipment': return '📦';
            default: return '📌';
        }
    };

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'part': return 'bg-blue-100 text-blue-800';
            case 'tool': return 'bg-green-100 text-green-800';
            case 'equipment': return 'bg-purple-100 text-purple-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getConditionColor = (condition: string) => {
        switch (condition) {
            case 'new': return 'text-green-600';
            case 'used': return 'text-yellow-600';
            case 'unknown': return 'text-gray-600';
            default: return 'text-gray-600';
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                    <Package size={20} className="text-green-600" />
                    Parts & Tools Inventory
                </h2>

                {/* Upload Button */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-400 text-white rounded-lg flex items-center justify-center gap-2 font-medium"
                >
                    {loading ? (
                        <>
                            <Loader size={20} className="animate-spin" />
                            Cataloging...
                        </>
                    ) : (
                        <>
                            <Camera size={20} />
                            Take Photo to Add Items
                        </>
                    )}
                </button>
                <p className="text-xs text-gray-600 mt-2 text-center">
                    AI will automatically catalog parts and tools from your photo
                </p>
            </div>

            {/* Inventory List */}
            <div className="flex-1 overflow-auto p-4">
                {items.length === 0 ? (
                    <div className="text-center text-gray-500 py-12">
                        <Package size={64} className="mx-auto text-gray-300 mb-4" />
                        <p className="font-medium">No inventory items yet</p>
                        <p className="text-sm mt-2">Take photos to get started</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(itemsByCategory).map(([category, categoryItems]) => (
                            <div key={category}>
                                <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                    <span>{getCategoryIcon(category)}</span>
                                    <span className="capitalize">{category}s</span>
                                    <span className="text-xs text-gray-500">({categoryItems.length})</span>
                                </h3>

                                <div className="space-y-2">
                                    {categoryItems.map(item => (
                                        <div
                                            key={item.id}
                                            className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow"
                                        >
                                            {editingId === item.id ? (
                                                // Edit Mode
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        value={editForm.name || ''}
                                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                        placeholder="Item name"
                                                    />
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="number"
                                                            value={editForm.quantity || 0}
                                                            onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) })}
                                                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                                            placeholder="Qty"
                                                        />
                                                        <select
                                                            value={editForm.condition || 'unknown'}
                                                            onChange={(e) => setEditForm({ ...editForm, condition: e.target.value as any })}
                                                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                                        >
                                                            <option value="new">New</option>
                                                            <option value="used">Used</option>
                                                            <option value="unknown">Unknown</option>
                                                        </select>
                                                    </div>
                                                    <div className="flex gap-2 justify-end">
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm flex items-center gap-1"
                                                        >
                                                            <X size={14} />
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={() => saveEdit(item.id)}
                                                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1"
                                                        >
                                                            <Save size={14} />
                                                            Save
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                // View Mode
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="font-medium text-gray-900">{item.name}</div>
                                                        <div className="flex items-center gap-3 mt-1 text-xs">
                                                            <span className={`px-2 py-0.5 rounded ${getCategoryColor(item.category)}`}>
                                                                {item.category}
                                                            </span>
                                                            <span className="text-gray-600">Qty: {item.quantity}</span>
                                                            <span className={`capitalize ${getConditionColor(item.condition)}`}>
                                                                {item.condition}
                                                            </span>
                                                        </div>
                                                        {item.catalogedBy === 'ai' && (
                                                            <div className="text-xs text-violet-600 mt-1">
                                                                ✨ AI Cataloged
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => startEdit(item)}
                                                            className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(item.id)}
                                                            className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Summary Stats */}
                {items.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-gray-200">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-2xl font-bold text-blue-600">
                                    {itemsByCategory.part?.length || 0}
                                </div>
                                <div className="text-xs text-gray-600">Parts</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-green-600">
                                    {itemsByCategory.tool?.length || 0}
                                </div>
                                <div className="text-xs text-gray-600">Tools</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-purple-600">
                                    {itemsByCategory.equipment?.length || 0}
                                </div>
                                <div className="text-xs text-gray-600">Equipment</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
