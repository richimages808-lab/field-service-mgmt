import React, { useState, useEffect } from 'react';
import {
    Sparkles, X, Check, AlertCircle, Clock, MapPin, Truck, Wrench, Package,
    Calendar, Users, ChevronRight, Navigation, ShieldCheck, RefreshCw, CheckCircle2,
    Sliders, ArrowRight, ExternalLink, HelpCircle, AlertTriangle
} from 'lucide-react';
import { Job, UserProfile, ToolItem, SchedulingMetricId } from '../../types';
import {
    optimizeMultiTechSchedule,
    MultiTechScheduleResult,
    MultiTechSchedulerOptions,
    ScheduledJobAssignment,
    UnassignedJobReport,
    normalizeDate,
    isJobAssignedToTech
} from '../../lib/multiTechScheduler';
import { format, addDays, isSameDay } from 'date-fns';
import toast from 'react-hot-toast';
import { MetricPriorityRanker, DEFAULT_METRIC_PRIORITIES } from '../scheduling/MetricPriorityRanker';

interface AutoScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentDate: Date;
    jobs: Job[];
    technicians: UserProfile[];
    materials: any[];
    tools: ToolItem[];
    orgSettings?: {
        materialSchedulingMode?: 'allow_all' | 'estimated_availability' | 'in_stock_only';
        materialBufferDays?: number;
    };
    onApplySchedule: (assignments: ScheduledJobAssignment[]) => Promise<void>;
}

export const AutoScheduleModal: React.FC<AutoScheduleModalProps> = ({
    isOpen,
    onClose,
    currentDate,
    jobs,
    technicians,
    materials,
    tools,
    orgSettings,
    onApplySchedule
}) => {
    // Configuration states
    const [targetDateStr, setTargetDateStr] = useState<string>(format(currentDate, 'yyyy-MM-dd'));
    const [numDays, setNumDays] = useState<number>(1);
    const [includeScheduled, setIncludeScheduled] = useState<boolean>(false);
    const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
    
    // Constraint toggles
    const [enforceMaterials, setEnforceMaterials] = useState<boolean>(true);
    const [enforceTools, setEnforceTools] = useState<boolean>(true);
    const [respectCustomerWindows, setRespectCustomerWindows] = useState<boolean>(true);
    const [considerTraffic, setConsiderTraffic] = useState<boolean>(true);
    const [optimizeRouteOrder, setOptimizeRouteOrder] = useState<boolean>(true);
    const [metricPriorities, setMetricPriorities] = useState<SchedulingMetricId[]>(DEFAULT_METRIC_PRIORITIES);
    const [materialMode, setMaterialMode] = useState<'allow_all' | 'estimated_availability' | 'in_stock_only'>(
        orgSettings?.materialSchedulingMode || 'allow_all'
    );

    // Execution & Results states
    const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
    const [isApplying, setIsApplying] = useState<boolean>(false);
    const [result, setResult] = useState<MultiTechScheduleResult | null>(null);
    const [selectedTabTechId, setSelectedTabTechId] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState<boolean>(true);

    // Detect if the target date currently contains existing overlapping schedule conflicts
    const existingConflictsCount = React.useMemo(() => {
        let conflicts = 0;
        const [year, month, day] = targetDateStr.split('-').map(Number);
        const targetDate = new Date(year, month - 1, day);
        for (const tech of technicians) {
            const techJobs = jobs.filter(j => {
                const sched = normalizeDate(j.scheduled_at);
                return sched && isSameDay(sched, targetDate) && isJobAssignedToTech(j, tech) && ['scheduled', 'in_progress'].includes(j.status);
            });
            for (let i = 0; i < techJobs.length; i++) {
                for (let k = i + 1; k < techJobs.length; k++) {
                    const a = techJobs[i];
                    const b = techJobs[k];
                    const aStart = normalizeDate(a.scheduled_at)!;
                    const bStart = normalizeDate(b.scheduled_at)!;
                    const aEnd = new Date(aStart.getTime() + (a.estimated_duration || 60) * 60000);
                    const bEnd = new Date(bStart.getTime() + (b.estimated_duration || 60) * 60000);
                    if (aStart < bEnd && aEnd > bStart) conflicts++;
                }
            }
        }
        return conflicts;
    }, [jobs, technicians, targetDateStr]);

    // Initialize selected techs when modal opens
    useEffect(() => {
        if (isOpen) {
            const activeIds = technicians.filter(t => t.status !== 'inactive' && !t.archived).map(t => t.id);
            setSelectedTechIds(activeIds);
            setTargetDateStr(format(currentDate, 'yyyy-MM-dd'));
            setResult(null);
            setShowSettings(true);
        }
    }, [isOpen, technicians, currentDate]);

    if (!isOpen) return null;

    const unassignedCount = jobs.filter(j => ['pending', 'unscheduled', 'quote_pending'].includes(j.status)).length;
    const activeTechCount = technicians.filter(t => t.status !== 'inactive' && !t.archived).length;

    const handleRunOptimization = async () => {
        setIsOptimizing(true);
        try {
            const [year, month, day] = targetDateStr.split('-').map(Number);
            const targetDate = new Date(year, month - 1, day, 8, 0, 0);

            const options: MultiTechSchedulerOptions = {
                targetDate,
                numDays,
                includeAlreadyScheduled: includeScheduled,
                selectedTechIds: selectedTechIds.length > 0 ? selectedTechIds : undefined,
                enforceMaterials,
                enforceTools,
                respectCustomerWindows,
                considerTraffic,
                optimizeRouteOrder,
                metricPriorities,
                materialSchedulingMode: materialMode,
                materialBufferDays: orgSettings?.materialBufferDays || 0
            };

            // Run solver
            const scheduleResult = await optimizeMultiTechSchedule(
                jobs,
                technicians,
                jobs,
                materials,
                tools,
                options
            );

            setResult(scheduleResult);
            if (scheduleResult.techSummaries.length > 0) {
                // Default to the first tech with assignments
                const firstWithJobs = scheduleResult.techSummaries.find(t => t.assignedJobs.length > 0) || scheduleResult.techSummaries[0];
                setSelectedTabTechId(firstWithJobs.tech.id);
            }
            setShowSettings(false); // Switch to proposal review view
            toast.success(`AI Schedule Proposal Generated! ${scheduleResult.totalScheduled} jobs assigned.`);
        } catch (error) {
            console.error('Optimization error:', error);
            toast.error('Failed to run AI optimization. Please check parameters.');
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleApply = async () => {
        if (!result) return;
        setIsApplying(true);
        try {
            const jobsToApply = result.techSummaries
                .flatMap(t => t.assignedJobs)
                .filter(a => includeScheduled ? true : !a.isPreExisting);

            await onApplySchedule(jobsToApply);
            toast.success(`Successfully applied schedule for ${jobsToApply.length} jobs!`);
            onClose();
        } catch (error) {
            console.error('Error applying schedule:', error);
            toast.error('Failed to apply schedule updates.');
        } finally {
            setIsApplying(false);
        }
    };

    const selectedTechSummary = result?.techSummaries.find(t => t.tech.id === selectedTabTechId);

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                
                {/* ── Modal Header ── */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 text-white flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/15 backdrop-blur-md rounded-xl">
                            <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold">AI Multi-Tech Auto-Scheduler</h2>
                                <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-medium text-blue-100">
                                    5-Pillar Optimizer
                                </span>
                            </div>
                            <p className="text-xs text-blue-100 mt-0.5">
                                Automatically routes & schedules jobs by materials, specialty tools, customer time windows & live traffic
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* ── Modal Content ── */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Quick Stats Header Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        <div className="bg-blue-50/70 border border-blue-100 p-3 rounded-xl flex items-center gap-3">
                            <div className="p-2.5 bg-blue-100 rounded-lg text-blue-700">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[11px] text-gray-500 font-medium">Unscheduled Jobs</div>
                                <div className="text-lg font-bold text-gray-800">{unassignedCount}</div>
                            </div>
                        </div>

                        <div className="bg-indigo-50/70 border border-indigo-100 p-3 rounded-xl flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-100 rounded-lg text-indigo-700">
                                <Users className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[11px] text-gray-500 font-medium">Active Techs</div>
                                <div className="text-lg font-bold text-gray-800">{activeTechCount}</div>
                            </div>
                        </div>

                        <div className="bg-cyan-50/70 border border-cyan-100 p-3 rounded-xl flex items-center gap-3">
                            <div className="p-2.5 bg-cyan-100 rounded-lg text-cyan-700">
                                <Navigation className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[11px] text-gray-500 font-medium">Route Order</div>
                                <div className="text-xs font-bold text-cyan-800 truncate">
                                    {optimizeRouteOrder ? 'Shortest Path' : 'Standard'}
                                </div>
                            </div>
                        </div>

                        <div className="bg-emerald-50/70 border border-emerald-100 p-3 rounded-xl flex items-center gap-3">
                            <div className="p-2.5 bg-emerald-100 rounded-lg text-emerald-700">
                                <Package className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[11px] text-gray-500 font-medium">Material Mode</div>
                                <div className="text-xs font-bold text-emerald-800 capitalize truncate">
                                    {materialMode === 'in_stock_only' ? 'In-Stock Only' : materialMode === 'estimated_availability' ? 'Lead-Time ETA' : 'Schedule Anytime'}
                                </div>
                            </div>
                        </div>

                        <div className="bg-amber-50/70 border border-amber-100 p-3 rounded-xl flex items-center gap-3">
                            <div className="p-2.5 bg-amber-100 rounded-lg text-amber-700">
                                <Truck className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[11px] text-gray-500 font-medium">Traffic Model</div>
                                <div className="text-xs font-bold text-amber-800">
                                    {considerTraffic ? 'Rush-Hour Aware' : 'Standard'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Toggle Settings Accordion Button */}
                    <div className="flex justify-between items-center pt-2">
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="flex items-center gap-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors"
                        >
                            <Sliders className="w-3.5 h-3.5" />
                            {showSettings ? 'Hide Optimization Settings' : 'Adjust Optimization Settings'}
                        </button>
                        {result && (
                            <span className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                Proposal ready ({result.totalScheduled} scheduled, {result.totalUnassigned} held)
                            </span>
                        )}
                    </div>

                    {/* ── Configuration Options Drawer ── */}
                    {showSettings && (
                        <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-5 animate-in fade-in duration-150">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                
                                {/* 1. Schedule Target & Scope */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4 text-indigo-600" />
                                        Target Date & Scope
                                    </h4>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-gray-600 block mb-1 font-medium">Target Date</label>
                                            <input
                                                type="date"
                                                value={targetDateStr}
                                                onChange={(e) => setTargetDateStr(e.target.value)}
                                                className="w-full px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-xs text-gray-600 block mb-1 font-medium">Horizon</label>
                                            <select
                                                value={numDays}
                                                onChange={(e) => setNumDays(Number(e.target.value))}
                                                className="w-full px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            >
                                                <option value={1}>Single Day ({targetDateStr})</option>
                                                <option value={3}>Next 3 Days</option>
                                                <option value={7}>Full Week (7 Days)</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Re-optimization checkbox */}
                                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                                        <input
                                            type="checkbox"
                                            checked={includeScheduled}
                                            onChange={(e) => setIncludeScheduled(e.target.checked)}
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                        <span className="text-xs text-gray-700 font-medium">
                                            Re-optimize existing scheduled jobs on target date(s)
                                        </span>
                                    </label>

                                    {/* Pre-existing Conflict Alert */}
                                    {existingConflictsCount > 0 && !includeScheduled && (
                                        <div className="mt-2 p-2.5 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2 text-amber-900 text-[11px]">
                                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                            <div className="flex-1">
                                                <div className="font-bold">
                                                    {existingConflictsCount} Existing Schedule Conflict{existingConflictsCount > 1 ? 's' : ''} Detected
                                                </div>
                                                <div className="text-amber-800 text-[10px] mt-0.5">
                                                    Jobs already overlap on the timeline. Enable re-optimization to sequence all appointments cleanly with zero collisions.
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setIncludeScheduled(true)}
                                                    className="mt-1.5 px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-semibold transition-colors shadow-xs"
                                                >
                                                    Enable Re-Optimization
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 2. Active Technicians Selection */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                            <Users className="w-4 h-4 text-indigo-600" />
                                            Technician Pool ({selectedTechIds.length}/{technicians.length})
                                        </h4>
                                        <button
                                            onClick={() => {
                                                if (selectedTechIds.length === technicians.length) setSelectedTechIds([]);
                                                else setSelectedTechIds(technicians.map(t => t.id));
                                            }}
                                            className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
                                        >
                                            {selectedTechIds.length === technicians.length ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>

                                    <div className="max-h-28 overflow-y-auto bg-white p-2 border border-gray-200 rounded-lg space-y-1.5">
                                        {technicians.map(tech => (
                                            <label key={tech.id} className="flex items-center justify-between text-xs px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedTechIds.includes(tech.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedTechIds([...selectedTechIds, tech.id]);
                                                            else setSelectedTechIds(selectedTechIds.filter(id => id !== tech.id));
                                                        }}
                                                        className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300"
                                                    />
                                                    <span className="font-medium text-gray-800">{tech.name}</span>
                                                </div>
                                                <span className="text-[10px] text-gray-400">
                                                    {tech.specialties?.slice(0, 2).join(', ') || 'General'}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* 3. 5-Pillar Constraint Rules */}
                            <div className="border-t border-gray-200 pt-4">
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">
                                    Scheduling Constraints & Rules
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                    
                                    {/* Shortest Route Optimization */}
                                    <div className="bg-white p-3 rounded-lg border border-blue-200 bg-blue-50/20 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                                <Navigation className="w-3.5 h-3.5 text-blue-600" />
                                                Shortest Route
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={optimizeRouteOrder}
                                                onChange={(e) => setOptimizeRouteOrder(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-500 leading-tight">
                                            Sequences stops to the next closest site to eliminate crisscrossing & minimize drive time.
                                        </p>
                                    </div>

                                    {/* Material Check */}
                                    <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                                <Package className="w-3.5 h-3.5 text-emerald-600" />
                                                Materials
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={enforceMaterials}
                                                onChange={(e) => setEnforceMaterials(e.target.checked)}
                                                className="w-4 h-4 text-emerald-600 rounded border-gray-300 cursor-pointer"
                                            />
                                        </div>
                                        <select
                                            disabled={!enforceMaterials}
                                            value={materialMode}
                                            onChange={(e) => setMaterialMode(e.target.value as any)}
                                            className="w-full text-[11px] bg-gray-50 border border-gray-200 rounded p-1"
                                        >
                                            <option value="allow_all">Schedule Anytime</option>
                                            <option value="estimated_availability">Wait for Delivery ETA</option>
                                            <option value="in_stock_only">In-Stock Only</option>
                                        </select>
                                    </div>

                                    {/* Tools Check */}
                                    <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                                <Wrench className="w-3.5 h-3.5 text-blue-600" />
                                                Specialty Tools
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={enforceTools}
                                                onChange={(e) => setEnforceTools(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-500 leading-tight">
                                            Matches required tools to tech truck inventory & equipment availability.
                                        </p>
                                    </div>

                                    {/* Customer Windows */}
                                    <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                                Customer Times
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={respectCustomerWindows}
                                                onChange={(e) => setRespectCustomerWindows(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 rounded border-gray-300 cursor-pointer"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-500 leading-tight">
                                            Honors customer preferred days, morning/afternoon slots, and time windows.
                                        </p>
                                    </div>

                                    {/* Traffic Model */}
                                    <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                                <Truck className="w-3.5 h-3.5 text-amber-600" />
                                                Live Traffic
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={considerTraffic}
                                                onChange={(e) => setConsiderTraffic(e.target.checked)}
                                                className="w-4 h-4 text-amber-600 rounded border-gray-300 cursor-pointer"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-500 leading-tight">
                                            Applies rush hour transit multipliers (7–9:30 AM & 3:45–6:30 PM).
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 4. Drag & Drop Metric Priorities Hierarchy */}
                            <div className="border-t border-gray-200 pt-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                        <Sliders className="w-4 h-4 text-indigo-600" />
                                        Scheduling Metric Priorities (Drag & Drop Hierarchy)
                                    </h4>
                                    <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-semibold border border-blue-200">
                                        Default: Shortest Driving Route (#1)
                                    </span>
                                </div>

                                <MetricPriorityRanker
                                    priorities={metricPriorities}
                                    onChange={setMetricPriorities}
                                    compact={false}
                                    showPresets={true}
                                />
                            </div>

                            {/* Run solver action bar */}
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={handleRunOptimization}
                                    disabled={isOptimizing || selectedTechIds.length === 0}
                                    className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-200 flex items-center gap-2 transition-all disabled:opacity-50"
                                >
                                    {isOptimizing ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Solving Optimal Routes...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 text-amber-300" />
                                            Generate AI Schedule Proposal
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Proposal Results & Review View ── */}
                    {result && (
                        <div className="space-y-5">
                            
                            {/* Summary Metrics Banner */}
                            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400">
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm">
                                            {result.newlyScheduled} New Jobs Scheduled {result.preExistingScheduled > 0 ? `(+${result.preExistingScheduled} Pre-Scheduled)` : ''} Across {result.techSummaries.filter(t => t.assignedJobs.length > 0).length} Techs
                                        </h3>
                                        <p className="text-xs text-gray-300 mt-0.5">
                                            {result.totalUnassigned} jobs held for materials/tools/window constraints • Est. Drive Time: {result.overallStatistics.totalDriveMinutes}m
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 text-xs">
                                    <div>
                                        <div className="text-gray-400 font-medium">Work Time</div>
                                        <div className="text-base font-bold text-white">
                                            {Math.round(result.overallStatistics.totalWorkMinutes / 60 * 10) / 10} hrs
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-gray-400 font-medium">Drive Distance</div>
                                        <div className="text-base font-bold text-white">
                                            {result.overallStatistics.totalDistanceMiles} mi
                                        </div>
                                    </div>
                                    <div className="bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-emerald-300 font-bold">
                                        ~{result.overallStatistics.estimatedDriveTimeSavedMinutes}m Drive Saved
                                    </div>
                                </div>
                            </div>

                            {/* Technician Tabs */}
                            <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-1">
                                {result.techSummaries.map(summary => (
                                    <button
                                        key={summary.tech.id}
                                        onClick={() => setSelectedTabTechId(summary.tech.id)}
                                        className={`px-4 py-2 rounded-t-lg text-xs font-semibold flex items-center gap-2 transition-colors border-b-2 whitespace-nowrap ${
                                            selectedTabTechId === summary.tech.id
                                                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        <span>{summary.tech.name}</span>
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                            summary.assignedJobs.length > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            {summary.assignedJobs.length}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {/* Selected Technician Schedule Breakdown */}
                            {selectedTechSummary && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                                                {selectedTechSummary.tech.name.slice(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-bold text-gray-900">{selectedTechSummary.tech.name}</h4>
                                                <p className="text-[11px] text-gray-500">
                                                    {selectedTechSummary.assignedJobs.length} stops • {selectedTechSummary.totalWorkTimeMinutes}m work • {selectedTechSummary.totalDriveTimeMinutes}m transit
                                                </p>
                                            </div>
                                        </div>

                                        {selectedTechSummary.routeMapsUrl && (
                                            <a
                                                href={selectedTechSummary.routeMapsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm hover:shadow transition-all"
                                            >
                                                <Navigation className="w-3.5 h-3.5 text-blue-600" />
                                                Open Route in Google Maps
                                                <ExternalLink className="w-3 h-3 text-gray-400" />
                                            </a>
                                        )}
                                    </div>

                                    {/* Stops Timeline */}
                                    {selectedTechSummary.assignedJobs.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400 text-xs bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                            No jobs scheduled for this technician on {targetDateStr}.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {selectedTechSummary.assignedJobs.map((assignment, idx) => (
                                                <div key={assignment.job.id} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow transition-shadow">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-start gap-3">
                                                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                                                                #{idx + 1}
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <h5 className="font-bold text-gray-900 text-sm">
                                                                        {assignment.job.customer.name}
                                                                    </h5>
                                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${
                                                                        assignment.job.priority === 'critical' ? 'bg-red-100 text-red-700' :
                                                                        assignment.job.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                                                        'bg-blue-100 text-blue-700'
                                                                    }`}>
                                                                        {assignment.job.priority}
                                                                    </span>
                                                                    {assignment.isPreExisting && (
                                                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                                                            🔒 Pre-Scheduled
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-gray-600 mt-0.5">
                                                                    {assignment.job.request?.description || 'General Service'}
                                                                </p>
                                                                <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                                                                    <span className="flex items-center gap-1">
                                                                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                                                        {assignment.job.customer.address}
                                                                    </span>
                                                                    <span className="flex items-center gap-1 font-semibold text-indigo-700">
                                                                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                                                        {format(assignment.estimatedArrival, 'h:mm a')} – {format(assignment.estimatedDeparture, 'h:mm a')}
                                                                    </span>
                                                                    <span className="text-gray-400">
                                                                        ({assignment.durationMinutes}m on site)
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Transit badge */}
                                                        <div className="text-right flex-shrink-0">
                                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded-md">
                                                                <Truck className="w-3 h-3 text-gray-500" />
                                                                {assignment.driveTimeMinutes}m drive ({assignment.distanceMiles} mi)
                                                            </span>
                                                            <div className="text-[10px] text-emerald-600 font-medium mt-1">
                                                                Score: {assignment.score}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Match reasons pills */}
                                                    {assignment.matchReasons.length > 0 && (
                                                        <div className="mt-2.5 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5">
                                                            {assignment.matchReasons.map((reason, rIdx) => (
                                                                <span key={rIdx} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium border border-indigo-100">
                                                                    ✓ {reason}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Held / Unassigned Jobs Drawer */}
                            {result.unassignedJobs.length > 0 && (
                                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                                            Jobs Held Back / Unassigned ({result.unassignedJobs.length})
                                        </h4>
                                        <span className="text-[11px] text-amber-800">
                                            Protected by constraint rules
                                        </span>
                                    </div>

                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {result.unassignedJobs.map((unassigned, uIdx) => (
                                            <div key={uIdx} className="bg-white p-2.5 rounded-lg border border-amber-200 text-xs flex justify-between items-center">
                                                <div>
                                                    <span className="font-bold text-gray-800 mr-2">{unassigned.job.customer.name}</span>
                                                    <span className="text-gray-500">{unassigned.job.request?.description}</span>
                                                </div>
                                                <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md ml-2 flex-shrink-0">
                                                    {unassigned.reason}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Modal Footer ── */}
                <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex justify-between items-center flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        Cancel
                    </button>

                    <div className="flex items-center gap-3">
                        {result && (
                            <button
                                onClick={handleRunOptimization}
                                disabled={isOptimizing}
                                className="px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors flex items-center gap-1.5"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isOptimizing ? 'animate-spin' : ''}`} />
                                Re-Calculate
                            </button>
                        )}

                        <button
                            onClick={handleApply}
                            disabled={!result || result.totalScheduled === 0 || isApplying}
                            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-200 flex items-center gap-2 transition-all disabled:opacity-40"
                        >
                            {isApplying ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Applying Schedule to Timeline...
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    Apply Schedule to Timeline ({includeScheduled ? (result?.totalScheduled || 0) : (result?.newlyScheduled || 0)} Jobs)
                                </>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
