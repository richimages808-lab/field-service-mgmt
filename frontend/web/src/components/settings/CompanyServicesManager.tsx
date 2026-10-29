import React, { useState, useMemo } from 'react';
import {
    Sparkles,
    Plus,
    Trash2,
    Clock,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Edit3,
    Check,
    X,
    Filter,
    HelpCircle,
    ChevronDown,
    ChevronRight,
    Wrench,
    Search,
    RefreshCw,
    ShieldCheck,
    AlertTriangle,
    Tag,
    Layers,
    DollarSign,
    CheckSquare,
    Square
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

interface CategoryMeta {
    id: string;
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    bg: string;
    text: string;
    border: string;
    badgeBg: string;
}

const CATEGORY_DEFINITIONS: Record<string, CategoryMeta> = {
    diagnostic: {
        id: 'diagnostic',
        title: 'Diagnostics & System Assessments',
        subtitle: 'Troubleshooting, leak detection, dispatch fees, and initial evaluations',
        icon: Search,
        bg: 'bg-purple-50/60',
        text: 'text-purple-700',
        border: 'border-purple-200',
        badgeBg: 'bg-purple-100 text-purple-800'
    },
    repair: {
        id: 'repair',
        title: 'Repairs & Troubleshooting',
        subtitle: 'Component rebuilds, pipe leak splices, fixture fixes, and line clearing',
        icon: Wrench,
        bg: 'bg-amber-50/60',
        text: 'text-amber-700',
        border: 'border-amber-200',
        badgeBg: 'bg-amber-100 text-amber-800'
    },
    installation: {
        id: 'installation',
        title: 'New Installations & Upgrades',
        subtitle: 'Fresh fixture supply, new appliances, and full system installations',
        icon: Layers,
        bg: 'bg-emerald-50/60',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        badgeBg: 'bg-emerald-100 text-emerald-800'
    },
    replacement: {
        id: 'replacement',
        title: 'Replacements & Modernization',
        subtitle: 'Removing failed legacy units and retrofitting updated models',
        icon: RefreshCw,
        bg: 'bg-indigo-50/60',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        badgeBg: 'bg-indigo-100 text-indigo-800'
    },
    maintenance: {
        id: 'maintenance',
        title: 'Preventive & Routine Maintenance',
        subtitle: 'Annual system flushes, descaling, tune-ups, and seasonal checks',
        icon: CheckCircle2,
        bg: 'bg-blue-50/60',
        text: 'text-blue-700',
        border: 'border-blue-200',
        badgeBg: 'bg-blue-100 text-blue-800'
    },
    inspection: {
        id: 'inspection',
        title: 'Code, Safety & Camera Inspections',
        subtitle: 'Video sewer scoping, certified backflow testing, and safety sign-offs',
        icon: ShieldCheck,
        bg: 'bg-cyan-50/60',
        text: 'text-cyan-700',
        border: 'border-cyan-200',
        badgeBg: 'bg-cyan-100 text-cyan-800'
    },
    emergency: {
        id: 'emergency',
        title: 'Emergency & After-Hours Response',
        subtitle: 'Immediate dispatch response for after-hours, weekend, or holiday emergencies',
        icon: AlertTriangle,
        bg: 'bg-rose-50/60',
        text: 'text-rose-700',
        border: 'border-rose-200',
        badgeBg: 'bg-rose-100 text-rose-800'
    }
};

const SUGGESTED_REFINEMENT_PROMPTS = [
    { label: '🚫 Exclude Commercial', prompt: 'We only do residential home services. Remove all commercial kitchen grease lines and industrial items.' },
    { label: '🚰 Add Tankless Water Heaters', prompt: 'Add gas and electric tankless water heater flushing, descaling, and installation capabilities.' },
    { label: '📷 Add Camera Sewer Inspection', prompt: 'Add color video sewer camera inspection with locator and line recording scopes.' },
    { label: '🚨 Add 24/7 Emergency Dispatch', prompt: 'Add 24/7 urgent water emergency shutoff and after-hours emergency dispatch scopes.' },
    { label: '💧 Restrict to Leak Repairs', prompt: 'Focus our repair capabilities strictly on pipe leak detection, copper/PEX repiping, and slab leak fixes.' }
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
    const [addServiceCategory, setAddServiceCategory] = useState<CatalogServiceItem['category']>('repair');
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

    // Collapsed branches state (stores category keys that are collapsed)
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

    // New service form state
    const [newServiceName, setNewServiceName] = useState('');
    const [newServiceGroup, setNewServiceGroup] = useState('');
    const [newServiceDesc, setNewServiceDesc] = useState('');
    const [newServiceCategory, setNewServiceCategory] = useState<CatalogServiceItem['category']>('repair');
    const [newServiceDuration, setNewServiceDuration] = useState<number>(60);
    const [newServiceTags, setNewServiceTags] = useState('');

    const activeCount = services.filter(s => s.active !== false).length;

    // Toggle collapse for category
    const toggleCollapse = (catKey: string) => {
        setCollapsedCategories(prev => ({
            ...prev,
            [catKey]: !prev[catKey]
        }));
    };

    // Expand all or collapse all
    const handleExpandAll = () => setCollapsedCategories({});
    const handleCollapseAll = () => {
        const allCollapsed: Record<string, boolean> = {};
        Object.keys(CATEGORY_DEFINITIONS).forEach(k => { allCollapsed[k] = true; });
        setCollapsedCategories(allCollapsed);
    };

    // Toggle active state for single service
    const handleToggleActive = (id: string) => {
        onChange(services.map(s => s.id === id ? { ...s, active: s.active === false } : s));
    };

    // Toggle active state for an entire category
    const handleToggleCategoryActive = (categoryKey: string, currentActiveCount: number, totalCount: number) => {
        // If all are active, turn all off. Otherwise, turn all on.
        const targetState = currentActiveCount < totalCount;
        onChange(services.map(s => s.category === categoryKey ? { ...s, active: targetState } : s));
    };

    // Delete a service
    const handleDeleteService = (id: string) => {
        onChange(services.filter(s => s.id !== id));
    };

    // Update specific field
    const handleUpdateField = (id: string, field: keyof CatalogServiceItem, value: any) => {
        onChange(services.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    // Handle adding custom service scope
    const handleAddCustomService = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newServiceName.trim()) return;

        const tagList = newServiceTags
            .split(',')
            .map(t => t.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'))
            .filter(Boolean);

        if (tagList.length === 0) {
            tagList.push(newServiceName.toLowerCase().replace(/[^a-z0-9]/g, '_'));
        }

        const newService: CatalogServiceItem = {
            id: `scope_srv_${Date.now()}`,
            name: newServiceName.trim(),
            description: newServiceDesc.trim() || 'Standard technical service scope and diagnostic procedure.',
            category: newServiceCategory,
            group: newServiceGroup.trim() || undefined,
            unit_price: 0,
            unit: 'flat_rate',
            estimated_duration_minutes: Number(newServiceDuration) || 60,
            tags: tagList,
            active: true,
            isFlatFee: false
        };

        onChange([newService, ...services]);
        setIsAddingNew(false);
        setNewServiceName('');
        setNewServiceGroup('');
        setNewServiceDesc('');
        setNewServiceCategory('repair');
        setNewServiceDuration(60);
        setNewServiceTags('');
    };

    // Refine with AI submit
    const handleAiSubmit = async (promptToUse?: string) => {
        const text = promptToUse || aiPrompt;
        if (!text.trim() || isGeneratingAI) return;
        await onRefineWithAI(text.trim());
        setAiPrompt('');
    };

    // Group services into hierarchy by category
    const groupedServices = useMemo(() => {
        const groups: Record<string, CatalogServiceItem[]> = {};

        // Pre-initialize defined categories to maintain consistent logical order
        Object.keys(CATEGORY_DEFINITIONS).forEach(cat => {
            groups[cat] = [];
        });

        services.forEach(s => {
            const cat = s.category || 'repair';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(s);
        });

        return groups;
    }, [services]);

    const visibleCategories = useMemo(() => {
        return Object.entries(groupedServices).filter(([catKey, items]) => {
            if (filterCategory === 'all') return items.length > 0;
            if (filterCategory === 'active') return items.some(s => s.active !== false);
            return catKey === filterCategory && items.length > 0;
        });
    }, [groupedServices, filterCategory]);

    return (
        <div className="space-y-5">
            {/* Header & Trade Grounding Explainer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900">
                            Trade Capabilities & Services Hierarchy
                        </h3>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            {activeCount} Active Scopes of {services.length} Total
                        </span>
                        {businessType && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                                {businessType}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Hierarchical scopes of work defining your trade boundaries. The AI strictly confines all AI estimates, quotes, and job intakes to your enabled services below—guaranteeing it never assumes work outside your trade.
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsAddingNew(!isAddingNew)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors shadow-xs"
                    >
                        <Plus className="w-3.5 h-3.5 text-indigo-600" />
                        Add Service Scope
                    </button>
                    <button
                        type="button"
                        onClick={handleExpandAll}
                        className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 font-medium"
                    >
                        Expand All
                    </button>
                    <button
                        type="button"
                        onClick={handleCollapseAll}
                        className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 font-medium"
                    >
                        Collapse All
                    </button>
                </div>
            </div>

            {/* AI Scope Grounding Alert Box */}
            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3.5 flex items-start gap-3 text-xs text-indigo-950">
                <Sparkles className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                    <span className="font-semibold text-indigo-900">
                        AI Trade Guardrail Active ({businessType || industry || 'Your Trade'}):
                    </span>
                    <p className="text-indigo-800/90 leading-relaxed text-[11px]">
                        These services provide positive grounding for AI-assisted estimates, quotes, and dispatch triage. By unchecking services you do not perform, the AI is explicitly instructed not to recommend or estimate them (e.g. preventing a plumbing business from being assigned HVAC or roofing work).
                    </p>
                </div>
            </div>

            {/* AI Scope Refinement Prompt Bar */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 rounded-xl p-4 text-white shadow-md relative overflow-hidden">
                <div className="relative z-10 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1 rounded-md bg-indigo-500/30 text-indigo-300">
                            <Sparkles className="w-4 h-4 text-indigo-300" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">
                            AI Service Hierarchy Refinement
                        </h4>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-400/20 text-indigo-200">
                            Scope-Driven
                        </span>
                    </div>
                    <p className="text-xs text-indigo-200/90 leading-relaxed">
                        Tell the AI how your company operates and it will instantly reshape your service categories, add missing specialty scopes, and remove excluded trade work.
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
                            placeholder="e.g. 'We don't do gas lines or boilers, add commercial grease traps and camera inspections'..."
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
                                    Refining Scope...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Refine Scopes
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

            {/* Quick Add Custom Service Scope Form */}
            {isAddingNew && (
                <form onSubmit={handleAddCustomService} className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Plus className="w-4 h-4 text-indigo-600" />
                            Add Custom Service Capability Scope
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsAddingNew(false)}
                            className="text-slate-400 hover:text-slate-600"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Service Title *</label>
                            <input
                                type="text"
                                value={newServiceName}
                                onChange={(e) => setNewServiceName(e.target.value)}
                                placeholder="e.g. Commercial Hydro-Jetting & Degreasing"
                                required
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Hierarchy Category *</label>
                            <select
                                value={newServiceCategory}
                                onChange={(e) => setNewServiceCategory(e.target.value as any)}
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                            >
                                <option value="diagnostic">Diagnostics & Assessments</option>
                                <option value="repair">Repairs & Troubleshooting</option>
                                <option value="installation">New Installations</option>
                                <option value="replacement">Replacements & Retrofits</option>
                                <option value="maintenance">Preventive Maintenance</option>
                                <option value="inspection">Code & Camera Inspections</option>
                                <option value="emergency">Emergency Response</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Subsystem / Area (Optional)</label>
                            <input
                                type="text"
                                value={newServiceGroup}
                                onChange={(e) => setNewServiceGroup(e.target.value)}
                                placeholder="e.g. Drain & Sewer, Fixtures & Valves"
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Scope of Work Description *</label>
                            <input
                                type="text"
                                value={newServiceDesc}
                                onChange={(e) => setNewServiceDesc(e.target.value)}
                                placeholder="Detailed operational scope, diagnostic tasks, and safety checks..."
                                required
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
                        <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Search Keywords / AI Tags (comma-separated)</label>
                            <input
                                type="text"
                                value={newServiceTags}
                                onChange={(e) => setNewServiceTags(e.target.value)}
                                placeholder="e.g. hydro jet, grease line, kitchen drain, restaurant"
                                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
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
                            Add Capability Scope
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
                    All Disciplines ({services.length})
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
                {Object.entries(CATEGORY_DEFINITIONS).map(([catKey, meta]) => {
                    const count = groupedServices[catKey]?.length || 0;
                    if (count === 0) return null;
                    return (
                        <button
                            key={catKey}
                            type="button"
                            onClick={() => setFilterCategory(catKey)}
                            className={`px-2.5 py-1 rounded-lg font-medium capitalize transition-colors flex items-center gap-1 ${
                                filterCategory === catKey ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            <span>{catKey}</span>
                            <span className="opacity-70 text-[10px]">({count})</span>
                        </button>
                    );
                })}
            </div>

            {/* Hierarchical Service Branches */}
            {services.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                    <p className="text-sm font-medium text-slate-600">No services loaded yet</p>
                    <p className="text-xs text-slate-400 mt-1">Select an industry trade above to populate standard capabilities, or click "Add Service Scope".</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {visibleCategories.map(([catKey, items]) => {
                        const meta = CATEGORY_DEFINITIONS[catKey] || CATEGORY_DEFINITIONS.repair;
                        const Icon = meta.icon;
                        const isCollapsed = Boolean(collapsedCategories[catKey]);
                        const catActiveCount = items.filter(s => s.active !== false).length;
                        const allActive = catActiveCount === items.length;

                        return (
                            <div
                                key={catKey}
                                className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs transition-all"
                            >
                                {/* Category Branch Header */}
                                <div
                                    className={`p-3.5 flex items-center justify-between gap-3 select-none cursor-pointer border-b ${
                                        isCollapsed ? 'border-transparent bg-slate-50/70 hover:bg-slate-100/70' : 'border-slate-100 bg-slate-50/90'
                                    }`}
                                    onClick={() => toggleCollapse(catKey)}
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleCollapse(catKey);
                                            }}
                                            className="p-1 rounded-md hover:bg-slate-200/80 text-slate-500 transition-colors"
                                        >
                                            {isCollapsed ? (
                                                <ChevronRight className="w-4 h-4 text-slate-600" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-slate-600" />
                                            )}
                                        </button>

                                        <div className={`p-1.5 rounded-lg border ${meta.bg} ${meta.text} ${meta.border} flex-shrink-0`}>
                                            <Icon className="w-4 h-4" />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                                                    {meta.title}
                                                </h4>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                    catActiveCount > 0 ? meta.badgeBg : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {catActiveCount} of {items.length} Active
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                                {meta.subtitle}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Category Controls */}
                                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleCategoryActive(catKey, catActiveCount, items.length)}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                                                allActive
                                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                            title={allActive ? 'Disable all services in this category' : 'Enable all services in this category'}
                                        >
                                            {allActive ? (
                                                <>
                                                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                                                    <span>Category Active</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Square className="w-3.5 h-3.5 text-slate-400" />
                                                    <span>Enable Category</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Child Service Rows (Hierarchical Scope List - UNPRICED) */}
                                {!isCollapsed && (
                                    <div className="p-2 sm:p-3 space-y-4">
                                        {Object.entries(
                                            items.reduce((acc, service) => {
                                                const grp = service.group || 'Core Trade Scopes';
                                                if (!acc[grp]) acc[grp] = [];
                                                acc[grp].push(service);
                                                return acc;
                                            }, {} as Record<string, CatalogServiceItem[]>)
                                        ).map(([groupName, groupServices]) => (
                                            <div key={groupName} className="space-y-2">
                                                {/* Subsystem / Equipment Group Header */}
                                                <div className="flex items-center justify-between px-2 pt-1 pb-1 border-b border-slate-100">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                                        <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                                                            {groupName}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] font-medium text-slate-400">
                                                        {groupServices.filter(s => s.active !== false).length} of {groupServices.length} Active
                                                    </span>
                                                </div>

                                                <div className="space-y-1.5">
                                                    {groupServices.map((service) => {
                                                        const isEditing = editingServiceId === service.id;
                                                        const isActive = service.active !== false;

                                                        return (
                                                            <div
                                                                key={service.id}
                                                                className={`p-3 rounded-xl border transition-all ${
                                                                    isActive
                                                                        ? 'bg-white border-slate-200 shadow-2xs hover:border-slate-300'
                                                                        : 'bg-slate-50/70 border-slate-200/80 opacity-60'
                                                                }`}
                                                            >
                                                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                                                    {/* Left: Active Checkbox & Details */}
                                                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isActive}
                                                                            onChange={() => handleToggleActive(service.id)}
                                                                            className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer flex-shrink-0"
                                                                            title={isActive ? 'Deactivate this service scope' : 'Activate this service scope'}
                                                                        />

                                                                        <div className="flex-1 min-w-0">
                                                                            {isEditing ? (
                                                                                <div className="space-y-2.5 p-1 bg-slate-50 rounded-lg border border-slate-200">
                                                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                                                        <div className="sm:col-span-2">
                                                                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Service Name</label>
                                                                                            <input
                                                                                                type="text"
                                                                                                value={service.name}
                                                                                                onChange={(e) => handleUpdateField(service.id, 'name', e.target.value)}
                                                                                                className="w-full px-2.5 py-1 text-xs font-semibold border rounded-md bg-white"
                                                                                            />
                                                                                        </div>
                                                                                        <div>
                                                                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Subsystem / Area</label>
                                                                                            <input
                                                                                                type="text"
                                                                                                value={service.group || ''}
                                                                                                placeholder="e.g. Drain & Sewer"
                                                                                                onChange={(e) => handleUpdateField(service.id, 'group', e.target.value)}
                                                                                                className="w-full px-2.5 py-1 text-xs border rounded-md bg-white"
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Scope Description</label>
                                                                                        <textarea
                                                                                            value={service.description}
                                                                                            onChange={(e) => handleUpdateField(service.id, 'description', e.target.value)}
                                                                                            className="w-full px-2.5 py-1 text-xs border rounded-md bg-white"
                                                                                            rows={2}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="flex items-center justify-between">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <label className="text-[11px] font-semibold text-slate-600">Est. Mins:</label>
                                                                                            <input
                                                                                                type="number"
                                                                                                value={service.estimated_duration_minutes || 60}
                                                                                                onChange={(e) => handleUpdateField(service.id, 'estimated_duration_minutes', Number(e.target.value))}
                                                                                                className="w-20 px-2 py-0.5 text-xs border rounded bg-white"
                                                                                                step="15"
                                                                                            />
                                                                                        </div>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setEditingServiceId(null)}
                                                                                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
                                                                                        >
                                                                                            Done
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div>
                                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                                        <span className="text-sm font-bold text-slate-900">
                                                                                            {service.name}
                                                                                        </span>

                                                                                        {/* Subsystem Group Pill */}
                                                                                        {service.group && (
                                                                                            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                                                                                                {service.group}
                                                                                            </span>
                                                                                        )}

                                                                                        {/* Duration Pill */}
                                                                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                                                                            <Clock className="w-3 h-3 text-slate-400" />
                                                                                            ~{service.estimated_duration_minutes || 60}m
                                                                                        </span>
                                                                                    </div>

                                                                                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                                                                        {service.description}
                                                                                    </p>

                                                                                    {/* Tags Chips */}
                                                                                    {service.tags && service.tags.length > 0 && (
                                                                                        <div className="flex items-center gap-1 flex-wrap mt-1.5">
                                                                                            <Tag className="w-3 h-3 text-slate-400 mr-0.5 flex-shrink-0" />
                                                                                            {service.tags.map((tag, tIdx) => (
                                                                                                <span
                                                                                                    key={tIdx}
                                                                                                    className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"
                                                                                                >
                                                                                                    #{tag}
                                                                                                </span>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Right Actions: Edit & Delete */}
                                                                    <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                                                                        {/* Edit Toggle */}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditingServiceId(isEditing ? null : service.id)}
                                                                            className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors rounded-md hover:bg-slate-100"
                                                                            title={isEditing ? 'Done Editing' : 'Edit Scope Details'}
                                                                        >
                                                                            {isEditing ? <Check className="w-4 h-4 text-emerald-600" /> : <Edit3 className="w-3.5 h-3.5" />}
                                                                        </button>

                                                                        {/* Delete */}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteService(service.id)}
                                                                            className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded-md hover:bg-rose-50"
                                                                            title="Remove Capability from Organization Scope"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}

                                        {/* Add Service to this category shortcut */}
                                        <div className="pt-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsAddingNew(true);
                                                    setNewServiceCategory(catKey as any);
                                                }}
                                                className="w-full py-2 border border-dashed border-slate-300 hover:border-indigo-400 rounded-lg text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1.5 transition-colors text-xs font-semibold hover:bg-indigo-50/20"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                <span>Add Service to {meta.title}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
