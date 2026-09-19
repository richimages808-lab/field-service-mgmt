import React from 'react';
import { Search, X } from 'lucide-react';

export interface ModuleFilterToolbarProps {
    searchTerm?: string;
    onSearchChange?: (val: string) => void;
    searchPlaceholder?: string;
    filters?: React.ReactNode;
    leftSlot?: React.ReactNode;
    rightSlot?: React.ReactNode;
    className?: string;
}

export const ModuleFilterToolbar: React.FC<ModuleFilterToolbarProps> = ({
    searchTerm,
    onSearchChange,
    searchPlaceholder = 'Search...',
    filters,
    leftSlot,
    rightSlot,
    className = ''
}) => {
    return (
        <div className={`bg-white rounded-xl border border-slate-200/90 p-2 sm:p-2.5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 ${className}`}>
            {/* Left Area: Search + Filters */}
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                {leftSlot}

                {typeof onSearchChange === 'function' && typeof searchTerm === 'string' && (
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-9 pr-8 py-1.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                        />
                        {searchTerm.trim().length > 0 && (
                            <button
                                type="button"
                                onClick={() => onSearchChange('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                                aria-label="Clear search"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                {filters}
            </div>

            {/* Right Area: View switchers, density toggles, or secondary actions */}
            {rightSlot && (
                <div className="flex items-center gap-2 flex-shrink-0 self-start md:self-auto">
                    {rightSlot}
                </div>
            )}
        </div>
    );
};
