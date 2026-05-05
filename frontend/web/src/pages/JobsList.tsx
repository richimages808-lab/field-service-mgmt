import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { Job, UserProfile } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { Link, useNavigate } from 'react-router-dom';
import { AssignTechModal } from '../components/AssignTechModal';
import { getAutoAssignment } from '../lib/techMatchingEngine';
import {
    Plus, Search, ChevronUp, ChevronDown, UserPlus, Eye,
    Clock, AlertCircle, Clipboard, Filter
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import toast from 'react-hot-toast';

type StatusFilter = 'all' | 'unscheduled' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
type SortField = 'priority' | 'customer' | 'type' | 'status' | 'tech' | 'duration' | 'age';

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_STYLES: Record<string, string> = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-green-100 text-green-800 border-green-200',
};
const STATUS_STYLES: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    unscheduled: 'bg-gray-100 text-gray-700',
    quote_pending: 'bg-purple-100 text-purple-700',
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending',
    unscheduled: 'Unscheduled',
    quote_pending: 'Quote Pending',
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

export const JobsList: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [sortField, setSortField] = useState<SortField>('priority');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // AssignTechModal state
    const [assignModalJob, setAssignModalJob] = useState<Job | null>(null);

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
            setTechnicians(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)));
        });

        return () => { unsubJobs(); unsubTechs(); };
    }, [user]);

    // ── Helpers ─────────────────────────────────────────────
    const getAge = (job: Job): number => {
        const created = job.createdAt?.toDate?.() || job.createdAt?.seconds
            ? new Date(job.createdAt.seconds * 1000) : null;
        if (!created) return 0;
        return Math.floor((Date.now() - created.getTime()) / 86400000);
    };

    const getAgeLabel = (job: Job): string => {
        const created = job.createdAt?.toDate?.() || job.createdAt?.seconds
            ? new Date(job.createdAt.seconds * 1000) : null;
        if (!created) return '—';
        return formatDistanceToNowStrict(created, { addSuffix: true });
    };

    // ── Status counts ──────────────────────────────────────
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { all: jobs.length };
        jobs.forEach(j => {
            const s = j.status === 'pending' ? 'unscheduled' : j.status;
            counts[s] = (counts[s] || 0) + 1;
        });
        return counts;
    }, [jobs]);

    const priorityCounts = useMemo(() => {
        const counts: Record<string, number> = { all: 0 };
        const filtered = statusFilter === 'all'
            ? jobs
            : jobs.filter(j => (j.status === 'pending' ? 'unscheduled' : j.status) === statusFilter);
        counts.all = filtered.length;
        filtered.forEach(j => { counts[j.priority] = (counts[j.priority] || 0) + 1; });
        return counts;
    }, [jobs, statusFilter]);

    // ── Filtering & Sorting ────────────────────────────────
    const filteredJobs = useMemo(() => {
        let result = [...jobs];

        // Status filter
        if (statusFilter !== 'all') {
            result = result.filter(j => {
                const s = j.status === 'pending' ? 'unscheduled' : j.status;
                return s === statusFilter;
            });
        }

        // Priority filter
        if (priorityFilter !== 'all') {
            result = result.filter(j => j.priority === priorityFilter);
        }

        // Search
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            result = result.filter(j =>
                j.customer?.name?.toLowerCase().includes(q) ||
                j.customer?.address?.toLowerCase().includes(q) ||
                j.request?.description?.toLowerCase().includes(q) ||
                j.request?.type?.toLowerCase().includes(q) ||
                j.assigned_tech_name?.toLowerCase().includes(q)
            );
        }

        // Sort
        result.sort((a, b) => {
            let va: any, vb: any;
            switch (sortField) {
                case 'priority':
                    va = PRIORITY_ORDER[a.priority] ?? 3;
                    vb = PRIORITY_ORDER[b.priority] ?? 3;
                    break;
                case 'customer':
                    va = (a.customer?.name || '').toLowerCase();
                    vb = (b.customer?.name || '').toLowerCase();
                    break;
                case 'type':
                    va = (a.request?.type || a.category || '').toLowerCase();
                    vb = (b.request?.type || b.category || '').toLowerCase();
                    break;
                case 'status':
                    va = a.status;
                    vb = b.status;
                    break;
                case 'tech':
                    va = (a.assigned_tech_name || 'zzz').toLowerCase();
                    vb = (b.assigned_tech_name || 'zzz').toLowerCase();
                    break;
                case 'duration':
                    va = a.estimated_duration || 0;
                    vb = b.estimated_duration || 0;
                    break;
                case 'age':
                    va = getAge(a);
                    vb = getAge(b);
                    break;
            }
            if (va < vb) return sortDirection === 'asc' ? -1 : 1;
            if (va > vb) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [jobs, statusFilter, priorityFilter, searchTerm, sortField, sortDirection]);

    // ── Sort handler ───────────────────────────────────────
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'age' || field === 'duration' ? 'desc' : 'asc');
        }
    };

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

    // ── Sort Icon ──────────────────────────────────────────
    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span className="opacity-0 group-hover:opacity-50"><ChevronDown className="w-3.5 h-3.5 inline ml-0.5" /></span>;
        return sortDirection === 'asc'
            ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
            : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />;
    };

    if (loading) return <div className="p-8 flex items-center gap-2 text-gray-500"><Clock className="w-5 h-5 animate-spin" /> Loading jobs...</div>;

    return (
        <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
            {/* ── Header ──────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Jobs / Work Orders</h1>
                    <p className="text-sm text-gray-500 mt-1">{jobs.length} total jobs · {statusCounts['unscheduled'] || 0} unassigned</p>
                </div>
                <button
                    onClick={() => navigate('/jobs/new')}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    New Job
                </button>
            </div>

            {/* ── Status Tabs ─────────────────────────────────── */}
            <div className="mb-4 flex flex-wrap border-b border-gray-200 overflow-x-auto">
                {(['all', 'unscheduled', 'scheduled', 'in_progress', 'completed', 'cancelled'] as StatusFilter[]).map(status => (
                    <button
                        key={status}
                        onClick={() => { setStatusFilter(status); setPriorityFilter('all'); }}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                            statusFilter === status
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        {status === 'all' ? 'All' : STATUS_LABELS[status] || status}
                        <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                            statusFilter === status ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                            {statusCounts[status] || 0}
                        </span>
                    </button>
                ))}
            </div>

            {/* ── Search + Priority Filter ─────────────────────── */}
            <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-grow max-w-md">
                    <input
                        type="text"
                        placeholder="Search customer, address, type..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    <Filter className="w-4 h-4 text-gray-400 mr-1" />
                    {(['all', 'critical', 'high', 'medium', 'low'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPriorityFilter(p)}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                priorityFilter === p
                                    ? p === 'all'
                                        ? 'bg-gray-800 text-white border-gray-800'
                                        : `${PRIORITY_STYLES[p]} border-current font-bold`
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                            }`}
                        >
                            {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                            {(priorityCounts[p] !== undefined) && (
                                <span className="ml-1">({priorityCounts[p]})</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Table ───────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {([
                                ['priority', 'Priority'],
                                ['customer', 'Customer'],
                                ['type', 'Type'],
                                ['status', 'Status'],
                                ['tech', 'Assigned Tech'],
                                ['duration', 'Duration'],
                                ['age', 'Age'],
                            ] as [SortField, string][]).map(([field, label]) => (
                                <th
                                    key={field}
                                    onClick={() => handleSort(field)}
                                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 select-none whitespace-nowrap"
                                >
                                    {label} <SortIcon field={field} />
                                </th>
                            ))}
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredJobs.map(job => {
                            const isUnassigned = !job.assigned_tech_id || job.status === 'pending' || job.status === 'unscheduled';
                            const age = getAge(job);
                            const ageColor = age > 14 ? 'text-red-600 font-semibold' : age > 7 ? 'text-orange-600' : age > 3 ? 'text-yellow-600' : 'text-gray-500';

                            return (
                                <tr
                                    key={job.id}
                                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                                    onClick={() => navigate(`/jobs/${job.id}`)}
                                >
                                    {/* Priority */}
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border ${PRIORITY_STYLES[job.priority] || 'bg-gray-100 text-gray-700'}`}>
                                            {job.priority}
                                        </span>
                                    </td>

                                    {/* Customer */}
                                    <td className="px-4 py-3">
                                        <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{job.customer?.name || 'Unknown'}</div>
                                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{job.customer?.address || ''}</div>
                                    </td>

                                    {/* Type */}
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="text-sm text-gray-700">{job.request?.type || job.category || '—'}</span>
                                    </td>

                                    {/* Status */}
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[job.status] || 'bg-gray-100 text-gray-700'}`}>
                                            {STATUS_LABELS[job.status] || job.status}
                                        </span>
                                    </td>

                                    {/* Assigned Tech */}
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {isUnassigned ? (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setAssignModalJob(job); }}
                                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                                            >
                                                <UserPlus className="w-3.5 h-3.5" />
                                                Assign
                                            </button>
                                        ) : (
                                            <span className="text-sm text-gray-700">{job.assigned_tech_name || 'Assigned'}</span>
                                        )}
                                    </td>

                                    {/* Duration */}
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                        {job.estimated_duration ? `${job.estimated_duration}m` : '—'}
                                    </td>

                                    {/* Age */}
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className={`text-xs ${ageColor}`}>{getAgeLabel(job)}</span>
                                    </td>

                                    {/* Actions */}
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <Link
                                                to={`/jobs/${job.id}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-gray-500 hover:text-blue-600 transition-colors"
                                                title="View Job"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Link>
                                            {isUnassigned && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setAssignModalJob(job); }}
                                                    className="text-gray-500 hover:text-green-600 transition-colors"
                                                    title="Assign Technician"
                                                >
                                                    <UserPlus className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {filteredJobs.length === 0 && (
                    <div className="p-12 text-center text-gray-500 flex flex-col items-center">
                        <Clipboard className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-lg font-medium">No jobs found</p>
                        <p className="text-sm mt-1">
                            {searchTerm ? 'Try adjusting your search term.' : 'Create a new job to get started.'}
                        </p>
                    </div>
                )}
            </div>

            {/* ── Summary bar ─────────────────────────────────── */}
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 px-1">
                <span>Showing {filteredJobs.length} of {jobs.length} jobs</span>
                <span className="flex items-center gap-4">
                    <span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 text-red-400" /> {statusCounts['unscheduled'] || 0} unassigned</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-blue-400" /> {statusCounts['scheduled'] || 0} scheduled</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> {statusCounts['in_progress'] || 0} in progress</span>
                </span>
            </div>

            {/* ── Assign Tech Modal ────────────────────────────── */}
            <AssignTechModal
                job={assignModalJob}
                isOpen={!!assignModalJob}
                onClose={() => setAssignModalJob(null)}
                onAssign={handleAssignFromModal}
                technicians={technicians}
                allJobs={jobs}
            />
        </div>
    );
};
