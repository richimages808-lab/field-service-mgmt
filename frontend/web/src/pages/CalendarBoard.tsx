import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Job, UserProfile } from '../types';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { format, addDays, startOfWeek, isSameDay, setHours, setMinutes, addMinutes, parse, addMonths, differenceInDays } from 'date-fns';
import { TechnicianMap } from '../components/dispatcher/TechnicianMap';
import { optimizeSchedule, getSmartDuration } from '../lib/scheduler';
import { autoAssignJobs } from '../lib/smartScheduler';
import { Clock, MapPin, Wrench, Calendar, Zap, Users, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, Plus, ArrowLeft, CalendarDays, LayoutGrid, Sun, Lightbulb, Package, AlertTriangle, Phone, Mail, FileText } from 'lucide-react';
import { EditJobModal } from '../components/EditJobModal';
import { QuickCreateJobModal } from '../components/QuickCreateJobModal';
import { TechMonthView } from '../components/TechMonthView';

const HOUR_HEIGHT = 60; // pixels per hour
const START_HOUR = 7; // 7am
const END_HOUR = 19; // 7pm
const HOURS_DISPLAY = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const MAP_STORAGE_KEY = 'dispatchbox_calendar_map_visible';

interface JobCardProps {
    job: Job;
    onClick: () => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, onClick }) => {
    const [{ isDragging }, drag] = useDrag({
        type: 'JOB',
        item: { job },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    });

    const priorityColors = {
        critical: 'border-l-4 border-red-600 bg-red-50',
        high: 'border-l-4 border-orange-500 bg-orange-50',
        medium: 'border-l-4 border-yellow-500 bg-yellow-50',
        low: 'border-l-4 border-green-500 bg-green-50',
    };

    const statusColors = {
        pending: 'bg-gray-100',
        scheduled: 'bg-blue-50',
        in_progress: 'bg-amber-50',
        completed: 'bg-green-50',
    };

    const duration = getSmartDuration(job);
    const heightInPixels = (duration / 60) * HOUR_HEIGHT;

    return (
        <div
            ref={drag}
            onClick={onClick}
            className={`absolute left-0 right-0 mx-1 rounded shadow-sm cursor-pointer hover:shadow-md transition-all ${priorityColors[job.priority]} ${statusColors[job.status]} ${isDragging ? 'opacity-50' : 'opacity-100'
                }`}
            style={{
                height: `${Math.max(heightInPixels, 40)}px`,
                zIndex: 10,
            }}
        >
        <div className="p-2 text-xs h-full overflow-hidden">
                <div className="font-semibold truncate">{job.customer.name}</div>
                {job.assigned_tech_name && (
                    <div className="text-gray-600 truncate flex items-center gap-1 mt-1">
                        <Users size={10} />
                        {job.assigned_tech_name}
                    </div>
                )}
                <div className="text-gray-500 truncate flex items-center gap-1">
                    <Clock size={10} />
                    {duration}m
                </div>
                {job.parts_needed && (
                    <div className="text-orange-600 flex items-center gap-1">
                        <Wrench size={10} />
                        Parts
                    </div>
                )}
                {(job as any).quoteStatus === 'approved' && (
                    <div className="text-emerald-700 flex items-center gap-1 font-semibold">
                        <CheckCircle2 size={10} />
                        Quote ✓
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Detailed Job Card for Day View ─────────────────────────────────────────
interface DetailedJobCardProps {
    job: Job;
    onClick: () => void;
}

const DetailedJobCard: React.FC<DetailedJobCardProps> = ({ job, onClick }) => {
    const duration = getSmartDuration(job);

    const priorityConfig = {
        critical: { bg: 'bg-red-50 border-red-300', badge: 'bg-red-600 text-white', label: '🔴 Critical' },
        high: { bg: 'bg-orange-50 border-orange-300', badge: 'bg-orange-500 text-white', label: '🟠 High' },
        medium: { bg: 'bg-yellow-50 border-yellow-300', badge: 'bg-yellow-500 text-white', label: '🟡 Medium' },
        low: { bg: 'bg-green-50 border-green-300', badge: 'bg-green-500 text-white', label: '🟢 Low' },
    };

    const statusConfig: Record<string, { bg: string; label: string }> = {
        pending: { bg: 'bg-gray-100', label: 'Pending' },
        scheduled: { bg: 'bg-blue-100 text-blue-800', label: 'Scheduled' },
        in_progress: { bg: 'bg-amber-100 text-amber-800', label: 'In Progress' },
        completed: { bg: 'bg-green-100 text-green-800', label: 'Completed' },
        quote_pending: { bg: 'bg-purple-100 text-purple-800', label: 'Quote Pending' },
    };

    const pConfig = priorityConfig[job.priority] || priorityConfig.medium;
    const sConfig = statusConfig[job.status] || statusConfig.pending;
    const jobTime = job.scheduled_at?.toDate?.() || (job.scheduled_at ? new Date(job.scheduled_at) : null);
    const aiRec = (job as any).aiRecommendation || job.intakeReview?.aiRecommendation;

    return (
        <div
            onClick={onClick}
            className={`rounded-xl border-2 ${pConfig.bg} cursor-pointer hover:shadow-lg transition-all p-4 mx-1 my-1`}
            style={{ zIndex: 10 }}
        >
            {/* Row 1: Customer + Status */}
            <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-base text-gray-900 truncate">{job.customer.name}</div>
                    {jobTime && (
                        <div className="text-sm text-gray-600 font-medium mt-0.5">
                            {format(jobTime, 'h:mm a')} — {format(new Date(jobTime.getTime() + duration * 60000), 'h:mm a')}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${pConfig.badge}`}>
                        {pConfig.label}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sConfig.bg}`}>
                        {sConfig.label}
                    </span>
                </div>
            </div>

            {/* Row 2: Address + Contact */}
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="truncate">{job.customer.address || 'No address'}</span>
                </div>
                {job.customer.phone && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <Phone size={12} className="text-gray-400" />
                        <span className="text-xs">{job.customer.phone}</span>
                    </div>
                )}
                {job.customer.email && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <Mail size={12} className="text-gray-400" />
                        <span className="text-xs truncate max-w-[140px]">{job.customer.email}</span>
                    </div>
                )}
            </div>

            {/* Row 3: Description */}
            {job.request?.description && (
                <div className="flex items-start gap-1.5 text-sm text-gray-700 mb-2 bg-white/60 rounded-lg p-2">
                    <FileText size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                    <p className="line-clamp-2">{job.request.description}</p>
                </div>
            )}

            {/* Row 4: Meta — Duration, Category, Parts */}
            <div className="flex items-center gap-3 text-xs flex-wrap">
                <div className="flex items-center gap-1 text-gray-600 bg-white/70 px-2 py-1 rounded-md">
                    <Clock size={12} />
                    <span className="font-medium">{duration} min</span>
                </div>
                {job.category && (
                    <div className="flex items-center gap-1 text-gray-600 bg-white/70 px-2 py-1 rounded-md">
                        <Wrench size={12} />
                        <span className="font-medium capitalize">{job.category}</span>
                    </div>
                )}
                {job.parts_needed && (
                    <div className="flex items-center gap-1 text-orange-700 bg-orange-100 px-2 py-1 rounded-md font-medium">
                        <Package size={12} />
                        Parts Needed
                    </div>
                )}
                {job.site_name && (
                    <div className="text-gray-500 bg-white/70 px-2 py-1 rounded-md font-medium">
                        📍 {job.site_name}
                    </div>
                )}
                {(job as any).quoteStatus === 'approved' && (
                    <div className="flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md font-medium">
                        <CheckCircle2 size={12} />
                        Quote Approved
                    </div>
                )}
            </div>

            {/* Row 5: AI Analysis (if present) */}
            {aiRec && (
                <div className="mt-2 p-2 bg-white/80 rounded-lg border border-yellow-200">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-yellow-800 mb-1">
                        <Lightbulb size={12} />
                        AI Analysis
                    </div>
                    <p className="text-xs text-gray-700 line-clamp-2">
                        {aiRec.fixInstructions?.summary || aiRec.diagnosis || aiRec.priorityReason || 'AI analysis available'}
                    </p>
                    {aiRec.recommendedMaterials && aiRec.recommendedMaterials.length > 0 && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-orange-700">
                            <Package size={10} />
                            {aiRec.recommendedMaterials.length} materials recommended
                        </div>
                    )}
                    {aiRec.requiredTools && aiRec.requiredTools.length > 0 && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-blue-700">
                            <Wrench size={10} />
                            {aiRec.requiredTools.length} tools required
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

interface TimeSlotProps {
    date: Date;
    hour: number;
    techId: string | null;
    jobs: Job[];
    unassignedJobs: Job[];
    onDrop: (job: Job, newTime: Date, techId: string | null) => void;
    onJobClick: (job: Job) => void;
    onEmptyClick?: (date: Date, hour: number, techId: string | null) => void;
}

const TimeSlot: React.FC<TimeSlotProps> = ({ date, hour, techId, jobs, unassignedJobs, onDrop, onJobClick, onEmptyClick }) => {
    const slotTime = setMinutes(setHours(date, hour), 0);

    const [{ isOver }, drop] = useDrop({
        accept: 'JOB',
        drop: (item: { job: Job }) => {
            onDrop(item.job, slotTime, techId);
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    });

    // Find jobs that start in this hour slot
    const slotJobs = jobs.filter(job => {
        if (!job.scheduled_at) return false;
        const jobTime = (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at));
        return isSameDay(jobTime, date) && jobTime.getHours() === hour && job.assigned_tech_id === techId;
    });

    // Check if any unassigned job has availability window matching this time slot
    const hasCustomerAvailability = unassignedJobs.some(job => {
        if (!job.request?.availabilityWindows || job.request.availabilityWindows.length === 0) {
            return false;
        }

        const now = new Date();
        const slotEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1, 0, 0, 0);
        if (slotEnd <= now) {
            return false;
        }

        return job.request.availabilityWindows.some(window => {
            try {
                const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const windowDay = (window.day || '').trim().toLowerCase();
                const currentDayName = dayNames[date.getDay()];

                let dayMatches = false;
                if (windowDay === format(date, 'yyyy-MM-dd')) {
                    dayMatches = true;
                } else if (windowDay === currentDayName || (windowDay.length >= 3 && currentDayName.startsWith(windowDay))) {
                    const daysDiff = differenceInDays(date, now);
                    if (daysDiff >= 0 && daysDiff <= 14) {
                        dayMatches = true;
                    }
                }
                if (!dayMatches) return false;

                const [startHour, startMin = 0] = window.startTime.split(':').map(Number);
                const [endHour, endMin = 0] = window.endTime.split(':').map(Number);

                return hour >= startHour && hour < endHour;
            } catch (error) {
                console.error('Error parsing availability window:', error);
                return false;
            }
        });
    });

    const isEmpty = slotJobs.length === 0;

    const handleClick = (e: React.MouseEvent) => {
        // Only fire on empty slots, not when clicking on a job
        if (isEmpty && onEmptyClick && techId) {
            e.stopPropagation();
            onEmptyClick(date, hour, techId);
        }
    };

    return (
        <div
            ref={drop}
            onClick={handleClick}
            className={`border-b border-r border-gray-200 relative group ${
                isOver
                    ? 'bg-blue-100'
                    : hasCustomerAvailability
                    ? 'bg-green-50 hover:bg-green-100'
                    : isEmpty && techId
                    ? 'bg-white hover:bg-violet-50 cursor-pointer'
                    : 'bg-white hover:bg-gray-50'
            }`}
            style={{ height: `${HOUR_HEIGHT}px` }}
            title={hasCustomerAvailability ? 'Customer requested time window' : isEmpty && techId ? 'Click to create a job' : ''}
        >
            {hasCustomerAvailability && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" title="Customer availability" />
            )}

            {/* Empty slot "+" indicator */}
            {isEmpty && techId && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="flex items-center gap-1 text-violet-400 text-xs font-medium bg-violet-50/80 px-2 py-1 rounded-md border border-violet-200">
                        <Plus size={12} />
                        New Job
                    </div>
                </div>
            )}

            {slotJobs.map(job => {
                const jobTime = job.scheduled_at!.toDate();
                const minuteOffset = jobTime.getMinutes();
                const topOffset = (minuteOffset / 60) * HOUR_HEIGHT;

                return (
                    <div key={job.id} style={{ position: 'absolute', top: `${topOffset}px`, left: 0, right: 0 }}>
                        <JobCard job={job} onClick={() => onJobClick(job)} />
                    </div>
                );
            })}
        </div>
    );
};

export const CalendarBoard: React.FC = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const scheduleJobId = searchParams.get('scheduleJobId');
    const [jobs, setJobs] = useState<Job[]>([]);
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [viewDate, setViewDate] = useState<Date>(new Date());
    const [selectedDay, setSelectedDay] = useState<Date>(new Date());
    const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
    const [editingJob, setEditingJob] = useState<Job | null>(null);
    const [showUnassigned, setShowUnassigned] = useState(true);
    const [showMap, setShowMap] = useState(() => {
        try {
            const saved = localStorage.getItem(MAP_STORAGE_KEY);
            return saved !== null ? JSON.parse(saved) : true;
        } catch { return true; }
    });

    // Individual tech focus mode
    const [focusedTechId, setFocusedTechId] = useState<string | null>(null);
    const [techViewMode, setTechViewMode] = useState<'day' | 'week' | 'month'>('week');

    // Quick create job modal
    const [quickCreateSlot, setQuickCreateSlot] = useState<{
        date: Date;
        hour: number;
        techId: string | null;
        techName: string | null;
    } | null>(null);

    const orgId = (user as any)?.org_id || 'demo-org';

    // Persist map visibility
    useEffect(() => {
        try {
            localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(showMap));
        } catch { /* ignore */ }
    }, [showMap]);

    // Fetch jobs
    useEffect(() => {
        const jobsQuery = query(collection(db, 'jobs'), where('org_id', '==', orgId));
        const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
            const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
            setJobs(jobsData);
        });
        return unsubscribe;
    }, [orgId]);

    // Fetch technicians
    useEffect(() => {
        const techsQuery = query(
            collection(db, 'users'),
            where('org_id', '==', orgId),
            where('role', '==', 'technician')
        );
        const unsubscribe = onSnapshot(techsQuery, (snapshot) => {
            const techsData = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as UserProfile))
                .filter(t => t.archived !== true && t.status !== 'archived');
            setTechnicians(techsData);
            // Auto-select all active techs on load
            if (selectedTechIds.length === 0) {
                setSelectedTechIds(techsData.map(t => t.id));
            }
        });
        return unsubscribe;
    }, [orgId]);

    // Calculate week range
    const weekStart = startOfWeek(viewDate, { weekStartsOn: 1 }); // Monday
    const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)); // Mon-Fri

    // Ensure selectedDay is in the visible week
    useEffect(() => {
        const isInWeek = weekDays.some(d => isSameDay(d, selectedDay));
        if (!isInWeek) {
            const currentDayOfWeek = selectedDay.getDay();
            const matchingDay = weekDays.find(d => d.getDay() === currentDayOfWeek);
            setSelectedDay(matchingDay || weekDays[0]);
        }
    }, [viewDate]);

    // Unassigned jobs
    const unassignedJobs = useMemo(() => {
        return jobs.filter(j => !j.assigned_tech_id && ['pending', 'unscheduled', 'quote_pending'].includes(j.status) && !j.archived);
    }, [jobs]);

    // Focused tech data
    const focusedTech = focusedTechId ? technicians.find(t => t.id === focusedTechId) : null;

    // Handle job drop
    const handleJobDrop = async (job: Job, newTime: Date, techId: string | null) => {
        try {
            const updates: Partial<Job> = {
                scheduled_at: Timestamp.fromDate(newTime),
                status: 'scheduled',
            };

            if (techId) {
                const tech = technicians.find(t => t.id === techId);
                if (tech) {
                    updates.assigned_tech_id = tech.id;
                    updates.assigned_tech_name = tech.name;
                    updates.assigned_tech_email = tech.email;
                }
            }

            await updateDoc(doc(db, 'jobs', job.id), updates);
            console.log('Job rescheduled:', job.customer.name, 'to', format(newTime, 'MMM d @ h:mm a'));
        } catch (error) {
            console.error('Failed to update job:', error);
            alert('Failed to reschedule job');
        }
    };

    // Auto-assign all unassigned jobs
    const handleAutoAssign = async () => {
        try {
            const result = await autoAssignJobs(unassignedJobs, technicians, jobs);

            // Save to Firestore
            for (const scheduledJob of result.scheduledJobs) {
                await updateDoc(doc(db, 'jobs', scheduledJob.id), {
                    assigned_tech_id: scheduledJob.assigned_tech_id,
                    assigned_tech_name: scheduledJob.assigned_tech_name,
                    assigned_tech_email: scheduledJob.assigned_tech_email,
                    scheduled_at: scheduledJob.scheduled_at,
                    status: 'scheduled',
                });
            }

            alert(`✅ Scheduled ${result.scheduledJobs.length} jobs\n⚠️ ${result.unscheduledJobs.length} jobs couldn't be scheduled\n\nCheck console for details.`);
            console.log('Scheduling summary:', result.summary);
        } catch (error) {
            console.error('Auto-assign failed:', error);
            alert('Auto-assign failed. Check console for details.');
        }
    };

    // Toggle tech selection
    const toggleTech = (techId: string) => {
        setSelectedTechIds(prev =>
            prev.includes(techId) ? prev.filter(id => id !== techId) : [...prev, techId]
        );
    };

    // Handle clicking on an empty time slot
    const handleEmptySlotClick = (date: Date, hour: number, techId: string | null) => {
        const tech = techId ? technicians.find(t => t.id === techId) : null;
        setQuickCreateSlot({
            date,
            hour,
            techId,
            techName: tech?.name || null
        });
    };

    // Enter focused tech mode
    const handleTechFocus = (techId: string) => {
        setFocusedTechId(techId);
        setTechViewMode('week');
    };

    // Exit focused tech mode
    const handleExitFocus = () => {
        setFocusedTechId(null);
    };

    // ─── Focused Tech View ───────────────────────────────────────────────
    if (focusedTechId && focusedTech) {
        return (
            <DndProvider backend={HTML5Backend}>
                <div className="h-screen flex flex-col bg-gray-50">
                    {/* Header */}
                    <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleExitFocus}
                                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                            >
                                <ArrowLeft size={16} />
                                All Technicians
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-violet-600 text-white rounded-full flex items-center justify-center text-lg font-bold">
                                    {focusedTech.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-gray-900">{focusedTech.name}</h1>
                                    <p className="text-xs text-gray-500">{focusedTech.specialties?.join(', ') || 'General technician'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Day / Week / Month Toggle */}
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setTechViewMode('day')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                                        techViewMode === 'day'
                                            ? 'bg-white text-violet-700 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <Sun size={14} />
                                    Day
                                </button>
                                <button
                                    onClick={() => setTechViewMode('week')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                                        techViewMode === 'week'
                                            ? 'bg-white text-violet-700 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <CalendarDays size={14} />
                                    Week
                                </button>
                                <button
                                    onClick={() => setTechViewMode('month')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                                        techViewMode === 'month'
                                            ? 'bg-white text-violet-700 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <LayoutGrid size={14} />
                                    Month
                                </button>
                            </div>

                            {/* Navigation (day and week modes) */}
                            {(techViewMode === 'week' || techViewMode === 'day') && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => { const d = addDays(techViewMode === 'day' ? selectedDay : viewDate, techViewMode === 'day' ? -1 : -7); if (techViewMode === 'day') setSelectedDay(d); setViewDate(d); }}
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <button
                                        onClick={() => { setViewDate(new Date()); setSelectedDay(new Date()); }}
                                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium"
                                    >
                                        Today
                                    </button>
                                    <button
                                        onClick={() => { const d = addDays(techViewMode === 'day' ? selectedDay : viewDate, techViewMode === 'day' ? 1 : 7); if (techViewMode === 'day') setSelectedDay(d); setViewDate(d); }}
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                    <span className="ml-2 text-sm font-medium text-gray-600">
                                        {techViewMode === 'day'
                                            ? format(selectedDay, 'EEEE, MMMM d, yyyy')
                                            : `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 4), 'MMM d, yyyy')}`
                                        }
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Content */}
                    {techViewMode === 'month' ? (
                        <div className="flex-1 overflow-hidden">
                            <TechMonthView
                                techId={focusedTechId}
                                techName={focusedTech.name}
                                jobs={jobs}
                                viewDate={viewDate}
                                onDateChange={setViewDate}
                                onDayClick={(day) => {
                                    setViewDate(day);
                                    setSelectedDay(day);
                                    setTechViewMode('day');
                                }}
                                onJobClick={setEditingJob}
                                onSlotClick={(day, hour) => handleEmptySlotClick(day, hour, focusedTechId)}
                            />
                        </div>
                    ) : techViewMode === 'day' ? (
                        /* ─── DAY VIEW: Single day, full-width, detailed job cards ─── */
                        <div className="flex-1 overflow-auto">
                            <div className="inline-block min-w-full">
                                {/* Header Row */}
                                <div className="flex sticky top-0 z-20 bg-white border-b-2 border-gray-300">
                                    <div className="w-16 flex-shrink-0 border-r border-gray-300 bg-gray-50"></div>
                                    <div className="flex-1 border-r border-gray-300 p-3 text-center bg-violet-50">
                                        <div className="font-bold text-violet-800">{format(selectedDay, 'EEEE, MMMM d')}</div>
                                        <div className="text-xs text-violet-600 mt-0.5">
                                            {focusedTech.name} — {jobs.filter(j =>
                                                j.assigned_tech_id === focusedTechId &&
                                                j.scheduled_at &&
                                                isSameDay(j.scheduled_at?.toDate?.() || new Date(j.scheduled_at), selectedDay)
                                            ).length} job(s)
                                        </div>
                                    </div>
                                </div>

                                {/* Time Slots with Detailed Job Cards */}
                                {HOURS_DISPLAY.map(hour => {
                                    const slotJobs = jobs.filter(job => {
                                        if (!job.scheduled_at) return false;
                                        if (job.assigned_tech_id !== focusedTechId) return false;
                                        const jobTime = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
                                        return isSameDay(jobTime, selectedDay) && jobTime.getHours() === hour;
                                    });

                                    return (
                                        <div key={hour} className="flex">
                                            <div className="w-16 flex-shrink-0 border-r border-gray-300 text-xs text-gray-500 text-right pr-3 pt-2 bg-gray-50 font-semibold">
                                                {format(setHours(new Date(), hour), 'ha')}
                                            </div>
                                            <div className="flex-1 border-b border-r border-gray-200 relative min-h-[60px]">
                                                {slotJobs.length > 0 ? (
                                                    <div className="p-1">
                                                        {slotJobs.map(job => (
                                                            <DetailedJobCard
                                                                key={job.id}
                                                                job={job}
                                                                onClick={() => setEditingJob(job)}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div
                                                        className="h-full min-h-[60px] cursor-pointer hover:bg-violet-50 transition-colors group flex items-center justify-center"
                                                        onClick={() => handleEmptySlotClick(selectedDay, hour, focusedTechId)}
                                                    >
                                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-violet-400 text-xs font-medium bg-violet-50/80 px-2 py-1 rounded-md border border-violet-200">
                                                            <Plus size={12} />
                                                            New Job
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        /* ─── WEEK VIEW: Mon-Fri columns side by side ─── */
                        <div className="flex-1 overflow-auto">
                            <div className="inline-block min-w-full">
                                {/* Header Row — Day columns */}
                                <div className="flex sticky top-0 z-20 bg-white border-b-2 border-gray-300">
                                    <div className="w-16 flex-shrink-0 border-r border-gray-300 bg-gray-50"></div>
                                    {weekDays.map(day => {
                                        const isToday = isSameDay(day, new Date());
                                        const dayJobCount = jobs.filter(j =>
                                            j.assigned_tech_id === focusedTechId &&
                                            j.scheduled_at &&
                                            isSameDay(j.scheduled_at?.toDate?.() || new Date(j.scheduled_at), day)
                                        ).length;
                                        return (
                                            <div
                                                key={day.toISOString()}
                                                className={`flex-1 min-w-[140px] border-r border-gray-300 p-2 text-center cursor-pointer hover:bg-violet-50 transition-colors ${
                                                    isToday ? 'bg-violet-50' : 'bg-white'
                                                }`}
                                                onClick={() => { setSelectedDay(day); setTechViewMode('day'); }}
                                                title={`Click to view ${format(day, 'EEEE')} details`}
                                            >
                                                <div className={`text-xs font-bold uppercase tracking-wider ${isToday ? 'text-violet-700' : 'text-gray-500'}`}>
                                                    {format(day, 'EEE')}
                                                </div>
                                                <div className={`text-lg font-bold ${isToday ? 'text-violet-700' : 'text-gray-800'}`}>
                                                    {format(day, 'd')}
                                                </div>
                                                {dayJobCount > 0 && (
                                                    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${
                                                        isToday ? 'bg-violet-200 text-violet-700' : 'bg-gray-200 text-gray-600'
                                                    }`}>
                                                        {dayJobCount} job{dayJobCount !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Time Slots — one column per day */}
                                {HOURS_DISPLAY.map(hour => (
                                    <div key={hour} className="flex">
                                        <div className="w-16 flex-shrink-0 border-r border-gray-300 text-xs text-gray-500 text-right pr-3 pt-2 bg-gray-50 font-semibold">
                                            {format(setHours(new Date(), hour), 'ha')}
                                        </div>
                                        {weekDays.map(day => (
                                            <div key={`${day.toISOString()}-${hour}`} className="flex-1 min-w-[140px]">
                                                <TimeSlot
                                                    date={day}
                                                    hour={hour}
                                                    techId={focusedTechId}
                                                    jobs={jobs}
                                                    unassignedJobs={unassignedJobs}
                                                    onDrop={handleJobDrop}
                                                    onJobClick={setEditingJob}
                                                    onEmptyClick={handleEmptySlotClick}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Edit Job Modal */}
                    {editingJob && (
                        <EditJobModal
                            job={editingJob}
                            onClose={() => setEditingJob(null)}
                        />
                    )}

                    {/* Quick Create Job Modal */}
                    {quickCreateSlot && (
                        <QuickCreateJobModal
                            date={quickCreateSlot.date}
                            hour={quickCreateSlot.hour}
                            techId={quickCreateSlot.techId}
                            techName={quickCreateSlot.techName}
                            onClose={() => setQuickCreateSlot(null)}
                            onJobCreated={() => {
                                // Job will appear via Firestore listener
                            }}
                        />
                    )}
                </div>
            </DndProvider>
        );
    }

    // ─── Main Multi-Tech Calendar View ───────────────────────────────────
    return (
        <DndProvider backend={HTML5Backend}>
            <div className="h-screen flex flex-col bg-gray-50">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Calendar className="text-violet-600" />
                            Schedule Calendar
                        </h1>

                        {/* Week Navigation */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setViewDate(addDays(viewDate, -7))}
                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
                            >
                                ← Prev Week
                            </button>
                            <button
                                onClick={() => setViewDate(new Date())}
                                className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-sm"
                            >
                                Today
                            </button>
                            <button
                                onClick={() => setViewDate(addDays(viewDate, 7))}
                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
                            >
                                Next Week →
                            </button>
                            <span className="ml-2 text-sm font-medium">
                                {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 4), 'MMM d, yyyy')}
                            </span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleAutoAssign}
                            disabled={unassignedJobs.length === 0}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded flex items-center gap-2"
                        >
                            <Zap size={16} />
                            Auto-Assign ({unassignedJobs.length})
                        </button>
                        <button
                            onClick={() => setShowMap(!showMap)}
                            className={`px-4 py-2 rounded flex items-center gap-2 transition-all ${showMap ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                        >
                            {showMap ? <EyeOff size={16} /> : <Eye size={16} />}
                            {showMap ? 'Hide Map' : 'Show Map'}
                        </button>
                    </div>
                </div>

                {/* Main Content: Calendar + Map */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Calendar View */}
                    <div
                        className="flex flex-col overflow-hidden border-r border-gray-200 transition-all duration-300 ease-in-out"
                        style={{ width: showMap ? '66.667%' : '100%' }}
                    >
                        {/* Technician Filter */}
                        <div className="bg-white border-b border-gray-200 p-3 flex items-center gap-2 overflow-x-auto">
                            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter:</span>
                            <button
                                onClick={() => setShowUnassigned(!showUnassigned)}
                                className={`px-3 py-1 rounded text-xs ${showUnassigned ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}
                            >
                                Unassigned ({unassignedJobs.length})
                            </button>
                            {technicians.map(tech => (
                                <button
                                    key={tech.id}
                                    onClick={() => toggleTech(tech.id)}
                                    className={`px-3 py-1 rounded text-xs whitespace-nowrap ${selectedTechIds.includes(tech.id)
                                        ? 'bg-violet-600 text-white'
                                        : 'bg-gray-200 text-gray-700'
                                        }`}
                                >
                                    {tech.name}
                                </button>
                            ))}
                        </div>

                        {/* Day Selector Tabs */}
                        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 overflow-x-auto">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Active Day:</span>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                {weekDays.map(day => {
                                    const isSelected = isSameDay(day, selectedDay);
                                    return (
                                        <button
                                            key={day.toISOString()}
                                            onClick={() => setSelectedDay(day)}
                                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${
                                                isSelected
                                                    ? 'bg-white text-violet-700 shadow-sm'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            {format(day, 'EEEE')} ({format(day, 'MMM d')})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Calendar Grid */}
                        <div className="flex-1 overflow-auto">
                            <div className="inline-block min-w-full">
                                {/* Header Row */}
                                <div className="flex sticky top-0 z-20 bg-white border-b-2 border-gray-300">
                                    <div className="w-16 flex-shrink-0 border-r border-gray-300 bg-gray-50"></div>
                                    {showUnassigned && (
                                        <div className="w-32 flex-shrink-0 border-r border-gray-300 p-3 text-center font-bold text-xs uppercase tracking-wider text-gray-500 bg-gray-100">
                                            Unassigned
                                        </div>
                                    )}
                                    {selectedTechIds.map(techId => {
                                        const tech = technicians.find(t => t.id === techId);
                                        return (
                                            <div
                                                key={techId}
                                                className="flex-1 min-w-[150px] border-r border-gray-300 p-2 text-center bg-white flex flex-col justify-center cursor-pointer hover:bg-violet-50 transition-colors group"
                                                onClick={() => handleTechFocus(techId)}
                                                title={`Click to view ${tech?.name}'s individual schedule`}
                                            >
                                                <div className="font-bold text-sm text-slate-800 group-hover:text-violet-700 transition-colors">
                                                    {tech?.name}
                                                </div>
                                                <div className="text-[10px] font-medium text-gray-400 mt-0.5 truncate max-w-[140px] mx-auto group-hover:text-violet-500 transition-colors" title={tech?.specialties?.join(', ')}>
                                                    {tech?.specialties?.join(', ') || 'General tech'}
                                                </div>
                                                <div className="text-[9px] text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 font-medium">
                                                    Click for solo view →
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Time Slots */}
                                {HOURS_DISPLAY.map(hour => (
                                    <div key={hour} className="flex">
                                        {/* Hour Label */}
                                        <div className="w-16 flex-shrink-0 border-r border-gray-300 text-xs text-gray-500 text-right pr-3 pt-2 bg-gray-50 font-semibold">
                                            {format(setHours(new Date(), hour), 'ha')}
                                        </div>

                                        {/* Unassigned Column */}
                                        {showUnassigned && (
                                            <div className="w-32 flex-shrink-0 border-r border-gray-300">
                                                <TimeSlot
                                                    key={`unassigned-${selectedDay.toISOString()}-${hour}`}
                                                    date={selectedDay}
                                                    hour={hour}
                                                    techId={null}
                                                    jobs={unassignedJobs}
                                                    unassignedJobs={unassignedJobs}
                                                    onDrop={handleJobDrop}
                                                    onJobClick={setEditingJob}
                                                />
                                            </div>
                                        )}

                                        {/* Tech Columns */}
                                        {selectedTechIds.map(techId => (
                                            <div key={`${techId}-${selectedDay.toISOString()}-${hour}`} className="flex-1 min-w-[150px]">
                                                <TimeSlot
                                                    date={selectedDay}
                                                    hour={hour}
                                                    techId={techId}
                                                    jobs={jobs}
                                                    unassignedJobs={unassignedJobs}
                                                    onDrop={handleJobDrop}
                                                    onJobClick={setEditingJob}
                                                    onEmptyClick={handleEmptySlotClick}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Map View — with smooth collapse transition */}
                    <div
                        className="bg-white flex flex-col transition-all duration-300 ease-in-out overflow-hidden"
                        style={{
                            width: showMap ? '33.333%' : '0%',
                            minWidth: showMap ? '300px' : '0px',
                            opacity: showMap ? 1 : 0,
                        }}
                    >
                        <div className="p-3 border-b border-gray-200">
                            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                <MapPin size={18} className="text-blue-600" />
                                Route Map
                            </h2>
                            <p className="text-xs text-gray-600 mt-1">
                                Showing routes for selected technicians
                            </p>
                        </div>
                        <div className="flex-1">
                            <TechnicianMap
                                technicians={technicians.filter(t => selectedTechIds.includes(t.id))}
                                jobs={jobs}
                                viewDate={viewDate}
                                selectedTechIds={selectedTechIds}
                            />
                        </div>
                    </div>
                </div>

                {/* Edit Job Modal */}
                {editingJob && (
                    <EditJobModal
                        job={editingJob}
                        onClose={() => setEditingJob(null)}
                    />
                )}

                {/* Quick Create Job Modal */}
                {quickCreateSlot && (
                    <QuickCreateJobModal
                        date={quickCreateSlot.date}
                        hour={quickCreateSlot.hour}
                        techId={quickCreateSlot.techId}
                        techName={quickCreateSlot.techName}
                        onClose={() => setQuickCreateSlot(null)}
                        onJobCreated={() => {
                            // Job will appear via Firestore listener
                        }}
                    />
                )}
            </div>
        </DndProvider>
    );
};
