import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { Job, UserProfile } from '../../types';
import {
    X,
    Search,
    Calendar,
    CheckCircle2,
    Clock,
    DollarSign,
    Briefcase,
    MapPin,
    ArrowUpRight,
    User,
    Mail,
    Phone,
    Filter,
    ArrowUpDown,
    Archive
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface TechJobHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    technician: UserProfile | null;
}

type JobStatusFilter = 'all' | 'completed' | 'in_progress' | 'scheduled' | 'pending' | 'cancelled';

export const TechJobHistoryModal: React.FC<TechJobHistoryModalProps> = ({
    isOpen,
    onClose,
    technician
}) => {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<JobStatusFilter>('all');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    useEffect(() => {
        if (!isOpen || !technician) return;

        const fetchTechJobs = async () => {
            setLoading(true);
            try {
                const jobsRef = collection(db, 'jobs');
                
                // Fetch jobs by assigned_tech_id
                const qById = query(jobsRef, where('assigned_tech_id', '==', technician.id));
                const snapById = await getDocs(qById);

                const jobsMap = new Map<string, Job>();
                snapById.docs.forEach(d => {
                    jobsMap.set(d.id, { id: d.id, ...d.data() } as Job);
                });

                // Also fetch by assigned_tech_email if email exists (covers legacy records)
                if (technician.email) {
                    const qByEmail = query(jobsRef, where('assigned_tech_email', '==', technician.email));
                    const snapByEmail = await getDocs(qByEmail);
                    snapByEmail.docs.forEach(d => {
                        jobsMap.set(d.id, { id: d.id, ...d.data() } as Job);
                    });
                }

                // If technician has a name, also fetch by name as fallback for legacy records
                if (technician.name) {
                    const qByName = query(jobsRef, where('assigned_tech_name', '==', technician.name));
                    const snapByName = await getDocs(qByName);
                    snapByName.docs.forEach(d => {
                        jobsMap.set(d.id, { id: d.id, ...d.data() } as Job);
                    });
                }

                setJobs(Array.from(jobsMap.values()));
            } catch (error) {
                console.error('Error loading technician job history:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchTechJobs();
    }, [isOpen, technician]);

    const stats = useMemo(() => {
        const total = jobs.length;
        const completed = jobs.filter(j => j.status === 'completed').length;
        const active = jobs.filter(j => ['scheduled', 'in_progress'].includes(j.status)).length;
        const totalRevenue = jobs
            .filter(j => j.status === 'completed')
            .reduce((sum, j) => {
                const val = Number((j as any).totalAmount || (j as any).quote_amount || (j as any).total || 0);
                return sum + (isNaN(val) ? 0 : val);
            }, 0);

        return { total, completed, active, totalRevenue };
    }, [jobs]);

    const filteredJobs = useMemo(() => {
        let result = [...jobs];

        if (statusFilter !== 'all') {
            result = result.filter(j => j.status === statusFilter);
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter(j =>
                (j.request?.description || '').toLowerCase().includes(term) ||
                ((j as any).title || '').toLowerCase().includes(term) ||
                (j.customer?.name || '').toLowerCase().includes(term) ||
                (j.customer?.address || '').toLowerCase().includes(term) ||
                (j.id || '').toLowerCase().includes(term)
            );
        }

        result.sort((a, b) => {
            const getDate = (job: Job) => {
                if (job.scheduled_at?.toDate) return job.scheduled_at.toDate().getTime();
                if (job.scheduled_at?.seconds) return job.scheduled_at.seconds * 1000;
                if (job.createdAt?.toDate) return job.createdAt.toDate().getTime();
                if (job.createdAt?.seconds) return job.createdAt.seconds * 1000;
                return 0;
            };
            const timeA = getDate(a);
            const timeB = getDate(b);
            return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        });

        return result;
    }, [jobs, statusFilter, searchTerm, sortOrder]);

    if (!isOpen || !technician) return null;

    const isArchived = technician.archived === true || technician.status === 'archived';

    const getStatusPill = (status: string) => {
        switch (status) {
            case 'completed':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completed</span>;
            case 'in_progress':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 flex items-center gap-1"><Clock className="w-3 h-3" /> In Progress</span>;
            case 'scheduled':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 flex items-center gap-1"><Calendar className="w-3 h-3" /> Scheduled</span>;
            case 'cancelled':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">Cancelled</span>;
            default:
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 capitalize">{status || 'Unassigned'}</span>;
        }
    };

    const formatJobDate = (job: Job) => {
        const rawDate = job.scheduled_at || job.createdAt;
        if (!rawDate) return 'No date specified';
        try {
            const dateObj = rawDate.toDate ? rawDate.toDate() : new Date(rawDate.seconds * 1000);
            return format(dateObj, 'MMM d, yyyy • h:mm a');
        } catch {
            return 'Invalid date';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex justify-between items-start">
                    <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm ${
                            isArchived
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-blue-600 text-white shadow-blue-200'
                        }`}>
                            {isArchived ? <Archive className="w-6 h-6" /> : <User className="w-6 h-6" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h2 className="text-xl font-bold text-slate-900">{technician.name || 'Technician History'}</h2>
                                {isArchived ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                        <Archive className="w-3 h-3" /> Archived
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        <CheckCircle2 className="w-3 h-3" /> Active Tech
                                    </span>
                                )}
                                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-medium capitalize">
                                    {technician.techType === 'solopreneur' ? 'Contractor' : 'Employee'}
                                </span>
                            </div>

                            <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
                                {technician.email && (
                                    <span className="flex items-center gap-1">
                                        <Mail className="w-3.5 h-3.5 text-slate-400" /> {technician.email}
                                    </span>
                                )}
                                {technician.phone && (
                                    <span className="flex items-center gap-1">
                                        <Phone className="w-3.5 h-3.5 text-slate-400" /> {technician.phone}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Stat Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 bg-slate-100/60 border-b border-slate-200">
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Briefcase className="w-3.5 h-3.5 text-blue-500" /> Total Jobs
                        </div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Completed
                        </div>
                        <div className="text-2xl font-bold text-emerald-700 mt-1">{stats.completed}</div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" /> In Progress / Sched
                        </div>
                        <div className="text-2xl font-bold text-indigo-700 mt-1">{stats.active}</div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5 text-amber-500" /> Completed Value
                        </div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">
                            ${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                    </div>
                </div>

                {/* Filters & Search Controls */}
                <div className="px-6 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white">
                    {/* Search */}
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search jobs, customers, address..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                        <Filter className="w-4 h-4 text-slate-400 mr-1 flex-shrink-0 hidden sm:block" />
                        {(['all', 'completed', 'in_progress', 'scheduled', 'cancelled'] as JobStatusFilter[]).map((st) => (
                            <button
                                key={st}
                                onClick={() => setStatusFilter(st)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                                    statusFilter === st
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {st.replace('_', ' ')}
                            </button>
                        ))}

                        <button
                            onClick={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}
                            className="ml-auto sm:ml-2 p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200 text-xs flex items-center gap-1 font-medium"
                            title={`Sort ${sortOrder === 'desc' ? 'Oldest First' : 'Newest First'}`}
                        >
                            <ArrowUpDown className="w-3.5 h-3.5" />
                            {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
                        </button>
                    </div>
                </div>

                {/* Jobs List */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-slate-50/50">
                    {loading ? (
                        <div className="py-16 text-center text-slate-500">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-3" />
                            <p className="text-sm font-medium">Loading job history...</p>
                        </div>
                    ) : filteredJobs.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 p-8">
                            <Briefcase className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                            <h3 className="text-base font-semibold text-slate-700">No jobs found for this technician</h3>
                            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                                {searchTerm || statusFilter !== 'all'
                                    ? 'No jobs match your current search or status filter.'
                                    : 'This technician has not been assigned to any jobs yet.'}
                            </p>
                        </div>
                    ) : (
                        filteredJobs.map((job) => {
                            const jobPrice = (job as any).totalAmount || (job as any).quote_amount || (job as any).total;
                            return (
                                <div
                                    key={job.id}
                                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
                                >
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                #{job.id.substring(0, 7).toUpperCase()}
                                            </span>
                                            <span className="font-semibold text-slate-900 text-sm truncate">
                                                {(job as any).title || job.request?.description?.substring(0, 45) || (job as any).description?.substring(0, 45) || 'Service Job'}
                                            </span>
                                            {getStatusPill(job.status)}
                                        </div>

                                        <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                                            <span className="font-medium text-slate-700">
                                                {job.customer?.name || 'Unknown Customer'}
                                            </span>
                                            {job.customer?.address && (
                                                <span className="flex items-center gap-1 text-slate-400 truncate max-w-xs">
                                                    <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                    {job.customer.address}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1 text-slate-500">
                                                <Calendar className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                {formatJobDate(job)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 self-end sm:self-center flex-shrink-0">
                                        {jobPrice && (
                                            <div className="text-right mr-2 hidden sm:block">
                                                <span className="text-xs text-slate-400 block font-medium">Billed</span>
                                                <span className="text-sm font-bold text-slate-900">${Number(jobPrice).toLocaleString()}</span>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => {
                                                onClose();
                                                navigate(`/jobs?selected=${job.id}`);
                                            }}
                                            className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 group-hover:bg-blue-600 group-hover:text-white"
                                        >
                                            View Job <ArrowUpRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
                    <span>Showing {filteredJobs.length} of {jobs.length} total historical jobs</span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors shadow-sm"
                    >
                        Close History
                    </button>
                </div>
            </div>
        </div>
    );
};
