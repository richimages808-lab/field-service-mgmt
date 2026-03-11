import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { QuoteTemplate, JobCategory, JOB_CATEGORIES } from '../types';
import { FileText, Plus, Trash2, Edit2, X, Check, Copy, DollarSign } from 'lucide-react';

interface QuoteTemplateManagerProps {
    onSelectTemplate?: (template: QuoteTemplate) => void;
    filterCategory?: JobCategory;
    compact?: boolean;
}

export const QuoteTemplateManager: React.FC<QuoteTemplateManagerProps> = ({
    onSelectTemplate,
    filterCategory,
    compact = false
}) => {
    const { user } = useAuth();
    const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<QuoteTemplate | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formCategory, setFormCategory] = useState<JobCategory>('repair');
    const [formDescription, setFormDescription] = useState('');
    const [formDuration, setFormDuration] = useState(60);
    const [formTools, setFormTools] = useState('');
    const [formMaterials, setFormMaterials] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [formLineItems, setFormLineItems] = useState<QuoteTemplate['lineItems']>([
        { description: '', unitPrice: 0, quantity: 1, isOptional: false }
    ]);

    const orgId = (user as any)?.org_id || 'demo-org';

    useEffect(() => {
        const templatesQuery = query(
            collection(db, 'quote_templates'),
            where('org_id', '==', orgId),
            where('isActive', '==', true)
        );

        const unsubscribe = onSnapshot(templatesQuery, (snapshot) => {
            let templatesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as QuoteTemplate));

            if (filterCategory) {
                templatesData = templatesData.filter(t => t.jobCategory === filterCategory);
            }

            setTemplates(templatesData.sort((a, b) => a.name.localeCompare(b.name)));
            setLoading(false);
        }, (error) => {
            console.error('Error fetching quote templates:', error);
            setLoading(false);
        });

        return unsubscribe;
    }, [orgId, filterCategory]);

    const resetForm = () => {
        setFormName('');
        setFormCategory('repair');
        setFormDescription('');
        setFormDuration(60);
        setFormTools('');
        setFormMaterials('');
        setFormNotes('');
        setFormLineItems([{ description: '', unitPrice: 0, quantity: 1, isOptional: false }]);
        setEditingTemplate(null);
        setShowAddForm(false);
    };

    const handleEdit = (template: QuoteTemplate) => {
        setEditingTemplate(template);
        setFormName(template.name);
        setFormCategory(template.jobCategory);
        setFormDescription(template.description);
        setFormDuration(template.estimatedDuration);
        setFormTools(template.requiredTools.join(', '));
        setFormMaterials(template.requiredMaterials.join(', '));
        setFormNotes(template.notes || '');
        setFormLineItems(template.lineItems.length > 0 ? template.lineItems : [
            { description: '', unitPrice: 0, quantity: 1, isOptional: false }
        ]);
        setShowAddForm(true);
    };

    const handleDuplicate = (template: QuoteTemplate) => {
        setFormName(`${template.name} (Copy)`);
        setFormCategory(template.jobCategory);
        setFormDescription(template.description);
        setFormDuration(template.estimatedDuration);
        setFormTools(template.requiredTools.join(', '));
        setFormMaterials(template.requiredMaterials.join(', '));
        setFormNotes(template.notes || '');
        setFormLineItems(template.lineItems);
        setEditingTemplate(null);
        setShowAddForm(true);
    };

    const addLineItem = () => {
        setFormLineItems([...formLineItems, { description: '', unitPrice: 0, quantity: 1, isOptional: false }]);
    };

    const updateLineItem = (index: number, field: keyof QuoteTemplate['lineItems'][0], value: any) => {
        const updated = [...formLineItems];
        updated[index] = { ...updated[index], [field]: value };
        setFormLineItems(updated);
    };

    const removeLineItem = (index: number) => {
        if (formLineItems.length > 1) {
            setFormLineItems(formLineItems.filter((_, i) => i !== index));
        }
    };

    const handleSave = async () => {
        if (!formName.trim() || !user) return;

        setSaving(true);
        const toolsArray = formTools.split(',').map(t => t.trim()).filter(t => t);
        const materialsArray = formMaterials.split(',').map(m => m.trim()).filter(m => m);
        const validLineItems = formLineItems.filter(item => item.description.trim());

        try {
            const templateData = {
                org_id: orgId,
                name: formName.trim(),
                jobCategory: formCategory,
                description: formDescription.trim(),
                estimatedDuration: formDuration,
                requiredTools: toolsArray,
                requiredMaterials: materialsArray,
                notes: formNotes.trim() || null,
                lineItems: validLineItems,
                isActive: true
            };

            if (editingTemplate) {
                await updateDoc(doc(db, 'quote_templates', editingTemplate.id), {
                    ...templateData,
                    updatedAt: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, 'quote_templates'), {
                    ...templateData,
                    createdAt: serverTimestamp()
                });
            }
            resetForm();
        } catch (error) {
            console.error('Error saving template:', error);
            alert('Failed to save template');
        }
        setSaving(false);
    };

    const handleDelete = async (templateId: string) => {
        if (!confirm('Delete this quote template?')) return;
        try {
            await updateDoc(doc(db, 'quote_templates', templateId), {
                isActive: false,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Error deleting template:', error);
        }
    };

    const calculateTotal = (items: QuoteTemplate['lineItems']) => {
        return items
            .filter(item => !item.isOptional)
            .reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    };

    if (compact) {
        return (
            <div className="bg-white rounded-lg shadow p-3">
                <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold">Quote Templates</span>
                </div>
                <div className="space-y-1">
                    {templates.slice(0, 5).map(template => (
                        <button
                            key={template.id}
                            onClick={() => onSelectTemplate?.(template)}
                            className="w-full text-left p-2 text-sm rounded hover:bg-gray-50 flex items-center justify-between"
                        >
                            <span>{template.name}</span>
                            <span className="text-gray-500">${calculateTotal(template.lineItems)}</span>
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
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Quote Templates</h3>
                </div>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                    <Plus className="w-4 h-4" />
                    New Template
                </button>
            </div>

            {/* Add/Edit Form */}
            {showAddForm && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border max-h-[70vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{editingTemplate ? 'Edit Template' : 'New Quote Template'}</h4>
                        <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                            <input
                                type="text"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder="e.g., Standard HVAC Service"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Job Category</label>
                            <select
                                value={formCategory}
                                onChange={(e) => setFormCategory(e.target.value as JobCategory)}
                                className="w-full p-2 border rounded"
                            >
                                {JOB_CATEGORIES.map(cat => (
                                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                placeholder="Describe what this quote covers..."
                                rows={2}
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Est. Duration (min)</label>
                            <input
                                type="number"
                                value={formDuration}
                                onChange={(e) => setFormDuration(parseInt(e.target.value) || 0)}
                                min="15"
                                step="15"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Required Tools</label>
                            <input
                                type="text"
                                value={formTools}
                                onChange={(e) => setFormTools(e.target.value)}
                                placeholder="Multimeter, wrench set"
                                className="w-full p-2 border rounded"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Required Materials</label>
                            <input
                                type="text"
                                value={formMaterials}
                                onChange={(e) => setFormMaterials(e.target.value)}
                                placeholder="Filter, refrigerant, copper tubing"
                                className="w-full p-2 border rounded"
                            />
                        </div>
                    </div>

                    {/* Line Items */}
                    <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700">Line Items</label>
                            <button
                                type="button"
                                onClick={addLineItem}
                                className="text-xs text-blue-600 hover:text-blue-800"
                            >
                                + Add Line
                            </button>
                        </div>
                        <div className="space-y-2">
                            {formLineItems.map((item, index) => (
                                <div key={index} className="flex gap-2 items-start">
                                    <input
                                        type="text"
                                        value={item.description}
                                        onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                                        placeholder="Description"
                                        className="flex-1 p-2 border rounded text-sm"
                                    />
                                    <input
                                        type="number"
                                        value={item.quantity}
                                        onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                        min="1"
                                        className="w-16 p-2 border rounded text-sm"
                                        title="Qty"
                                    />
                                    <div className="relative">
                                        <DollarSign className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
                                        <input
                                            type="number"
                                            value={item.unitPrice}
                                            onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                                            min="0"
                                            step="0.01"
                                            className="w-24 p-2 pl-6 border rounded text-sm"
                                            title="Price"
                                        />
                                    </div>
                                    <label className="flex items-center gap-1 text-xs text-gray-600">
                                        <input
                                            type="checkbox"
                                            checked={item.isOptional}
                                            onChange={(e) => updateLineItem(index, 'isOptional', e.target.checked)}
                                            className="rounded"
                                        />
                                        Optional
                                    </label>
                                    {formLineItems.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeLineItem(index)}
                                            className="p-2 text-gray-400 hover:text-red-600"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="mt-2 text-right text-sm font-medium">
                            Total: ${calculateTotal(formLineItems).toFixed(2)}
                        </div>
                    </div>

                    <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
                        <textarea
                            value={formNotes}
                            onChange={(e) => setFormNotes(e.target.value)}
                            placeholder="Notes for techs (not shown to customers)"
                            rows={2}
                            className="w-full p-2 border rounded"
                        />
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={handleSave}
                            disabled={saving || !formName.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            {saving ? 'Saving...' : 'Save Template'}
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

            {/* Templates List */}
            {loading ? (
                <p className="text-gray-500 text-sm">Loading templates...</p>
            ) : templates.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                    No quote templates yet. Create templates to speed up quoting.
                </p>
            ) : (
                <div className="space-y-2">
                    {templates.map(template => (
                        <div
                            key={template.id}
                            className="p-3 rounded-lg border bg-white hover:bg-gray-50"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-gray-900">{template.name}</p>
                                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                            {JOB_CATEGORIES.find(c => c.value === template.jobCategory)?.label}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                        <span>{template.estimatedDuration} min</span>
                                        <span>{template.lineItems.length} line items</span>
                                        <span className="font-medium text-green-600">
                                            ${calculateTotal(template.lineItems).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {onSelectTemplate && (
                                        <button
                                            onClick={() => onSelectTemplate(template)}
                                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                                        >
                                            Use
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDuplicate(template)}
                                        className="p-1 text-gray-400 hover:text-blue-600"
                                        title="Duplicate"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleEdit(template)}
                                        className="p-1 text-gray-400 hover:text-blue-600"
                                        title="Edit"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(template.id)}
                                        className="p-1 text-gray-400 hover:text-red-600"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
