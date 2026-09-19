import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
    TechViewProps, getJobPriorityColor, getJobPriorityDot, getStatusBadge,
    getCategoryEmoji, formatJobTime, getJobDate, LiveJobTimer
} from './shared';
import {
    MapPin, Phone, Play, CheckCircle, Clock, Wrench, Package, Navigation,
    ExternalLink, ChevronRight, Timer, Shield, Clock as Clock2, Car,
    CheckSquare, Square, Store, Warehouse, Sparkles, Navigation2, Compass,
    AlertTriangle, Check, Layers, Edit3
} from 'lucide-react';
import { launchNavigation } from '../../lib/navigationHelper';
import { OnSiteExecutionModal } from '../OnSiteExecutionModal';
import { Job } from '../../types';
import toast from 'react-hot-toast';

export const MissionBriefingView: React.FC<TechViewProps> = ({
    jobs, onStatusUpdate, onCheckInJob, onSelectJob, dispatchMode, onRequestReschedule,
    onAcknowledgeJob, onTogglePrepChecklist, onStartTransit, onNotifyDelay, autoOpenNav = true, onToggleAutoOpenNav
}) => {
    const [prepExpanded, setPrepExpanded] = useState(true);
    const [executionModalJob, setExecutionModalJob] = useState<Job | null>(null);
    const [executionModalTab, setExecutionModalTab] = useState<'checklist' | 'scope_change' | 'parts_needed'>('checklist');

    // Sort jobs chronologically by scheduled time
    const sortedJobs = useMemo(() => {
        return [...jobs].sort((a, b) => {
            const dateA = a.scheduled_at ? (a.scheduled_at?.toDate?.() || new Date(a.scheduled_at)).getTime() : 0;
            const dateB = b.scheduled_at ? (b.scheduled_at?.toDate?.() || new Date(b.scheduled_at)).getTime() : 0;
            return dateA - dateB;
        });
    }, [jobs]);

    // ── Aggregated Morning Prep & Loadout Items ──────────────────────────────
    const { depotTools, depotMaterials, pickupStops, totalPrepItems, completedPrepItems } = useMemo(() => {
        const toolsMap = new Map<string, { name: string; essential: boolean; jobsCount: number }>();
        const materialsMap = new Map<string, { name: string; quantity?: string; estimatedCost?: number; jobsCount: number; isPickup?: boolean; supplierName?: string; supplierAddress?: string }>();

        jobs.forEach(j => {
            const jobTools = j.aiRecommendation?.requiredTools || j.intakeReview?.aiRecommendation?.requiredTools || [];
            const jobMaterials = j.aiRecommendation?.recommendedMaterials || j.intakeReview?.aiRecommendation?.recommendedMaterials || [];

            jobTools.forEach(t => {
                const existing = toolsMap.get(t.name);
                if (existing) {
                    existing.jobsCount += 1;
                    if (t.essential) existing.essential = true;
                } else {
                    toolsMap.set(t.name, { name: t.name, essential: !!t.essential, jobsCount: 1 });
                }
            });

            jobMaterials.forEach(m => {
                const existing = materialsMap.get(m.name);
                // Check if material is flagged as off-site supplier pickup
                const isPickup = (m as any).isPickup || (m as any).pickupRequired || (m as any).supplierName;
                if (existing) {
                    existing.jobsCount += 1;
                } else {
                    materialsMap.set(m.name, {
                        name: m.name,
                        quantity: m.quantity,
                        estimatedCost: m.estimatedCost,
                        jobsCount: 1,
                        isPickup: !!isPickup,
                        supplierName: (m as any).supplierName || 'Pacific Plumbing Supply',
                        supplierAddress: (m as any).supplierAddress || '711 Nimitz Hwy, Honolulu, HI'
                    });
                }
            });
        });

        const allTools = Array.from(toolsMap.values());
        const allMaterials = Array.from(materialsMap.values());

        const depotTools = allTools;
        const depotMaterials = allMaterials.filter(m => !m.isPickup);
        const pickupStops = allMaterials.filter(m => m.isPickup);

        // Check against first job's prep checklist (or global tech loadout)
        let total = depotTools.length + depotMaterials.length + pickupStops.length;
        let checked = 0;

        // Check completed items across jobs
        const checkedLabels = new Set<string>();
        jobs.forEach(j => {
            (j.prep_checklist || []).forEach(item => {
                if (item.checked) checkedLabels.add(item.label);
            });
        });

        depotTools.forEach(t => { if (checkedLabels.has(t.name)) checked++; });
        depotMaterials.forEach(m => { if (checkedLabels.has(m.name)) checked++; });
        pickupStops.forEach(p => { if (checkedLabels.has(p.name)) checked++; });

        return {
            depotTools,
            depotMaterials,
            pickupStops,
            totalPrepItems: total,
            completedPrepItems: checked
        };
    }, [jobs]);

    const isPrepComplete = totalPrepItems > 0 && completedPrepItems >= totalPrepItems;
    const prepPercentage = totalPrepItems > 0 ? Math.round((completedPrepItems / totalPrepItems) * 100) : 100;

    const handleTransitAction = (job: typeof jobs[0]) => {
        const address = job.customer?.address || (job as any).location?.address || '';
        if (onStartTransit) {
            onStartTransit(job.id, address);
        } else {
            onStatusUpdate(job.id, 'en_route');
            if (autoOpenNav && address) {
                launchNavigation(address);
            }
        }
    };

    const handleOpenDirections = (address: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        launchNavigation(address);
    };

    if (jobs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <CheckCircle className="w-16 h-16 mb-4 text-green-300" />
                <p className="text-xl font-semibold text-gray-600">All clear — no active jobs</p>
                <p className="text-sm mt-1">Enjoy your day! 🌺</p>
            </div>
        );
    }

    return (
        <div className="space-y-5 max-w-3xl mx-auto pb-12">
            {/* ── Top Bar: Navigation Auto-Open Preference Pill ───────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-3.5 shadow-2xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                        <Compass className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-900">Google Maps Auto-Navigation</p>
                        <p className="text-[11px] text-gray-500">
                            {autoOpenNav ? 'Opens driving directions automatically on job start' : 'Manual direction launches only'}
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => onToggleAutoOpenNav?.(!autoOpenNav)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        autoOpenNav
                            ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/30'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                    }`}
                >
                    <Navigation2 className="w-3.5 h-3.5" />
                    <span>Auto-Open: {autoOpenNav ? 'ON' : 'OFF'}</span>
                </button>
            </div>

            {/* ── CARD #1 (TOP): Morning Prep & Supply Pickup Loadout ─────────── */}
            {(depotTools.length > 0 || depotMaterials.length > 0 || pickupStops.length > 0) && (
                <div className="bg-white rounded-2xl border border-blue-200/80 shadow-sm overflow-hidden animate-in fade-in">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white px-5 py-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                                <Warehouse className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                                    <span>Step 0: Truck Loadout & Supply Prep</span>
                                </h3>
                                <p className="text-xs text-blue-200/80">
                                    Pack required tools & pick supplies before rolling out
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                                isPrepComplete
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}>
                                {completedPrepItems}/{totalPrepItems} Ready ({prepPercentage}%)
                            </span>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-100 h-1.5 overflow-hidden">
                        <div
                            className={`h-full transition-all duration-300 ${isPrepComplete ? 'bg-emerald-500' : 'bg-blue-600'}`}
                            style={{ width: `${prepPercentage}%` }}
                        />
                    </div>

                    {/* Body */}
                    <div className="p-4 sm:p-5 space-y-4">
                        {/* 1. Shop / Warehouse Tools & Gear */}
                        {depotTools.length > 0 && (
                            <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200">
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                    <Wrench className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Truck Tools Required ({depotTools.length})</span>
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {depotTools.map((tool, i) => {
                                        const isChecked = jobs.some(j => (j.prep_checklist || []).some(item => item.label === tool.name && item.checked));
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => onTogglePrepChecklist?.(jobs[0]?.id, tool.name, !isChecked)}
                                                className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                                                    isChecked
                                                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-semibold shadow-2xs'
                                                        : 'bg-white border-gray-200 hover:border-blue-300 text-gray-800'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {}}
                                                        className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300 pointer-events-none"
                                                    />
                                                    <span className="truncate">{tool.name}</span>
                                                </div>
                                                {tool.essential && (
                                                    <span className="text-[9px] font-black bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded uppercase">
                                                        REQ
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 2. Warehouse Stock Materials */}
                        {depotMaterials.length > 0 && (
                            <div className="bg-amber-50/60 rounded-xl p-3.5 border border-amber-200/80">
                                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                    <Package className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Shop Inventory Parts ({depotMaterials.length})</span>
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {depotMaterials.map((mat, i) => {
                                        const isChecked = jobs.some(j => (j.prep_checklist || []).some(item => item.label === mat.name && item.checked));
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => onTogglePrepChecklist?.(jobs[0]?.id, mat.name, !isChecked)}
                                                className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                                                    isChecked
                                                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-semibold shadow-2xs'
                                                        : 'bg-white border-amber-200/80 hover:border-amber-400 text-amber-950'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {}}
                                                        className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 border-gray-300 pointer-events-none"
                                                    />
                                                    <span className="truncate">{mat.name} {mat.quantity && `(${mat.quantity})`}</span>
                                                </div>
                                                {mat.estimatedCost && (
                                                    <span className="font-mono text-[11px] text-amber-700">${mat.estimatedCost}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 3. Off-Site Supply House / Vendor Pickups */}
                        {pickupStops.length > 0 && (
                            <div className="bg-purple-50/70 rounded-xl p-3.5 border border-purple-200">
                                <div className="flex items-center justify-between mb-2.5">
                                    <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
                                        <Store className="w-3.5 h-3.5 text-purple-600" />
                                        <span>Off-Site Supply Pickups ({pickupStops.length})</span>
                                    </h4>
                                    {pickupStops[0]?.supplierAddress && (
                                        <button
                                            onClick={(e) => handleOpenDirections(pickupStops[0].supplierAddress!, e)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[11px] font-bold transition-colors shadow-2xs"
                                        >
                                            <Navigation className="w-3 h-3" /> Navigate to Supplier
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {pickupStops.map((pickup, i) => {
                                        const isChecked = jobs.some(j => (j.prep_checklist || []).some(item => item.label === pickup.name && item.checked));
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => onTogglePrepChecklist?.(jobs[0]?.id, pickup.name, !isChecked)}
                                                className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                                                    isChecked
                                                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-semibold'
                                                        : 'bg-white border-purple-200 hover:border-purple-400'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => {}}
                                                            className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4 border-gray-300 pointer-events-none"
                                                        />
                                                        <span className="font-bold text-purple-950">{pickup.name}</span>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                                                        {pickup.supplierName}
                                                    </span>
                                                </div>
                                                {pickup.supplierAddress && (
                                                    <p className="text-[11px] text-gray-500 mt-1 ml-6 flex items-center gap-1">
                                                        <MapPin className="w-3 h-3 text-gray-400" />
                                                        {pickup.supplierAddress}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── SEQUENTIAL JOB CARDS (#1, #2, #3...) ────────────────────────── */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-600" />
                        <span>Today's Assigned Route ({sortedJobs.length} Stops)</span>
                    </h2>
                    <span className="text-xs text-gray-400 font-medium">
                        Executed in order
                    </span>
                </div>

                {sortedJobs.map((job, idx) => {
                    const priorityClass = getJobPriorityColor(job.priority);
                    const priorityDot = getJobPriorityDot(job.priority);
                    const statusBadge = getStatusBadge(job.status);
                    const isAcked = job.tech_alert_status?.acknowledged === true;
                    const isEnRoute = job.status === 'en_route';
                    const isInProgress = job.status === 'in_progress';
                    const isCompleted = job.status === 'completed';

                    const tools = job.aiRecommendation?.requiredTools || job.intakeReview?.aiRecommendation?.requiredTools || [];
                    const materials = job.aiRecommendation?.recommendedMaterials || job.intakeReview?.aiRecommendation?.recommendedMaterials || [];
                    const safety = job.aiRecommendation?.safetyConsiderations || job.intakeReview?.aiRecommendation?.safetyConsiderations || [];

                    return (
                        <div
                            key={job.id}
                            className={`rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${
                                isInProgress ? 'border-amber-400 ring-2 ring-amber-300/60' :
                                isEnRoute ? 'border-purple-400 ring-2 ring-purple-300/60' :
                                'border-gray-200'
                            }`}
                        >
                            {/* Card Top Banner: Stop Number + Time + Status */}
                            <div className={`px-5 py-3 flex items-center justify-between ${
                                isInProgress ? 'bg-gradient-to-r from-amber-600 to-orange-700 text-white' :
                                isEnRoute ? 'bg-gradient-to-r from-purple-700 to-indigo-800 text-white' :
                                'bg-gradient-to-r from-gray-800 via-gray-900 to-slate-900 text-white'
                            }`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center font-black text-xs font-mono">
                                        #{idx + 1}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-bold font-mono">
                                            {formatJobTime(job.scheduled_at)}
                                        </span>
                                        {job.estimated_duration && (
                                            <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                                                <Timer className="w-3 h-3" />
                                                {job.estimated_duration}m
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${priorityDot}`} />
                                    <span className="text-xs font-bold uppercase tracking-wider">
                                        {job.priority}
                                    </span>
                                </div>
                            </div>

                            {/* En Route Driving Alert Ribbon */}
                            {isEnRoute && (
                                <div className="bg-purple-100 text-purple-950 px-5 py-2.5 flex items-center justify-between border-b border-purple-200 text-xs font-bold animate-pulse">
                                    <span className="flex items-center gap-1.5">
                                        <Car className="w-4 h-4 text-purple-700" />
                                        <span>En Route to Customer Site</span>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => handleOpenDirections(job.customer?.address || (job as any).location?.address || '', e)}
                                            className="text-purple-800 hover:underline flex items-center gap-1 text-[11px]"
                                        >
                                            <Navigation className="w-3 h-3" /> View Route
                                        </button>
                                        <button
                                            onClick={() => onCheckInJob ? onCheckInJob(job.id) : onStatusUpdate(job.id, 'in_progress')}
                                            className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-[11px] font-black flex items-center gap-1 shadow-2xs"
                                        >
                                            <Play className="w-3 h-3 fill-white" /> Check In
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* On-Site Active Work Banner with Live Timer */}
                            {isInProgress && (
                                <div className="bg-amber-500/15 border-b border-amber-300 text-amber-950 px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2 font-bold">
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                                        <span className="flex items-center gap-1.5">
                                            <Wrench className="w-4 h-4 text-amber-600" />
                                            <span>Active On-Site Work</span>
                                        </span>
                                        {job.arrived_at && (
                                            <span className="text-[11px] font-normal text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md">
                                                Arrived {formatJobTime(job.arrived_at)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {job.transit_duration_minutes && (
                                            <span className="text-[11px] text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md font-semibold">
                                                🚗 {job.transit_duration_minutes}m drive
                                            </span>
                                        )}
                                        {job.customer_arrival_notified && (
                                            <span className="text-[11px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                                                <Check className="w-3 h-3 text-emerald-600" /> Customer Notified
                                            </span>
                                        )}
                                        <LiveJobTimer startTime={job.actual_start || job.arrived_at} />
                                    </div>
                                </div>
                            )}

                            {/* Parts Needed Alert Ribbon */}
                            {job.parts_needed && (
                                <div className="bg-amber-500/15 text-amber-950 border-b border-amber-300 px-5 py-2 flex items-center justify-between text-xs font-bold">
                                    <span className="flex items-center gap-1.5 truncate">
                                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                        <span className="truncate">
                                            Parts Exception: {job.parts_description || 'Specialty parts requested'}
                                            {job.parts_procurement_status && (
                                                <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-amber-200 text-amber-900 uppercase font-black">
                                                    {job.parts_procurement_status.replace(/_/g, ' ')}
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                    <button
                                        onClick={() => { setExecutionModalJob(job); setExecutionModalTab('parts_needed'); }}
                                        className="text-amber-900 underline hover:text-amber-950 text-[11px] font-bold flex-shrink-0 ml-2"
                                    >
                                        Update Requisition
                                    </button>
                                </div>
                            )}

                            {/* Office Quote Requested Ribbon */}
                            {job.field_quote_requested && (
                                <div className="bg-purple-100 text-purple-950 border-b border-purple-300 px-5 py-2 flex items-center justify-between text-xs font-bold">
                                    <span className="flex items-center gap-1.5 truncate">
                                        <Edit3 className="w-4 h-4 text-purple-700 flex-shrink-0 animate-pulse" />
                                        <span className="truncate">
                                            📋 Field Quote Request Sent to Office ({job.field_quote_details?.urgency?.toUpperCase() || 'STANDARD'})
                                        </span>
                                    </span>
                                    <button
                                        onClick={() => { setExecutionModalJob(job); setExecutionModalTab('scope_change'); }}
                                        className="text-purple-800 underline hover:text-purple-950 text-[11px] font-bold flex-shrink-0 ml-2"
                                    >
                                        View Quote Details
                                    </button>
                                </div>
                            )}

                            {/* Scope Amendment Ribbon */}
                            {(job as any).has_scope_amendment && !job.field_quote_requested && (
                                <div className="bg-purple-50 text-purple-950 border-b border-purple-200 px-5 py-2 flex items-center justify-between text-xs font-bold">
                                    <span className="flex items-center gap-1.5 truncate">
                                        <Edit3 className="w-4 h-4 text-purple-600 flex-shrink-0" />
                                        <span>Scope Amendment Recorded</span>
                                    </span>
                                    <button
                                        onClick={() => { setExecutionModalJob(job); setExecutionModalTab('scope_change'); }}
                                        className="text-purple-800 underline hover:text-purple-950 text-[11px] font-bold flex-shrink-0 ml-2"
                                    >
                                        View Changes
                                    </button>
                                </div>
                            )}

                            {/* Unacknowledged Alert Banner (if tech hasn't confirmed) */}
                            {!isAcked && onAcknowledgeJob && (
                                <div className="bg-amber-500 text-white px-5 py-2 flex items-center justify-between gap-3 text-xs font-semibold">
                                    <span className="flex items-center gap-1.5">
                                        <span>⚡ New stop! Confirm receipt:</span>
                                    </span>
                                    <button
                                        onClick={() => onAcknowledgeJob(job.id)}
                                        className="px-3 py-1 bg-white text-amber-950 hover:bg-amber-50 font-bold rounded-lg shadow-xs text-xs flex items-center gap-1"
                                    >
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                        Acknowledge
                                    </button>
                                </div>
                            )}

                            {/* Card Body */}
                            <div className="p-5 space-y-4">
                                {/* Customer Name + Phone + Address */}
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900">{job.customer?.name || (job as any).customer_name || 'Customer'}</h3>
                                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 mt-1.5 text-xs text-gray-600">
                                            {/* Clickable Address to Maps */}
                                            {(job.customer?.address || (job as any).location?.address) && (
                                                <a
                                                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.customer?.address || (job as any).location?.address || '')}&travelmode=driving&dir_action=navigate`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium group"
                                                >
                                                    <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0 group-hover:scale-110 transition-transform" />
                                                    <span className="underline underline-offset-2">{job.customer?.address || (job as any).location?.address}</span>
                                                    <ExternalLink className="w-3 h-3 text-gray-400" />
                                                </a>
                                            )}

                                            {/* Clickable Phone */}
                                            {job.customer?.phone && (
                                                <a
                                                    href={`tel:${job.customer.phone}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1 text-gray-700 hover:text-emerald-700 font-medium"
                                                >
                                                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                                                    <span>{job.customer.phone}</span>
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    <span className={`self-start px-3 py-1 rounded-full text-xs font-bold border shadow-2xs ${statusBadge.bg} ${statusBadge.text}`}>
                                        {statusBadge.label}
                                    </span>
                                </div>

                                {/* Scope of Work */}
                                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70 text-xs text-gray-700">
                                    <span className="font-bold text-gray-900 mr-1.5 uppercase text-[10px] tracking-wider block sm:inline">Scope:</span>
                                    <span className="leading-relaxed">{job.request?.description || 'No description provided'}</span>
                                </div>

                                {/* Safety / Site Access Alert */}
                                {safety.length > 0 && (
                                    <div className="bg-red-50 rounded-xl p-3 border border-red-100 text-xs text-red-800 flex items-start gap-2">
                                        <Shield className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <span className="font-bold mr-1">Site / Safety Alert:</span>
                                            <span>{safety.join(' • ')}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Tools & Parts Pill Summary for this Job */}
                                {(tools.length > 0 || materials.length > 0) && (
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                        {tools.slice(0, 3).map((t, idx) => (
                                            <span key={idx} className="text-[11px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded-md border border-blue-100 flex items-center gap-1 font-medium">
                                                <Wrench className="w-2.5 h-2.5 text-blue-500" /> {t.name}
                                            </span>
                                        ))}
                                        {materials.slice(0, 2).map((m, idx) => (
                                            <span key={idx} className="text-[11px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-100 flex items-center gap-1 font-medium">
                                                <Package className="w-2.5 h-2.5 text-amber-500" /> {m.name}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* ── Dynamic Transit & Execution Action Bar ──────── */}
                                <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {/* Scheduled State -> Start Transit or Direct Check In */}
                                        {job.status === 'scheduled' && (
                                            <>
                                                <button
                                                    onClick={() => handleTransitAction(job)}
                                                    className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                                                >
                                                    <Car className="w-4 h-4" />
                                                    <span>Start Transit (En Route)</span>
                                                </button>
                                                <button
                                                    onClick={() => onCheckInJob ? onCheckInJob(job.id) : onStatusUpdate(job.id, 'in_progress')}
                                                    className="px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95"
                                                    title="Arrived at job site without prior en-route transit"
                                                >
                                                    <Play className="w-3.5 h-3.5 fill-blue-800 text-blue-800" />
                                                    <span>Arrived & Check In</span>
                                                </button>
                                            </>
                                        )}

                                        {/* En Route State -> Arrived & Check In */}
                                        {isEnRoute && (
                                            <button
                                                onClick={() => onCheckInJob ? onCheckInJob(job.id) : onStatusUpdate(job.id, 'in_progress')}
                                                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-2 active:scale-95 animate-bounce-short"
                                            >
                                                <Play className="w-4 h-4 fill-white" />
                                                <span>▶️ Arrived on Site & Check In</span>
                                            </button>
                                        )}

                                        {/* In Progress State -> Action Hub & Complete */}
                                        {isInProgress && (
                                            <>
                                                <button
                                                    onClick={() => { setExecutionModalJob(job); setExecutionModalTab('checklist'); }}
                                                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-2xs"
                                                    title="Open on-site work tasks and diagnosis notes"
                                                >
                                                    <Wrench className="w-3.5 h-3.5 text-blue-600" />
                                                    <span>Work Hub</span>
                                                </button>
                                                <button
                                                    onClick={() => { setExecutionModalJob(job); setExecutionModalTab('scope_change'); }}
                                                    className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-2xs"
                                                    title="Add unexpected line items or customer quote approval"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5 text-purple-600" />
                                                    <span>+ Scope Change</span>
                                                </button>
                                                <button
                                                    onClick={() => { setExecutionModalJob(job); setExecutionModalTab('parts_needed'); }}
                                                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-2xs"
                                                    title="Flag missing parts or create PO requisition"
                                                >
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                                    <span>Parts Exception</span>
                                                </button>
                                                <button
                                                    onClick={() => onStatusUpdate(job.id, 'completed')}
                                                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                    <span>Finish & Complete</span>
                                                </button>
                                            </>
                                        )}

                                        {/* On-Demand Directions Button (Always Available) */}
                                        {(job.customer?.address || (job as any).location?.address) && (
                                            <button
                                                onClick={(e) => handleOpenDirections(job.customer?.address || (job as any).location?.address || '', e)}
                                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                                                title="Open Turn-by-Turn Driving Directions in Google Maps"
                                            >
                                                <Navigation className="w-3.5 h-3.5 text-blue-600" />
                                                <span>Directions</span>
                                            </button>
                                        )}

                                        {/* Quick Delay SMS Alert Button */}
                                        {job.status !== 'completed' && onNotifyDelay && (
                                            <button
                                                onClick={() => onNotifyDelay(job.id, 25, 'traffic delay and extended safety check')}
                                                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 active:scale-95"
                                                title="Send Quick SMS to Customer: 25 Min Delay"
                                            >
                                                <Clock2 className="w-3.5 h-3.5 text-amber-600" />
                                                <span>Delay SMS (25m)</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Right Actions: Phone + Details */}
                                    <div className="flex items-center gap-2 ml-auto">
                                        {job.customer?.phone && (
                                            <a
                                                href={`tel:${job.customer.phone}`}
                                                className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
                                                title="Call Customer"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Phone className="w-4 h-4 text-gray-700" />
                                            </a>
                                        )}

                                        <button
                                            onClick={() => onSelectJob(job)}
                                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                                        >
                                            <span>Dossier</span>
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* On-Site Execution Modal */}
            {executionModalJob && (
                <OnSiteExecutionModal
                    job={executionModalJob}
                    onClose={() => setExecutionModalJob(null)}
                    initialTab={executionModalTab}
                />
            )}
        </div>
    );
};
