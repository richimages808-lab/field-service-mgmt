import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { InventoryCategory } from '../../types';
import { getDefaultInventorySettings, normalizeTradeKey } from '../../utils/defaultInventoryCategories';
import { Plus, Trash2, Save, X, AlertCircle, CheckCircle, Briefcase, Wrench, Boxes, Sparkles, RefreshCw, FolderPlus } from 'lucide-react';
import toast from 'react-hot-toast';

export const InventoryCategoriesManager: React.FC = () => {
    const { organization } = useAuth();
    const [workCategories, setWorkCategories] = useState<InventoryCategory[]>([]);
    const [toolCategories, setToolCategories] = useState<InventoryCategory[]>([]);
    const [materialCategories, setMaterialCategories] = useState<InventoryCategory[]>([]);
    const [activeSection, setActiveSection] = useState<'work' | 'tools' | 'materials'>('work');
    
    // Subcategory inline add state: categoryId -> draft text
    const [activeAddSubId, setActiveAddSubId] = useState<string | null>(null);
    const [newSubText, setNewSubText] = useState('');

    // Inline parent category add state
    const [isAddingParent, setIsAddingParent] = useState(false);
    const [newParentName, setNewParentName] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Trade specialty detected from organization profile
    const org = organization as any;
    const tradeTitle = org?.settings?.businessType || org?.settings?.industry || org?.businessProfile || 'Residential Plumbing & Drain Cleaning';

    // Load initial data
    useEffect(() => {
        if (organization) {
            const defaultSettings = getDefaultInventorySettings(tradeTitle);
            
            // If workCategories doesn't exist or is the 3-item generic fallback when trade is specialized, upgrade to trade default
            const existingWork = org.inventorySettings?.workCategories;
            const isGenericWork = existingWork && existingWork.length === 3 && (existingWork[0]?.id === 'work_diag_eval' || existingWork[0]?.id === 'work_gen_diag' || existingWork[0]?.name === 'Diagnostics & Evaluation') && normalizeTradeKey(tradeTitle) !== 'general';
            setWorkCategories(!existingWork || isGenericWork ? defaultSettings.workCategories : existingWork);
            
            // If toolCategories is missing or using default general items when trade is specialized, upgrade to trade default
            const existingTools = org.inventorySettings?.toolCategories;
            const isGenericTools = existingTools && existingTools.length <= 4 && (existingTools[0]?.id === 'hand_tools' || existingTools[0]?.id === 'tool_gen_hand') && normalizeTradeKey(tradeTitle) !== 'general';
            setToolCategories(!existingTools || isGenericTools ? defaultSettings.toolCategories : existingTools);
            
            // If materialCategories is missing or using default general items when trade is specialized, upgrade to trade default
            const existingMats = org.inventorySettings?.materialCategories;
            const isGenericMats = existingMats && existingMats.length <= 3 && (existingMats[0]?.id === 'hardware' || existingMats[0]?.id === 'mat_gen_fasteners') && normalizeTradeKey(tradeTitle) !== 'general';
            setMaterialCategories(!existingMats || isGenericMats ? defaultSettings.materialCategories : existingMats);
        }
    }, [organization, tradeTitle]);

    const handleAutoFillFromTrade = () => {
        if (confirm(`Auto-fill Work, Tool, and Material categories tailored for "${tradeTitle}"? Any unsaved manual additions will be replaced with standard trade categories.`)) {
            const defaults = getDefaultInventorySettings(tradeTitle);
            setWorkCategories(defaults.workCategories);
            setToolCategories(defaults.toolCategories);
            setMaterialCategories(defaults.materialCategories);
            toast.success(`Loaded standard categories for ${tradeTitle}! Click "Save Categories" to persist.`);
        }
    };

    const handleSave = async () => {
        if (!organization) return;
        setIsSaving(true);
        setError('');
        try {
            const orgRef = doc(db, 'organizations', organization.id);
            await updateDoc(orgRef, {
                'inventorySettings.workCategories': workCategories,
                'inventorySettings.toolCategories': toolCategories,
                'inventorySettings.materialCategories': materialCategories,
            });
            setSuccess(true);
            toast.success('Categories updated successfully!');
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            console.error('Failed to save categories', err);
            setError(err.message || 'Failed to save categories');
            toast.error(err.message || 'Failed to save categories');
        } finally {
            setIsSaving(false);
        }
    };

    const getActiveCategoryList = () => {
        if (activeSection === 'work') return workCategories;
        if (activeSection === 'tools') return toolCategories;
        return materialCategories;
    };

    const setActiveCategoryList = (newList: InventoryCategory[]) => {
        if (activeSection === 'work') setWorkCategories(newList);
        else if (activeSection === 'tools') setToolCategories(newList);
        else setMaterialCategories(newList);
    };

    const targetCategories = getActiveCategoryList();

    const handleCreateParentCategory = () => {
        if (!newParentName.trim()) return;
        const newCat: InventoryCategory = {
            id: `cat_${Date.now()}`,
            name: newParentName.trim(),
            subcategories: []
        };
        setActiveCategoryList([...targetCategories, newCat]);
        setNewParentName('');
        setIsAddingParent(false);
    };

    const updateCategoryName = (id: string, name: string) => {
        setActiveCategoryList(targetCategories.map(cat => cat.id === id ? { ...cat, name } : cat));
    };

    const deleteCategory = (id: string) => {
        if (confirm('Are you sure you want to delete this category? Items or tasks referencing it will keep their values.')) {
            setActiveCategoryList(targetCategories.filter(cat => cat.id !== id));
        }
    };

    const handleAddSubcategorySubmit = (categoryId: string) => {
        const text = newSubText.trim();
        if (!text) return;
        setActiveCategoryList(targetCategories.map(cat => {
            if (cat.id === categoryId && !cat.subcategories.includes(text)) {
                return { ...cat, subcategories: [...cat.subcategories, text] };
            }
            return cat;
        }));
        setNewSubText('');
        setActiveAddSubId(null);
    };

    const removeSubcategory = (categoryId: string, sub: string) => {
        setActiveCategoryList(targetCategories.map(cat => {
            if (cat.id === categoryId) {
                return { ...cat, subcategories: cat.subcategories.filter(s => s !== sub) };
            }
            return cat;
        }));
    };

    return (
        <div className="space-y-6">
            {/* Header & Auto-Fill Bar */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-gray-900">Trade Work & Inventory Categories</h2>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                {tradeTitle}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            Customize categories of work, tools, and inventory materials. Auto-filled based on your trade specialty so AI estimates, tech dispatch, and inventory stay organized.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={handleAutoFillFromTrade}
                        className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200 hover:from-blue-100 hover:to-indigo-100 transition-colors shrink-0 shadow-2xs"
                        title="Reset or auto-fill categories tailored to your selected trade specialty"
                    >
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <span>Auto-fill from Trade</span>
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 border-b border-gray-200 pb-px">
                <button
                    onClick={() => { setActiveSection('work'); setActiveAddSubId(null); setIsAddingParent(false); }}
                    className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                        activeSection === 'work'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    <Briefcase className="w-4 h-4" />
                    <span>Categories of Work</span>
                    <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 font-mono">
                        {workCategories.length}
                    </span>
                </button>

                <button
                    onClick={() => { setActiveSection('tools'); setActiveAddSubId(null); setIsAddingParent(false); }}
                    className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                        activeSection === 'tools'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    <Wrench className="w-4 h-4" />
                    <span>Tool Categories</span>
                    <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 font-mono">
                        {toolCategories.length}
                    </span>
                </button>

                <button
                    onClick={() => { setActiveSection('materials'); setActiveAddSubId(null); setIsAddingParent(false); }}
                    className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                        activeSection === 'materials'
                            ? 'border-amber-600 text-amber-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    <Boxes className="w-4 h-4" />
                    <span>Material Categories</span>
                    <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 font-mono">
                        {materialCategories.length}
                    </span>
                </button>
            </div>

            {/* Explanatory helper text per tab */}
            <div className="text-xs text-gray-500">
                {activeSection === 'work' && (
                    <span>Define standard service work scopes and subsystems. The AI uses these categories to categorize job estimates, quote line items, and dispatch scopes.</span>
                )}
                {activeSection === 'tools' && (
                    <span>Define equipment classifications and tool groups. Technicians use these categories when reviewing truck loadouts and warehouse assets.</span>
                )}
                {activeSection === 'materials' && (
                    <span>Define parts, pipe, hardware, and consumable categories. Used for vendor parts catalog matching, stock tracking, and material pricing.</span>
                )}
            </div>

            {/* Category Cards List */}
            <div className="space-y-4">
                {targetCategories.map(category => (
                    <div key={category.id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-2xs hover:border-gray-300 transition-colors">
                        <div className="flex items-center justify-between mb-3 gap-3">
                            <div className="flex items-center gap-2 flex-1">
                                <input 
                                    type="text" 
                                    value={category.name}
                                    onChange={(e) => updateCategoryName(category.id, e.target.value)}
                                    className="font-bold text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent px-1 py-0.5 max-w-md text-base"
                                    title="Click to rename category"
                                />
                                <span className="text-xs text-gray-400 font-medium">
                                    ({category.subcategories.length} {category.subcategories.length === 1 ? 'item' : 'items'})
                                </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        if (activeAddSubId === category.id) {
                                            setActiveAddSubId(null);
                                        } else {
                                            setActiveAddSubId(category.id);
                                            setNewSubText('');
                                        }
                                    }}
                                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors border border-gray-200"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add Subcategory</span>
                                </button>
                                
                                <button 
                                    type="button"
                                    onClick={() => deleteCategory(category.id)}
                                    className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors ml-1"
                                    title="Delete Category"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        
                        {/* Subcategories Chip List */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 pl-1">
                            {category.subcategories.length === 0 && activeAddSubId !== category.id ? (
                                <span className="text-xs text-gray-400 italic">No subcategories yet. Click "Add Subcategory" to add items.</span>
                            ) : (
                                category.subcategories.map(sub => (
                                    <div 
                                        key={sub} 
                                        className="group inline-flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200/80 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-700 transition-colors"
                                    >
                                        <span>{sub}</span>
                                        <button 
                                            type="button"
                                            onClick={() => removeSubcategory(category.id, sub)}
                                            className="text-gray-400 hover:text-red-500 rounded-full p-0.5 hover:bg-red-50 transition-colors"
                                            title={`Remove ${sub}`}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))
                            )}

                            {/* Inline Add Subcategory Input */}
                            {activeAddSubId === category.id && (
                                <div className="inline-flex items-center gap-1 bg-blue-50/70 border border-blue-200 rounded-lg p-1 animate-fadeIn">
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="e.g. Tankless Descaling"
                                        value={newSubText}
                                        onChange={(e) => setNewSubText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddSubcategorySubmit(category.id);
                                            } else if (e.key === 'Escape') {
                                                setActiveAddSubId(null);
                                            }
                                        }}
                                        className="text-xs px-2 py-1 bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 placeholder-gray-400 w-44"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleAddSubcategorySubmit(category.id)}
                                        disabled={!newSubText.trim()}
                                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold"
                                    >
                                        Add
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveAddSubId(null)}
                                        className="p-1 text-gray-400 hover:text-gray-600 rounded"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* Add Parent Category Card */}
                {isAddingParent ? (
                    <div className="border border-blue-300 rounded-xl p-4 bg-blue-50/40 shadow-xs animate-fadeIn space-y-3">
                        <div className="flex items-center gap-2">
                            <FolderPlus className="w-4 h-4 text-blue-600" />
                            <h4 className="text-sm font-bold text-gray-900">Add New Category</h4>
                        </div>
                        <div className="flex items-center gap-2 max-w-md">
                            <input
                                type="text"
                                autoFocus
                                placeholder="e.g. Specialty Equipment & Testing"
                                value={newParentName}
                                onChange={(e) => setNewParentName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleCreateParentCategory();
                                    } else if (e.key === 'Escape') {
                                        setIsAddingParent(false);
                                    }
                                }}
                                className="flex-1 text-sm px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                            />
                            <button
                                type="button"
                                onClick={handleCreateParentCategory}
                                disabled={!newParentName.trim()}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                            >
                                Create
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsAddingParent(false)}
                                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <button 
                        type="button"
                        onClick={() => setIsAddingParent(true)}
                        className="w-full py-3.5 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl text-gray-500 hover:text-blue-600 flex items-center justify-center gap-2 transition-colors bg-white hover:bg-blue-50/20 text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Add Parent Category to {activeSection === 'work' ? 'Categories of Work' : activeSection === 'tools' ? 'Tool Categories' : 'Material Categories'}</span>
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Bottom Save Action Bar */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-500">
                    Changes to Work, Tool, and Material categories are saved across your entire organization.
                </div>
                
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors shadow-2xs disabled:opacity-50 text-sm"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Saving...' : 'Save Categories'}</span>
                    </button>
                    {success && (
                        <span className="text-sm font-medium text-emerald-600 flex items-center gap-1.5 animate-fadeIn">
                            <CheckCircle className="w-4 h-4" />
                            <span>Saved!</span>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
