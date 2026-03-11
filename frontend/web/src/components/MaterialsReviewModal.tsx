import React, { useState } from 'react';
import { X, Save, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AIIdentifiedMaterial, AIIdentifiedTool } from '../types';

interface MaterialsReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: (AIIdentifiedMaterial | AIIdentifiedTool)[];
    type: 'materials' | 'tools';
    onSave: (items: any[]) => Promise<void>;
}

const CATEGORIES = [
    { value: 'parts', label: 'Parts' },
    { value: 'consumables', label: 'Consumables' },
    { value: 'materials', label: 'Materials' },
    { value: 'equipment', label: 'Equipment' },
    { value: 'other', label: 'Other' }
];

const UNITS = ['each', 'box', 'case', 'ft', 'lb', 'gal', 'other'];

const TOOL_CATEGORIES = [
    { value: 'hand_tool', label: 'Hand Tool' },
    { value: 'power_tool', label: 'Power Tool' },
    { value: 'diagnostic', label: 'Diagnostic' },
    { value: 'safety', label: 'Safety' },
    { value: 'specialized', label: 'Specialized' },
    { value: 'other', label: 'Other' }
];

const CONDITIONS = [
    { value: 'excellent', label: 'Excellent' },
    { value: 'good', label: 'Good' },
    { value: 'fair', label: 'Fair' },
    { value: 'needs_replacement', label: 'Needs Replacement' }
];

export const MaterialsReviewModal: React.FC<MaterialsReviewModalProps> = ({
    isOpen,
    onClose,
    items: initialItems,
    type,
    onSave
}) => {
    const [items, setItems] = useState(initialItems);
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const isMaterialType = type === 'materials';

    const updateItem = (index: number, field: string, value: any) => {
        setItems(prev => prev.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        ));
    };

    const removeItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const addManualItem = () => {
        const newItem: any = isMaterialType
            ? {
                id: `manual-${Date.now()}`,
                name: '',
                quantity: 1,
                unit: 'each',
                category: 'parts',
                confidence: 100,
                photoUrl: '',
                suggestedUnitCost: 0,
                suggestedUnitPrice: 0
            }
            : {
                id: `manual-${Date.now()}`,
                name: '',
                category: 'hand_tool',
                condition: 'good',
                confidence: 100,
                photoUrl: ''
            };

        setItems(prev => [...prev, newItem]);
    };

    const handleSave = async () => {
        // Validate
        const valid = items.every(item => item.name.trim() !== '');
        if (!valid) {
            alert('Please fill in all item names');
            return;
        }

        setIsSaving(true);
        try {
            await onSave(items);
            onClose();
        } catch (error) {
            console.error('Error saving items:', error);
            alert('Failed to save items. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const getConfidenceBadge = (confidence: number) => {
        if (confidence >= 80) {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded">
                <CheckCircle2 className="w-3 h-3" />
                High ({confidence}%)
            </span>;
        } else if (confidence >= 50) {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                <AlertCircle className="w-3 h-3" />
                Medium ({confidence}%)
            </span>;
        } else {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 text-xs font-medium rounded">
                <AlertCircle className="w-3 h-3" />
                Low ({confidence}%)
            </span>;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b shrink-0">
                    <div>
                        <h2 className="text-xl font-semibold">
                            Review Identified {isMaterialType ? 'Materials' : 'Tools'}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            AI found {items.length} items. Review and edit before saving.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        disabled={isSaving}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Items Grid */}
                <div className="flex-1 overflow-y-auto p-6">
                    {items.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-lg">
                            <p className="text-gray-500">No items to review</p>
                            <button
                                onClick={addManualItem}
                                className="mt-4 text-blue-600 hover hover:text-blue-700 font-medium"
                            >
                                Add item manually
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {items.map((item, index) => (
                                <div key={item.id} className="border rounded-lg p-4 hover:bg-gray-50">
                                    <div className="flex gap-4">
                                        {/* Photo Thumbnail */}
                                        {item.photoUrl && (
                                            <div className="shrink-0">
                                                <img
                                                    src={item.photoUrl}
                                                    alt={item.name}
                                                    className="w-24 h-24 object-cover rounded border"
                                                />
                                            </div>
                                        )}

                                        {/* Fields */}
                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {/* Name */}
                                            <div className="lg:col-span-2">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Name *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={item.name}
                                                    onChange={(e) => updateItem(index, 'name', e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                                                    placeholder="Enter item name"
                                                />
                                            </div>

                                            {/* Confidence Badge */}
                                            <div className="flex items-end">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        AI Confidence
                                                    </label>
                                                    {getConfidenceBadge(item.confidence)}
                                                </div>
                                            </div>

                                            {isMaterialType ? (
                                                <>
                                                    {/* Materials-specific fields */}
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Quantity
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={(item as AIIdentifiedMaterial).quantity}
                                                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Unit
                                                        </label>
                                                        <select
                                                            value={(item as AIIdentifiedMaterial).unit}
                                                            onChange={(e) => updateItem(index, 'unit', e.target.value)}
                                                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                                                        >
                                                            {UNITS.map(unit => (
                                                                <option key={unit} value={unit}>{unit}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Category
                                                        </label>
                                                        <select
                                                            value={(item as AIIdentifiedMaterial).category}
                                                            onChange={(e) => updateItem(index, 'category', e.target.value)}
                                                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                                                        >
                                                            {CATEGORIES.map(cat => (
                                                                <option key={cat.value} value={cat.value}>{cat.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Cost (Your Cost)
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={(item as AIIdentifiedMaterial).suggestedUnitCost || 0}
                                                                onChange={(e) => updateItem(index, 'suggestedUnitCost', parseFloat(e.target.value) || 0)}
                                                                className="w-full border border-gray-300 rounded-lg p-2 pl-6 focus:ring-2 focus:ring-blue-500"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Price (Customer Pays)
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={(item as AIIdentifiedMaterial).suggestedUnitPrice || 0}
                                                                onChange={(e) => updateItem(index, 'suggestedUnitPrice', parseFloat(e.target.value) || 0)}
                                                                className="w-full border border-gray-300 rounded-lg p-2 pl-6 focus:ring-2 focus:ring-blue-500"
                                                            />
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    {/* Tool-specific fields */}
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Category
                                                        </label>
                                                        <select
                                                            value={(item as AIIdentifiedTool).category}
                                                            onChange={(e) => updateItem(index, 'category', e.target.value)}
                                                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
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
                                                            value={(item as AIIdentifiedTool).condition}
                                                            onChange={(e) => updateItem(index, 'condition', e.target.value)}
                                                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                                                        >
                                                            {CONDITIONS.map(cond => (
                                                                <option key={cond.value} value={cond.value}>{cond.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </>
                                            )}

                                            {/* Notes */}
                                            <div className="lg:col-span-2">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Notes
                                                </label>
                                                <textarea
                                                    value={item.notes || ''}
                                                    onChange={(e) => updateItem(index, 'notes', e.target.value)}
                                                    rows={2}
                                                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                                                    placeholder="Optional notes..."
                                                />
                                            </div>
                                        </div>

                                        {/* Remove Button */}
                                        <div className="shrink-0">
                                            <button
                                                onClick={() => removeItem(index)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                title="Remove item"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add Manual Item Button */}
                    {items.length > 0 && (
                        <button
                            onClick={addManualItem}
                            className="mt-4 w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 text-gray-600 hover:text-blue-600 font-medium flex items-center justify-center gap-2"
                        >
                            <Plus className="w-5 h-5" />
                            Add Item Manually
                        </button>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center p-6 border-t shrink-0">
                    <div className="text-sm text-gray-500">
                        {items.length} item{items.length !== 1 ? 's' : ''} to save
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                            disabled={isSaving}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                            disabled={isSaving || items.length === 0}
                        >
                            {isSaving ? (
                                <>
                                    <Save className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    Save All {items.length > 0 && `(${items.length})`}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
