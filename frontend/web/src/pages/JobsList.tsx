import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { Job, UserProfile } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AssignTechModal } from '../components/AssignTechModal';
import { getAutoAssignment } from '../lib/techMatchingEngine';
import {
    Plus, Search, ChevronUp, ChevronDown, UserPlus, Eye,
    Clock, AlertCircle, Clipboard, Filter, Archive, Trash2,
    List, Kanban, PackageCheck, Briefcase, Calendar, MapPin,
    User, Wrench, CheckCircle2, TrendingUp, AlertTriangle,
    ArrowRight, XCircle, History, Sparkles, Phone, Mail,
    CheckSquare, Square
} from 'lucide-react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import toast from 'react-hot-toast';
import { QuoteJobTimeline } from '../components/QuoteJobTimeline';
import { DeleteReasonModal } from '../components/DeleteReasonModal';
import { canUserDelete, deleteJobWithAudit } from '../lib/deletionService';

// Lazy-load the Board and Prep sub-views
const KanbanBoard = lazy(() => import('./KanbanBoard').then(m => ({ default: m.KanbanBoard })));
const JobPrepView = lazy(() => import('./JobPrep').then(m => ({ default: m.JobPrep })));

type StatusFilter = 'all' | 'unscheduled' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
type SortField = 'priority' | 'customer' | 'type' | 'status' | 'tech' | 'duration' | 'age';
type JobView = 'list' | 'board' | 'prep';

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    critical: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
    high: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' },
    low: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
};

const STATUS_CONFIG: Record<string, {
    label: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    cardBorder: string;
    cardHover: string;
    icon: React.ReactNode;
}> = {
    pending: {
        label: 'Unscheduled',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-700',
        badgeBorder: 'border-slate-200',
        cardBorder: 'border-gray-200 bg-white',
        cardHover: 'hover:border-slate-400',
        icon: <Clock className="w-3.5 h-3.5" />
    },
    unscheduled: {
        label: 'Unscheduled',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-700',
        badgeBorder: 'border-slate-200',
        cardBorder: 'border-gray-200 bg-white',
        cardHover: 'hover:border-slate-400',
        icon: <Clock className="w-3.5 h-3.5" />
    },
    quote_pending: {
        label: 'Quote Pending',
        badgeBg: 'bg-purple-100',
        badgeText: 'text-purple-800',
        badgeBorder: 'border-purple-200',
        cardBorder: 'border-purple-100 bg-purple-50/10',
        cardHover: 'hover:border-purple-400',
        icon: <AlertCircle className="w-3.5 h-3.5" />
    },
    scheduled: {
        label: 'Scheduled',
        badgeBg: 'bg-blue-100',
        badgeText: 'text-blue-800',
        badgeBorder: 'border-blue-200',
        cardBorder: 'border-blue-100 bg-blue-50/10',
        cardHover: 'hover:border-blue-400',
        icon: <Calendar className="w-3.5 h-3.5" />
    },
    in_progress: {
        label: 'In Progress',
        badgeBg: 'bg-amber-100',
        badgeText: 'text-amber-800',
        badgeBorder: 'border-amber-200',
        cardBorder: 'border-amber-200 bg-amber-50/20',
        cardHover: 'hover:border-amber-400',
        icon: <Wrench className="w-3.5 h-3.5" />
    },
    completed: {
        label: 'Completed',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-800',
        badgeBorder: 'border-emerald-200',
        cardBorder: 'border-emerald-100 bg-emerald-50/10',
        cardHover: 'hover:border-emerald-400',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />
    },
    cancelled: {
        label: 'Cancelled',
        badgeBg: 'bg-rose-100',
        badgeText: 'text-rose-800',
        badgeBorder: 'border-rose-200',
        cardBorder: 'border-gray-200 bg-white',
        cardHover: 'hover:border-rose-300',
        icon: <XCircle className="w-3.5 h-3.5" />
    },
    archived: {
        label: 'Archived',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-700',
        badgeBorder: 'border-slate-200',
        cardBorder: 'border-gray-200 bg-white',
        cardHover: 'hover:border-slate-300',
        icon: <Archive className="w-3.5 h-3.5" />
    },
};

// ── Job Card Component ────────────────────────────────────────────────────────
const JobCard: React.FC<{
    job: Job;
    isSelected: boolean;
    isExpanded: boolean;
    onToggleSelect: (e: React.MouseEvent) => void;
    onToggleExpand: (e: React.MouseEvent) => void;
    onNavigate: (path: string) => void;
    onAssignTech: (job: Job) => void;
    onArchive: (jobId: string, shouldArchive: boolean) => void;
    canDelete?: boolean;
    onDelete?: (job: Job) => void;
}> = ({
    job,
    isSelected,
    isExpanded,
    onToggleSelect,
    onToggleExpand,
    onNavigate,
    onAssignTech,
    onArchive,
    canDelete,
    onDelete,
}) => {
    const rawStatus = job.status === 'pending' ? 'unscheduled' : job.status;
    const config = STATUS_CONFIG[rawStatus] || STATUS_CONFIG.unscheduled;
    const priority = job.priority || 'medium';
    const priorityStyle = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium;
    const isUnassigned = !job.assigned_tech_id || rawStatus === 'unscheduled';

    // Customer Identity & Initials
    const customerName = job.customer?.name || 'Unknown Customer';
    const initials = customerName
        .split(' ')
        .map(n => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'J';

    // When requested (Submitted timestamp)
    const requestDate = useMemo(() => {
        const raw = job.createdAt || (job.request as any)?.submittedAt;
        if (!raw) return null;
        if (raw instanceof Timestamp) return raw.toDate();
        if (typeof raw === 'object' && 'seconds' in raw) return new Date((raw as any).seconds * 1000);
        const parsed = new Date(raw);
        return isNaN(parsed.getTime()) ? null : parsed;
    }, [job]);

    const requestDateFormatted = requestDate ? format(requestDate, 'MMM d, yyyy') : null;
    const requestAge = requestDate ? formatDistanceToNowStrict(requestDate, { addSuffix: true }) : null;

    // Scheduled Time Window formatting
    const scheduledWindowText = useMemo(() => {
        const raw = job.scheduled_at || (job as any).scheduled_start;
        if (!raw) return null;
        const start = raw instanceof Timestamp ? raw.toDate() : new Date(raw);
        if (isNaN(start.getTime())) return null;

        const datePart = format(start, 'MMM d, yyyy');
        const startTimePart = format(start, 'h:mm a');

        const scheduledEnd = (job as any).scheduled_end;
        if (scheduledEnd) {
            const end = scheduledEnd instanceof Timestamp ? scheduledEnd.toDate() : new Date(scheduledEnd);
            if (!isNaN(end.getTime())) {
                const endTimePart = format(end, 'h:mm a');
                return `${datePart} · ${startTimePart} – ${endTimePart}`;
            }
        }

        if (job.estimated_duration) {
            const end = new Date(start.getTime() + job.estimated_duration * 60000);
            const endTimePart = format(end, 'h:mm a');
            return `${datePart} · ${startTimePart} – ${endTimePart} (${job.estimated_duration}m)`;
        }

        return `${datePart} at ${startTimePart}`;
    }, [job]);

    // Actual Request Text
    const requestDescription = useMemo(() => {
        if (job.request?.description && job.request.description.trim()) {
            return job.request.description.trim();
        }
        if ((job as any).description && (job as any).description.trim()) {
            return (job as any).description.trim();
        }
        return 'No specific request description provided.';
    }, [job]);

    // Trade Type
    const tradeType = job.request?.type || (job as any).category || job.type || null;

    // Last & Next Steps Progression Workflow
    const workflowSteps = useMemo(() => {
        let lastAction = 'Job created';
        let nextStep = 'Assign technician & schedule on timeline';
        let lastIcon = <Clipboard className="w-3.5 h-3.5 text-slate-500" />;
        let nextIcon = <UserPlus className="w-3.5 h-3.5 text-blue-600" />;

        if (rawStatus === 'unscheduled') {
            lastAction = requestDateFormatted ? `Request received on ${requestDateFormatted}` : 'Customer request submitted';
            nextStep = 'Assign technician & auto-schedule time slot';
            lastIcon = <Clock className="w-3.5 h-3.5 text-slate-600" />;
            nextIcon = <UserPlus className="w-3.5 h-3.5 text-blue-600" />;
        } else if (rawStatus === 'quote_pending') {
            lastAction = 'AI Job intake & preliminary estimate drafted';
            nextStep = 'Review quote pricing & send proposal to customer';
            lastIcon = <Sparkles className="w-3.5 h-3.5 text-purple-600" />;
            nextIcon = <ArrowRight className="w-3.5 h-3.5 text-purple-600" />;
        } else if (rawStatus === 'scheduled') {
            lastAction = job.assigned_tech_name
                ? `Dispatched & assigned to ${job.assigned_tech_name}`
                : 'Scheduled on calendar';
            nextStep = 'Technician transit & pre-job arrival check-in';
            lastIcon = <Calendar className="w-3.5 h-3.5 text-blue-600" />;
            nextIcon = <Wrench className="w-3.5 h-3.5 text-blue-600" />;
        } else if (rawStatus === 'in_progress') {
            lastAction = job.assigned_tech_name ? `${job.assigned_tech_name} started work on site` : 'Technician started work on site';
            nextStep = 'Complete work tasks & collect customer sign-off';
            lastIcon = <Wrench className="w-3.5 h-3.5 text-amber-600" />;
            nextIcon = <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />;
        } else if (rawStatus === 'completed') {
            lastAction = 'Work completed & service verified';
            nextStep = 'Generate final invoice & collect customer payment';
            lastIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
            nextIcon = <Briefcase className="w-3.5 h-3.5 text-emerald-600" />;
        } else if (rawStatus === 'cancelled') {
            lastAction = 'Job marked cancelled';
            nextStep = 'Archive record or follow up with customer';
            lastIcon = <XCircle className="w-3.5 h-3.5 text-rose-600" />;
            nextIcon = <Archive className="w-3.5 h-3.5 text-gray-500" />;
        }

        return { lastAction, nextStep, lastIcon, nextIcon };
    }, [rawStatus, job, requestDateFormatted]);

    return (
        <div
            onClick={() => onNavigate(`/jobs/${job.id}`)}
            className={`bg-white rounded-xl border ${config.cardBorder} ${config.cardHover} ${
                isSelected ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/20' : ''
            } shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer`}
        >
            <div className="p-4 sm:p-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Checkbox + Avatar + Customer & Job Info */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        {/* Select Checkbox */}
                        <div
                            onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
                            className="mt-1 flex-shrink-0 cursor-pointer text-gray-400 hover:text-blue-600"
                        >
                            {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-blue-600" />
                            ) : (
                                <Square className="w-5 h-5 text-gray-300 hover:text-gray-500" />
                            )}
                        </div>

                        {/* Customer Avatar */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-xs ${
                            rawStatus === 'in_progress' ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white' :
                            rawStatus === 'completed' ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white' :
                            rawStatus === 'scheduled' ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' :
                            rawStatus === 'quote_pending' ? 'bg-gradient-to-br from-purple-500 to-pink-600 text-white' :
                            'bg-gradient-to-br from-slate-600 to-gray-700 text-white'
                        }`}>
                            {initials}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-bold text-gray-900 hover:text-blue-600 transition-colors truncate">
                                    {customerName}
                                </h3>

                                <span className="text-xs font-mono font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200">
                                    #{job.id?.substring(0, 8)}
                                </span>

                                {priority && (
                                    <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${priorityStyle.bg} ${priorityStyle.text} ${priorityStyle.border}`}>
                                        {priority}
                                    </span>
                                )}

                                {tradeType && (
                                    <span className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md flex items-center gap-1 border border-slate-200">
                                        <Wrench className="w-3 h-3 text-slate-500" />
                                        {tradeType}
                                    </span>
                                )}

                                {job.estimated_duration && (
                                    <span className="text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-gray-400" />
                                        {job.estimated_duration} min
                                    </span>
                                )}
                            </div>

                            {/* Address & Submission Age Subline */}
                            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 mt-1.5 text-xs text-gray-500">
                                {job.customer?.address && (
                                    <span className="flex items-center gap-1 truncate max-w-md">
                                        <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                        <span className="truncate">{job.customer.address}</span>
                                    </span>
                                )}

                                {requestDateFormatted && (
                                    <span className="flex items-center gap-1 text-gray-600 font-medium">
                                        <Clock className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                                        Requested: {requestDateFormatted} ({requestAge})
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Assigned Tech, Status Badge & Action Controls */}
                    <div className="flex items-center justify-between lg:justify-end gap-3 flex-shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100" onClick={(e) => e.stopPropagation()}>
                        {/* Assigned Tech */}
                        <div>
                            {isUnassigned ? (
                                <button
                                    onClick={() => onAssignTech(job)}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-xl transition-colors shadow-2xs"
                                >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    Assign Tech
                                </button>
                            ) : (
                                <div className="flex items-center gap-1.5 text-xs font-semibold bg-gray-50 border border-gray-200 text-gray-800 px-3 py-1 rounded-xl">
                                    <User className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>{job.assigned_tech_name}</span>
                                </div>
                            )}
                        </div>

                        {/* Status Badge */}
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}>
                            {config.icon}
                            {config.label}
                        </span>

                        {/* Expand Timeline Toggle */}
                        <button
                            onClick={onToggleExpand}
                            className={`p-2 rounded-xl border transition-all duration-200 ${
                                isExpanded
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-inner'
                                    : 'border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-700'
                            }`}
                            title={isExpanded ? 'Collapse timeline' : 'Expand full timeline'}
                        >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* ── Scheduled Appointment Window Banner (if present) ── */}
                {scheduledWindowText && (
                    <div className="mt-3 px-3 py-2 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-blue-900 font-semibold truncate">
                            <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <span>Appointment: <strong>{scheduledWindowText}</strong></span>
                        </div>
                        {job.assigned_tech_name && (
                            <span className="text-[11px] text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-md font-medium flex-shrink-0">
                                Tech: {job.assigned_tech_name}
                            </span>
                        )}
                    </div>
                )}

                {/* ── Actual Job Request Description ── */}
                <div className="mt-3 p-3 bg-gray-50/90 rounded-xl border border-gray-150 flex items-start gap-2.5 text-xs text-gray-700">
                    <Clipboard className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <span className="font-semibold text-gray-900 mr-1.5">Request / Scope:</span>
                        <span className="text-gray-700 leading-relaxed line-clamp-2">{requestDescription}</span>
                    </div>
                </div>

                {/* ── Last Action > Next Step Workflow Progression ── */}
                <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {/* Last Action */}
                    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200/60">
                        <span className="flex-shrink-0">{workflowSteps.lastIcon}</span>
                        <div className="flex-1 min-w-0">
                            <span className="font-bold text-gray-700 mr-1 text-[11px] uppercase tracking-wider">Last:</span>
                            <span className="text-gray-800 truncate font-medium">{workflowSteps.lastAction}</span>
                        </div>
                    </div>

                    {/* Next Step */}
                    <div className="flex items-center gap-2 p-2 bg-blue-50/60 rounded-lg border border-blue-100">
                        <span className="flex-shrink-0">{workflowSteps.nextIcon}</span>
                        <div className="flex-1 min-w-0">
                            <span className="font-bold text-blue-900 mr-1 text-[11px] uppercase tracking-wider">Next:</span>
                            <span className="text-blue-950 font-semibold truncate">{workflowSteps.nextStep}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Expanded: Communication & Activity Timeline ── */}
            {isExpanded && (
                <div className="px-5 pb-5 pt-3 bg-gray-50/50 border-t border-gray-200 space-y-4 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-2xs">
                        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <History className="w-4 h-4 text-indigo-600" />
                            Job Activity & Communication Timeline
                        </h4>
                        <QuoteJobTimeline jobId={job.id} isInternal={true} initialJob={job} />
                    </div>

                    {/* Quick Action Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onNavigate(`/jobs/${job.id}`)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-bold shadow-sm transition-colors"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                View / Modify Job File
                            </button>

                            {isUnassigned && (
                                <button
                                    onClick={() => onAssignTech(job)}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-xl font-bold shadow-sm transition-colors"
                                >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    Assign Technician
                                </button>
                            )}

                            {job.archived ? (
                                <button
                                    onClick={() => onArchive(job.id, false)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs rounded-xl font-bold transition-colors"
                                >
                                    <Archive className="w-3.5 h-3.5" />
                                    Unarchive
                                </button>
                            ) : (
                                <button
                                    onClick={() => onArchive(job.id, true)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs rounded-xl font-bold transition-colors"
                                >
                                    <Archive className="w-3.5 h-3.5" />
                                    Archive Job
                                </button>
                            )}
                        </div>

                        {canDelete && onDelete && (
                            <button
                                onClick={() => onDelete(job)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs rounded-xl font-bold transition-colors"
                                title="Delete Job"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete Job
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Main JobsList Page Component ──────────────────────────────────────────────
export const JobsList: React.FC = () => {
    const { user, organization } = useAuth();
    const canDelete = canUserDelete(user, organization, 'job');
    const [deleteTargetJob, setDeleteTargetJob] = useState<Job | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const navigate = useNavigate();

    const [jobs, setJobs] = useState<Job[]>([]);
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const [searchParams, setSearchParams] = useSearchParams();
    const statusParam = searchParams.get('status') as StatusFilter || 'all';
    const statusFilter = statusParam;
    const setStatusFilter = (newFilter: StatusFilter) => {
        setSearchParams(newFilter === 'all' ? {} : { status: newFilter });
    };

    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
    const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());

    const toggleExpandJob = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedJobIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const expandAll = () => {
        setExpandedJobIds(new Set(filteredJobs.map(j => j.id)));
    };

    const collapseAll = () => {
        setExpandedJobIds(new Set());
    };

    // AssignTechModal state
    const [assignModalJob, setAssignModalJob] = useState<Job | null>(null);

    // Reset selection when search/filter changes
    useEffect(() => {
        setSelectedJobIds([]);
    }, [statusFilter, priorityFilter, searchTerm]);

    // ── Data Fetching ──────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';

        // Jobs listener
        const jobsQ = query(collection(db, 'jobs'), where('org_id', '==', orgId));
        const unsubJobs = onSnapshot(jobsQ, (snap) => {
            setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
            setLoading(false);
        });

        // Technicians listener (for assign modal)
        const techsQ = query(
            collection(db, 'users'),
            where('role', '==', 'technician'),
            where('org_id', '==', orgId)
        );
        const unsubTechs = onSnapshot(techsQ, (snap) => {
            setTechnicians(
                snap.docs
                    .map(d => ({ id: d.id, ...d.data() } as UserProfile))
                    .filter(t => t.archived !== true && t.status !== 'archived')
            );
        });

        return () => { unsubJobs(); unsubTechs(); };
    }, [user]);

    // ── Status counts ──────────────────────────────────────
    const statusCounts = useMemo(() => {
        const activeJobs = jobs.filter(j => !j.archived);
        const archivedJobs = jobs.filter(j => j.archived);

        const counts: Record<string, number> = {
            all: activeJobs.length,
            archived: archivedJobs.length,
            unscheduled: 0,
            scheduled: 0,
            in_progress: 0,
            completed: 0,
            cancelled: 0
        };

        activeJobs.forEach(j => {
            const s = j.status === 'pending' ? 'unscheduled' : j.status;
            counts[s] = (counts[s] || 0) + 1;
        });
        return counts;
    }, [jobs]);

    const priorityCounts = useMemo(() => {
        const counts: Record<string, number> = { all: 0 };
        const filtered = statusFilter === 'archived'
            ? jobs.filter(j => j.archived)
            : statusFilter === 'all'
                ? jobs.filter(j => !j.archived)
                : jobs.filter(j => !j.archived && (j.status === 'pending' ? 'unscheduled' : j.status) === statusFilter);

        counts.all = filtered.length;
        filtered.forEach(j => { counts[j.priority] = (counts[j.priority] || 0) + 1; });
        return counts;
    }, [jobs, statusFilter]);

    // ── Filtering ──────────────────────────────────────────
    const filteredJobs = useMemo(() => {
        let result = [...jobs];

        // Archive status filter
        if (statusFilter === 'archived') {
            result = result.filter(j => j.archived);
        } else {
            result = result.filter(j => !j.archived);
            if (statusFilter !== 'all') {
                result = result.filter(j => {
                    const s = j.status === 'pending' ? 'unscheduled' : j.status;
                    return s === statusFilter;
                });
            }
        }

        // Priority filter
        if (priorityFilter !== 'all') {
            result = result.filter(j => j.priority === priorityFilter);
        }

        // Search Keyword
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            result = result.filter(j =>
                j.customer?.name?.toLowerCase().includes(q) ||
                j.customer?.address?.toLowerCase().includes(q) ||
                j.request?.description?.toLowerCase().includes(q) ||
                j.request?.type?.toLowerCase().includes(q) ||
                (j as any).category?.toLowerCase().includes(q) ||
                j.assigned_tech_name?.toLowerCase().includes(q) ||
                j.id?.toLowerCase().includes(q)
            );
        }

        // Default sort: Unscheduled & In Progress first, then most recently requested
        result.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return dateB - dateA;
        });

        return result;
    }, [jobs, statusFilter, priorityFilter, searchTerm]);

    // ── Assignment handler ─────────────────────────────────
    const handleAssignFromModal = async (techId: string, techName: string, scheduledTime?: Date) => {
        if (!assignModalJob) return;
        try {
            const jobRef = doc(db, 'jobs', assignModalJob.id);
            const startTime = scheduledTime || (() => {
                const result = getAutoAssignment(technicians, assignModalJob, jobs, new Date());
                if (result) return result.slot.start;
                const fallback = new Date();
                fallback.setHours(9, 0, 0, 0);
                return fallback;
            })();

            await updateDoc(jobRef, {
                assigned_tech_id: techId,
                assigned_tech_name: techName,
                scheduled_at: Timestamp.fromDate(startTime),
                status: 'scheduled'
            });
            toast.success(`Job assigned to ${techName}`);
        } catch (error) {
            console.error('Error assigning job:', error);
            toast.error('Failed to assign job');
        }
        setAssignModalJob(null);
    };

    // ── Bulk & Individual Operations ───────────────────────
    const handleToggleSelectJob = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedJobIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleToggleSelectAll = () => {
        if (selectedJobIds.length === filteredJobs.length) {
            setSelectedJobIds([]);
        } else {
            setSelectedJobIds(filteredJobs.map(j => j.id));
        }
    };

    const handleIndividualArchive = async (jobId: string, shouldArchive: boolean) => {
        const actionText = shouldArchive ? 'archive' : 'unarchive';
        if (!window.confirm(`Are you sure you want to ${actionText} this job?`)) return;

        try {
            const jobRef = doc(db, 'jobs', jobId);
            await updateDoc(jobRef, { archived: shouldArchive });
            toast.success(`Job successfully ${shouldArchive ? 'archived' : 'unarchived'}`);
        } catch (error) {
            console.error(`Error trying to ${actionText} job:`, error);
            toast.error(`Failed to ${actionText} job`);
        }
    };

    const handleIndividualDelete = (job: Job) => {
        if (!canDelete) {
            toast.error('You do not have permission to delete jobs.');
            return;
        }
        setDeleteTargetJob(job);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDeleteJob = async (reasonCategory: string, reasonDetails: string) => {
        if (!deleteTargetJob || !user) return;
        await deleteJobWithAudit(deleteTargetJob.id, deleteTargetJob, user, reasonCategory, reasonDetails);
        setSelectedJobIds(prev => prev.filter(id => id !== deleteTargetJob.id));
        setDeleteTargetJob(null);
    };

    const handleArchiveJobs = async (shouldArchive: boolean) => {
        const actionText = shouldArchive ? 'archive' : 'unarchive';
        if (!window.confirm(`Are you sure you want to ${actionText} the ${selectedJobIds.length} selected jobs?`)) return;

        let successCount = 0;
        let failCount = 0;

        for (const id of selectedJobIds) {
            try {
                const jobRef = doc(db, 'jobs', id);
                await updateDoc(jobRef, { archived: shouldArchive });
                successCount++;
            } catch (error) {
                console.error(`Error archiving job ${id}:`, error);
                failCount++;
            }
        }

        if (successCount > 0) {
            toast.success(`Successfully ${shouldArchive ? 'archived' : 'unarchived'} ${successCount} ${successCount === 1 ? 'job' : 'jobs'}`);
        }
        if (failCount > 0) {
            toast.error(`Failed to update ${failCount} jobs`);
        }
        setSelectedJobIds([]);
    };

    const handleDeleteJobs = async () => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete the ${selectedJobIds.length} selected jobs? This action cannot be undone.`)) return;

        let successCount = 0;
        let failCount = 0;

        for (const id of selectedJobIds) {
            try {
                const jobRef = doc(db, 'jobs', id);
                await deleteDoc(jobRef);
                successCount++;
            } catch (error) {
                console.error(`Error deleting job ${id}:`, error);
                failCount++;
            }
        }

        if (successCount > 0) {
            toast.success(`Successfully deleted ${successCount} ${successCount === 1 ? 'job' : 'jobs'}`);
        }
        if (failCount > 0) {
            toast.error(`Failed to delete ${failCount} jobs`);
        }
        setSelectedJobIds([]);
    };

    // ── Active view (list / board / prep) ──────────────────
    const activeView: JobView = (searchParams.get('view') as JobView) || 'list';
    const setActiveView = (view: JobView) => {
        const next = new URLSearchParams(searchParams);
        if (view === 'list') {
            next.delete('view');
        } else {
            next.set('view', view);
        }
        setSearchParams(next);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3">
                    <Clock className="w-10 h-10 animate-spin text-blue-600" />
                    <p className="text-sm font-semibold text-gray-600">Loading jobs & work orders...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-xl shadow-md shadow-blue-500/20">
                            <Briefcase className="w-6 h-6" />
                        </div>
                        Jobs & Work Orders
                    </h1>
                    <p className="mt-1 text-sm text-gray-600 ml-13">
                        Manage all customer appointments, work scopes, technician assignments, and progress
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* View Switcher Tabs */}
                    <div className="flex items-center bg-gray-100 rounded-xl p-1 border border-gray-200">
                        {[
                            { id: 'list' as JobView, icon: List, label: 'List' },
                            { id: 'board' as JobView, icon: Kanban, label: 'Board' },
                            { id: 'prep' as JobView, icon: PackageCheck, label: 'Prep' },
                        ].map(v => {
                            const Icon = v.icon;
                            const isActive = activeView === v.id;
                            return (
                                <button
                                    key={v.id}
                                    onClick={() => setActiveView(v.id)}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        isActive
                                            ? 'bg-white text-blue-700 shadow-xs'
                                            : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                    title={v.label}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span>{v.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => navigate('/jobs/new')}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus className="w-4 h-4" />
                        New Job
                    </button>
                </div>
            </div>

            {/* Top KPI Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Active Jobs */}
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex items-center gap-3.5">
                    <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 rounded-xl border border-blue-100">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Work Orders</p>
                        <p className="text-xl font-black text-gray-900 mt-0.5">
                            {statusCounts['all'] || 0}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            {statusCounts['scheduled'] || 0} scheduled on timeline
                        </p>
                    </div>
                </div>

                {/* Unscheduled Attention */}
                <div
                    onClick={() => { setStatusFilter('unscheduled'); setPriorityFilter('all'); }}
                    className={`rounded-xl p-4 border shadow-xs flex items-center gap-3.5 cursor-pointer transition-all ${
                        (statusCounts['unscheduled'] || 0) > 0
                            ? 'bg-amber-50/50 border-amber-300 hover:border-amber-400 hover:bg-amber-50'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                >
                    <div className={`p-3 rounded-xl border ${
                        (statusCounts['unscheduled'] || 0) > 0
                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Unassigned & Unscheduled</p>
                        <p className={`text-xl font-black mt-0.5 ${(statusCounts['unscheduled'] || 0) > 0 ? 'text-amber-900' : 'text-gray-900'}`}>
                            {statusCounts['unscheduled'] || 0}
                        </p>
                        <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                            {(statusCounts['unscheduled'] || 0) > 0 ? 'Needs tech & slot assignment' : 'All jobs scheduled'}
                        </p>
                    </div>
                </div>

                {/* Scheduled & Dispatched */}
                <div
                    onClick={() => { setStatusFilter('scheduled'); setPriorityFilter('all'); }}
                    className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex items-center gap-3.5 cursor-pointer hover:border-blue-300 transition-all"
                >
                    <div className="p-3 bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-600 rounded-xl border border-blue-100">
                        <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Scheduled & Dispatched</p>
                        <p className="text-xl font-black text-gray-900 mt-0.5">
                            {statusCounts['scheduled'] || 0}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            Ready for tech arrival
                        </p>
                    </div>
                </div>

                {/* In Progress & Completed */}
                <div
                    onClick={() => { setStatusFilter('in_progress'); setPriorityFilter('all'); }}
                    className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex items-center gap-3.5 cursor-pointer hover:border-emerald-300 transition-all"
                >
                    <div className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 rounded-xl border border-emerald-100">
                        <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">In Progress & Completed</p>
                        <p className="text-xl font-black text-emerald-800 mt-0.5">
                            {statusCounts['in_progress'] || 0} / {statusCounts['completed'] || 0}
                        </p>
                        <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">
                            {statusCounts['in_progress'] || 0} live on site · {statusCounts['completed'] || 0} fulfilled
                        </p>
                    </div>
                </div>
            </div>

            {/* Sub-views: Board / Prep */}
            {activeView === 'board' && (
                <Suspense fallback={<div className="p-12 flex items-center justify-center gap-2 text-gray-500"><Clock className="w-6 h-6 animate-spin text-blue-600" /> Loading Kanban board...</div>}>
                    <KanbanBoard />
                </Suspense>
            )}

            {activeView === 'prep' && (
                <Suspense fallback={<div className="p-12 flex items-center justify-center gap-2 text-gray-500"><Clock className="w-6 h-6 animate-spin text-blue-600" /> Loading Job Prep...</div>}>
                    <JobPrepView />
                </Suspense>
            )}

            {/* List View */}
            {activeView === 'list' && (
                <div className="space-y-4">
                    {/* Status Tabs, Priority Filters & Search Toolbar */}
                    <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-xs space-y-3">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            {/* Status Tabs */}
                            <div className="flex space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                                {(['all', 'unscheduled', 'scheduled', 'in_progress', 'completed', 'cancelled', 'archived'] as StatusFilter[]).map(status => {
                                    const count = statusCounts[status] || 0;
                                    const isActive = statusFilter === status;

                                    return (
                                        <button
                                            key={status}
                                            onClick={() => { setStatusFilter(status); setPriorityFilter('all'); }}
                                            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all ${
                                                isActive
                                                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                                                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200/60'
                                            }`}
                                        >
                                            <span>
                                                {status === 'all' ? 'All' : STATUS_CONFIG[status]?.label || status}
                                            </span>
                                            <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                                                isActive
                                                    ? 'bg-white/20 text-white'
                                                    : status === 'unscheduled' && count > 0
                                                        ? 'bg-amber-500 text-white'
                                                        : 'bg-gray-200 text-gray-700'
                                            }`}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Search Input */}
                            <div className="relative min-w-[260px] md:w-80">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search customer, address, request, tech..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Secondary Filter Line: Priority Chips + Select All & Expand/Collapse */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs">
                            {/* Priority Filter Chips */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-gray-500 font-semibold mr-1 flex items-center gap-1">
                                    <Filter className="w-3.5 h-3.5 text-gray-400" /> Priority:
                                </span>
                                {(['all', 'critical', 'high', 'medium', 'low'] as const).map(p => {
                                    const isPActive = priorityFilter === p;
                                    return (
                                        <button
                                            key={p}
                                            onClick={() => setPriorityFilter(p)}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                                                isPActive
                                                    ? p === 'all'
                                                        ? 'bg-gray-800 text-white border-gray-800'
                                                        : `${PRIORITY_STYLES[p].bg} ${PRIORITY_STYLES[p].text} border-current`
                                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                                            }`}
                                        >
                                            {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                                            {priorityCounts[p] !== undefined && (
                                                <span className="ml-1 opacity-80">({priorityCounts[p]})</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Select All & Expand All Controls */}
                            <div className="flex items-center gap-3 self-end sm:self-auto">
                                <button
                                    onClick={handleToggleSelectAll}
                                    className="text-xs text-gray-600 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors"
                                >
                                    {selectedJobIds.length === filteredJobs.length && filteredJobs.length > 0 ? (
                                        <><CheckSquare className="w-3.5 h-3.5 text-blue-600" /> Deselect all</>
                                    ) : (
                                        <><Square className="w-3.5 h-3.5" /> Select all</>
                                    )}
                                </button>

                                <span className="text-gray-300">|</span>

                                <button
                                    onClick={expandAll}
                                    className="text-xs text-gray-500 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors"
                                >
                                    <ChevronDown className="w-3.5 h-3.5" /> Expand all
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                    onClick={collapseAll}
                                    className="text-xs text-gray-500 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors"
                                >
                                    <ChevronUp className="w-3.5 h-3.5" /> Collapse all
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bulk Actions Floating Bar */}
                    {selectedJobIds.length > 0 && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between animate-fadeIn shadow-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-900 bg-blue-200/60 px-2 py-0.5 rounded-md">
                                    {selectedJobIds.length} {selectedJobIds.length === 1 ? 'job' : 'jobs'} selected
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {statusFilter === 'archived' ? (
                                    <button
                                        onClick={() => handleArchiveJobs(false)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 text-xs font-bold transition-colors"
                                    >
                                        <Archive className="w-3.5 h-3.5" />
                                        Unarchive Selected
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleArchiveJobs(true)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 text-xs font-bold transition-colors"
                                    >
                                        <Archive className="w-3.5 h-3.5" />
                                        Archive Selected
                                    </button>
                                )}
                                <button
                                    onClick={handleDeleteJobs}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-bold transition-colors shadow-xs"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete Selected
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Jobs List Items */}
                    {filteredJobs.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-xs">
                            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-sm">
                                <Briefcase className="w-8 h-8" />
                            </div>
                            <h3 className="text-base font-bold text-gray-900">No jobs found</h3>
                            <p className="mt-1.5 text-xs text-gray-500 max-w-sm mx-auto">
                                {searchTerm
                                    ? `No jobs matched "${searchTerm}". Try adjusting your search query or filters.`
                                    : statusFilter === 'all'
                                        ? 'No jobs created yet. Click "+ New Job" to create your first work order.'
                                        : `No jobs currently in ${STATUS_CONFIG[statusFilter]?.label || statusFilter} status.`}
                            </p>
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors"
                                >
                                    Clear Search
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3.5">
                            {filteredJobs.map((job) => (
                                <JobCard
                                    key={job.id}
                                    job={job}
                                    isSelected={selectedJobIds.includes(job.id)}
                                    isExpanded={expandedJobIds.has(job.id)}
                                    onToggleSelect={(e) => handleToggleSelectJob(job.id, e)}
                                    onToggleExpand={(e) => toggleExpandJob(job.id, e)}
                                    onNavigate={navigate}
                                    onAssignTech={(targetJob) => setAssignModalJob(targetJob)}
                                    onArchive={handleIndividualArchive}
                                    canDelete={canDelete}
                                    onDelete={handleIndividualDelete}
                                />
                            ))}
                        </div>
                    )}

                    {/* Summary Footer */}
                    <div className="mt-4 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 px-1 gap-2">
                        <span>
                            Showing <strong className="text-gray-800">{filteredJobs.length}</strong> of{' '}
                            <strong className="text-gray-800">
                                {statusFilter === 'archived' ? statusCounts['archived'] : statusCounts['all']}
                            </strong> jobs
                        </span>
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1 font-medium text-amber-700">
                                <AlertCircle className="w-3.5 h-3.5" /> {statusCounts['unscheduled'] || 0} unassigned
                            </span>
                            <span className="flex items-center gap-1 font-medium text-blue-700">
                                <Calendar className="w-3.5 h-3.5" /> {statusCounts['scheduled'] || 0} scheduled
                            </span>
                            <span className="flex items-center gap-1 font-medium text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5" /> {statusCounts['in_progress'] || 0} in progress
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Assign Tech Modal ────────────────────────────── */}
            <AssignTechModal
                job={assignModalJob}
                isOpen={!!assignModalJob}
                onClose={() => setAssignModalJob(null)}
                onAssign={handleAssignFromModal}
                technicians={technicians}
                allJobs={jobs}
            />

            {/* ── Delete Reason Modal ──────────────────────────── */}
            <DeleteReasonModal
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setDeleteTargetJob(null);
                }}
                onConfirm={handleConfirmDeleteJob}
                itemType="job"
                itemIdentifier={deleteTargetJob ? `Job #${deleteTargetJob.id?.substring(0, 8)} (${deleteTargetJob.customer?.name || 'Customer'})` : 'Job'}
            />
        </div>
    );
};
