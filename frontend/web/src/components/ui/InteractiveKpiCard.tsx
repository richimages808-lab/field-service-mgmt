import React from 'react';
import { Check } from 'lucide-react';

export interface InteractiveKpiCardProps {
    id: string;
    label: string;
    count: number;
    subtext?: string;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
    variant: 'blue' | 'amber' | 'cyan' | 'emerald';
}

const VARIANT_CONFIGS = {
    blue: {
        iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
        activeCard: 'border-blue-500 bg-gradient-to-br from-blue-50/90 to-indigo-50/70 ring-2 ring-blue-500/30 shadow-sm',
        countColor: 'text-blue-950',
        activeBadge: 'bg-blue-600 text-white',
        activeSubtext: 'text-blue-700 font-medium',
    },
    amber: {
        iconBg: 'bg-amber-100 text-amber-700 border-amber-200',
        activeCard: 'border-amber-500 bg-gradient-to-br from-amber-50/90 to-orange-50/70 ring-2 ring-amber-500/30 shadow-sm',
        countColor: 'text-amber-950',
        activeBadge: 'bg-amber-600 text-white',
        activeSubtext: 'text-amber-700 font-medium',
    },
    cyan: {
        iconBg: 'bg-cyan-50 text-cyan-600 border-cyan-100',
        activeCard: 'border-cyan-500 bg-gradient-to-br from-cyan-50/90 to-blue-50/70 ring-2 ring-cyan-500/30 shadow-sm',
        countColor: 'text-cyan-950',
        activeBadge: 'bg-cyan-600 text-white',
        activeSubtext: 'text-cyan-700 font-medium',
    },
    emerald: {
        iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        activeCard: 'border-emerald-500 bg-gradient-to-br from-emerald-50/90 to-teal-50/70 ring-2 ring-emerald-500/30 shadow-sm',
        countColor: 'text-emerald-950',
        activeBadge: 'bg-emerald-600 text-white',
        activeSubtext: 'text-emerald-700 font-medium',
    },
};

export const InteractiveKpiCard: React.FC<InteractiveKpiCardProps> = ({
    label,
    count,
    subtext,
    icon,
    isActive,
    onClick,
    variant,
}) => {
    const config = VARIANT_CONFIGS[variant];

    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full text-left rounded-xl p-3.5 border transition-all duration-150 relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isActive
                    ? config.activeCard
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs'
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl border flex-shrink-0 transition-transform group-hover:scale-105 ${config.iconBg}`}>
                        {icon}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">
                                {label}
                            </p>
                        </div>
                        <p className={`text-2xl font-extrabold tracking-tight mt-0.5 ${isActive ? config.countColor : 'text-slate-900'}`}>
                            {count}
                        </p>
                    </div>
                </div>

                {/* Active Indicator Badge */}
                {isActive ? (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full ${config.activeBadge}`}>
                        <Check className="w-3 h-3 stroke-[3]" /> Filter Active
                    </span>
                ) : (
                    <span className="text-[10px] font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to filter
                    </span>
                )}
            </div>

            {subtext && (
                <p className={`text-[11px] mt-2 truncate ${isActive ? config.activeSubtext : 'text-slate-500'}`}>
                    {subtext}
                </p>
            )}
        </button>
    );
};
