/**
 * ToolsInventory - Tools management page with AI photo identification
 * 
 * Similar to MaterialsInventory but for managing tools and equipment.
 */
import React, { useState, useEffect } from 'react';
import {
    Wrench,
    Plus,
    Search,
    Filter,
    Edit2,
    Trash2,
    Camera,
    AlertTriangle,
    CheckCircle,
    XCircle
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import {
    collection,
    query,
    where,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { ToolItem, AIIdentifiedTool } from '../types';
import { PhotoUploadModal } from '../components/PhotoUploadModal';
import { MaterialsReviewModal } from '../components/MaterialsReviewModal';
import { uploadPhotos, identifyMaterials } from '../lib/aiMaterialsService';

// Category options for tools (matches ToolItem type)
const TOOL_CATEGORIES: Array<{ value: ToolItem['category']; label: string }> = [
    { value: 'hand_tool', label: 'Hand Tools' },
    { value: 'power_tool', label: 'Power Tools' },
    { value: 'diagnostic', label: 'Diagnostic Equipment' },
    { value: 'safety', label: 'Safety Equipment' },
    { value: 'specialized', label: 'Specialty Tools' },
    { value: 'other', label: 'Other' }
];

// Condition options (matches ToolItem type)
const CONDITIONS: Array<{ value: ToolItem['condition']; label: string }> = [
    { value: 'excellent', label: 'Excellent' },
    { value: 'good', label: 'Good' },
    { value: 'fair', label: 'Fair' },
    { value: 'needs_replacement', label: 'Needs Replacement' }
];

export const ToolsInventory: React.FC = () => {
    const { user } = useAuth();
    const [tools, setTools] = useState<ToolItem[]>([]);
    const [filteredTools, setFilteredTools] = useState<ToolItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [loading, setLoading] = useState(true);

    // Modal states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editTool, setEditTool] = useState<ToolItem | null>(null);

    // AI Photo workflow states
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [identifiedItems, setIdentifiedItems] = useState<AIIdentifiedTool[]>([]);
    const [uploadedPhotos, setUploadedPhotos] = useState<File[]>([]);

    // Fetch tools from Firestore
    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        const orgId = (user as any).org_id || user.uid;

        console.log("Fetching tools for OrgID:", orgId);

        const q = query(collection(db, 'tools'), where('org_id', '==', orgId));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const toolsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ToolItem[];
            setTools(toolsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching tools:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    // Filter tools based on search and category
    useEffect(() => {
        let filtered = [...tools];

        if (searchQuery) {
            const lowerSearch = searchQuery.toLowerCase();
            filtered = filtered.filter(tool =>
                tool.name.toLowerCase().includes(lowerSearch)
            );
        }

        if (selectedCategory !== 'all') {
            filtered = filtered.filter(tool => tool.category === selectedCategory);
        }

        setFilteredTools(filtered);
    }, [tools, searchQuery, selectedCategory]);

    // AI Photo workflow handlers
    const handlePhotosSelected = (files: File[]) => {
        setUploadedPhotos(files);
    };

    const handleIdentifyTools = async () => {
        if (!user?.uid) return;

        try {
            const orgId = (user as any).org_id || user.uid;
            const uploadedUrls = await uploadPhotos(uploadedPhotos, orgId, 'tools');
            const identified = await identifyMaterials(uploadedUrls, orgId, 'tools');
            setIdentifiedItems(identified as AIIdentifiedTool[]);
            setIsPhotoModalOpen(false);
            setIsReviewModalOpen(true);
        } catch (error) {
            console.error('Error identifying tools:', error);
        }
    };

    const handleSaveIdentifiedTools = async (items: AIIdentifiedTool[]) => {
        if (!user?.uid) return;

        try {
            const orgId = (user as any).org_id || user.uid;
            const now = serverTimestamp();

            for (const item of items) {
                await addDoc(collection(db, 'tools'), {
                    name: item.name,
                    category: item.category || 'other',
                    condition: item.condition || 'good',
                    notes: item.notes || '',
                    org_id: orgId,
                    tech_id: (user as any).role === 'technician' ? user.uid : null,
                    createdAt: now,
                    updatedAt: now,
                    aiMetadata: {
                        identifiedFromPhoto: true,
                        photoUrl: item.photoUrl,
                        confidence: item.confidence,
                        originalAIName: item.name,
                        identifiedAt: now
                    }
                });
            }

            setIsReviewModalOpen(false);
            setIdentifiedItems([]);
        } catch (error) {
            console.error('Error saving tools:', error);
        }
    };

    const handleSaveTool = async (toolData: Partial<ToolItem>) => {
        if (!user?.uid) return;

        try {
            const orgId = (user as any).org_id || user.uid;
            const now = serverTimestamp();

            if (editTool) {
                await updateDoc(doc(db, 'tools', editTool.id), {
                    ...toolData,
                    updatedAt: now
                });
            } else {
                await addDoc(collection(db, 'tools'), {
                    ...toolData,
                    org_id: orgId,
                    tech_id: (user as any).role === 'technician' ? user.uid : null,
                    createdAt: now,
                    updatedAt: now
                });
            }

            setIsAddModalOpen(false);
            setEditTool(null);
        } catch (error) {
            console.error('Error saving tool:', error);
        }
    };

    const handleDeleteTool = async (toolId: string) => {
        if (!confirm('Are you sure you want to delete this tool?')) return;

        try {
            await deleteDoc(doc(db, 'tools', toolId));
        } catch (error) {
            console.error('Error deleting tool:', error);
        }
    };

    const getConditionColor = (condition: ToolItem['condition']) => {
        switch (condition) {
            case 'excellent': return 'bg-green-100 text-green-800';
            case 'good': return 'bg-blue-100 text-blue-800';
            case 'fair': return 'bg-yellow-100 text-yellow-800';
            case 'needs_replacement': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getConditionLabel = (condition: ToolItem['condition']) => {
        return CONDITIONS.find(c => c.value === condition)?.label || condition;
    };

    const getCategoryLabel = (category: ToolItem['category']) => {
        return TOOL_CATEGORIES.find(c => c.value === category)?.label || category;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Tools Inventory</h1>
                    <p className="text-gray-600">{tools.length} tools</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsPhotoModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                        <Camera className="w-4 h-4" />
                        Add from Photo
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Tool
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                        <Wrench className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Total Tools</p>
                        <p className="text-2xl font-bold">{tools.length}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Good Condition</p>
                        <p className="text-2xl font-bold">
                            {tools.filter(t => t.condition === 'good' || t.condition === 'excellent').length}
                        </p>
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
                    <div className="p-3 bg-yellow-100 rounded-lg">
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Fair Condition</p>
                        <p className="text-2xl font-bold">
                            {tools.filter(t => t.condition === 'fair').length}
                        </p>
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
                    <div className="p-3 bg-red-100 rounded-lg">
                        <XCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Needs Replacement</p>
                        <p className="text-2xl font-bold">
                            {tools.filter(t => t.condition === 'needs_replacement').length}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search tools by name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-gray-400" />
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">All Categories</option>
                        {TOOL_CATEGORIES.map(cat => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Tools Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTools.length === 0 ? (
                    <div className="col-span-full bg-white rounded-xl shadow-sm border p-8 text-center">
                        <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No tools found</p>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
                        >
                            Add your first tool
                        </button>
                    </div>
                ) : (
                    filteredTools.map(tool => (
                        <div key={tool.id} className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gray-100 rounded-lg">
                                        <Wrench className="w-5 h-5 text-gray-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{tool.name}</h3>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => {
                                            setEditTool(tool);
                                            setIsAddModalOpen(true);
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteTool(tool.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                    {getCategoryLabel(tool.category)}
                                </span>
                                <span className={`px-2 py-1 text-xs rounded ${getConditionColor(tool.condition)}`}>
                                    {getConditionLabel(tool.condition)}
                                </span>
                                {tool.aiMetadata?.identifiedFromPhoto && (
                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded flex items-center gap-1">
                                        <Camera className="w-3 h-3" />
                                        AI
                                    </span>
                                )}
                            </div>
                            {tool.notes && (
                                <p className="mt-2 text-sm text-gray-600 line-clamp-2">{tool.notes}</p>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Photo Upload Modal */}
            <PhotoUploadModal
                isOpen={isPhotoModalOpen}
                onClose={() => {
                    setIsPhotoModalOpen(false);
                    setUploadedPhotos([]);
                }}
                onPhotosSelected={handlePhotosSelected}
                onIdentify={handleIdentifyTools}
                type="tools"
            />

            {/* Review Modal */}
            <MaterialsReviewModal
                isOpen={isReviewModalOpen}
                onClose={() => {
                    setIsReviewModalOpen(false);
                    setIdentifiedItems([]);
                }}
                items={identifiedItems as any}
                type="tools"
                onSave={handleSaveIdentifiedTools as any}
            />

            {/* Add/Edit Tool Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <h2 className="text-xl font-bold mb-4">
                            {editTool ? 'Edit Tool' : 'Add New Tool'}
                        </h2>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                handleSaveTool({
                                    name: formData.get('name') as string,
                                    category: formData.get('category') as ToolItem['category'],
                                    condition: formData.get('condition') as ToolItem['condition'],
                                    notes: formData.get('notes') as string
                                });
                            }}
                            className="space-y-4"
                        >
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tool Name
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    defaultValue={editTool?.name}
                                    required
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., DeWalt Cordless Drill"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Category
                                </label>
                                <select
                                    name="category"
                                    defaultValue={editTool?.category || 'hand_tool'}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    {TOOL_CATEGORIES.map(cat => (
                                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Condition
                                </label>
                                <select
                                    name="condition"
                                    defaultValue={editTool?.condition || 'good'}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    {CONDITIONS.map(cond => (
                                        <option key={cond.value} value={cond.value}>{cond.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Notes (Optional)
                                </label>
                                <textarea
                                    name="notes"
                                    defaultValue={editTool?.notes}
                                    rows={2}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Additional notes..."
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAddModalOpen(false);
                                        setEditTool(null);
                                    }}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    {editTool ? 'Save Changes' : 'Add Tool'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
