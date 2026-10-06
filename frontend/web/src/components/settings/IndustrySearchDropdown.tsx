import React, { useState, useEffect, useRef } from 'react';
import {
    Search,
    ChevronDown,
    ChevronRight,
    Sparkles,
    Briefcase,
    Wrench,
    Thermometer,
    Zap,
    Home,
    Trees,
    Hammer,
    Bug,
    Waves,
    Refrigerator,
    DoorClosed,
    Check,
    Plus
} from 'lucide-react';
import {
    IndustrySector,
    IndustrySpecialty,
    BUILTIN_INDUSTRY_CATALOG,
    getMergedIndustryCatalog,
    saveCustomSpecialtyToGlobalCatalog
} from '../../lib/industryCatalog';

interface IndustrySearchDropdownProps {
    selectedSectorName?: string;
    selectedSpecialtyName?: string;
    onSelect: (sector: IndustrySector, specialty: IndustrySpecialty, isCustom?: boolean) => void;
    orgId?: string;
}

export const IndustrySearchDropdown: React.FC<IndustrySearchDropdownProps> = ({
    selectedSectorName,
    selectedSpecialtyName,
    onSelect,
    orgId
}) => {
    const [catalog, setCatalog] = useState<IndustrySector[]>(BUILTIN_INDUSTRY_CATALOG);
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSectorId, setExpandedSectorId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load merged catalog from Firestore
    useEffect(() => {
        let isMounted = true;
        getMergedIndustryCatalog().then(data => {
            if (isMounted && data.length > 0) {
                setCatalog(data);
            }
        });
        return () => { isMounted = false; };
    }, []);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getSectorIcon = (iconName: string) => {
        const props = { className: "w-4 h-4 text-indigo-600 flex-shrink-0" };
        switch (iconName) {
            case 'Wrench': return <Wrench {...props} />;
            case 'Thermometer': return <Thermometer {...props} />;
            case 'Zap': return <Zap {...props} />;
            case 'Home': return <Home {...props} />;
            case 'Trees': return <Trees {...props} />;
            case 'Hammer': return <Hammer {...props} />;
            case 'Bug': return <Bug {...props} />;
            case 'Waves': return <Waves {...props} />;
            case 'Refrigerator': return <Refrigerator {...props} />;
            case 'DoorClosed': return <DoorClosed {...props} />;
            default: return <Briefcase {...props} />;
        }
    };

    // Filter results based on search query
    const queryLower = searchQuery.trim().toLowerCase();

    const filteredCatalog = catalog.map(sector => {
        const sectorMatches = sector.name.toLowerCase().includes(queryLower);
        const matchedSpecialties = sector.specialties.filter(sp => {
            if (!queryLower) return true;
            return sp.name.toLowerCase().includes(queryLower) ||
                sp.keywords.some(k => k.toLowerCase().includes(queryLower)) ||
                (sectorMatches);
        });

        return {
            ...sector,
            specialties: matchedSpecialties
        };
    }).filter(sector => sector.specialties.length > 0);

    const hasExactMatch = catalog.some(s =>
        s.specialties.some(sp => sp.name.toLowerCase() === queryLower)
    );

    const handleSelectSpecialty = (sector: IndustrySector, specialty: IndustrySpecialty, isCustom = false) => {
        onSelect(sector, specialty, isCustom);
        setIsOpen(false);
        setSearchQuery('');
    };

    const handleCreateCustom = () => {
        if (!searchQuery.trim()) return;

        const customSpecialtyName = searchQuery.trim();
        const fallbackSector = catalog[0] || {
            id: 'general',
            name: 'General Field Services',
            icon: 'Briefcase',
            description: 'Custom industry',
            specialties: []
        };

        const newSpecialty: IndustrySpecialty = {
            id: `custom_${customSpecialtyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            name: customSpecialtyName,
            description: `Custom ${customSpecialtyName} business`,
            keywords: customSpecialtyName.toLowerCase().split(/\s+/),
            standardServices: [],
            isCustom: true,
            createdByOrgId: orgId
        };

        // Save to global community catalog in background
        saveCustomSpecialtyToGlobalCatalog(fallbackSector.name, customSpecialtyName, [], orgId);

        handleSelectSpecialty(fallbackSector, newSpecialty, true);
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            {/* Input Trigger */}
            <div
                className={`w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl shadow-sm cursor-pointer transition-all ${
                    isOpen ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-300 hover:border-slate-400'
                }`}
                onClick={() => {
                    setIsOpen(true);
                    setTimeout(() => inputRef.current?.focus(), 50);
                }}
            >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Briefcase className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                    <div className="flex-1 truncate">
                        {selectedSpecialtyName ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {selectedSectorName && (
                                    <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                                        {selectedSectorName}
                                    </span>
                                )}
                                <span className="text-sm font-medium text-slate-900 truncate">
                                    {selectedSpecialtyName}
                                </span>
                            </div>
                        ) : (
                            <span className="text-sm text-slate-400">
                                Select or type your trade & business type (e.g. Plumbing, HVAC, Roofer)...
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 pl-2 text-slate-400">
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 max-h-[460px] flex flex-col">
                    {/* Search Bar */}
                    <div className="p-3 border-b border-slate-100 bg-slate-50/70">
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && searchQuery.trim() && !hasExactMatch) {
                                        e.preventDefault();
                                        handleCreateCustom();
                                    }
                                }}
                                placeholder="Type to search industries or enter a custom trade..."
                                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 placeholder-slate-400"
                            />
                        </div>
                    </div>

                    {/* Custom Type Option if user is typing something novel */}
                    {searchQuery.trim().length > 2 && !hasExactMatch && (
                        <div className="p-2 border-b border-indigo-100 bg-indigo-50/80">
                            <button
                                type="button"
                                onClick={handleCreateCustom}
                                className="w-full text-left p-2.5 rounded-lg bg-white border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors flex items-center justify-between group shadow-sm"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="p-1.5 rounded-md bg-indigo-100 text-indigo-700">
                                        <Sparkles className="w-4 h-4" />
                                    </div>
                                    <div className="truncate">
                                        <div className="text-xs font-semibold text-indigo-900">
                                            Custom Business Type:
                                        </div>
                                        <div className="text-sm font-bold text-indigo-700 truncate">
                                            "{searchQuery.trim()}"
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xs font-medium text-indigo-600 bg-indigo-100/80 px-2 py-1 rounded-md flex items-center gap-1 group-hover:bg-indigo-200">
                                    <Plus className="w-3 h-3" /> Auto-Generate with AI
                                </span>
                            </button>
                        </div>
                    )}

                    {/* Category List */}
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1">
                        {filteredCatalog.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                <p className="text-sm font-medium">No matching trades found for "{searchQuery}"</p>
                                <p className="text-xs text-slate-400 mt-1">Press Enter or click above to create this custom business type with AI.</p>
                            </div>
                        ) : (
                            filteredCatalog.map((sector) => {
                                const isExpanded = expandedSectorId === sector.id || searchQuery.trim().length > 0;
                                const isSectorSelected = selectedSectorName?.toLowerCase() === sector.name.toLowerCase();

                                return (
                                    <div key={sector.id} className="py-1">
                                        {/* Level 1: Sector Header */}
                                        <button
                                            type="button"
                                            onClick={() => setExpandedSectorId(isExpanded && !searchQuery.trim() ? null : sector.id)}
                                            className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-lg transition-colors ${
                                                isSectorSelected ? 'bg-indigo-50/70 text-indigo-900 font-semibold' : 'hover:bg-slate-100 text-slate-800 font-medium'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                {getSectorIcon(sector.icon)}
                                                <span className="text-sm">{sector.name}</span>
                                                <span className="text-xs text-slate-400 font-normal">
                                                    ({sector.specialties.length})
                                                </span>
                                            </div>
                                            <ChevronRight
                                                className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                            />
                                        </button>

                                        {/* Level 2: Specialties List */}
                                        {isExpanded && (
                                            <div className="ml-6 pl-3 border-l-2 border-slate-200 space-y-0.5 mt-1 mb-2">
                                                {sector.specialties.map((specialty) => {
                                                    const isSelected = selectedSpecialtyName?.toLowerCase() === specialty.name.toLowerCase();

                                                    return (
                                                        <button
                                                            key={specialty.id}
                                                            type="button"
                                                            onClick={() => handleSelectSpecialty(sector, specialty)}
                                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between group ${
                                                                isSelected
                                                                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                                                                    : 'hover:bg-slate-100 text-slate-700'
                                                            }`}
                                                        >
                                                            <div className="min-w-0 pr-2">
                                                                <div className="truncate flex items-center gap-1.5">
                                                                    <span>{specialty.name}</span>
                                                                    {specialty.isCustom && (
                                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                                                                            isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-amber-100 text-amber-800'
                                                                        }`}>
                                                                            Community
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {specialty.description && (
                                                                    <div className={`text-xs truncate ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                                        {specialty.description}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {isSelected ? (
                                                                <Check className="w-4 h-4 text-white flex-shrink-0" />
                                                            ) : (
                                                                <span className="text-xs text-indigo-600 opacity-0 group-hover:opacity-100 flex-shrink-0 font-medium">
                                                                    Auto-fill Services →
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
