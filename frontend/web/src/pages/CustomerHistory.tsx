import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Job } from '../types';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { JobDetailsModal } from '../components/JobDetailsModal';
import {
    Search,
    Calendar,
    Clock,
    CheckCircle2,
    AlertCircle,
    Truck,
    ArrowLeft,
    FileText,
    Filter,
    MapPin,
    User as UserIcon,
    RefreshCw
} from 'lucide-react';

export const CustomerHistory: React.FC = () => {
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'scheduled' | 'cancelled'>('all');
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);

    const isTechnician = user?.role === 'technician';
    const activeOrg = user?.org_id || 'demo-org';

    // Load jobs in real-time
    useEffect(() => {
        if (!user) return;
        setLoading(true);
        setError(null);

        const jobsRef = collection(db, 'jobs');
        let q;

        if (isTechnician) {
            // For technicians, query by assigned tech email or ID
            if (user.email) {
                q = query(
                    jobsRef,
                    where('org_id', '==', activeOrg),
                    where('assigned_tech_email', '==', user.email)
                );
            } else {
                q = query(
                    jobsRef,
                    where('org_id', '==', activeOrg),
                    where('assigned_tech_id', '==', user.uid)
                );
            }
        } else {
            // For admins/dispatchers, query org jobs
            q = query(
                jobsRef,
                where('org_id', '==', activeOrg)
            );
        }

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const results: Job[] = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...(doc.data() as Omit<Job, 'id'>)
                } as Job));

                // Sort descending by date (scheduled_at or createdAt)
                results.sort((a, b) => {
                    const timeA = a.scheduled_at?.toDate ? a.scheduled_at.toDate().getTime() :
                        (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0);
                    const timeB = b.scheduled_at?.toDate ? b.scheduled_at.toDate().getTime() :
                        (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0);
                    return timeB - timeA;
                });

                setJobs(results);
                setLoading(false);
            },
            (err) => {
                console.error('[CustomerHistory] Error listening to jobs:', err);
                setError('Failed to load job history. ' + err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user, isTechnician, activeOrg]);

    // Filter jobs by search term and status
    const filteredJobs = useMemo(() => {
        return jobs.filter(job => {
            const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
            if (!matchesStatus) return false;

            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();

            const customerName = (job.customer?.name || '').toLowerCase();
            const customerEmail = (job.customer?.email || '').toLowerCase();
            const description = (job.request?.description || '').toLowerCase();
            const siteAddress = (job.site_name || job.customer?.address || '').toLowerCase();
            const jobId = (job.id || '').toLowerCase();

            return customerName.includes(term) ||
                customerEmail.includes(term) ||
                description.includes(term) ||
                siteAddress.includes(term) ||
                jobId.includes(term);
        });
    }, [jobs, statusFilter, searchTerm]);

    // Statistics summary
    const stats = useMemo(() => {
        const total = jobs.length;
        const completed = jobs.filter(j => j.status === 'completed').length;
        const inProgress = jobs.filter(j => j.status === 'in_progress' || j.status === 'en_route').length;
        const scheduled = jobs.filter(j => j.status === 'scheduled').length;
        return { total, completed, inProgress, scheduled };
    }, [jobs]);

    const getStatusBadge = (status?: string) => {
        switch (status) {
            case 'completed':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Completed
                    </span>
                );
            case 'in_progress':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40">
                        <Clock className="w-3.5 h-3.5 animate-pulse" />
                        In Progress
                    </span>
                );
            case 'en_route':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/40">
                        <Truck className="w-3.5 h-3.5" />
                        En Route
                    </span>
                );
            case 'cancelled':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200/50 dark:border-red-800/40">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Cancelled
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        <Calendar className="w-3.5 h-3.5" />
                        Scheduled
                    </span>
                );
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/60">
                    <div>
                        <div className="flex items-center gap-2.5 text-xs font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
                            <FileText className="w-4 h-4" />
                            {isTechnician ? 'My Work History' : 'Organization Records'}
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
                            {isTechnician ? 'Technician Job History' : 'Job Records & History'}
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            {isTechnician 
                                ? 'View and review all past and active service assignments' 
                                : 'Manage and search service records across your team'}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Dashboard
                        </Link>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {/* Summary Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Recorded</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{stats.total}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
                        <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Completed</div>
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.completed}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
                        <div className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">In Progress</div>
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats.inProgress}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Scheduled</div>
                        <div className="text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1">{stats.scheduled}</div>
                    </div>
                </div>

                {/* Filters & Search */}
                <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/60 flex flex-col md:flex-row items-center justify-between gap-4">
                    {/* Search Input */}
                    <div className="relative w-full md:w-96">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by customer, address, or task..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    {/* Status Filter Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                        <Filter className="w-4 h-4 text-slate-400 mr-1 flex-shrink-0" />
                        {(['all', 'completed', 'in_progress', 'scheduled', 'cancelled'] as const).map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-all ${
                                    statusFilter === status
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                }`}
                            >
                                {status.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Table / Cards */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/60 overflow-hidden">
                    {loading ? (
                        <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                            <span className="text-sm font-medium">Loading history records...</span>
                        </div>
                    ) : filteredJobs.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">No Job Records Found</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {searchTerm ? 'No results matched your search term.' : 'There are no job records to display.'}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                            {filteredJobs.map((job) => {
                                const jobDate = job.scheduled_at?.toDate
                                    ? job.scheduled_at.toDate()
                                    : job.createdAt?.toDate
                                        ? job.createdAt.toDate()
                                        : job.scheduled_at
                                            ? new Date(job.scheduled_at)
                                            : null;

                                return (
                                    <div
                                        key={job.id}
                                        onClick={() => setSelectedJob(job)}
                                        className="p-4 sm:p-5 hover:bg-slate-50/80 dark:hover:bg-slate-750 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                                    >
                                        <div className="space-y-1.5 flex-1 min-w-0">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                    {job.customer?.name || 'Customer Name Unavailable'}
                                                </span>
                                                {getStatusBadge(job.status)}
                                                {job.priority && (
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                                        job.priority === 'critical' || (job.priority as string) === 'urgent'
                                                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                                            : job.priority === 'high'
                                                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                                    }`}>
                                                        {job.priority}
                                                    </span>
                                                )}
                                            </div>

                                            <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-1">
                                                {job.request?.description || 'No description provided.'}
                                            </p>

                                            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                                                {jobDate && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        {jobDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </span>
                                                )}
                                                {(job.site_name || job.customer?.address) && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <MapPin className="w-3.5 h-3.5" />
                                                        <span className="truncate max-w-[200px]">{job.site_name || job.customer?.address}</span>
                                                    </span>
                                                )}
                                                {job.customer?.phone && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <UserIcon className="w-3.5 h-3.5" />
                                                        {job.customer.phone}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedJob(job);
                                                }}
                                                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 dark:text-indigo-300 transition-colors"
                                            >
                                                View Dossier
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Job Details Modal */}
            {selectedJob && (
                <JobDetailsModal
                    job={selectedJob}
                    onClose={() => setSelectedJob(null)}
                    onUpdate={() => {
                        setSelectedJob(null);
                    }}
                />
            )}
        </div>
    );
};
export default CustomerHistory;
