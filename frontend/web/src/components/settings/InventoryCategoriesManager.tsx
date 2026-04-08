import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { InventoryCategory } from '../../types';
import { getDefaultInventorySettings } from '../../utils/defaultInventoryCategories';
import { Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronRight, AlertCircle, CheckCircle } from 'lucide-react';

export const InventoryCategoriesManager: React.FC = () => {
    const { organization } = useAuth();
    const [toolCategories, setToolCategories] = useState<InventoryCategory[]>([]);
    const [materialCategories, setMaterialCategories] = useState<InventoryCategory[]>([]);
    const [activeSection, setActiveSection] = useState<'tools' | 'materials'>('tools');
    
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Load initial data
    useEffect(() => {
        if (organization) {
            const org = organization as any;
            const defaultSettings = getDefaultInventorySettings(org.businessProfile || 'general');
            setToolCategories(org.inventorySettings?.toolCategories || defaultSettings.toolCategories);
            setMaterialCategories(org.inventorySettings?.materialCategories || defaultSettings.materialCategories);
        }
    }, [organization]);

    const handleSave = async () => {
        if (!organization) return;
        setIsSaving(true);
        setError('');
        try {
            const orgRef = doc(db, 'organizations', organization.id);
            await updateDoc(orgRef, {
                'inventorySettings.toolCategories': toolCategories,
                'inventorySettings.materialCategories': materialCategories,
            });
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            console.error('Failed to save categories', err);
            setError(err.message || 'Failed to save categories');
        } finally {
            setIsSaving(false);
        }
    };

    const targetCategories = activeSection === 'tools' ? toolCategories : materialCategories;
    const setTargetCategories = activeSection === 'tools' ? setToolCategories : setMaterialCategories;

    const addCategory = () => {
        const newCat: InventoryCategory = {
            id: `cat_${Date.now()}`,
            name: 'New Category',
            subcategories: []
        };
        setTargetCategories([...targetCategories, newCat]);
    };

    const updateCategoryName = (id: string, name: string) => {
        setTargetCategories(targetCategories.map(cat => cat.id === id ? { ...cat, name } : cat));
    };

    const deleteCategory = (id: string) => {
        if (confirm('Are you sure you want to delete this category? Items using this category will still retain the text value but may be orphaned in the UI.')) {
            setTargetCategories(targetCategories.filter(cat => cat.id !== id));
        }
    };

    const addSubcategory = (categoryId: string) => {
        const subName = prompt('Enter new subcategory name:');
        if (subName && subName.trim()) {
            setTargetCategories(targetCategories.map(cat => {
                if (cat.id === categoryId && !cat.subcategories.includes(subName.trim())) {
                    return { ...cat, subcategories: [...cat.subcategories, subName.trim()] };
                }
                return cat;
            }));
        }
    };

    const removeSubcategory = (categoryId: string, sub: string) => {
        setTargetCategories(targetCategories.map(cat => {
            if (cat.id === categoryId) {
                return { ...cat, subcategories: cat.subcategories.filter(s => s !== sub) };
            }
            return cat;
        }));
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Inventory Categories</h2>
                <p className="text-sm text-gray-500 mb-6">Customize the categories and subcategories used for organizing your Tools and Materials.</p>
                
                {/* Tabs */}
                <div className="flex gap-4 border-b border-gray-200 mb-6">
                    <button
                        onClick={() => setActiveSection('tools')}
                        className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeSection === 'tools' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Tool Categories
                    </button>
                    <button
                        onClick={() => setActiveSection('materials')}
                        className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeSection === 'materials' ? 'border-amber-600 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Material Categories
                    </button>
                </div>

                <div className="space-y-4">
                    {targetCategories.map(category => (
                        <div key={category.id} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2 flex-1">
                                    <input 
                                        type="text" 
                                        value={category.name}
                                        onChange={(e) => updateCategoryName(category.id, e.target.value)}
                                        className="font-semibold text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent px-1 py-0.5 max-w-sm"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => addSubcategory(category.id)}
                                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                        <Plus size={14} /> Add Subcategory
                                    </button>
                                    <button 
                                        onClick={() => deleteCategory(category.id)}
                                        className="text-red-400 hover:text-red-600 ml-2"
                                        title="Delete Category"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap gap-2 pl-2">
                                {category.subcategories.length === 0 ? (
                                    <span className="text-xs text-gray-400 italic">No subcategories</span>
                                ) : (
                                    category.subcategories.map(sub => (
                                        <div key={sub} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-sm text-gray-700">
                                            {sub}
                                            <button 
                                                onClick={() => removeSubcategory(category.id, sub)}
                                                className="text-gray-400 hover:text-red-500 ml-1"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ))}

                    <button 
                        onClick={addCategory}
                        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-400 flex items-center justify-center gap-2 transition-colors"
                    >
                        <Plus size={18} />
                        Add Parent Category
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                    <AlertCircle size={18} /> {error}
                </div>
            )}

            <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                    <Save size={18} />
                    {isSaving ? 'Saving...' : 'Save Categories'}
                </button>
                {success && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle size={16} /> Saved!</span>}
            </div>
        </div>
    );
};
