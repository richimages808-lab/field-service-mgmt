import React, { useState } from 'react';
import {
    Sparkles,
    Plus,
    Trash2,
    Clock,
    DollarSign,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Edit3,
    Check,
    X,
    Filter,
    HelpCircle
} from 'lucide-react';
import { CatalogServiceItem } from '../../lib/industryCatalog';

interface CompanyServicesManagerProps {
    services: CatalogServiceItem[];
    onChange: (services: CatalogServiceItem[]) => void;
    businessType?: string;
    industry?: string;
    onRefineWithAI: (refinementPrompt: string) => Promise<void>;
    isGeneratingAI?: boolean;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    repair: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    installation: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    maintenance: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    diagnostic: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    emergency: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    inspection: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
    replacement: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
};

const UNIT_LABELS: Record<string, string> = {
    flat_rate: 'Flat Rate',
    per_hour: '/ Hour',
    diagnostic_fee: 'Diagnostic Fee',
    per_unit: '/ Unit',
    per_foot: '/ Linear Ft',
    per_sqft: '/ Sq Ft'
};

const SUGGESTED_REFINEMENT_PROMPTS = [
    { label: '⚡ Add 24/7 Emergency Rate', prompt: 'Add an emergency after-hours dispatch fee of $195 and adjust standard repairs for urgent calls.' },
    { label: '🏢 Focus on Commercial Clients', prompt: 'Tailor all services for commercial facilities and property managers, remove small residential jobs.' },
    { label: '🔍 Add Diagnostic Inspection', prompt: 'Ensure there is a standard $89 diagnostic fee that applies toward repairs.' },
    { label: '💰 Increase Rates by 20%', prompt: 'Increase suggested pricing across all services by approximately 20% for high-cost metro area.' },
    { label: '🛠️ Add Preventive Maintenance', prompt: 'Add a recurring seasonal maintenance inspection and tune-up agreement.' }
];

export const CompanyServicesManager: React.FC<CompanyServicesManagerProps> = ({
    services,
    onChange,
    businessType,
    industry,
    onRefineWithAI,
    isGeneratingAI = false
}) => {
    const [aiPrompt, setAiPrompt] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

    // New service form state
    const [newServiceName, setNewServiceName] = useState('');
    const [newServiceDesc, setNewServiceDesc] = useState('');
    const [newServicePrice, setNewServicePrice] = useState<number>(150);
    const [newServiceUnit, setNewServiceUnit] = useState<CatalogServiceItem['unit']>('flat_rate');
    const [newServiceCategory, setNewServiceCategory] = useState<CatalogServiceItem['category']>('repair');
    const [newServiceDuration, setNewServiceDuration] = useState<number>(60);

    const activeCount = services.filter(s => s.active !== false).length;

    // Toggle active state
    const handleToggleActive = (id: string) => {
        onChange(services.map(s => s.id === id ? { ...s, active: s.active === false } : s));
    };

    // Delete a service
    const handleDeleteService = (id: string) => {
        onChange(services.filter(s => s.id !== id));
    };

    // Update specific field
    const handleUpdateField = (id: string, field: keyof CatalogServiceItem, value: any) => {
        onChange(services.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    // Handle adding custom service
    const handleAddCustomService = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newServiceName.trim()) return;

        const newService: CatalogServiceItem = {
            id: `custom_srv_${Date.now()}`,
            name: newServiceName.trim(),
            description: newServiceDesc.trim() || 'Custom billable labor service.',
            unit_price: Number(newServicePrice) || 0,
            unit: newServiceUnit,
            category: newServiceCategory,
            estimated_duration_minutes: Number(newServiceDuration) || 60,
            tags: [newServiceName.toLowerCase().replace(/[^a-z0-9]/g, '_')],
            active: true
        };

        onChange([newService, ...services]);
        setIsAddingNew(false);
        setNewServiceName('');
        setNewServiceDesc('');
        setNewServicePrice(150);
        setNewServiceUnit('flat_rate');
        setNewServiceCategory('repair');
        setNewServiceDuration(60);
    };

    // Refine with AI submit
    const handleAiSubmit = async (promptToUse?: string) => {
        const text = promptToUse || aiPrompt;
        if (!text.trim() || isGeneratingAI) return;
        await onRefineWithAI(text.trim());
        setAiPrompt('');
    };

    const filteredServices = services.filter(s => {
        if (filterCategory === 'all') return true;
        if (filterCategory === 'active') return s.active !== false;
        if (filterCategory === 'inactive') return s.active === false;
        return s.category === filterCategory;
    });

    return (
        <div className="space-y-5">
            {/* Header & Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">
                            Types of Services Offered
                        </h3>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            {activeCount} Active of {services.length}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Pre-populated by AI based on {businessType || industry || 'your industry'}. Toggle on/off, edit rates, or refine with AI prompt.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setIsAddingNew(!isAddingNew)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors shadow-sm"
                    >
                        <Plus className="w-3.5 h-3.5 text-indigo-600" />
                        Add Custom Service
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange(services.map(s => ({ ...s, active: true })))}
                        className="px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                        Select All
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange(services.map(s => ({ ...s, active: false })))}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
                    >
                        Deselect All
                    </button>
                </div>
            </div>

            {/* AI Refinement Prompt Bar */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 rounded-xl p-4 text-white shadow-md relative overflow-hidden">
                <div className="relative z-10 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1 rounded-md bg-indigo-500/30 text-indigo-300">
                            <Sparkles className="w-4 h-4 text-indigo-300" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">
                            AI Service Catalog Refinement
                        </h4>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-400/20 text-indigo-200">
                            Prompt-Driven
                        </span>
                    </div>
                    <p className="text-xs text-indigo-200/90 leading-relaxed">
                        Don't want to edit line-by-line? Tell the AI how you operate and it will instantly reshape your services, rates, and scopes.
                    </p>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAiSubmit();
                                }
                            }}
                            disabled={isGeneratingAI}
                            placeholder="e.g. 'We don't do residential, add commercial kitchen grease lines and raise pricing 15%'..."
                            className="flex-1 px-3.5 py-2 text-xs rounded-lg bg-white/10 border border-white/20 text-white placeholder-indigo-200/60 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white/15 transition-all"
                        />
                        <button
                            type="button"
                            onClick={() => handleAiSubmit()}
                            disabled={isGeneratingAI || !aiPrompt.trim()}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white transition-all flex-shrink-0 shadow"
                        >
                            {isGeneratingAI ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Refining...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Refine with AI
                                </>
                            )}
                        </button>
                    </div>

                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        {SUGGESTED_REFINEMENT_PROMPTS.map((chip, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => handleAiSubmit(chip.prompt)}
                                disabled={isGeneratingAI}
                                className="text-[11px] px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-indigo-100 transition-colors border border-white/10"
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Quick Add Custom Service Form */}
            {isAddingNew && (
                <form onSubmit={handleAddCustomService} className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Plus className="w-4 h-4 text-indigo-600" />
                            New Custom Service Line-Item
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsAddingNew(false)}
                            className="text-slate-400 hover:text-slate-600"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Service Title *</label>
                            <input
                                type="text"
                                value={newServiceName}
                                onChange={(e) => setNewServiceName(e.target.value)}
                                placeholder="e.g. Emergency Hydro-Jetting"
                                required
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Category</label>
                            <select
                                value={newServiceCategory}
                                onChange={(e) => setNewServiceCategory(e.target.value as any)}
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                            >
                                <option value="repair">Repair</option>
                                <option value="installation">Installation</option>
                                <option value="maintenance">Maintenance</option>
                                <option value="diagnostic">Diagnostic</option>
                                <option value="emergency">Emergency</option>
                                <option value="inspection">Inspection</option>
                                <option value="replacement">Replacement</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Price ($) & Unit</label>
                            <div className="flex gap-1.5">
                                <input
                                    type="number"
                                    value={newServicePrice}
                                    onChange={(e) => setNewServicePrice(Number(e.target.value))}
                                    className="w-24 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                                    min="0"
                                />
                                <select
                                    value={newServiceUnit}
                                    onChange={(e) => setNewServiceUnit(e.target.value as any)}
                                    className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                                >
                                    <option value="flat_rate">Flat Rate</option>
                                    <option value="per_hour">/ Hour</option>
                                    <option value="diagnostic_fee">Diagnostic</option>
                                    <option value="per_unit">/ Unit</option>
                                </select>
                            </div>
                        </div>
                        <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Description (Customer-Facing)</label>
                            <input
                                type="text"
                                value={newServiceDesc}
                                onChange={(e) => setNewServiceDesc(e.target.value)}
                                placeholder="What is included in this service..."
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Est. Duration (Mins)</label>
                            <input
                                type="number"
                                value={newServiceDuration}
                                onChange={(e) => setNewServiceDuration(Number(e.target.value))}
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                                min="15"
                                step="15"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => setIsAddingNew(false)}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                            Add Service to Catalog
                        </button>
                    </div>
                </form>
            )}

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400 mr-1 flex-shrink-0" />
                <button
                    type="button"
                    onClick={() => setFilterCategory('all')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        filterCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    All ({services.length})
                </button>
                <button
                    type="button"
                    onClick={() => setFilterCategory('active')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        filterCategory === 'active' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    Active ({activeCount})
                </button>
                {['repair', 'installation', 'maintenance', 'diagnostic', 'emergency'].map(cat => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setFilterCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg font-medium capitalize transition-colors ${
                            filterCategory === cat ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Services List / Cards */}
            {services.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                    <p className="text-sm font-medium text-slate-600">No services loaded yet</p>
                    <p className="text-xs text-slate-400 mt-1">Select an industry above to auto-populate standard services, or add a custom service.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredServices.map((service) => {
                        const isEditing = editingServiceId === service.id;
                        const catStyle = CATEGORY_COLORS[service.category] || CATEGORY_COLORS.repair;
                        const isActive = service.active !== false;

                        return (
                            <div
                                key={service.id}
                                className={`p-3.5 rounded-xl border transition-all ${
                                    isActive
                                        ? 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
                                        : 'bg-slate-50/60 border-slate-200 opacity-60'
                                }`}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                    {/* Left: Active Toggle & Content */}
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={isActive}
                                            onChange={() => handleToggleActive(service.id)}
                                            className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <div className="flex-1 min-w-0">
                                            {isEditing ? (
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        value={service.name}
                                                        onChange={(e) => handleUpdateField(service.id, 'name', e.target.value)}
                                                        className="w-full px-2.5 py-1 text-sm font-semibold border rounded-md"
                                                    />
                                                    <textarea
                                                        value={service.description}
                                                        onChange={(e) => handleUpdateField(service.id, 'description', e.target.value)}
                                                        className="w-full px-2.5 py-1 text-xs border rounded-md"
                                                        rows={2}
                                                    />
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-semibold text-slate-900">
                                                            {service.name}
                                                        </span>
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                                                            {service.category}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                                        {service.description}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Price, Duration & Controls */}
                                    <div className="flex items-center gap-3 self-end sm:self-center flex-shrink-0">
                                        {/* Duration */}
                                        <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={service.estimated_duration_minutes}
                                                    onChange={(e) => handleUpdateField(service.id, 'estimated_duration_minutes', Number(e.target.value))}
                                                    className="w-12 text-center text-xs bg-white border rounded"
                                                    step="15"
                                                />
                                            ) : (
                                                <span>{service.estimated_duration_minutes}m</span>
                                            )}
                                        </div>

                                        {/* Price */}
                                        <div className="flex items-center gap-1 text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md">
                                            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={service.unit_price}
                                                    onChange={(e) => handleUpdateField(service.id, 'unit_price', Number(e.target.value))}
                                                    className="w-16 text-center text-xs bg-white border rounded"
                                                />
                                            ) : (
                                                <span>{service.unit_price}</span>
                                            )}
                                            <span className="text-[10px] font-normal text-slate-500">
                                                {UNIT_LABELS[service.unit] || service.unit}
                                            </span>
                                        </div>

                                        {/* Edit Toggle */}
                                        <button
                                            type="button"
                                            onClick={() => setEditingServiceId(isEditing ? null : service.id)}
                                            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                                            title={isEditing ? 'Done Editing' : 'Edit Service'}
                                        >
                                            {isEditing ? <Check className="w-4 h-4 text-emerald-600" /> : <Edit3 className="w-3.5 h-3.5" />}
                                        </button>

                                        {/* Delete */}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteService(service.id)}
                                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                            title="Remove from Catalog"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
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
