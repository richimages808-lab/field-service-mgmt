import React, { useState } from 'react';
import { useLayoutMode, LayoutMode, LAYOUT_PRESETS } from '../context/LayoutModeContext';
import { useNavArchitecture, NavArchitecture, ARCHITECTURE_INFO, PATH_MAPPINGS } from '../context/NavigationArchitectureContext';
import {
    LayoutGrid, Rows, Maximize2, Sparkles, Check, Layers, Briefcase, Zap,
    ChevronDown, ChevronRight, ArrowRight, Eye, Grid3X3, Map, Table2,
    Route, GitBranch, Minimize2, Maximize, Info
} from 'lucide-react';

export const SandboxAuditPanel: React.FC = () => {
    const { layoutMode, setLayoutMode } = useLayoutMode();
    const { navArchitecture, setNavArchitecture, architectureInfo, pathMappings } = useNavArchitecture();
    const [showPathTable, setShowPathTable] = useState(false);
    const [activeTab, setActiveTab] = useState<'layout' | 'architecture' | 'audit'>('architecture');

    const layoutIcons = {
        'modern-hub': <LayoutGrid className="w-4 h-4" />,
        'streamlined': <Rows className="w-4 h-4" />,
        'compact-pro': <Maximize2 className="w-4 h-4" />,
    };

    const archIcons: Record<NavArchitecture, React.ReactNode> = {
        'default': <Grid3X3 className="w-4 h-4" />,
        'pipeline': <Layers className="w-4 h-4" />,
        'domain-hubs': <Briefcase className="w-4 h-4" />,
        'flat-shortcuts': <Zap className="w-4 h-4" />,
    };

    const archColors: Record<NavArchitecture, { bg: string; border: string; text: string; activeBg: string }> = {
        'default': { bg: 'bg-slate-500/15', border: 'border-slate-500/50', text: 'text-slate-300', activeBg: 'bg-slate-600' },
        'pipeline': { bg: 'bg-emerald-500/15', border: 'border-emerald-500/50', text: 'text-emerald-300', activeBg: 'bg-emerald-600' },
        'domain-hubs': { bg: 'bg-violet-500/15', border: 'border-violet-500/50', text: 'text-violet-300', activeBg: 'bg-violet-600' },
        'flat-shortcuts': { bg: 'bg-amber-500/15', border: 'border-amber-500/50', text: 'text-amber-300', activeBg: 'bg-amber-600' },
    };

    return (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 mb-6 border border-slate-700/60 shadow-lg relative overflow-hidden">
            {/* Subtle backdrop glow */}
            <div className="absolute top-0 right-0 w-80 h-full bg-blue-500/10 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-60 h-40 bg-violet-500/10 blur-3xl pointer-events-none" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-800/80">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-gradient-to-r from-blue-500/20 to-violet-500/20 text-blue-300 border border-blue-500/30">
                                <Sparkles className="w-3 h-3" /> Sandbox Site Audit Studio
                            </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                            Compare Layouts, Navigation Architectures & Process Paths
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-300 max-w-3xl mt-0.5">
                            Switch between fundamentally different site structures to find the simplest and most intuitive navigation. Data and functionality remain identical across all options.
                        </p>
                    </div>

                    {/* Active Status */}
                    <div className="flex flex-col gap-1.5 shrink-0 self-start md:self-auto">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Config</div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 rounded-lg border border-slate-700/60">
                            <div className="flex items-center gap-1.5">
                                {layoutIcons[layoutMode]}
                                <span className="text-xs font-semibold text-white">{LAYOUT_PRESETS[layoutMode].name}</span>
                            </div>
                            <span className="text-slate-600">+</span>
                            <div className="flex items-center gap-1.5">
                                {archIcons[navArchitecture]}
                                <span className="text-xs font-semibold text-white">{architectureInfo.name}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center gap-1 pt-4 pb-3">
                    {([
                        { id: 'architecture' as const, label: 'Navigation Architecture', icon: <Route className="w-3.5 h-3.5" /> },
                        { id: 'layout' as const, label: 'Layout Style', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
                        { id: 'audit' as const, label: 'Path Audit Table', icon: <Table2 className="w-3.5 h-3.5" /> },
                    ]).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                activeTab === tab.id
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ═══ TAB: Navigation Architecture ═══ */}
                {activeTab === 'architecture' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {(['default', 'pipeline', 'domain-hubs', 'flat-shortcuts'] as NavArchitecture[]).map((arch) => {
                            const info = ARCHITECTURE_INFO[arch];
                            const active = navArchitecture === arch;
                            const colors = archColors[arch];
                            return (
                                <div
                                    key={arch}
                                    onClick={() => setNavArchitecture(arch)}
                                    className={`cursor-pointer rounded-xl p-3.5 transition-all text-left relative border ${
                                        active
                                            ? `${colors.bg} ${colors.border} ring-1 ring-opacity-50 shadow-md`
                                            : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-600'
                                    }`}
                                >
                                    {/* Active Indicator */}
                                    {active && (
                                        <div className="absolute top-2 right-2">
                                            <Check className="w-4 h-4 text-emerald-400" />
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`p-1.5 rounded-lg ${active ? colors.activeBg + ' text-white' : 'bg-slate-700 text-slate-300'}`}>
                                            {archIcons[arch]}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-sm text-white block leading-tight">{info.name}</span>
                                            <span className="text-[10px] text-slate-400">{info.tagline}</span>
                                        </div>
                                    </div>

                                    <p className="text-xs text-slate-300 leading-relaxed mb-2.5">
                                        {info.description}
                                    </p>

                                    {/* Stats row */}
                                    <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-2">
                                        <span className="flex items-center gap-1">
                                            <GitBranch className="w-3 h-3" />
                                            {info.navGroupCount} groups
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Map className="w-3 h-3" />
                                            {info.totalNavItems} items
                                        </span>
                                    </div>

                                    {/* Path example */}
                                    <div className="bg-slate-950/60 rounded-lg px-2.5 py-1.5 border border-slate-800/80">
                                        <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5 font-semibold">Path Examples</div>
                                        <div className="text-[11px] text-slate-300 font-mono break-all leading-relaxed">
                                            {info.pathExample}
                                        </div>
                                    </div>

                                    {/* Badge */}
                                    <div className="mt-2.5 flex items-center justify-between">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                                            active ? colors.activeBg + '/30 ' + colors.text + ' font-semibold' : 'bg-slate-700/60 text-slate-400'
                                        }`}>
                                            {info.badge}
                                        </span>
                                        {!active && (
                                            <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                                                Click to try <ArrowRight className="w-3 h-3" />
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ═══ TAB: Layout Style ═══ */}
                {activeTab === 'layout' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                                                {layoutIcons[mode]}
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
                                    {active && (
                                        <div className="absolute top-2 right-2">
                                            <Check className="w-4 h-4 text-blue-400" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ═══ TAB: Path Audit Table ═══ */}
                {activeTab === 'audit' && (
                    <div className="bg-slate-800/60 rounded-xl border border-slate-700/60 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Info className="w-4 h-4 text-blue-400" />
                                <span className="text-sm font-semibold text-white">Path Mapping Audit — Current vs. All 3 Options</span>
                            </div>
                            <span className="text-[10px] text-slate-400">{pathMappings.length} routes mapped</span>
                        </div>
                        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
                                    <tr className="text-left border-b border-slate-700/60">
                                        <th className="px-3 py-2 font-semibold text-slate-300 w-[120px]">Module</th>
                                        <th className="px-3 py-2 font-semibold text-slate-400 w-[160px]">
                                            <span className="flex items-center gap-1">
                                                <Grid3X3 className="w-3 h-3" /> Current Path
                                            </span>
                                        </th>
                                        <th className="px-3 py-2 font-semibold text-emerald-400 w-[160px]">
                                            <span className="flex items-center gap-1">
                                                <Layers className="w-3 h-3" /> Pipeline
                                            </span>
                                        </th>
                                        <th className="px-3 py-2 font-semibold text-violet-400 w-[160px]">
                                            <span className="flex items-center gap-1">
                                                <Briefcase className="w-3 h-3" /> Domain Hubs
                                            </span>
                                        </th>
                                        <th className="px-3 py-2 font-semibold text-amber-400 w-[180px]">
                                            <span className="flex items-center gap-1">
                                                <Zap className="w-3 h-3" /> Flat + Shortcuts
                                            </span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pathMappings.map((mapping, idx) => {
                                        const isActive = (col: string) => {
                                            if (navArchitecture === 'default' && col === 'canonical') return true;
                                            if (navArchitecture === 'pipeline' && col === 'pipeline') return true;
                                            if (navArchitecture === 'domain-hubs' && col === 'domainHubs') return true;
                                            if (navArchitecture === 'flat-shortcuts' && col === 'flatShortcuts') return true;
                                            return false;
                                        };
                                        return (
                                            <tr key={idx} className="border-b border-slate-800/40 hover:bg-slate-700/20 transition-colors">
                                                <td className="px-3 py-2 font-medium text-white whitespace-nowrap">{mapping.label}</td>
                                                <td className={`px-3 py-2 font-mono ${isActive('canonical') ? 'text-white bg-slate-700/30 font-semibold' : 'text-slate-400'}`}>
                                                    {mapping.canonical}
                                                </td>
                                                <td className={`px-3 py-2 font-mono ${isActive('pipeline') ? 'text-emerald-300 bg-emerald-500/10 font-semibold' : 'text-slate-500'}`}>
                                                    {mapping.pipeline}
                                                </td>
                                                <td className={`px-3 py-2 font-mono ${isActive('domainHubs') ? 'text-violet-300 bg-violet-500/10 font-semibold' : 'text-slate-500'}`}>
                                                    {mapping.domainHubs}
                                                </td>
                                                <td className={`px-3 py-2 font-mono ${isActive('flatShortcuts') ? 'text-amber-300 bg-amber-500/10 font-semibold' : 'text-slate-500'}`}>
                                                    {mapping.flatShortcuts}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Philosophy callout */}
                <div className="mt-4 flex items-start gap-2 p-3 bg-slate-800/40 rounded-xl border border-slate-700/40">
                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Design Philosophy — {architectureInfo.name}</div>
                        <p className="text-xs text-slate-300">{architectureInfo.philosophy}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
