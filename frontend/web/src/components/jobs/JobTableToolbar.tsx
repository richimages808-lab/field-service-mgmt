import React, { useState, useRef, useEffect } from 'react';
import { UserProfile } from '../../types';
import { useLayoutMode, LAYOUT_PRESETS, LayoutMode } from '../../context/LayoutModeContext';
import {
    Search, Filter, List, LayoutGrid, Kanban, PackageCheck,
    ChevronDown, Check, X, SlidersHorizontal, User,
    Calendar, CheckSquare, Square, Trash2, Archive, UserPlus,
    Maximize2, Rows
} from 'lucide-react';

export type DateFilterType = 'all' | 'today' | 'tomorrow' | 'this_week' | 'next_7_days' | 'overdue';

export interface JobTableToolbarProps {
    searchTerm: string;
    onSearchChange: (val: string) => void;
    priorityFilter: string;
    onPriorityChange: (p: string) => void;
    techFilter: string;
    onTechChange: (t: string) => void;
    dateFilter: DateFilterType;
    onDateChange: (d: DateFilterType) => void;
    statusFilter: string;
    onStatusChange: (s: string) => void;
    technicians: UserProfile[];
    selectedCount: number;
    totalCount: number;
    onToggleSelectAll: () => void;
    onBatchAssign: () => void;
    onBatchArchive: () => void;
    onBatchDelete: () => void;
    canDelete?: boolean;
    viewMode: 'table' | 'cards' | 'board' | 'prep';
    onViewModeChange: (v: 'table' | 'cards' | 'board' | 'prep') => void;
    tableDensity: 'compact' | 'comfortable';
    onTableDensityChange: (d: 'compact' | 'comfortable') => void;
}

export const JobTableToolbar: React.FC<JobTableToolbarProps> = ({
    searchTerm,
    onSearchChange,
    priorityFilter,
    onPriorityChange,
    techFilter,
    onTechChange,
    dateFilter,
    onDateChange,
    statusFilter,
    onStatusChange,
    technicians,
    selectedCount,
    totalCount,
    onToggleSelectAll,
    onBatchAssign,
    onBatchArchive,
    onBatchDelete,
    canDelete,
    viewMode,
    onViewModeChange,
    tableDensity,
    onTableDensityChange,
}) => {
    const { layoutMode, setLayoutMode } = useLayoutMode();
    const [openDropdown, setOpenDropdown] = useState<'priority' | 'tech' | 'date' | 'density' | 'status' | null>(null);

    const toolbarRef = useRef<HTMLDivElement>(null);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const hasActiveFilters = priorityFilter !== 'all' || techFilter !== 'all' || dateFilter !== 'all' || searchTerm.trim().length > 0;

    const clearAllFilters = () => {
        onSearchChange('');
        onPriorityChange('all');
        onTechChange('all');
        onDateChange('all');
        onStatusChange('all');
    };

    const isAllSelected = selectedCount > 0 && selectedCount === totalCount;

    return (
        <div ref={toolbarRef} className="bg-white rounded-xl border border-slate-200/90 p-2 sm:p-2.5 shadow-2xs space-y-2">
            {/* Unified Main Toolbar Row */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
                {/* ── Left Side: Selection, Search, Filters ── */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                    {/* Bulk Selection Toggle */}
                    <div className="flex items-center">
                        <button
                            type="button"
                            onClick={onToggleSelectAll}
                            className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                                selectedCount > 0
                                    ? 'bg-blue-50 border-blue-300 text-blue-800'
                                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                            }`}
                            title={isAllSelected ? 'Deselect all' : 'Select all jobs'}
                        >
                            {isAllSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : selectedCount > 0 ? (
                                <div className="w-4 h-4 bg-blue-600 text-white rounded flex items-center justify-center text-[10px] font-bold">
                                    -
                                </div>
                            ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                            )}
                            {selectedCount > 0 && (
                                <span className="font-bold text-xs">{selectedCount}</span>
                            )}
                        </button>
                    </div>

                    {/* Bulk Action Buttons (Show inline when items are selected) */}
                    {selectedCount > 0 ? (
                        <div className="flex items-center gap-1 bg-blue-50/80 px-2 py-1 rounded-lg border border-blue-200 text-xs">
                            <button
                                type="button"
                                onClick={onBatchAssign}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs flex items-center gap-1 transition-colors shadow-2xs"
                            >
                                <UserPlus className="w-3 h-3" />
                                Batch Assign
                            </button>
                            <button
                                type="button"
                                onClick={onBatchArchive}
                                className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold rounded text-xs flex items-center gap-1 transition-colors"
                            >
                                <Archive className="w-3 h-3 text-slate-400" />
                                Archive
                            </button>
                            {canDelete && (
                                <button
                                    type="button"
                                    onClick={onBatchDelete}
                                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded text-xs flex items-center gap-1 transition-colors"
                                >
                                    <Trash2 className="w-3 h-3 text-rose-500" />
                                    Delete
                                </button>
                            )}
                        </div>
                    ) : null}

                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search customer, address, ID..."
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => onSearchChange('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* ── Dropdown: Priority ── */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setOpenDropdown(openDropdown === 'priority' ? null : 'priority')}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                priorityFilter !== 'all'
                                    ? 'bg-blue-50 border-blue-300 text-blue-800'
                                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                        >
                            <span>
                                {priorityFilter === 'all' ? 'Priority' : `Priority: ${priorityFilter.toUpperCase()}`}
                            </span>
                            <ChevronDown className="w-3 h-3 text-slate-400" />
                        </button>

                        {openDropdown === 'priority' && (
                            <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-in fade-in duration-100 text-xs">
                                {([
                                    { id: 'all', label: 'All Priorities' },
                                    { id: 'critical', label: 'Critical' },
                                    { id: 'high', label: 'High' },
                                    { id: 'medium', label: 'Medium' },
                                    { id: 'low', label: 'Low' },
                                ] as const).map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => { onPriorityChange(p.id); setOpenDropdown(null); }}
                                        className="w-full flex items-center justify-between px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 font-medium"
                                    >
                                        <span>{p.label}</span>
                                        {priorityFilter === p.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Dropdown: Assigned Tech ── */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setOpenDropdown(openDropdown === 'tech' ? null : 'tech')}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                techFilter !== 'all'
                                    ? 'bg-blue-50 border-blue-300 text-blue-800'
                                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                        >
                            <User className="w-3 h-3 text-slate-400" />
                            <span>
                                {techFilter === 'all'
                                    ? 'Technician'
                                    : techFilter === 'unassigned'
                                        ? 'Unassigned'
                                        : (technicians.find(t => t.id === techFilter)?.name || technicians.find(t => t.id === techFilter)?.email)?.split(' ')[0] || 'Tech'}
                            </span>
                            <ChevronDown className="w-3 h-3 text-slate-400" />
                        </button>

                        {openDropdown === 'tech' && (
                            <div className="absolute top-full left-0 mt-1 w-52 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-in fade-in duration-100 text-xs">
                                <button
                                    type="button"
                                    onClick={() => { onTechChange('all'); setOpenDropdown(null); }}
                                    className="w-full flex items-center justify-between px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 font-medium"
                                >
                                    <span>All Technicians</span>
                                    {techFilter === 'all' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { onTechChange('unassigned'); setOpenDropdown(null); }}
                                    className="w-full flex items-center justify-between px-3 py-1.5 text-left text-amber-800 hover:bg-amber-50 font-medium"
                                >
                                    <span>Unassigned Only</span>
                                    {techFilter === 'unassigned' && <Check className="w-3.5 h-3.5 text-amber-600" />}
                                </button>
                                <div className="border-t border-slate-100 my-1" />
                                {technicians.map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => { onTechChange(t.id); setOpenDropdown(null); }}
                                        className="w-full flex items-center justify-between px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 font-medium"
                                    >
                                        <span className="truncate">{t.name || (t as any).displayName || t.email}</span>
                                        {techFilter === t.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Dropdown: Date Range ── */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setOpenDropdown(openDropdown === 'date' ? null : 'date')}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                dateFilter !== 'all'
                                    ? 'bg-blue-50 border-blue-300 text-blue-800'
                                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                        >
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>
                                {dateFilter === 'all'
                                    ? 'Date'
                                    : dateFilter === 'today'
                                        ? 'Today'
                                        : dateFilter === 'tomorrow'
                                            ? 'Tomorrow'
                                            : dateFilter === 'this_week'
                                                ? 'This Week'
                                                : dateFilter === 'next_7_days'
                                                    ? 'Next 7 Days'
                                                    : 'Overdue'}
                            </span>
                            <ChevronDown className="w-3 h-3 text-slate-400" />
                        </button>

                        {openDropdown === 'date' && (
                            <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-in fade-in duration-100 text-xs">
                                {([
                                    { id: 'all', label: 'All Dates' },
                                    { id: 'today', label: 'Scheduled Today' },
                                    { id: 'tomorrow', label: 'Scheduled Tomorrow' },
                                    { id: 'this_week', label: 'This Week' },
                                    { id: 'next_7_days', label: 'Next 7 Days' },
                                    { id: 'overdue', label: 'Overdue' },
                                ] as const).map(d => (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onClick={() => { onDateChange(d.id); setOpenDropdown(null); }}
                                        className="w-full flex items-center justify-between px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 font-medium"
                                    >
                                        <span>{d.label}</span>
                                        {dateFilter === d.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Reset Filters */}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={clearAllFilters}
                            className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold px-2 py-1 rounded hover:bg-slate-100 transition-colors flex items-center gap-1"
                            title="Reset all active search and filter criteria"
                        >
                            <X className="w-3 h-3" /> Clear
                        </button>
                    )}
                </div>

                {/* ── Right Side: Density & View Mode Switchers ── */}
                <div className="flex items-center gap-2 self-end lg:self-auto flex-shrink-0">
                    {/* View Density / Preset Menu Icon Button */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setOpenDropdown(openDropdown === 'density' ? null : 'density')}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors"
                            title="Table density & workspace layout style"
                        >
                            <SlidersHorizontal className="w-4 h-4" />
                        </button>

                        {openDropdown === 'density' && (
                            <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl p-2.5 z-50 animate-in fade-in duration-100 text-xs">
                                <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-2">
                                    Table Row Density
                                </p>
                                <div className="grid grid-cols-2 gap-1.5 mb-3">
                                    <button
                                        type="button"
                                        onClick={() => { onTableDensityChange('compact'); setOpenDropdown(null); }}
                                        className={`px-2.5 py-1.5 rounded-lg font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                                            tableDensity === 'compact'
                                                ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold'
                                                : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Rows className="w-3.5 h-3.5" /> Compact (48px)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { onTableDensityChange('comfortable'); setOpenDropdown(null); }}
                                        className={`px-2.5 py-1.5 rounded-lg font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                                            tableDensity === 'comfortable'
                                                ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold'
                                                : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Maximize2 className="w-3.5 h-3.5" /> Roomy (58px)
                                    </button>
                                </div>

                                <div className="border-t border-slate-100 pt-2 mb-1">
                                    <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1.5">
                                        Workspace Layout Style
                                    </p>
                                    {(['modern-hub', 'streamlined', 'compact-pro'] as LayoutMode[]).map((mode) => {
                                        const preset = LAYOUT_PRESETS[mode];
                                        const active = layoutMode === mode;
                                        return (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => { setLayoutMode(mode); setOpenDropdown(null); }}
                                                className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left transition-colors ${
                                                    active ? 'bg-blue-50 text-blue-800 font-bold' : 'text-slate-700 hover:bg-slate-50 font-medium'
                                                }`}
                                            >
                                                <span>{preset.name}</span>
                                                {active && <Check className="w-3.5 h-3.5 text-blue-600" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* View Mode Switcher (Dense Table | Cards | Board | Prep) */}
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        <button
                            type="button"
                            onClick={() => onViewModeChange('table')}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                                viewMode === 'table'
                                    ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title="Dense Table (Recommended)"
                        >
                            <List className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Table</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewModeChange('cards')}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                                viewMode === 'cards'
                                    ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title="Card Grid View"
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Cards</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewModeChange('board')}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                                viewMode === 'board'
                                    ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title="Kanban Board View"
                        >
                            <Kanban className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Board</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewModeChange('prep')}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                                viewMode === 'prep'
                                    ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title="Job Prep Verification"
                        >
                            <PackageCheck className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Prep</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
