import React, { useState, useMemo } from 'react';
import { Job } from '../../types';
import {
    ChevronRight, ChevronDown, MapPin, Calendar, Clock,
    UserPlus, Eye, MoreHorizontal, Phone, Mail, Archive,
    Trash2, ExternalLink, Wrench, CheckCircle2, AlertTriangle,
    Car, AlertCircle, XCircle, ArrowRight, ShieldAlert, Sparkles
} from 'lucide-react';
import { format, isToday, isTomorrow, formatDistanceToNowStrict } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { JobHistoryModule } from '../JobHistoryModule';

export interface JobRowProps {
    job: Job;
    isSelected: boolean;
    isExpanded: boolean;
    density?: 'compact' | 'comfortable';
    onToggleSelect: (e: React.MouseEvent) => void;
    onToggleExpand: (e: React.MouseEvent) => void;
    onNavigate: (path: string) => void;
    onAssignTech: (job: Job) => void;
    onArchive: (jobId: string, shouldArchive: boolean) => void;
    canDelete?: boolean;
    onDelete?: (job: Job) => void;
}

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
    unscheduled: {
        label: 'Unscheduled',
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
    },
    pending: {
        label: 'Unscheduled',
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
    },
    quote_pending: {
        label: 'Quote Pending',
        bg: 'bg-purple-50',
        text: 'text-purple-800',
        border: 'border-purple-200',
        dot: 'bg-purple-500',
    },
    scheduled: {
        label: 'Scheduled',
        bg: 'bg-blue-50',
        text: 'text-blue-800',
        border: 'border-blue-200',
        dot: 'bg-blue-500',
    },
    en_route: {
        label: 'En Route',
        bg: 'bg-indigo-50',
        text: 'text-indigo-800',
        border: 'border-indigo-200',
        dot: 'bg-indigo-500',
    },
    in_progress: {
        label: 'In Progress',
        bg: 'bg-amber-100',
        text: 'text-amber-900',
        border: 'border-amber-300',
        dot: 'bg-amber-600',
    },
    completed: {
        label: 'Completed',
        bg: 'bg-emerald-50',
        text: 'text-emerald-800',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
    },
    cancelled: {
        label: 'Cancelled',
        bg: 'bg-rose-50',
        text: 'text-rose-800',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
    },
    archived: {
        label: 'Archived',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200',
        dot: 'bg-slate-400',
    },
};

const PRIORITY_BADGES: Record<string, { label: string; badge: string }> = {
    critical: { label: 'CRITICAL', badge: 'bg-rose-100 text-rose-800 border-rose-200' },
    high: { label: 'HIGH', badge: 'bg-orange-100 text-orange-800 border-orange-200' },
    medium: { label: 'MED', badge: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
    low: { label: 'LOW', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const JobRow: React.FC<JobRowProps> = ({
    job,
    isSelected,
    isExpanded,
    density = 'compact',
    onToggleSelect,
    onToggleExpand,
    onNavigate,
    onAssignTech,
    onArchive,
    canDelete,
    onDelete,
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const rawStatus = job.status === 'pending' ? 'unscheduled' : job.status;
    const statusConfig = STATUS_BADGES[rawStatus] || STATUS_BADGES.unscheduled;
    const priority = job.priority || 'medium';
    const priorityConfig = PRIORITY_BADGES[priority];
    const isUnassigned = !job.assigned_tech_id || rawStatus === 'unscheduled';

    const customerName = job.customer?.name || 'Unknown Customer';
    const address = job.customer?.address || 'No location listed';
    const requestDesc = job.request?.description || (job as any).description || 'No description provided';
    const category = (job as any).category || job.request?.type;

    // Date parser
    const scheduledDateObj = useMemo(() => {
        const raw = job.scheduled_at || (job as any).scheduledTime || (job as any).date;
        if (!raw) return null;
        if (raw instanceof Timestamp) return raw.toDate();
        if (typeof raw === 'object' && 'seconds' in raw) return new Date((raw as any).seconds * 1000);
        if (typeof raw === 'string') {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) return d;
        }
        return null;
    }, [job.scheduled_at]);

    const scheduledFormatted = useMemo(() => {
        if (!scheduledDateObj) return null;
        const timePart = format(scheduledDateObj, 'h:mm a');
        if (isToday(scheduledDateObj)) return `Today ${timePart}`;
        if (isTomorrow(scheduledDateObj)) return `Tomorrow ${timePart}`;
        return format(scheduledDateObj, 'MMM d, h:mm a');
    }, [scheduledDateObj]);

    // Workflow Last Action & Next Steps
    const workflowSteps = useMemo(() => {
        switch (rawStatus) {
            case 'unscheduled':
                return {
                    lastAction: 'Work order intake logged',
                    nextStep: 'Assign qualified technician and dispatch',
                };
            case 'quote_pending':
                return {
                    lastAction: 'Estimate generated',
                    nextStep: 'Awaiting customer quote approval',
                };
            case 'scheduled':
                return {
                    lastAction: `Assigned to ${job.assigned_tech_name || 'technician'}`,
                    nextStep: 'Tech departure to customer location',
                };
            case 'en_route':
                return {
                    lastAction: 'Tech en route to site',
                    nextStep: 'Arrive on site and clock in',
                };
            case 'in_progress':
                return {
                    lastAction: 'Work commenced on site',
                    nextStep: 'Complete scope and collect signoff',
                };
            case 'completed':
                return {
                    lastAction: 'Service completed & signed',
                    nextStep: 'Send invoice & process payment',
                };
            default:
                return {
                    lastAction: 'Status updated',
                    nextStep: 'Review work order file',
                };
        }
    }, [rawStatus, job.assigned_tech_name]);

    return (
        <div className={`group border-b border-slate-200/80 transition-colors ${
            isSelected ? 'bg-blue-50/50' : isExpanded ? 'bg-slate-50/60' : 'bg-white hover:bg-slate-50/60'
        }`}>
            {/* ── Collapsed Scannable Data Row ── */}
            <div
                onClick={onToggleExpand}
                className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 cursor-pointer select-none ${
                    density === 'compact' ? 'py-2.5 min-h-[48px]' : 'py-3.5 min-h-[58px]'
                }`}
            >
                {/* 1. Selection Checkbox & Expand Chevron */}
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onToggleSelect(e as any)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <button
                        type="button"
                        onClick={onToggleExpand}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                        title={isExpanded ? 'Collapse row' : 'Expand details'}
                    >
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                    </button>
                </div>

                {/* 2. Customer & Job ID + Priority */}
                <div className="w-48 sm:w-56 flex-shrink-0 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm truncate hover:text-blue-600 transition-colors">
                            {customerName}
                        </span>
                        {priority && priority !== 'low' && priorityConfig && (
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border flex-shrink-0 ${priorityConfig.badge}`}>
                                {priorityConfig.label}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1 rounded border border-slate-200">
                            #{job.id.slice(-6).toUpperCase()}
                        </span>
                        {category && (
                            <span className="truncate text-slate-500 capitalize">
                                · {category}
                            </span>
                        )}
                    </div>
                </div>

                {/* 3. Location / Address */}
                <div className="hidden md:flex items-center gap-1.5 w-44 lg:w-52 flex-shrink-0 text-xs text-slate-600 pr-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate" title={address}>
                        {address}
                    </span>
                </div>

                {/* 4. Request Summary (Single Clear Line) */}
                <div className="flex-1 min-w-0 pr-3 hidden sm:block">
                    <p className="text-xs text-slate-700 truncate leading-relaxed">
                        {requestDesc}
                    </p>
                </div>

                {/* 5. Scheduled Time Slot */}
                <div className="w-36 flex-shrink-0 text-xs hidden lg:block pr-2">
                    {scheduledFormatted ? (
                        <span className="flex items-center gap-1.5 text-slate-700 font-medium truncate">
                            <Calendar className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                            <span>{scheduledFormatted}</span>
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-amber-700 text-[11px] font-semibold">
                            <Clock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                            <span>Unscheduled</span>
                        </span>
                    )}
                </div>

                {/* 6. Assigned Tech & Status Badge */}
                <div className="w-40 sm:w-48 flex-shrink-0 flex items-center justify-end sm:justify-start gap-2 pr-2">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                        {statusConfig.label}
                    </span>

                    {/* Tech Name */}
                    {job.assigned_tech_name ? (
                        <span className="hidden xl:inline text-[11px] font-semibold text-slate-700 truncate max-w-[90px]" title={job.assigned_tech_name}>
                            {job.assigned_tech_name}
                        </span>
                    ) : null}
                </div>

                {/* 7. Quick Action & 3-Dot Menu */}
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isUnassigned ? (
                        <button
                            type="button"
                            onClick={() => onAssignTech(job)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-colors flex items-center gap-1 whitespace-nowrap"
                            title="Assign technician to this job"
                        >
                            <UserPlus className="w-3 h-3" />
                            <span>Assign</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onNavigate(`/jobs/${job.id}`)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold text-[11px] rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
                            title="View job file"
                        >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>View</span>
                        </button>
                    )}

                    {/* Context Menu Dropdown */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="More options"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => { setIsMenuOpen(false); onNavigate(`/jobs/${job.id}`); }}
                                        className="w-full flex items-center gap-2 px-3.5 py-2 text-slate-700 hover:bg-slate-50 font-medium"
                                    >
                                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                                        Open Job File
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => { setIsMenuOpen(false); onAssignTech(job); }}
                                        className="w-full flex items-center gap-2 px-3.5 py-2 text-slate-700 hover:bg-slate-50 font-medium"
                                    >
                                        <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                                        {isUnassigned ? 'Assign Technician' : 'Reassign Tech'}
                                    </button>

                                    {(job.customer as any)?.id && (
                                        <button
                                            type="button"
                                            onClick={() => { setIsMenuOpen(false); onNavigate(`/contacts/${(job.customer as any).id}`); }}
                                            className="w-full flex items-center gap-2 px-3.5 py-2 text-slate-700 hover:bg-slate-50 font-medium"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                                            Customer Profile
                                        </button>
                                    )}

                                    <div className="my-1 border-t border-slate-100" />

                                    <button
                                        type="button"
                                        onClick={() => { setIsMenuOpen(false); onArchive(job.id, !job.archived); }}
                                        className="w-full flex items-center gap-2 px-3.5 py-2 text-slate-700 hover:bg-slate-50 font-medium"
                                    >
                                        <Archive className="w-3.5 h-3.5 text-slate-400" />
                                        {job.archived ? 'Unarchive Job' : 'Archive Job'}
                                    </button>

                                    {canDelete && onDelete && (
                                        <button
                                            type="button"
                                            onClick={() => { setIsMenuOpen(false); onDelete(job); }}
                                            className="w-full flex items-center gap-2 px-3.5 py-2 text-rose-600 hover:bg-rose-50 font-medium"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                            Delete Job
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Expandable Drawer / Sub-panel ── */}
            {isExpanded && (
                <div className="px-4 sm:px-6 py-4 bg-slate-50/80 border-t border-slate-200/80 space-y-4 animate-in fade-in duration-150">
                    {/* Micro-Card Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Scope & Description Card */}
                        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                <Wrench className="w-3.5 h-3.5 text-blue-600" />
                                Work Order Scope
                            </p>
                            <p className="text-xs text-slate-800 leading-relaxed font-medium">
                                {requestDesc}
                            </p>
                            {category && (
                                <div className="mt-2.5">
                                    <span className="inline-block text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 uppercase">
                                        {category}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Location & Contact Card */}
                        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                                Location & Contact
                            </p>
                            <p className="text-xs text-slate-800 font-semibold truncate">
                                {customerName}
                            </p>
                            <p className="text-xs text-slate-600 mt-0.5">
                                {address}
                            </p>
                            <div className="mt-2.5 flex items-center gap-3 text-xs">
                                {job.customer?.phone && (
                                    <a
                                        href={`tel:${job.customer.phone}`}
                                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        <Phone className="w-3 h-3" />
                                        <span>{job.customer.phone}</span>
                                    </a>
                                )}
                                {job.customer?.email && (
                                    <a
                                        href={`mailto:${job.customer.email}`}
                                        className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium truncate"
                                    >
                                        <Mail className="w-3 h-3" />
                                        <span className="truncate">{job.customer.email}</span>
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Workflow Progression Card */}
                        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                            <div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                    Workflow Progression
                                </p>
                                <div className="space-y-1.5 mt-2">
                                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 w-10 flex-shrink-0">Last:</span>
                                        <span className="font-medium text-slate-800 truncate">{workflowSteps.lastAction}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-blue-900">
                                        <span className="text-[10px] uppercase font-bold text-blue-500 w-10 flex-shrink-0">Next:</span>
                                        <span className="font-bold truncate">{workflowSteps.nextStep}</span>
                                    </div>
                                </div>
                            </div>

                            {scheduledFormatted && (
                                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-600">
                                    <Calendar className="w-3 h-3 text-blue-500" />
                                    <span>Arrival Window: <strong className="text-slate-900">{scheduledFormatted}</strong></span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Timeline & Activity History */}
                    <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
                        <JobHistoryModule jobId={job.id} initialJob={job} />
                    </div>

                    {/* Quick Drawer Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => onNavigate(`/jobs/${job.id}`)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-bold shadow-2xs transition-colors"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                Open Full Work Order
                            </button>

                            {isUnassigned ? (
                                <button
                                    type="button"
                                    onClick={() => onAssignTech(job)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-bold shadow-2xs transition-colors"
                                >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    Assign Technician
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onAssignTech(job)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded-lg font-bold transition-colors"
                                >
                                    <UserPlus className="w-3.5 h-3.5 text-slate-500" />
                                    Reassign Tech
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => onArchive(job.id, !job.archived)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs rounded-lg font-semibold transition-colors"
                            >
                                <Archive className="w-3.5 h-3.5 text-slate-400" />
                                {job.archived ? 'Unarchive' : 'Archive'}
                            </button>
                        </div>

                        {canDelete && onDelete && (
                            <button
                                type="button"
                                onClick={() => onDelete(job)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs rounded-lg font-bold transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
