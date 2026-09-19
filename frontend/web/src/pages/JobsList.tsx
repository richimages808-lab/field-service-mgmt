import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { db, functions } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Job, UserProfile } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AssignTechModal } from '../components/AssignTechModal';
import { getAutoAssignment } from '../lib/techMatchingEngine';
import {
    Plus, Clock, Archive, Trash2, Briefcase, Calendar,
    User, Wrench, CheckCircle2, TrendingUp, AlertTriangle,
    Eye, UserPlus, FileText, ChevronDown, ChevronUp, MapPin,
    CheckSquare, Square
} from 'lucide-react';
import { isToday, isTomorrow, startOfWeek, endOfWeek, addDays, format } from 'date-fns';
import toast from 'react-hot-toast';
import { DeleteReasonModal } from '../components/DeleteReasonModal';
import { canUserDelete, deleteJobWithAudit } from '../lib/deletionService';
import { InteractiveKpiCard } from '../components/ui/InteractiveKpiCard';
import { JobRow } from '../components/jobs/JobRow';
import { JobTableToolbar, DateFilterType } from '../components/jobs/JobTableToolbar';
import { JobHistoryModule } from '../components/JobHistoryModule';

// Lazy-load the Board and Prep sub-views
const KanbanBoard = lazy(() => import('./KanbanBoard').then(m => ({ default: m.KanbanBoard })));
const JobPrepView = lazy(() => import('./JobPrep').then(m => ({ default: m.JobPrep })));

type StatusFilter = 'all' | 'unscheduled' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
type ViewMode = 'table' | 'cards' | 'board' | 'prep';

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    critical: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
    high: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
    medium: { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
    low: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
};

// ── Alternative Card View Component (for Card Mode) ──
const CompactJobCard: React.FC<{
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
    job, isSelected, isExpanded, onToggleSelect, onToggleExpand,
    onNavigate, onAssignTech, onArchive, canDelete, onDelete
}) => {
    const rawStatus = job.status === 'pending' ? 'unscheduled' : job.status;
    const isUnassigned = !job.assigned_tech_id || rawStatus === 'unscheduled';

    const customerName = job.customer?.name || 'Unknown Customer';
    const address = job.customer?.address || 'No location';
    const requestDesc = job.request?.description || (job as any).description || 'No description';

    return (
        <div className={`rounded-xl border transition-all ${
            isSelected
                ? 'bg-blue-50/40 border-blue-400 ring-2 ring-blue-400/30'
                : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
        }`}>
            <div className="p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => onToggleSelect(e as any)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                            <h4 className="font-bold text-slate-900 text-sm">{customerName}</h4>
                            <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                                #{job.id.slice(-6).toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        rawStatus === 'completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                        rawStatus === 'in_progress' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                        rawStatus === 'scheduled' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                        'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                        {rawStatus.replace('_', ' ')}
                    </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-600 truncate">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{address}</span>
                </div>

                <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">
                    {requestDesc}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500 text-[11px]">
                        {job.assigned_tech_name ? `Tech: ${job.assigned_tech_name}` : 'Unassigned'}
                    </span>
                    <div className="flex items-center gap-1.5">
                        {isUnassigned ? (
                            <button
                                type="button"
                                onClick={() => onAssignTech(job)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg shadow-2xs"
                            >
                                Assign Tech
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => onNavigate(`/jobs/${job.id}`)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold text-[11px] rounded-lg"
                            >
                                View File
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                        >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="p-3.5 bg-slate-50/90 border-t border-slate-200 space-y-3">
                    <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                        <JobHistoryModule jobId={job.id} initialJob={job} />
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

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [searchParams, setSearchParams] = useSearchParams();
    const statusParam = (searchParams.get('status') as StatusFilter) || 'all';
    const statusFilter = statusParam;

    const setStatusFilter = (newFilter: StatusFilter) => {
        const next = new URLSearchParams(searchParams);
        if (newFilter === 'all') {
            next.delete('status');
        } else {
            next.set('status', newFilter);
        }
        setSearchParams(next);
    };

    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [techFilter, setTechFilter] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<DateFilterType>('all');
    const [tableDensity, setTableDensity] = useState<'compact' | 'comfortable'>('compact');

    // View Mode: defaults to 'table' for maximum density
    const viewParam = (searchParams.get('view') as ViewMode) || 'table';
    const viewMode: ViewMode = viewParam;

    const setViewMode = (nextView: ViewMode) => {
        const next = new URLSearchParams(searchParams);
        if (nextView === 'table') {
            next.delete('view');
        } else {
            next.set('view', nextView);
        }
        setSearchParams(next);
    };

    // Selection & Expansion
    const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
    const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());

    const toggleExpandJob = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setExpandedJobIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Modal state
    const [assignModalJob, setAssignModalJob] = useState<Job | null>(null);
    const [isBatchAssigning, setIsBatchAssigning] = useState(false);

    // Reset selection on filter changes
    useEffect(() => {
        setSelectedJobIds([]);
    }, [statusFilter, priorityFilter, techFilter, dateFilter, searchTerm]);

    // ── Data Fetching ──────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';

        const jobsQ = query(collection(db, 'jobs'), where('org_id', '==', orgId));
        const unsubJobs = onSnapshot(jobsQ, (snap) => {
            setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
            setLoading(false);
        });

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
            cancelled: 0,
        };

        activeJobs.forEach(j => {
            const s = j.status === 'pending' ? 'unscheduled' : j.status;
            counts[s] = (counts[s] || 0) + 1;
        });
        return counts;
    }, [jobs]);

    // ── Filtering ──────────────────────────────────────────
    const filteredJobs = useMemo(() => {
        let result = [...jobs];

        // Status filter
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

        // Technician filter
        if (techFilter !== 'all') {
            if (techFilter === 'unassigned') {
                result = result.filter(j => !j.assigned_tech_id || j.status === 'unscheduled' || j.status === 'pending');
            } else {
                result = result.filter(j => j.assigned_tech_id === techFilter);
            }
        }

        // Date Range filter
        if (dateFilter !== 'all') {
            const now = new Date();
            result = result.filter(j => {
                const raw = j.scheduled_at || (j as any).scheduledTime || (j as any).date;
                if (!raw) return dateFilter === 'overdue';
                const d = raw instanceof Timestamp ? raw.toDate() : new Date(typeof raw === 'object' && 'seconds' in raw ? (raw as any).seconds * 1000 : raw);
                if (isNaN(d.getTime())) return false;

                if (dateFilter === 'today') return isToday(d);
                if (dateFilter === 'tomorrow') return isTomorrow(d);
                if (dateFilter === 'this_week') {
                    const start = startOfWeek(now);
                    const end = endOfWeek(now);
                    return d >= start && d <= end;
                }
                if (dateFilter === 'next_7_days') {
                    const end = addDays(now, 7);
                    return d >= now && d <= end;
                }
                if (dateFilter === 'overdue') {
                    return d < now && j.status !== 'completed' && j.status !== 'cancelled' && !j.archived;
                }
                return true;
            });
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
    }, [jobs, statusFilter, priorityFilter, techFilter, dateFilter, searchTerm]);

    // ── Single & Batch Assignment handler ─────────────────
    const handleAssignFromModal = async (techId: string, techName: string, scheduledTime?: Date, sendSmsAlert?: boolean) => {
        if (!assignModalJob) return;

        const targetIds = isBatchAssigning && selectedJobIds.length > 0
            ? selectedJobIds
            : [assignModalJob.id];

        try {
            const startTime = scheduledTime || (() => {
                const result = getAutoAssignment(technicians, assignModalJob, jobs, new Date());
                if (result) return result.slot.start;
                const fallback = new Date();
                fallback.setHours(9, 0, 0, 0);
                return fallback;
            })();

            for (const id of targetIds) {
                const jobRef = doc(db, 'jobs', id);
                await updateDoc(jobRef, {
                    assigned_tech_id: techId,
                    assigned_tech_name: techName,
                    scheduled_at: Timestamp.fromDate(startTime),
                    status: 'scheduled'
                });
            }

            if (targetIds.length === 1) {
                toast.success(`Job assigned to ${techName}`);
            } else {
                toast.success(`Assigned ${targetIds.length} jobs to ${techName}`);
            }

            if (sendSmsAlert && targetIds.length > 0) {
                try {
                    const sendTechJobAlertFn = httpsCallable(functions, 'sendTechJobAlert');
                    await sendTechJobAlertFn({ jobId: targetIds[0], orgId: user?.org_id || 'demo-org' });
                    toast.success(`SMS job alert sent to ${techName}`);
                } catch (smsErr) {
                    console.warn('SMS alert warning:', smsErr);
                }
            }
        } catch (error) {
            console.error('Error assigning job(s):', error);
            toast.error('Failed to assign job');
        }

        setAssignModalJob(null);
        setIsBatchAssigning(false);
        setSelectedJobIds([]);
    };

    // ── Bulk & Individual Operations ───────────────────────
    const handleToggleSelectJob = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedJobIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleToggleSelectAll = () => {
        if (selectedJobIds.length === filteredJobs.length && filteredJobs.length > 0) {
            setSelectedJobIds([]);
        } else {
            setSelectedJobIds(filteredJobs.map(j => j.id));
        }
    };

    const handleBatchAssign = () => {
        if (selectedJobIds.length === 0) return;
        const targetJob = jobs.find(j => j.id === selectedJobIds[0]) || jobs[0];
        if (targetJob) {
            setIsBatchAssigning(true);
            setAssignModalJob(targetJob);
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

    const handleBatchArchive = async () => {
        if (selectedJobIds.length === 0) return;
        const shouldArchive = statusFilter !== 'archived';
        const actionText = shouldArchive ? 'archive' : 'unarchive';
        if (!window.confirm(`Are you sure you want to ${actionText} the ${selectedJobIds.length} selected jobs?`)) return;

        let successCount = 0;
        for (const id of selectedJobIds) {
            try {
                const jobRef = doc(db, 'jobs', id);
                await updateDoc(jobRef, { archived: shouldArchive });
                successCount++;
            } catch (error) {
                console.error(`Error updating job ${id}:`, error);
            }
        }

        if (successCount > 0) {
            toast.success(`Successfully ${shouldArchive ? 'archived' : 'unarchived'} ${successCount} jobs`);
        }
        setSelectedJobIds([]);
    };

    const handleBatchDelete = async () => {
        if (selectedJobIds.length === 0) return;
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete the ${selectedJobIds.length} selected jobs? This action cannot be undone.`)) return;

        let successCount = 0;
        for (const id of selectedJobIds) {
            try {
                const jobRef = doc(db, 'jobs', id);
                await deleteDoc(jobRef);
                successCount++;
            } catch (error) {
                console.error(`Error deleting job ${id}:`, error);
            }
        }

        if (successCount > 0) {
            toast.success(`Successfully deleted ${successCount} jobs`);
        }
        setSelectedJobIds([]);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3">
                    <Clock className="w-10 h-10 animate-spin text-blue-600" />
                    <p className="text-sm font-semibold text-slate-600">Loading jobs & work orders...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="px-3 sm:px-6 lg:px-8 py-5 space-y-4 max-w-[1600px] mx-auto">
            {/* ── 1. Page Header (With Single Primary "+ New Job" Action) ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200/60">
                <div>
                    <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                        <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-xl shadow-xs">
                            <Briefcase className="w-5 h-5" />
                        </div>
                        Jobs & Work Orders
                    </h1>
                    <p className="mt-0.5 text-xs text-slate-500">
                        Dispatching, customer appointments, on-site execution, and live work orders
                    </p>
                </div>

                {/* Single Primary Action */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => navigate('/jobs/new')}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all active:scale-98 cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        <span>New Job</span>
                    </button>
                </div>
            </div>

            {/* ── 2. KPI Metric Cards as Active Filters ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                {/* 1. All Active */}
                <InteractiveKpiCard
                    id="all"
                    label="Active Orders"
                    count={statusCounts['all'] || 0}
                    subtext="Total active pipeline"
                    icon={<TrendingUp className="w-5 h-5" />}
                    isActive={statusFilter === 'all'}
                    onClick={() => setStatusFilter('all')}
                    variant="blue"
                />

                {/* 2. Unassigned / Unscheduled */}
                <InteractiveKpiCard
                    id="unscheduled"
                    label="Unscheduled"
                    count={statusCounts['unscheduled'] || 0}
                    subtext={statusCounts['unscheduled'] > 0 ? 'Needs tech & time assignment' : 'All jobs scheduled'}
                    icon={<AlertTriangle className="w-5 h-5" />}
                    isActive={statusFilter === 'unscheduled'}
                    onClick={() => setStatusFilter(statusFilter === 'unscheduled' ? 'all' : 'unscheduled')}
                    variant="amber"
                />

                {/* 3. Scheduled */}
                <InteractiveKpiCard
                    id="scheduled"
                    label="Scheduled"
                    count={statusCounts['scheduled'] || 0}
                    subtext="Ready for tech arrival"
                    icon={<Calendar className="w-5 h-5" />}
                    isActive={statusFilter === 'scheduled'}
                    onClick={() => setStatusFilter(statusFilter === 'scheduled' ? 'all' : 'scheduled')}
                    variant="cyan"
                />

                {/* 4. In Progress */}
                <InteractiveKpiCard
                    id="in_progress"
                    label="In Progress"
                    count={statusCounts['in_progress'] || 0}
                    subtext={`${statusCounts['completed'] || 0} completed work orders`}
                    icon={<Wrench className="w-5 h-5" />}
                    isActive={statusFilter === 'in_progress'}
                    onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
                    variant="emerald"
                />
            </div>

            {/* ── 3. Unified Compact Toolbar ── */}
            <JobTableToolbar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                priorityFilter={priorityFilter}
                onPriorityChange={setPriorityFilter}
                techFilter={techFilter}
                onTechChange={setTechFilter}
                dateFilter={dateFilter}
                onDateChange={setDateFilter}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                technicians={technicians}
                selectedCount={selectedJobIds.length}
                totalCount={filteredJobs.length}
                onToggleSelectAll={handleToggleSelectAll}
                onBatchAssign={handleBatchAssign}
                onBatchArchive={handleBatchArchive}
                onBatchDelete={handleBatchDelete}
                canDelete={canDelete}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                tableDensity={tableDensity}
                onTableDensityChange={setTableDensity}
            />

            {/* ── 4. Main Views: Dense Table | Cards | Board | Prep ── */}

            {/* Sub-view: Kanban Board */}
            {viewMode === 'board' && (
                <Suspense fallback={<div className="p-12 flex items-center justify-center gap-2 text-slate-500"><Clock className="w-6 h-6 animate-spin text-blue-600" /> Loading Kanban board...</div>}>
                    <KanbanBoard />
                </Suspense>
            )}

            {/* Sub-view: Job Prep */}
            {viewMode === 'prep' && (
                <Suspense fallback={<div className="p-12 flex items-center justify-center gap-2 text-slate-500"><Clock className="w-6 h-6 animate-spin text-blue-600" /> Loading Job Prep...</div>}>
                    <JobPrepView />
                </Suspense>
            )}

            {/* Card Grid View */}
            {viewMode === 'cards' && (
                filteredJobs.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-2xs">
                        <Briefcase className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                        <h3 className="text-sm font-bold text-slate-900">No jobs match criteria</h3>
                        <p className="text-xs text-slate-500 mt-1">Try resetting search filters.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {filteredJobs.map(job => (
                            <CompactJobCard
                                key={job.id}
                                job={job}
                                isSelected={selectedJobIds.includes(job.id)}
                                isExpanded={expandedJobIds.has(job.id)}
                                onToggleSelect={(e) => handleToggleSelectJob(job.id, e)}
                                onToggleExpand={(e) => toggleExpandJob(job.id, e)}
                                onNavigate={navigate}
                                onAssignTech={(tJob) => setAssignModalJob(tJob)}
                                onArchive={handleIndividualArchive}
                                canDelete={canDelete}
                                onDelete={handleIndividualDelete}
                            />
                        ))}
                    </div>
                )
            )}

            {/* High-Density Table View (Default) */}
            {viewMode === 'table' && (
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                    {/* Fixed Table Column Header */}
                    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-slate-50/90 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        {/* 1. Selection Header */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                                type="button"
                                onClick={handleToggleSelectAll}
                                className="text-slate-400 hover:text-slate-600 p-0.5"
                                title="Select / deselect all"
                            >
                                {selectedJobIds.length === filteredJobs.length && filteredJobs.length > 0 ? (
                                    <CheckSquare className="w-4 h-4 text-blue-600" />
                                ) : (
                                    <Square className="w-4 h-4 text-slate-300" />
                                )}
                            </button>
                            <span className="w-3.5" />
                        </div>

                        {/* 2. Customer & ID */}
                        <div className="w-48 sm:w-56 flex-shrink-0">Customer / ID</div>

                        {/* 3. Location */}
                        <div className="hidden md:block w-44 lg:w-52 flex-shrink-0">Location</div>

                        {/* 4. Request Scope Summary */}
                        <div className="flex-1 min-w-0 hidden sm:block">Scope / Description</div>

                        {/* 5. Scheduled Time */}
                        <div className="w-36 flex-shrink-0 hidden lg:block">Appointment</div>

                        {/* 6. Status & Tech */}
                        <div className="w-40 sm:w-48 flex-shrink-0">Status & Tech</div>

                        {/* 7. Action Header */}
                        <div className="w-20 sm:w-24 text-right flex-shrink-0">Action</div>
                    </div>

                    {/* Table Body / Rows */}
                    {filteredJobs.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center mx-auto mb-3 border border-slate-200">
                                <Briefcase className="w-6 h-6" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-900">No jobs match your filter</h3>
                            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                                {searchTerm
                                    ? `No jobs match "${searchTerm}".`
                                    : statusFilter !== 'all'
                                        ? `No jobs currently in ${statusFilter.replace('_', ' ')} status.`
                                        : 'No jobs found in this organization.'}
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchTerm('');
                                    setStatusFilter('all');
                                    setPriorityFilter('all');
                                    setTechFilter('all');
                                    setDateFilter('all');
                                }}
                                className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                            >
                                Reset All Filters
                            </button>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-200/70">
                            {filteredJobs.map((job) => (
                                <JobRow
                                    key={job.id}
                                    job={job}
                                    isSelected={selectedJobIds.includes(job.id)}
                                    isExpanded={expandedJobIds.has(job.id)}
                                    density={tableDensity}
                                    onToggleSelect={(e) => handleToggleSelectJob(job.id, e)}
                                    onToggleExpand={(e) => toggleExpandJob(job.id, e)}
                                    onNavigate={navigate}
                                    onAssignTech={(tJob) => {
                                        setIsBatchAssigning(false);
                                        setAssignModalJob(tJob);
                                    }}
                                    onArchive={handleIndividualArchive}
                                    canDelete={canDelete}
                                    onDelete={handleIndividualDelete}
                                />
                            ))}
                        </div>
                    )}

                    {/* Table Footer Summary */}
                    <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
                        <span>
                            Showing <strong className="text-slate-800">{filteredJobs.length}</strong> of{' '}
                            <strong className="text-slate-800">{jobs.filter(j => !j.archived).length}</strong> active jobs
                        </span>
                        <div className="flex items-center gap-3">
                            <span className="text-amber-800 font-medium">
                                {statusCounts['unscheduled'] || 0} unscheduled
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-blue-800 font-medium">
                                {statusCounts['scheduled'] || 0} scheduled
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-emerald-800 font-medium">
                                {statusCounts['in_progress'] || 0} on site
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Assign Tech Modal ── */}
            {assignModalJob && (
                <AssignTechModal
                    job={assignModalJob}
                    isOpen={Boolean(assignModalJob)}
                    onClose={() => {
                        setAssignModalJob(null);
                        setIsBatchAssigning(false);
                    }}
                    onAssign={handleAssignFromModal}
                    technicians={technicians}
                    allJobs={jobs}
                />
            )}

            {/* ── Delete Job Reason Modal ── */}
            {deleteTargetJob && (
                <DeleteReasonModal
                    isOpen={isDeleteModalOpen}
                    itemType="job"
                    itemIdentifier={`Job #${deleteTargetJob.id.slice(-6).toUpperCase()} - ${deleteTargetJob.customer?.name || 'Customer'}`}
                    onClose={() => {
                        setIsDeleteModalOpen(false);
                        setDeleteTargetJob(null);
                    }}
                    onConfirm={handleConfirmDeleteJob}
                />
            )}
        </div>
    );
};
