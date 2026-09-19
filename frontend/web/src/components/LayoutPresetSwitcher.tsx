import React from 'react';
import { useLayoutMode, LayoutMode, LAYOUT_PRESETS } from '../context/LayoutModeContext';
import { LayoutGrid, Rows, Maximize2, Sparkles, Check } from 'lucide-react';

export const LayoutPresetSwitcher: React.FC<{ variant?: 'banner' | 'compact' | 'pill' }> = ({
    variant = 'banner'
}) => {
    const { layoutMode, setLayoutMode } = useLayoutMode();

    const icons = {
        'modern-hub': <LayoutGrid className="w-4 h-4" />,
        'streamlined': <Rows className="w-4 h-4" />,
        'compact-pro': <Maximize2 className="w-4 h-4" />,
    };

    if (variant === 'pill') {
        return (
            <div className="inline-flex items-center p-1 bg-slate-800/90 rounded-xl border border-slate-700/80 shadow-sm">
                {(['modern-hub', 'streamlined', 'compact-pro'] as LayoutMode[]).map((mode) => {
                    const preset = LAYOUT_PRESETS[mode];
                    const active = layoutMode === mode;
                    return (
                        <button
                            key={mode}
                            onClick={() => setLayoutMode(mode)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                                active
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                            }`}
                            title={`${preset.name}: ${preset.description}`}
                        >
                            {icons[mode]}
                            <span>{preset.name}</span>
                        </button>
                    );
                })}
            </div>
        );
    }

    if (variant === 'compact') {
        return (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                {(['modern-hub', 'streamlined', 'compact-pro'] as LayoutMode[]).map((mode) => {
                    const preset = LAYOUT_PRESETS[mode];
                    const active = layoutMode === mode;
                    return (
                        <button
                            key={mode}
                            onClick={() => setLayoutMode(mode)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                                active
                                    ? 'bg-white text-blue-700 shadow-sm font-semibold'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                            title={preset.description}
                        >
                            {icons[mode]}
                            <span className="hidden sm:inline">{preset.name}</span>
                        </button>
                    );
                })}
            </div>
        );
    }

    // Default 'banner' variant for main pages
    return (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 mb-6 border border-slate-700/60 shadow-lg relative overflow-hidden">
            {/* Subtle backdrop glow */}
            <div className="absolute top-0 right-0 w-80 h-full bg-blue-500/10 blur-3xl pointer-events-none" />

            <div className="relative z-10">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800/80">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                <Sparkles className="w-3 h-3" /> Sandbox Layout Studio
                            </span>
                            <span className="text-xs text-slate-400">
                                Active: <strong className="text-white font-medium">{LAYOUT_PRESETS[layoutMode].name}</strong>
                            </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                            Explore 3 Cohesive & Simplified Site Layouts
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mt-0.5">
                            Switch styles instantly to see which layout feels the simplest and most intuitive. Full functionality and data remain identical across all views.
                        </p>
                    </div>

                    {/* Quick Mode Switcher Tabs */}
                    <div className="flex items-center p-1 bg-slate-950/80 rounded-xl border border-slate-800 shrink-0 self-start md:self-auto">
                        {(['modern-hub', 'streamlined', 'compact-pro'] as LayoutMode[]).map((mode) => {
                            const preset = LAYOUT_PRESETS[mode];
                            const active = layoutMode === mode;
                            return (
                                <button
                                    key={mode}
                                    onClick={() => setLayoutMode(mode)}
                                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                                        active
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                                    }`}
                                >
                                    {icons[mode]}
                                    <span>{preset.name}</span>
                                    {active && <Check className="w-3.5 h-3.5 ml-0.5 text-blue-200" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 3 Interactive Cards to preview & compare */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                    {(['modern-hub', 'streamlined', 'compact-pro'] as LayoutMode[]).map((mode) => {
                        const preset = LAYOUT_PRESETS[mode];
                        const active = layoutMode === mode;
                        return (
                            <div
                                key={mode}
                                onClick={() => setLayoutMode(mode)}
                                className={`cursor-pointer rounded-xl p-3.5 transition-all text-left relative border ${
                                    active
                                        ? 'bg-blue-600/15 border-blue-500/80 ring-1 ring-blue-500/50 shadow-md'
                                        : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-600'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-lg ${active ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                            {icons[mode]}
                                        </div>
                                        <span className="font-semibold text-sm text-white">{preset.name}</span>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                                        active ? 'bg-blue-500/30 text-blue-200 font-semibold' : 'bg-slate-700/60 text-slate-400'
                                    }`}>
                                        {preset.badge}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    {preset.description}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
