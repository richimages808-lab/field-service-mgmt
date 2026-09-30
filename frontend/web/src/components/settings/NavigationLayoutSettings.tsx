import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useLayoutMode, LayoutMode, LAYOUT_PRESETS } from '../../context/LayoutModeContext';
import { useNavArchitecture, NavArchitecture, ARCHITECTURE_INFO, PATH_MAPPINGS } from '../../context/NavigationArchitectureContext';
import {
    LayoutGrid,
    Rows,
    Maximize2,
    Sparkles,
    Check,
    Layers,
    Briefcase,
    Zap,
    Grid3X3,
    Table2,
    Route,
    GitBranch,
    Map,
    ArrowRight,
    Save,
    RotateCcw,
    CheckCircle2,
    Columns,
    FileSpreadsheet
} from 'lucide-react';
import toast from 'react-hot-toast';

export type CreateJobLayout = 'express' | 'stepper' | 'split';

export interface CreateJobLayoutInfo {
    id: CreateJobLayout;
    name: string;
    tagline: string;
    badge: string;
    description: string;
    highlights: string[];
}

export const CREATE_JOB_LAYOUTS: CreateJobLayoutInfo[] = [
    {
        id: 'express',
        name: 'Option 1: Express Mode',
        tagline: 'Progressive disclosure with 4-field core',
        badge: 'Recommended',
        description: 'Single-page fast intake with essential customer, scope, schedule & tech fields. Advanced AI copilot and inventory parts expand gracefully via accordions.',
        highlights: ['Fast 4-field core intake', 'Collapsible AI estimation & parts', 'Instant customer autocomplete', 'Fastest booking time for dispatchers']
    },
    {
        id: 'stepper',
        name: 'Option 2: Guided Stepper (Wizard)',
        tagline: '4-step sequential intake with validation',
        badge: 'Staff Friendly',
        description: 'Structured 4-step wizard (1. Customer & Site → 2. Scope & AI Estimate → 3. Schedule & Tech → 4. Review & Confirm) with progress tracking.',
        highlights: ['Animated step progress indicators', 'Sequential field validation', 'Structured technician assignment', 'Ideal for call centers & onboarding']
    },
    {
        id: 'split',
        name: 'Option 3: Split-Pane Workspace',
        tagline: 'Side-by-side editing with live WYSIWYG work order',
        badge: 'Power User',
        description: '12-column dual-pane layout featuring an active data-entry form on the left and a live-updating Digital Work Order document on the right with real-time totals.',
        highlights: ['Real-time digital work order preview', 'Live item & rate recalculation', 'Clean in-flow form controls', 'Best for desktop power users']
    }
];

interface NavigationLayoutSettingsProps {
    isEmbedded?: boolean;
}

export const NavigationLayoutSettings: React.FC<NavigationLayoutSettingsProps> = () => {
    const { organization, user } = useAuth();
    const { layoutMode, setLayoutMode } = useLayoutMode();
    const { navArchitecture, setNavArchitecture, architectureInfo, pathMappings } = useNavArchitecture();

    const [saving, setSaving] = useState(false);
    const [selectedTab, setSelectedTab] = useState<'layout' | 'architecture' | 'audit'>('layout');

    // Create Job Layout preference (persisted to organization settings & localStorage)
    const initialCreateJobLayout = (
        organization?.settings?.createJobLayout ||
        organization?.layoutSettings?.createJobLayout ||
        (localStorage.getItem('dispatchbox_create_job_layout') as CreateJobLayout) ||
        'express'
    );
    const [createJobLayout, setCreateJobLayout] = useState<CreateJobLayout>(initialCreateJobLayout);

    useEffect(() => {
        const orgLayout = organization?.settings?.createJobLayout || organization?.layoutSettings?.createJobLayout;
        if (orgLayout && ['express', 'stepper', 'split'].includes(orgLayout)) {
            setCreateJobLayout(orgLayout);
        }
    }, [organization?.settings?.createJobLayout, organization?.layoutSettings?.createJobLayout]);

    const handleSelectCreateJobLayout = (layout: CreateJobLayout) => {
        setCreateJobLayout(layout);
        localStorage.setItem('dispatchbox_create_job_layout', layout);
        const name = CREATE_JOB_LAYOUTS.find(l => l.id === layout)?.name || layout;
        toast.success(`Job creation view set to ${name}. Click "Save As Company Default" to apply team-wide.`);
    };

    const layoutIcons: Record<LayoutMode, React.ReactNode> = {
        'modern-hub': <LayoutGrid className="w-5 h-5" />,
        'streamlined': <Rows className="w-5 h-5" />,
        'compact-pro': <Maximize2 className="w-5 h-5" />,
    };

    const archIcons: Record<NavArchitecture, React.ReactNode> = {
        'default': <Grid3X3 className="w-5 h-5" />,
        'pipeline': <Layers className="w-5 h-5" />,
        'domain-hubs': <Briefcase className="w-5 h-5" />,
        'flat-shortcuts': <Zap className="w-5 h-5" />,
    };

    const archColors: Record<NavArchitecture, { bg: string; border: string; text: string; activeBg: string }> = {
        'default': { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-800', activeBg: 'bg-slate-800' },
        'pipeline': { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', activeBg: 'bg-emerald-600' },
        'domain-hubs': { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-800', activeBg: 'bg-indigo-600' },
        'flat-shortcuts': { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', activeBg: 'bg-amber-600' },
    };

    const handleSaveOrganizationDefaults = async () => {
        const orgId = organization?.id || (user as any)?.org_id || user?.uid;
        if (!orgId) return;

        setSaving(true);
        try {
            await setDoc(doc(db, 'organizations', orgId), {
                settings: {
                    layoutMode,
                    navArchitecture,
                    createJobLayout
                },
                layoutSettings: {
                    layoutMode,
                    navArchitecture,
                    createJobLayout,
                    updatedAt: new Date().toISOString()
                }
            }, { merge: true });

            localStorage.setItem('dispatchbox_create_job_layout', createJobLayout);
            toast.success('Saved organization layout & navigation preferences!');
        } catch (error) {
            console.error('Failed to save layout preferences:', error);
            toast.error('Failed to save preferences to organization.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
                            <LayoutGrid className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                                Navigation Architecture & Workspace Layout
                            </h2>
                            <p className="text-xs text-slate-500">
                                Configure your team's application layout style and menu hierarchy.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={handleSaveOrganizationDefaults}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                    >
                        {saving ? (
                            <>
                                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-3.5 h-3.5" />
                                <span>Save As Company Default</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Segmented Control Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <button
                    type="button"
                    onClick={() => setSelectedTab('layout')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        selectedTab === 'layout'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                >
                    <LayoutGrid className="w-4 h-4" />
                    <span>Workspace Layout Style ({LAYOUT_PRESETS[layoutMode].name})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setSelectedTab('architecture')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        selectedTab === 'architecture'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                >
                    <Route className="w-4 h-4" />
                    <span>Menu Architecture ({architectureInfo.name})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setSelectedTab('audit')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        selectedTab === 'audit'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                >
                    <Table2 className="w-4 h-4" />
                    <span>Path Comparison Table</span>
                </button>
            </div>

            {/* ═══ SECTION 1: Workspace Layout Style ═══ */}
            {selectedTab === 'layout' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">Choose Workspace Layout Mode</h3>
                            <p className="text-xs text-slate-500">
                                Switch layout mode instantly. Your active choice applies immediately to your workspace view.
                            </p>
                        </div>
                        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                            Active: {LAYOUT_PRESETS[layoutMode].name}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(['modern-hub', 'streamlined', 'compact-pro'] as LayoutMode[]).map((mode) => {
                            const preset = LAYOUT_PRESETS[mode];
                            const active = layoutMode === mode;
                            return (
                                <div
                                    key={mode}
                                    onClick={() => {
                                        setLayoutMode(mode);
                                        toast.success(`Switched to ${preset.name} layout!`);
                                    }}
                                    className={`cursor-pointer rounded-2xl p-5 transition-all text-left relative border flex flex-col justify-between ${
                                        active
                                            ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className={`p-2.5 rounded-xl ${active ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'}`}>
                                                {layoutIcons[mode]}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                                    active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {preset.badge}
                                                </span>
                                                {active && (
                                                    <span className="p-0.5 rounded-full bg-blue-600 text-white">
                                                        <Check className="w-3.5 h-3.5" />
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <h4 className="font-extrabold text-sm text-slate-900 mb-0.5">
                                            {preset.name}
                                        </h4>
                                        <p className="text-[11px] font-semibold text-blue-700 mb-2">
                                            {preset.tagline}
                                        </p>
                                        <p className="text-xs text-slate-600 leading-relaxed">
                                            {preset.description}
                                        </p>
                                    </div>

                                    {/* Wireframe Mini-Preview Graphic */}
                                    <div className="mt-4 pt-3 border-t border-slate-200/80">
                                        <div className="h-16 rounded-lg bg-slate-100 p-1.5 flex gap-1.5 overflow-hidden border border-slate-200">
                                            {mode === 'modern-hub' && (
                                                <>
                                                    <div className="w-10 bg-slate-800 rounded flex flex-col gap-1 p-1">
                                                        <div className="w-full h-1.5 bg-blue-500 rounded-xs" />
                                                        <div className="w-full h-1 bg-slate-600 rounded-xs" />
                                                        <div className="w-3/4 h-1 bg-slate-600 rounded-xs" />
                                                    </div>
                                                    <div className="flex-1 bg-white rounded flex flex-col gap-1 p-1.5 shadow-2xs">
                                                        <div className="w-1/3 h-1.5 bg-slate-300 rounded-xs" />
                                                        <div className="w-full h-6 bg-slate-50 border border-slate-100 rounded" />
                                                    </div>
                                                </>
                                            )}
                                            {mode === 'streamlined' && (
                                                <div className="w-full flex flex-col gap-1">
                                                    <div className="w-full h-3.5 bg-slate-800 rounded flex items-center px-1.5 gap-1">
                                                        <div className="w-2 h-2 rounded-xs bg-blue-500" />
                                                        <div className="w-8 h-1 bg-slate-500 rounded-xs" />
                                                        <div className="w-8 h-1 bg-slate-500 rounded-xs" />
                                                    </div>
                                                    <div className="flex-1 bg-white rounded p-1.5 shadow-2xs">
                                                        <div className="w-1/4 h-1.5 bg-slate-300 rounded-xs mb-1" />
                                                        <div className="w-full h-5 bg-slate-50 border border-slate-100 rounded" />
                                                    </div>
                                                </div>
                                            )}
                                            {mode === 'compact-pro' && (
                                                <>
                                                    <div className="w-4 bg-slate-900 rounded flex flex-col items-center gap-1 py-1">
                                                        <div className="w-2 h-2 bg-blue-500 rounded-xs" />
                                                        <div className="w-2 h-1 bg-slate-600 rounded-xs" />
                                                        <div className="w-2 h-1 bg-slate-600 rounded-xs" />
                                                        <div className="w-2 h-1 bg-slate-600 rounded-xs" />
                                                    </div>
                                                    <div className="flex-1 bg-white rounded p-1.5 shadow-2xs">
                                                        <div className="w-1/3 h-1.5 bg-slate-300 rounded-xs mb-1" />
                                                        <div className="grid grid-cols-2 gap-1 h-7">
                                                            <div className="bg-slate-50 border border-slate-100 rounded" />
                                                            <div className="bg-slate-50 border border-slate-100 rounded" />
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ═══ SECTION 1B: Job Creation Form Layout Style ═══ */}
                    <div className="pt-6 border-t border-slate-200 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <div className="flex items-center gap-2">
                                    <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                                    <h3 className="text-sm font-bold text-slate-900">Choose Job Creation Form Layout</h3>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Select which layout style technicians, dispatchers, and coordinators use when booking new service jobs at <span className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">/jobs/new</span>.
                                </p>
                            </div>
                            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 self-start sm:self-auto">
                                Active: {CREATE_JOB_LAYOUTS.find(l => l.id === createJobLayout)?.name}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {CREATE_JOB_LAYOUTS.map((layout) => {
                                const active = createJobLayout === layout.id;
                                return (
                                    <div
                                        key={layout.id}
                                        onClick={() => handleSelectCreateJobLayout(layout.id)}
                                        className={`cursor-pointer rounded-2xl p-5 transition-all text-left relative border flex flex-col justify-between ${
                                            active
                                                ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                                                : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                                        }`}
                                    >
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className={`p-2.5 rounded-xl ${active ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'}`}>
                                                    {layout.id === 'express' && <Zap className="w-5 h-5" />}
                                                    {layout.id === 'stepper' && <Layers className="w-5 h-5" />}
                                                    {layout.id === 'split' && <Columns className="w-5 h-5" />}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                                        active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                                                    }`}>
                                                        {layout.badge}
                                                    </span>
                                                    {active && (
                                                        <span className="p-0.5 rounded-full bg-blue-600 text-white">
                                                            <Check className="w-3.5 h-3.5" />
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <h4 className="font-extrabold text-sm text-slate-900 mb-0.5">
                                                {layout.name}
                                            </h4>
                                            <p className="text-[11px] font-semibold text-blue-700 mb-2">
                                                {layout.tagline}
                                            </p>
                                            <p className="text-xs text-slate-600 leading-relaxed mb-3">
                                                {layout.description}
                                            </p>

                                            {/* Feature bullet list */}
                                            <div className="space-y-1.5 mb-2">
                                                {layout.highlights.map((highlight, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                                        <span>{highlight}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Wireframe Mini-Preview Graphic */}
                                        <div className="mt-4 pt-3 border-t border-slate-200/80">
                                            <div className="h-16 rounded-lg bg-slate-100 p-1.5 flex gap-1.5 overflow-hidden border border-slate-200">
                                                {layout.id === 'express' && (
                                                    <div className="w-full flex flex-col gap-1 p-1">
                                                        <div className="w-1/3 h-1.5 bg-blue-500 rounded-xs mb-0.5" />
                                                        <div className="grid grid-cols-2 gap-1">
                                                            <div className="h-3 bg-white border border-slate-200 rounded-xs" />
                                                            <div className="h-3 bg-white border border-slate-200 rounded-xs" />
                                                        </div>
                                                        <div className="h-3 bg-white border border-slate-200 rounded-xs" />
                                                        <div className="h-2.5 bg-slate-200/70 border border-dashed border-slate-300 rounded-xs flex items-center px-1">
                                                            <div className="w-8 h-1 bg-slate-400 rounded-xs" />
                                                        </div>
                                                    </div>
                                                )}
                                                {layout.id === 'stepper' && (
                                                    <div className="w-full flex flex-col gap-1.5 p-1">
                                                        <div className="flex items-center justify-between px-2 pt-0.5">
                                                            <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-blue-300" />
                                                            <div className="flex-1 h-0.5 bg-slate-300 mx-1" />
                                                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                                                            <div className="flex-1 h-0.5 bg-slate-300 mx-1" />
                                                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                                                            <div className="flex-1 h-0.5 bg-slate-300 mx-1" />
                                                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                                                        </div>
                                                        <div className="flex-1 bg-white border border-slate-200 rounded-xs p-1 flex flex-col justify-between">
                                                            <div className="w-1/2 h-1.5 bg-slate-400 rounded-xs" />
                                                            <div className="flex justify-end">
                                                                <div className="w-8 h-2 bg-blue-600 rounded-xs" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                {layout.id === 'split' && (
                                                    <div className="w-full flex gap-1.5 p-0.5">
                                                        <div className="w-7/12 bg-white border border-slate-200 rounded-xs p-1 flex flex-col gap-1">
                                                            <div className="w-3/4 h-1.5 bg-slate-400 rounded-xs" />
                                                            <div className="h-2.5 bg-slate-100 rounded-xs" />
                                                            <div className="h-2.5 bg-slate-100 rounded-xs" />
                                                        </div>
                                                        <div className="w-5/12 bg-indigo-50/70 border border-indigo-200 rounded-xs p-1 flex flex-col gap-1 shadow-2xs">
                                                            <div className="w-full h-1.5 bg-indigo-400 rounded-xs" />
                                                            <div className="w-3/4 h-1 bg-slate-300 rounded-xs" />
                                                            <div className="w-full h-1 bg-slate-300 rounded-xs" />
                                                            <div className="mt-auto flex justify-end">
                                                                <div className="w-6 h-1.5 bg-emerald-500 rounded-xs" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ SECTION 2: Navigation Architecture ═══ */}
            {selectedTab === 'architecture' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">Choose Navigation Architecture</h3>
                            <p className="text-xs text-slate-500">
                                Select how your modules are categorized and presented in menus.
                            </p>
                        </div>
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                            Active: {architectureInfo.name}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {(['default', 'pipeline', 'domain-hubs', 'flat-shortcuts'] as NavArchitecture[]).map((arch) => {
                            const info = ARCHITECTURE_INFO[arch];
                            const active = navArchitecture === arch;
                            const colors = archColors[arch];
                            return (
                                <div
                                    key={arch}
                                    onClick={() => {
                                        setNavArchitecture(arch);
                                        toast.success(`Switched to ${info.name}!`);
                                    }}
                                    className={`cursor-pointer rounded-2xl p-4 transition-all text-left relative border flex flex-col justify-between ${
                                        active
                                            ? `${colors.bg} border-blue-500 ring-2 ring-blue-500/20 shadow-md`
                                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                                    }`}
                                >
                                    <div>
                                        {active && (
                                            <div className="absolute top-3 right-3">
                                                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 mb-2">
                                            <div className={`p-2 rounded-xl ${active ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'}`}>
                                                {archIcons[arch]}
                                            </div>
                                            <div>
                                                <h4 className="font-extrabold text-xs text-slate-900 block leading-tight">
                                                    {info.name}
                                                </h4>
                                                <span className="text-[10px] text-slate-500 font-medium">{info.tagline}</span>
                                            </div>
                                        </div>

                                        <p className="text-xs text-slate-600 leading-relaxed mb-3">
                                            {info.description}
                                        </p>

                                        {/* Stats row */}
                                        <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500 mb-2.5">
                                            <span className="flex items-center gap-1">
                                                <GitBranch className="w-3 h-3 text-slate-400" />
                                                {info.navGroupCount} groups
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Map className="w-3 h-3 text-slate-400" />
                                                {info.totalNavItems} items
                                            </span>
                                        </div>

                                        {/* Path example */}
                                        <div className="bg-slate-50 rounded-xl p-2 border border-slate-200 text-[10px] text-slate-600 font-mono leading-relaxed break-all">
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Example:</span>
                                            {info.pathExample}
                                        </div>
                                    </div>

                                    <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                            active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {info.badge}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ═══ SECTION 3: Path Audit Comparison Table ═══ */}
            {selectedTab === 'audit' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                        <div>
                            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Route & Path Mapping Comparison Table
                            </h3>
                            <p className="text-[11px] text-slate-500">
                                How each DispatchBox module maps across the 3 architecture patterns.
                            </p>
                        </div>
                        <span className="text-xs font-bold text-slate-600 font-mono bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                            {pathMappings.length} mapped routes
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                                <tr>
                                    <th className="py-2.5 px-4">Feature / Module</th>
                                    <th className="py-2.5 px-4">Current Canonical</th>
                                    <th className="py-2.5 px-4 text-emerald-700 bg-emerald-50/40">1. Pipeline Flow</th>
                                    <th className="py-2.5 px-4 text-indigo-700 bg-indigo-50/40">2. Domain Hubs</th>
                                    <th className="py-2.5 px-4 text-amber-700 bg-amber-50/40">3. Flat Shortcuts</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pathMappings.map((row) => (
                                    <tr key={row.canonical} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-2 px-4 font-bold text-slate-800 whitespace-nowrap">
                                            {row.label}
                                        </td>
                                        <td className="py-2 px-4 font-mono text-slate-500">
                                            {row.canonical}
                                        </td>
                                        <td className="py-2 px-4 font-mono text-emerald-800 bg-emerald-50/20">
                                            {row.pipeline}
                                        </td>
                                        <td className="py-2 px-4 font-mono text-indigo-800 bg-indigo-50/20">
                                            {row.domainHubs}
                                        </td>
                                        <td className="py-2 px-4 font-mono text-amber-800 bg-amber-50/20">
                                            {row.flatShortcuts}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
