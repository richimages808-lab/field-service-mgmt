import React, { useState } from 'react';
import {
    DollarSign,
    Plus,
    Trash2,
    Clock,
    Tag,
    Edit3,
    Check,
    X,
    Filter,
    HelpCircle,
    Sparkles,
    CheckCircle2,
    Layers,
    ListPlus,
    Receipt,
    ArrowUpRight
} from 'lucide-react';
import { CatalogServiceItem } from '../../lib/industryCatalog';

interface FlatFeeServicesManagerProps {
    services: CatalogServiceItem[];
    onChange: (services: CatalogServiceItem[]) => void;
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
    diagnostic_fee: 'Diagnostic Fee',
    per_hour: '/ Hour',
    per_unit: '/ Unit',
    per_foot: '/ Linear Ft',
    per_sqft: '/ Sq Ft'
};

export const FlatFeeServicesManager: React.FC<FlatFeeServicesManagerProps> = ({
    services,
    onChange
}) => {
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [isPickingFromScope, setIsPickingFromScope] = useState(false);
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

    // Form states
    const [selectedScopeId, setSelectedScopeId] = useState<string>('');
    const [newPrice, setNewPrice] = useState<number>(189);
    const [newUnit, setNewUnit] = useState<CatalogServiceItem['unit']>('flat_rate');
    const [customName, setCustomName] = useState('');
    const [customCategory, setCustomCategory] = useState<CatalogServiceItem['category']>('repair');
    const [customDuration, setCustomDuration] = useState<number>(60);
    const [customDesc, setCustomDesc] = useState('');

    // Flat fee services are those marked as isFlatFee or having a positive unit_price
    const flatFeeServices = services.filter(s => s.isFlatFee === true || (s.unit_price && s.unit_price > 0 && s.isFlatFee !== false));
    const activeFlatCount = flatFeeServices.filter(s => s.active !== false).length;

    // Services from scope hierarchy not yet in flat fee menu
    const availableFromScope = services.filter(s => !s.isFlatFee && (!s.unit_price || s.unit_price <= 0));

    // Toggle active status of flat fee service
    const handleToggleActive = (id: string) => {
        onChange(services.map(s => s.id === id ? { ...s, active: s.active === false } : s));
    };

    // Remove from flat fee menu (reverts to unpriced capability in scope hierarchy)
    const handleRemoveFromFlatFee = (id: string) => {
        onChange(services.map(s => s.id === id ? { ...s, isFlatFee: false, unit_price: 0 } : s));
    };

    // Update specific field
    const handleUpdateField = (id: string, field: keyof CatalogServiceItem, value: any) => {
        onChange(services.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    // Add existing scope item to flat fee menu
    const handlePromoteScopeToFlatFee = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedScopeId) return;

        onChange(services.map(s => {
            if (s.id === selectedScopeId) {
                return {
                    ...s,
                    isFlatFee: true,
                    unit_price: Number(newPrice) || 0,
                    unit: newUnit,
                    active: true
                };
            }
            return s;
        }));

        setSelectedScopeId('');
        setIsPickingFromScope(false);
    };

    // Create a new custom flat fee service
    const handleCreateCustomFlatFee = (e: React.FormEvent) => {
        e.preventDefault();
        if (!customName.trim()) return;

        const newService: CatalogServiceItem = {
            id: `flat_srv_${Date.now()}`,
            name: customName.trim(),
            description: customDesc.trim() || 'Standard flat-rate service package.',
            category: customCategory,
            unit_price: Number(newPrice) || 0,
            unit: newUnit,
            estimated_duration_minutes: Number(customDuration) || 60,
            tags: [customName.toLowerCase().replace(/[^a-z0-9]/g, '_'), 'flat_fee'],
            active: true,
            isFlatFee: true
        };

        onChange([newService, ...services]);
        setIsAddingNew(false);
        setCustomName('');
        setCustomDesc('');
        setNewPrice(189);
        setCustomDuration(60);
        setNewUnit('flat_rate');
    };

    const filteredList = flatFeeServices.filter(s => {
        if (filterCategory === 'all') return true;
        if (filterCategory === 'active') return s.active !== false;
        return s.category === filterCategory;
    });

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                        <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-slate-900">Flat Fee & Menu-Priced Services</h2>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                {activeFlatCount} Configured
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Standard guaranteed prices for fixed-price jobs. These sync directly to your billable catalog for New Job, Quotes, and Customer Portal booking.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {availableFromScope.length > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                setIsPickingFromScope(!isPickingFromScope);
                                setIsAddingNew(false);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors shadow-xs"
                        >
                            <ListPlus className="w-3.5 h-3.5 text-indigo-600" />
                            Add from Service Scope ({availableFromScope.length})
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setIsAddingNew(!isAddingNew);
                            setIsPickingFromScope(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors shadow-xs"
                    >
                        <Plus className="w-3.5 h-3.5 text-slate-600" />
                        New Custom Flat Rate
                    </button>
                </div>
            </div>

            {/* Quick Picker: Promote from Services Hierarchy */}
            {isPickingFromScope && (
                <form onSubmit={handlePromoteScopeToFlatFee} className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                            <ListPlus className="w-4 h-4 text-indigo-600" />
                            Assign Flat Fee Price to Existing Service Scope
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsPickingFromScope(false)}
                            className="text-slate-400 hover:text-slate-600"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-xs text-indigo-800/80">
                        Choose a service capability from your trade hierarchy above and assign a fixed flat rate to offer it on your billable pricing menu.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Select Service Scope *</label>
                            <select
                                value={selectedScopeId}
                                onChange={(e) => {
                                    setSelectedScopeId(e.target.value);
                                    const match = availableFromScope.find(s => s.id === e.target.value);
                                    if (match?.unit_price) setNewPrice(match.unit_price);
                                }}
                                required
                                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">-- Choose a service from your scope hierarchy --</option>
                                {availableFromScope.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} ({s.category}) — {s.estimated_duration_minutes || 60}m
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Fixed Flat Rate ($) & Unit *</label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="number"
                                        value={newPrice}
                                        onChange={(e) => setNewPrice(Number(e.target.value))}
                                        className="w-full pl-7 pr-2 py-2 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
                                        min="0"
                                        required
                                    />
                                </div>
                                <select
                                    value={newUnit}
                                    onChange={(e) => setNewUnit(e.target.value as any)}
                                    className="px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                                >
                                    <option value="flat_rate">Flat Rate</option>
                                    <option value="diagnostic_fee">Diagnostic</option>
                                    <option value="per_hour">/ Hour</option>
                                    <option value="per_unit">/ Unit</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => setIsPickingFromScope(false)}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!selectedScopeId}
                            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            Add to Flat Fee Menu
                        </button>
                    </div>
                </form>
            )}

            {/* Quick Add Custom Flat Fee Service Form */}
            {isAddingNew && (
                <form onSubmit={handleCreateCustomFlatFee} className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Plus className="w-4 h-4 text-emerald-600" />
                            Create New Custom Flat Rate Package
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
                                value={customName}
                                onChange={(e) => setCustomName(e.target.value)}
                                placeholder="e.g. Standard Water Heater Flush & Safety Check"
                                required
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Category</label>
                            <select
                                value={customCategory}
                                onChange={(e) => setCustomCategory(e.target.value as any)}
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
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Flat Price ($) & Unit</label>
                            <div className="flex gap-1.5">
                                <input
                                    type="number"
                                    value={newPrice}
                                    onChange={(e) => setNewPrice(Number(e.target.value))}
                                    className="w-24 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
                                    min="0"
                                    required
                                />
                                <select
                                    value={newUnit}
                                    onChange={(e) => setNewUnit(e.target.value as any)}
                                    className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                                >
                                    <option value="flat_rate">Flat Rate</option>
                                    <option value="diagnostic_fee">Diagnostic</option>
                                    <option value="per_hour">/ Hour</option>
                                    <option value="per_unit">/ Unit</option>
                                </select>
                            </div>
                        </div>
                        <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Description (Customer-Facing)</label>
                            <input
                                type="text"
                                value={customDesc}
                                onChange={(e) => setCustomDesc(e.target.value)}
                                placeholder="What is included in this flat-rate package..."
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Est. Duration (Mins)</label>
                            <input
                                type="number"
                                value={customDuration}
                                onChange={(e) => setCustomDuration(Number(e.target.value))}
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
                            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                            Save Flat Fee Service
                        </button>
                    </div>
                </form>
            )}

            {/* Filter Pills */}
            {flatFeeServices.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    <Filter className="w-3.5 h-3.5 text-slate-400 mr-1 flex-shrink-0" />
                    <button
                        type="button"
                        onClick={() => setFilterCategory('all')}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                            filterCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        All ({flatFeeServices.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterCategory('active')}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                            filterCategory === 'active' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Active ({activeFlatCount})
                    </button>
                    {['diagnostic', 'repair', 'installation', 'maintenance', 'emergency'].map(cat => {
                        const count = flatFeeServices.filter(s => s.category === cat).length;
                        if (count === 0) return null;
                        return (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setFilterCategory(cat)}
                                className={`px-2.5 py-1 rounded-lg font-medium capitalize transition-colors ${
                                    filterCategory === cat ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {cat} ({count})
                            </button>
                        );
                    })}
                </div>
            )}

            {/* List / Cards */}
            {flatFeeServices.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/70 border border-dashed border-slate-300 rounded-xl space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <Receipt className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">No flat-fee services defined yet</p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Flat fee services have guaranteed fixed prices (like Diagnostic Fees or standard repairs). Click "Add from Service Scope" above or "⭐ Add to Flat Fee Menu" on any service in the hierarchy above to assign a price.
                    </p>
                    {availableFromScope.length > 0 && (
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={() => setIsPickingFromScope(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs"
                            >
                                <ListPlus className="w-3.5 h-3.5" />
                                Pick Service from Scope Tree
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredList.map((service) => {
                        const isEditing = editingServiceId === service.id;
                        const catStyle = CATEGORY_COLORS[service.category] || CATEGORY_COLORS.repair;
                        const isActive = service.active !== false;

                        return (
                            <div
                                key={service.id}
                                className={`p-3.5 rounded-xl border transition-all ${
                                    isActive
                                        ? 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
                                        : 'bg-slate-50/60 border-slate-200 opacity-60'
                                }`}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                    {/* Left: Active Checkbox & Details */}
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={isActive}
                                            onChange={() => handleToggleActive(service.id)}
                                            className="w-4 h-4 mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                            title={isActive ? 'Deactivate flat fee' : 'Activate flat fee'}
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
                                                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                            Menu Priced
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
                                                    value={service.estimated_duration_minutes || 60}
                                                    onChange={(e) => handleUpdateField(service.id, 'estimated_duration_minutes', Number(e.target.value))}
                                                    className="w-12 text-center text-xs bg-white border rounded"
                                                    step="15"
                                                />
                                            ) : (
                                                <span>{service.estimated_duration_minutes || 60}m</span>
                                            )}
                                        </div>

                                        {/* Flat Rate Price Pill */}
                                        <div className="flex items-center gap-1 text-xs font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                                            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={service.unit_price || 0}
                                                    onChange={(e) => handleUpdateField(service.id, 'unit_price', Number(e.target.value))}
                                                    className="w-16 text-center text-xs bg-white border rounded font-bold"
                                                />
                                            ) : (
                                                <span className="text-sm font-extrabold">{service.unit_price || 0}</span>
                                            )}
                                            <span className="text-[10px] font-normal text-emerald-700">
                                                {UNIT_LABELS[service.unit || 'flat_rate'] || service.unit}
                                            </span>
                                        </div>

                                        {/* Edit Toggle */}
                                        <button
                                            type="button"
                                            onClick={() => setEditingServiceId(isEditing ? null : service.id)}
                                            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                                            title={isEditing ? 'Done Editing' : 'Edit Rate & Details'}
                                        >
                                            {isEditing ? <Check className="w-4 h-4 text-emerald-600" /> : <Edit3 className="w-3.5 h-3.5" />}
                                        </button>

                                        {/* Remove from flat fee menu */}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveFromFlatFee(service.id)}
                                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                            title="Remove from Flat Fee Menu"
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
