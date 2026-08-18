import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp, deleteField, collectionGroup, deleteDoc, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import { Job, UserProfile } from '../types';
import { UnscheduledList } from '../components/dispatcher/UnscheduledList';
import { TimelineGrid, ViewMode } from '../components/dispatcher/TimelineGrid';
import { TechnicianMap } from '../components/dispatcher/TechnicianMap';
import { TechStatusPanel } from '../components/dispatcher/TechStatusPanel';
import { AssignTechModal } from '../components/AssignTechModal';
import { AddTechnicianModal } from '../components/dispatcher/AddTechnicianModal';
import { AutoScheduleModal } from '../components/dispatcher/AutoScheduleModal';
import { ScheduledJobAssignment } from '../lib/multiTechScheduler';
import { getAutoAssignment } from '../lib/techMatchingEngine';
import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus,
    AlertCircle, Users, Clock, CheckCircle, MapIcon,
    CalendarDays, LayoutGrid, Sun, AlertTriangle, ShieldAlert, Wrench, X, Bell,
    Car, Navigation, ArrowRight, Sparkles
} from 'lucide-react';
import { format, addDays, subDays, isToday, isSameDay, addWeeks, subWeeks, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { useAuth } from '../auth/AuthProvider';
import { evaluateSlotViability, estimateDriveTime } from '../lib/travelEstimator';

// ============================================================================
// Robust Timestamp Helper
// ============================================================================
const parseFirestoreTimestamp = (ts: any): Date | null => {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') {
        try {
            return ts.toDate();
        } catch {
            // Ignore
        }
    }
    if (ts instanceof Date) {
        return ts;
    }
    if (ts.seconds !== undefined && ts.seconds !== null) {
        const secs = Number(ts.seconds);
        if (!isNaN(secs)) return new Date(secs * 1000);
    }
    if (ts._seconds !== undefined && ts._seconds !== null) {
        const secs = Number(ts._seconds);
        if (!isNaN(secs)) return new Date(secs * 1000);
    }
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
        return d;
    }
    return null;
};

export const DispatcherConsole: React.FC = () => {
    const { user, organization } = useAuth();
    const navigate = useNavigate();
    const dispatchMode = (organization?.settings?.dispatchMode as 'assign_only' | 'assign_and_schedule') || 'assign_and_schedule';
    const [jobs, setJobs] = useState<Job[]>([]);
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [viewDate, setViewDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [showMap, setShowMap] = useState(false);

    const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isAddTechModalOpen, setIsAddTechModalOpen] = useState(false);
    const [isTechPanelOpen, setIsTechPanelOpen] = useState(true);
    const [isJobsPanelCollapsed, setIsJobsPanelCollapsed] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);

    // Auto-Scheduler state & Inventory data
    const [isAutoScheduleModalOpen, setIsAutoScheduleModalOpen] = useState(false);
    const [materials, setMaterials] = useState<any[]>([]);
    const [tools, setTools] = useState<any[]>([]);

    // Quick assign modal state
    const [assignModalJob, setAssignModalJob] = useState<Job | null>(null);
    // Drag tracking
    const [draggingJob, setDraggingJob] = useState<Job | null>(null);
    // Drop warning modal
    const [dropWarning, setDropWarning] = useState<{
        jobId: string;
        techId: string;
        startTime: Date;
        suggestedAdjustTime?: Date;
        warnings: {
            type: 'overload' | 'skills' | 'hours' | 'travel';
            message: string;
            detail?: string;
            transitDetail?: {
                from: string;
                to: string;
                miles: number;
                durationMinutes: number;
                delayMinutes: number;
                trafficLevel: string;
                trafficReason: string;
            };
        }[];
        techName: string;
        jobName: string;
    } | null>(null);

    // Reschedule requests
    interface RescheduleRequest {
        id: string;
        jobId: string;
        techId: string;
        techName: string;
        reason: string;
        status: string;
        customerName: string;
        requestedNewTime?: any;
        currentScheduledAt?: any;
        createdAt?: any;
    }
    const [rescheduleRequests, setRescheduleRequests] = useState<RescheduleRequest[]>([]);
    const [showReschedulePanel, setShowReschedulePanel] = useState(false);

    const initialized = React.useRef(false);

    const ROUTE_COLORS = ['#7c3aed', '#db2777', '#059669', '#d97706', '#2563eb'];

    // ========================================================================
    // Data Fetching
    // ========================================================================
    useEffect(() => {
        if (!user) return;

        const orgId = user.org_id || 'demo-org';
        const role = user?.role;
        const email = user?.email;

        // 1. Fetch Technicians
        const usersRef = collection(db, 'users');
        let techQuery;
        if (role === 'technician') {
            techQuery = query(usersRef, where('email', '==', email), where('org_id', '==', orgId));
        } else {
            techQuery = query(usersRef, where('role', '==', 'technician'), where('org_id', '==', orgId));
        }

        const unsubscribeTechs = onSnapshot(techQuery, (snapshot) => {
            const techs = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as UserProfile))
                .filter(t => t.archived !== true && t.status !== 'archived');
            setTechnicians(techs);
        }, (error) => {
            console.error("Error fetching technicians:", error);
            setLoading(false);
        });

        // 2. Fetch Jobs
        const jobsRef = collection(db, 'jobs');
        const jobsQuery = query(jobsRef,
            where('org_id', '==', orgId),
            where('status', 'in', ['pending', 'assigned', 'scheduled', 'in_progress'])
        );

        const unsubscribeJobs = onSnapshot(jobsQuery, (snapshot) => {
            const fetchedJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
            setJobs(fetchedJobs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching jobs:", error);
            setLoading(false);
        });

        // 3. Fetch Materials Inventory
        const materialsRef = collection(db, 'materials');
        const matQuery = query(materialsRef, where('org_id', '==', orgId));
        const unsubscribeMaterials = onSnapshot(matQuery, (snapshot) => {
            setMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => console.warn('Error fetching materials:', err));

        // 4. Fetch Tools Inventory
        const toolsRef = collection(db, 'tools');
        const toolQuery = query(toolsRef, where('org_id', '==', orgId));
        const unsubscribeTools = onSnapshot(toolQuery, (snapshot) => {
            setTools(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => console.warn('Error fetching tools:', err));

        return () => {
            unsubscribeTechs();
            unsubscribeJobs();
            unsubscribeMaterials();
            unsubscribeTools();
        };
    }, [user]);

    // Initialize selected techs
    useEffect(() => {
        if (!initialized.current && technicians.length > 0) {
            setSelectedTechIds(technicians.map(t => t.id));
            initialized.current = true;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [technicians]);

    // ========================================================================
    // Keyboard Shortcuts
    // ========================================================================
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    if (viewMode === 'month') setViewDate(prev => subMonths(prev, 1));
                    else if (viewMode === 'week') setViewDate(prev => subWeeks(prev, 1));
                    else setViewDate(prev => subDays(prev, 1));
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (viewMode === 'month') setViewDate(prev => addMonths(prev, 1));
                    else if (viewMode === 'week') setViewDate(prev => addWeeks(prev, 1));
                    else setViewDate(prev => addDays(prev, 1));
                    break;
                case 't':
                case 'T':
                    e.preventDefault();
                    setShowMap(prev => !prev);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewMode]);

    // ========================================================================
    // Reschedule Requests Listener
    // ========================================================================
    useEffect(() => {
        if (!user || dispatchMode !== 'assign_and_schedule') return;
        const orgId = user.org_id || 'demo-org';

        // Listen to all scheduled jobs for this org, then poll their rescheduleRequests
        const jobsQ = query(
            collection(db, 'jobs'),
            where('org_id', '==', orgId),
            where('status', 'in', ['scheduled', 'assigned', 'in_progress'])
        );

        const unsub = onSnapshot(jobsQ, async (snapshot) => {
            const allRequests: RescheduleRequest[] = [];
            for (const jobDoc of snapshot.docs) {
                try {
                    const reqSnap = await getDocs(collection(db, 'jobs', jobDoc.id, 'rescheduleRequests'));
                    reqSnap.forEach(reqDoc => {
                        const data = reqDoc.data();
                        if (data.status === 'pending') {
                            allRequests.push({
                                id: reqDoc.id,
                                jobId: jobDoc.id,
                                techId: data.techId,
                                techName: data.techName || 'Unknown',
                                reason: data.reason || '',
                                status: data.status,
                                customerName: data.customerName || '',
                                requestedNewTime: data.requestedNewTime,
                                currentScheduledAt: data.currentScheduledAt,
                                createdAt: data.createdAt,
                            });
                        }
                    });
                } catch (e) {
                    // Subcollection may not exist yet
                }
            }
            setRescheduleRequests(allRequests);
        });

        return () => unsub();
    }, [user, dispatchMode]);

    const handleApproveReschedule = useCallback(async (request: RescheduleRequest) => {
        try {
            const jobRef = doc(db, 'jobs', request.jobId);

        if (request.requestedNewTime) {
            const newTime = parseFirestoreTimestamp(request.requestedNewTime) || new Date();
            await updateDoc(jobRef, {
                scheduled_at: Timestamp.fromDate(newTime),
                status: 'scheduled'
            });
        }

            // Delete the request
            const reqRef = doc(db, 'jobs', request.jobId, 'rescheduleRequests', request.id);
            await deleteDoc(reqRef);

            toast.success(`Reschedule approved for "${request.customerName}"`);
            setRescheduleRequests(prev => prev.filter(r => r.id !== request.id));
        } catch (error) {
            console.error('Error approving reschedule:', error);
            toast.error('Failed to approve reschedule.');
        }
    }, []);

    const handleDenyReschedule = useCallback(async (request: RescheduleRequest) => {
        try {
            const reqRef = doc(db, 'jobs', request.jobId, 'rescheduleRequests', request.id);
            await deleteDoc(reqRef);

            toast('Reschedule request denied', { icon: '❌' });
            setRescheduleRequests(prev => prev.filter(r => r.id !== request.id));
        } catch (error) {
            console.error('Error denying reschedule:', error);
            toast.error('Failed to deny reschedule request.');
        }
    }, []);

    // ========================================================================
    // KPI Stats
    // ========================================================================
    const kpiStats = useMemo(() => {
        const unassigned = jobs.filter(j => j.status === 'pending').length;
        const todayScheduled = jobs.filter(j => {
            const schedDate = parseFirestoreTimestamp(j.scheduled_at);
            return j.status === 'scheduled' && schedDate && isSameDay(schedDate, viewDate);
        }).length;
        const inProgress = jobs.filter(j => j.status === 'in_progress').length;
        const availableTechs = technicians.filter(t => t.status !== 'inactive').length;

        // Check for scheduling conflicts
        let conflicts = 0;
        for (const tech of technicians) {
            const techJobs = jobs.filter(j => {
                const schedDate = parseFirestoreTimestamp(j.scheduled_at);
                return j.assigned_tech_id === tech.id && schedDate && ['scheduled', 'in_progress'].includes(j.status);
            });
            for (let i = 0; i < techJobs.length; i++) {
                for (let k = i + 1; k < techJobs.length; k++) {
                    const a = techJobs[i];
                    const b = techJobs[k];
                    const aStart = parseFirestoreTimestamp(a.scheduled_at) || new Date();
                    const bStart = parseFirestoreTimestamp(b.scheduled_at) || new Date();
                    const aEnd = new Date(aStart.getTime() + (a.estimated_duration || 60) * 60000);
                    const bEnd = new Date(bStart.getTime() + (b.estimated_duration || 60) * 60000);
                    if (aStart < bEnd && aEnd > bStart) conflicts++;
                }
            }
        }

        return { unassigned, todayScheduled, inProgress, availableTechs, conflicts };
    }, [jobs, technicians, viewDate]);

    // ========================================================================
    // Handlers
    // ========================================================================
    const toggleTech = (techId: string) => {
        setSelectedTechIds(prev =>
            prev.includes(techId)
                ? prev.filter(id => id !== techId)
                : [...prev, techId]
        );
    };

    const handleJobDrop = async (jobId: string, techId: string, startTime: Date) => {
        const tech = technicians.find(t => t.id === techId);
        const job = jobs.find(j => j.id === jobId);
        if (!tech || !job) return;

        // Use actual job duration instead of hardcoded 60
        const jobDuration = job.estimated_duration || 60;
        const endTime = new Date(startTime.getTime() + jobDuration * 60000);

        const hasConflict = jobs.some(j => {
            const schedDate = parseFirestoreTimestamp(j.scheduled_at);
            if (j.assigned_tech_id !== techId || j.id === jobId || !schedDate) return false;
            const jStart = schedDate;
            const jEnd = new Date(jStart.getTime() + (j.estimated_duration || 60) * 60000);
            return (startTime < jEnd && endTime > jStart);
        });

        if (hasConflict) {
            toast.error("This time slot overlaps with another job!", { duration: 4000 });
            return;
        }

        // Check for warnings: overload, missing skills, outside hours, travel & traffic conflicts
        const warnings: {
            type: 'overload' | 'skills' | 'hours' | 'travel';
            message: string;
            detail?: string;
            transitDetail?: {
                from: string;
                to: string;
                miles: number;
                durationMinutes: number;
                delayMinutes: number;
                trafficLevel: string;
                trafficReason: string;
            };
        }[] = [];

        // 1. Evaluate Travel & Historical Traffic Viability
        const viability = evaluateSlotViability(job, tech, jobs, startTime, jobDuration);
        let suggestedAdjustTime: Date | undefined;

        if (viability.status.startsWith('conflict')) {
            const inc = viability.incomingTransit;
            suggestedAdjustTime = viability.earliestViableStart;
            warnings.push({
                type: 'travel',
                message: `Insufficient travel time (~${inc?.trafficDurationMinutes || 20}m required)`,
                detail: `Drive from ${inc?.originLabel || 'previous stop'} requires ~${inc?.trafficDurationMinutes} min (${inc?.distanceMiles} mi) with ${inc?.trafficLevel} traffic (${inc?.trafficReason}). Earliest realistic arrival is ${viability.earliestViableStart ? format(viability.earliestViableStart, 'h:mm a') : 'later'}.`,
                transitDetail: inc ? {
                    from: inc.originLabel,
                    to: inc.destinationLabel,
                    miles: inc.distanceMiles,
                    durationMinutes: inc.trafficDurationMinutes,
                    delayMinutes: inc.delayMinutes,
                    trafficLevel: inc.trafficLevel,
                    trafficReason: inc.trafficReason
                } : undefined
            });
        } else if (viability.status === 'tight') {
            const inc = viability.incomingTransit;
            warnings.push({
                type: 'travel',
                message: `Tight travel schedule (~${inc?.trafficDurationMinutes || 15}m drive)`,
                detail: `Travel buffer from ${inc?.originLabel} is tight with ${inc?.trafficLevel} traffic. Minimal margin for unexpected road delays.`,
                transitDetail: inc ? {
                    from: inc.originLabel,
                    to: inc.destinationLabel,
                    miles: inc.distanceMiles,
                    durationMinutes: inc.trafficDurationMinutes,
                    delayMinutes: inc.delayMinutes,
                    trafficLevel: inc.trafficLevel,
                    trafficReason: inc.trafficReason
                } : undefined
            });
        }

        // 2. Overload check
        const techJobsToday = jobs.filter(j => {
            const schedDate = parseFirestoreTimestamp(j.scheduled_at);
            return j.assigned_tech_id === techId &&
                   j.id !== jobId &&
                   schedDate &&
                   isSameDay(schedDate, startTime);
        });
        const maxJobs = tech.schedulingPreferences?.jobPreferences?.maxJobsPerDay || 6;
        if (techJobsToday.length + 1 > maxJobs) {
            warnings.push({
                type: 'overload',
                message: `${tech.name} is over their daily limit`,
                detail: `This would be job ${techJobsToday.length + 1} of ${maxJobs} max. The tech may not be able to complete all jobs on time.`
            });
        } else if (techJobsToday.length + 1 >= maxJobs) {
            warnings.push({
                type: 'overload',
                message: `${tech.name} will be at full capacity`,
                detail: `This would be job ${techJobsToday.length + 1} of ${maxJobs} max — no room for emergency jobs.`
            });
        }

        // 3. Qualification / skill check
        const requiredSkills = [
            ...(job.intakeReview?.aiRecommendation?.skillsRequired || []),
            ...(job.aiRecommendation?.skillsRequired || []),
        ].filter((s, i, arr) => Boolean(s) && arr.indexOf(s) === i); // dedupe

        if (requiredSkills.length > 0) {
            const techSkills = (tech.specialties || []).map(s => s.toLowerCase());
            const missingSkills = requiredSkills.filter(skill =>
                !techSkills.some(ts => ts.includes(skill.toLowerCase()) || skill.toLowerCase().includes(ts))
            );
            if (missingSkills.length > 0) {
                warnings.push({
                    type: 'skills',
                    message: `${tech.name} may lack required qualifications`,
                    detail: `Missing: ${missingSkills.join(', ')}. Tech has: ${tech.specialties?.join(', ') || 'none listed'}.`
                });
            }
        }

        // 4. Outside working hours check
        const dropHour = startTime.getHours();
        const dayOfWeek = startTime.getDay();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayKey = dayNames[dayOfWeek] as string;
        const dayAvail = (tech.weeklyAvailability as any)?.[dayKey];
        if (dayAvail && 'available' in dayAvail) {
            if (!dayAvail.available) {
                warnings.push({
                    type: 'hours',
                    message: `${tech.name} is not scheduled to work this day`,
                    detail: `${format(startTime, 'EEEE')} is marked as a day off for this technician.`
                });
            } else {
                const workStart = parseInt(dayAvail.startTime?.split(':')[0] || '8');
                const workEnd = parseInt(dayAvail.endTime?.split(':')[0] || '17');
                if (dropHour < workStart || dropHour >= workEnd) {
                    warnings.push({
                        type: 'hours',
                        message: `Job is outside ${tech.name}'s working hours`,
                        detail: `Tech works ${workStart}:00–${workEnd}:00 but job starts at ${format(startTime, 'h:mm a')}.`
                    });
                }
            }
        }

        // If warnings, show confirmation modal
        if (warnings.length > 0) {
            setDropWarning({
                jobId,
                techId,
                startTime,
                suggestedAdjustTime,
                warnings,
                techName: tech.name || 'Unnamed Tech',
                jobName: job.customer.name || 'Unnamed Job'
            });
            return;
        }

        // No warnings — schedule directly
        await executeSchedule(jobId, techId, startTime, tech);
    };

    const executeSchedule = async (jobId: string, techId: string, startTime: Date, tech?: UserProfile) => {
        const techInfo = tech || technicians.find(t => t.id === techId);
        if (!techInfo) return;
        try {
            const jobRef = doc(db, 'jobs', jobId);

            if (dispatchMode === 'assign_only') {
                // Assign Only: set tech but no scheduled time — tech schedules themselves
                await updateDoc(jobRef, {
                    assigned_tech_id: techId,
                    assigned_tech_name: techInfo.name,
                    status: 'assigned'
                });
                toast.success(`Job assigned to ${techInfo.name} — they'll schedule it themselves`);
            } else {
                // Assign & Schedule: set tech AND time
                await updateDoc(jobRef, {
                    assigned_tech_id: techId,
                    assigned_tech_name: techInfo.name,
                    scheduled_at: Timestamp.fromDate(startTime),
                    status: 'scheduled'
                });
                toast.success(`Job scheduled for ${techInfo.name} at ${format(startTime, 'h:mm a')}`);
            }
        } catch (error) {
            console.error("Error scheduling job:", error);
            toast.error("Failed to schedule job. Please try again.");
        }
    };

    const handleConfirmDrop = async () => {
        if (!dropWarning) return;
        await executeSchedule(dropWarning.jobId, dropWarning.techId, dropWarning.startTime);
        setDropWarning(null);
    };

    const handleUnscheduleJob = useCallback(async (jobId: string) => {
        const job = jobs.find(j => j.id === jobId);
        if (!job) return;
        try {
            const jobRef = doc(db, 'jobs', jobId);
            await updateDoc(jobRef, {
                assigned_tech_id: deleteField(),
                assigned_tech_name: deleteField(),
                scheduled_at: deleteField(),
                status: 'pending'
            });
            toast.success(`"${job.customer.name}" moved back to unscheduled`);
            setDraggingJob(null);
        } catch (error) {
            console.error('Error unscheduling job:', error);
            toast.error('Failed to unschedule job. Please try again.');
        }
    }, [jobs]);

    const handleViewJob = useCallback((jobId: string) => {
        navigate(`/jobs/${jobId}`);
    }, [navigate]);

    const handleQuickAssign = useCallback((job: Job) => {
        setAssignModalJob(job);
    }, []);

    const handleAutoAssignFromPanel = useCallback((techId: string) => {
        const unscheduled = jobs.filter(j => j.status === 'pending');
        if (unscheduled.length === 0) {
            toast.error('No unscheduled jobs to assign');
            return;
        }
        // Pick the highest priority unscheduled job
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const sorted = [...unscheduled].sort((a, b) =>
            (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
        );
        const nextJob = sorted[0];
        const result = getAutoAssignment(technicians, nextJob, jobs, viewDate);
        if (result) {
            handleJobDrop(nextJob.id, techId, result.slot.start);
        } else {
            toast.error('No available time slots for this technician today');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobs, technicians, viewDate]);

    const handleAssignFromModal = async (techId: string, techName: string, scheduledTime?: Date) => {
        if (!assignModalJob) return;
        if (scheduledTime) {
            await handleJobDrop(assignModalJob.id, techId, scheduledTime);
        } else {
            // Assign without specific time — auto-pick earliest slot
            const result = getAutoAssignment(technicians, assignModalJob, jobs, viewDate);
            if (result) {
                await handleJobDrop(assignModalJob.id, techId, result.slot.start);
            } else {
                // Fallback: assign at 9 AM
                const fallbackTime = new Date(viewDate);
                fallbackTime.setHours(9, 0, 0, 0);
                await handleJobDrop(assignModalJob.id, techId, fallbackTime);
            }
        }
        setAssignModalJob(null);
    };

    const handleApplyAutoSchedule = async (assignments: ScheduledJobAssignment[]) => {
        try {
            const updatePromises = assignments.map(a => {
                const jobRef = doc(db, 'jobs', a.job.id);
                if (dispatchMode === 'assign_only') {
                    return updateDoc(jobRef, {
                        assigned_tech_id: a.techId,
                        assigned_tech_name: a.techName,
                        status: 'assigned'
                    });
                } else {
                    return updateDoc(jobRef, {
                        assigned_tech_id: a.techId,
                        assigned_tech_name: a.techName,
                        scheduled_at: Timestamp.fromDate(a.scheduledAt),
                        status: 'scheduled'
                    });
                }
            });
            await Promise.all(updatePromises);
            toast.success(`Successfully assigned & scheduled ${assignments.length} jobs!`);
        } catch (error) {
            console.error('Error applying auto-schedule batch:', error);
            toast.error('Failed to apply auto-schedule batch.');
            throw error;
        }
    };

    // Format date label based on view mode
    const dateLabel = useMemo(() => {
        if (viewMode === 'month') return format(viewDate, 'MMMM yyyy');
        if (viewMode === 'week') {
            const ws = startOfWeek(viewDate, { weekStartsOn: 1 });
            const we = endOfWeek(viewDate, { weekStartsOn: 1 });
            return `${format(ws, 'MMM d')} - ${format(we, 'MMM d, yyyy')}`;
        }
        return format(viewDate, 'EEEE, MMM d, yyyy');
    }, [viewDate, viewMode]);

    // Handle day click from week/month views — drill down to day view
    const handleDayClick = useCallback((date: Date) => {
        setViewDate(date);
        setViewMode('day');
    }, []);

    // Handle job selection for availability highlighting
    const handleJobSelect = useCallback((job: Job | null) => {
        setSelectedJob(job);
    }, []);

    // ========================================================================
    // Render
    // ========================================================================
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <div className="text-center space-y-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent mx-auto" />
                    <p className="text-gray-500 font-medium">Loading Dispatch Console...</p>
                </div>
            </div>
        );
    }

    const unscheduledJobs = jobs.filter(j => ['pending', 'unscheduled', 'quote_pending'].includes(j.status) && !j.archived);

    // Navigation helpers
    const navigateBack = () => {
        if (viewMode === 'month') setViewDate(subMonths(viewDate, 1));
        else if (viewMode === 'week') setViewDate(subWeeks(viewDate, 1));
        else setViewDate(subDays(viewDate, 1));
    };
    const navigateForward = () => {
        if (viewMode === 'month') setViewDate(addMonths(viewDate, 1));
        else if (viewMode === 'week') setViewDate(addWeeks(viewDate, 1));
        else setViewDate(addDays(viewDate, 1));
    };

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="flex flex-col h-[calc(100vh-48px)] bg-gray-100">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 px-5 py-2.5 flex justify-between items-center shadow-sm z-20">
                    <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-blue-600" />
                        Dispatch Console
                        {dispatchMode === 'assign_only' && (
                            <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">Assign Only Mode</span>
                        )}
                    </h1>

                    {/* Date Navigator */}
                    <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-0.5 border border-gray-200">
                        <button onClick={navigateBack} className="p-1.5 hover:bg-white rounded transition-all" title={`Previous ${viewMode} (← key)`}>
                            <ChevronLeft className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                            onClick={() => setViewDate(new Date())}
                            className={`px-3 py-1 text-sm font-medium rounded transition-all ${
                                isToday(viewDate) ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-white'
                            }`}
                        >
                            {viewMode === 'day' ? 'Go to Today' : viewMode === 'week' ? 'This Week' : 'This Month'}
                        </button>
                        <span className="font-medium text-gray-700 min-w-[130px] text-center text-sm">
                            {dateLabel}
                        </span>
                        <button onClick={navigateForward} className="p-1.5 hover:bg-white rounded transition-all" title={`Next ${viewMode} (→ key)`}>
                            <ChevronRight className="w-4 h-4 text-gray-600" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* View Mode Toggle: Day / Week / Month */}
                        <div className="flex bg-gray-100 p-0.5 rounded-lg">
                            <button
                                onClick={() => { setViewMode('day'); setShowMap(false); }}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                                    viewMode === 'day' && !showMap ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                <Sun className="w-3.5 h-3.5" />
                                Day
                            </button>
                            <button
                                onClick={() => { setViewMode('week'); setShowMap(false); }}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                                    viewMode === 'week' && !showMap ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                <CalendarDays className="w-3.5 h-3.5" />
                                Week
                            </button>
                            <button
                                onClick={() => { setViewMode('month'); setShowMap(false); }}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                                    viewMode === 'month' && !showMap ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                Month
                            </button>
                            <button
                                onClick={() => setShowMap(true)}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                                    showMap ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
                                }`}
                                title="Map view (T key)"
                            >
                                <MapIcon className="w-3.5 h-3.5" />
                                Map
                            </button>
                        </div>

                        {/* AI Auto-Schedule Button */}
                        <button
                            onClick={() => setIsAutoScheduleModalOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-indigo-200 hover:shadow-md transition-all cursor-pointer group"
                            title="Run AI Multi-Technician Auto-Scheduler"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-amber-300 group-hover:rotate-12 transition-transform animate-pulse" />
                            <span>Auto-Schedule</span>
                        </button>

                        {/* Tech Filter Dropdown */}
                        <div className="relative border-l pl-3 border-gray-200">
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                <Users className="w-4 h-4 text-gray-400" />
                                <span>{selectedTechIds.length} Tech{selectedTechIds.length !== 1 ? 's' : ''}</span>
                                <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${isFilterOpen ? '-rotate-90' : 'rotate-0'}`} />
                            </button>

                            {isFilterOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)} />
                                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 p-2 max-h-80 overflow-y-auto z-20">
                                        <div className="mb-2 pb-2 border-b border-gray-100 flex justify-between items-center">
                                            <div className="space-x-2">
                                                <button
                                                    onClick={() => setSelectedTechIds(technicians.map(t => t.id))}
                                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                                >
                                                    All
                                                </button>
                                                <span className="text-gray-300">|</span>
                                                <button
                                                    onClick={() => setSelectedTechIds([])}
                                                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                                                >
                                                    None
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setIsFilterOpen(false);
                                                    setIsAddTechModalOpen(true);
                                                }}
                                                className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100"
                                            >
                                                <Plus className="w-3 h-3" />
                                                <span>Add Tech</span>
                                            </button>
                                        </div>
                                        <div className="space-y-0.5">
                                            {technicians.map((tech, index) => {
                                                const techJobCount = jobs.filter(j => {
                                                    const schedDate = parseFirestoreTimestamp(j.scheduled_at);
                                                    return j.assigned_tech_id === tech.id &&
                                                           ['scheduled', 'in_progress'].includes(j.status) &&
                                                           schedDate &&
                                                           isSameDay(schedDate, viewDate);
                                                }).length;
                                                const isActive = tech.status !== 'inactive';

                                                return (
                                                    <label key={tech.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedTechIds.includes(tech.id)}
                                                            onChange={() => toggleTech(tech.id)}
                                                            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300"
                                                        />
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }} />
                                                            <span className="text-sm text-gray-700 truncate font-medium">{tech.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] text-gray-400 font-medium">{techJobCount} jobs</span>
                                                            <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Reschedule Requests Bell */}
                        {dispatchMode === 'assign_and_schedule' && (
                            <div className="relative border-l pl-3 border-gray-200">
                                <button
                                    onClick={() => setShowReschedulePanel(!showReschedulePanel)}
                                    className={`relative p-2 rounded-lg transition-all ${rescheduleRequests.length > 0 ? 'bg-amber-50 hover:bg-amber-100 text-amber-700' : 'hover:bg-gray-100 text-gray-400'}`}
                                    title={`${rescheduleRequests.length} reschedule request(s)`}
                                >
                                    <Bell className="w-4.5 h-4.5" />
                                    {rescheduleRequests.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                                            {rescheduleRequests.length}
                                        </span>
                                    )}
                                </button>

                                {showReschedulePanel && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowReschedulePanel(false)} />
                                        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 z-20 overflow-hidden">
                                            <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex items-center justify-between">
                                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                                    <Bell className="w-4 h-4 text-amber-600" />
                                                    Reschedule Requests
                                                </h3>
                                                <button onClick={() => setShowReschedulePanel(false)} className="p-1 hover:bg-amber-100 rounded">
                                                    <X className="w-3.5 h-3.5 text-gray-500" />
                                                </button>
                                            </div>
                                            <div className="max-h-80 overflow-y-auto">
                                                {rescheduleRequests.length === 0 ? (
                                                    <div className="p-6 text-center text-gray-400 text-sm">
                                                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-300" />
                                                        <p className="font-medium">No pending requests</p>
                                                    </div>
                                                ) : (
                                                    rescheduleRequests.map(req => {
                                                        const requestedTime = req.requestedNewTime
                                                            ? (() => { try { const d = parseFirestoreTimestamp(req.requestedNewTime) || new Date(); return format(d, 'MMM d, h:mm a'); } catch { return 'Invalid date'; } })()
                                                            : null;
                                                        const currentTime = req.currentScheduledAt
                                                            ? (() => { try { const d = parseFirestoreTimestamp(req.currentScheduledAt) || new Date(); return format(d, 'MMM d, h:mm a'); } catch { return '—'; } })()
                                                            : '—';

                                                        return (
                                                            <div key={req.id} className="p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                                                <div className="flex items-start justify-between mb-1.5">
                                                                    <div>
                                                                        <span className="text-sm font-bold text-gray-800">{req.customerName}</span>
                                                                        <p className="text-[10px] text-gray-500">From: {req.techName}</p>
                                                                    </div>
                                                                </div>
                                                                <p className="text-xs text-gray-600 mb-2 bg-gray-50 rounded px-2 py-1 italic">"{req.reason}"</p>
                                                                <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-2">
                                                                    <span>Current: <strong>{currentTime}</strong></span>
                                                                    {requestedTime && (
                                                                        <>
                                                                            <span>→</span>
                                                                            <span className="text-amber-700 font-semibold">Requested: {requestedTime}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => handleApproveReschedule(req)}
                                                                        className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                                                                    >
                                                                        <CheckCircle className="w-3 h-3" /> Approve
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDenyReschedule(req)}
                                                                        className="flex-1 px-3 py-1.5 bg-gray-100 hover:bg-red-50 hover:text-red-700 text-gray-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 border border-gray-200"
                                                                    >
                                                                        <X className="w-3 h-3" /> Deny
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </header>

                {/* KPI Stats Bar */}
                <div className="bg-white border-b border-gray-200 px-5 py-1.5 flex items-center gap-5 text-xs">
                    <KpiStat
                        icon={<AlertCircle className="w-3.5 h-3.5" />}
                        label="Unassigned"
                        value={kpiStats.unassigned}
                        color={kpiStats.unassigned > 0 ? 'text-orange-600' : 'text-green-600'}
                        bgColor={kpiStats.unassigned > 0 ? 'bg-orange-50' : 'bg-green-50'}
                    />
                    <div className="w-px h-5 bg-gray-200" />
                    <KpiStat
                        icon={<CheckCircle className="w-3.5 h-3.5" />}
                        label="Scheduled Today"
                        value={kpiStats.todayScheduled}
                        color="text-blue-600"
                        bgColor="bg-blue-50"
                    />
                    <div className="w-px h-5 bg-gray-200" />
                    <KpiStat
                        icon={<Clock className="w-3.5 h-3.5" />}
                        label="In Progress"
                        value={kpiStats.inProgress}
                        color="text-green-600"
                        bgColor="bg-green-50"
                    />
                    <div className="w-px h-5 bg-gray-200" />
                    <KpiStat
                        icon={<Users className="w-3.5 h-3.5" />}
                        label="Techs"
                        value={kpiStats.availableTechs}
                        color="text-indigo-600"
                        bgColor="bg-indigo-50"
                    />
                    {kpiStats.conflicts > 0 && (
                        <>
                            <div className="w-px h-5 bg-gray-200" />
                            <KpiStat
                                icon={<AlertCircle className="w-3.5 h-3.5" />}
                                label="Conflicts"
                                value={kpiStats.conflicts}
                                color="text-red-600"
                                bgColor="bg-red-50"
                                pulse
                            />
                        </>
                    )}
                </div>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: Unscheduled Jobs */}
                    <div className={`flex-shrink-0 z-10 shadow-lg bg-white border-r border-gray-200 transition-all duration-300 ease-in-out ${
                        isJobsPanelCollapsed ? 'w-12' : 'w-64'
                    }`}>
                        <UnscheduledList
                            jobs={unscheduledJobs}
                            onQuickAssign={handleQuickAssign}
                            onJobSelect={handleJobSelect}
                            selectedJobId={selectedJob?.id || null}
                            isCollapsed={isJobsPanelCollapsed}
                            onToggleCollapse={() => setIsJobsPanelCollapsed(prev => !prev)}
                            onDragStart={(job) => setDraggingJob(job)}
                            onDragEnd={() => setDraggingJob(null)}
                            onUnscheduleJob={handleUnscheduleJob}
                            onViewJob={handleViewJob}
                            onAutoScheduleAll={() => setIsAutoScheduleModalOpen(true)}
                        />
                    </div>

                    {/* Center Panel: Timeline, Week, Month, or Map */}
                    <div className="flex-1 overflow-hidden relative bg-gray-50">
                        {showMap ? (
                            <TechnicianMap
                                technicians={technicians}
                                jobs={jobs}
                                viewDate={viewDate}
                                selectedTechIds={selectedTechIds}
                                onDateChange={(newDate) => setViewDate(newDate)}
                                onTechSelectionChange={(newIds) => setSelectedTechIds(newIds)}
                            />
                        ) : (
                            <TimelineGrid
                                technicians={technicians}
                                jobs={jobs}
                                viewDate={viewDate}
                                onJobDrop={handleJobDrop}
                                selectedTechIds={selectedTechIds}
                                viewMode={viewMode}
                                focusedJob={draggingJob || selectedJob}
                                onDayClick={handleDayClick}
                                allTechnicians={technicians}
                                onScheduledJobDragStart={(job) => setDraggingJob(job)}
                                onScheduledJobDragEnd={() => setDraggingJob(null)}
                            />
                        )}
                    </div>
                </div>

                {/* Modals */}
                <AddTechnicianModal
                    isOpen={isAddTechModalOpen}
                    onClose={() => setIsAddTechModalOpen(false)}
                />

                <AssignTechModal
                    job={assignModalJob}
                    isOpen={!!assignModalJob}
                    onClose={() => setAssignModalJob(null)}
                    onAssign={handleAssignFromModal}
                    technicians={technicians}
                    allJobs={jobs}
                    targetDate={viewDate}
                />
            </div>

                {/* Drop Warning Modal */}
                {dropWarning && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDropWarning(null)}>
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="bg-amber-50 px-6 py-4 border-b border-amber-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">Schedule Warning</h3>
                                        <p className="text-sm text-gray-600">
                                            {dropWarning.jobName} → {dropWarning.techName}
                                        </p>
                                    </div>
                                    <button onClick={() => setDropWarning(null)} className="ml-auto p-1 text-gray-400 hover:text-gray-600 rounded">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Warnings */}
                            <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
                                {dropWarning.warnings.map((w, i) => (
                                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                                        w.type === 'travel' ? 'bg-rose-50 border border-rose-200' :
                                        w.type === 'skills' ? 'bg-red-50 border border-red-200' :
                                        w.type === 'overload' ? 'bg-amber-50 border border-amber-200' :
                                        'bg-orange-50 border border-orange-200'
                                    }`}>
                                        <div className={`mt-0.5 flex-shrink-0 ${
                                            w.type === 'travel' ? 'text-rose-500' :
                                            w.type === 'skills' ? 'text-red-500' :
                                            w.type === 'overload' ? 'text-amber-500' :
                                            'text-orange-500'
                                        }`}>
                                            {w.type === 'travel' ? <Car className="w-5 h-5" /> :
                                             w.type === 'skills' ? <ShieldAlert className="w-5 h-5" /> :
                                             w.type === 'overload' ? <Users className="w-5 h-5" /> :
                                             <Clock className="w-5 h-5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-sm text-gray-900">{w.message}</div>
                                            {w.detail && (
                                                <div className="text-xs text-gray-600 mt-0.5 leading-relaxed">{w.detail}</div>
                                            )}

                                            {/* Route & Traffic Breakdown Card */}
                                            {w.transitDetail && (
                                                <div className="mt-2.5 pt-2 border-t border-rose-200/80 text-[11px] text-gray-700 bg-white/80 rounded-md p-2 border">
                                                    <div className="flex items-center gap-1.5 font-medium text-gray-800 mb-1 truncate">
                                                        <span className="truncate max-w-[130px] font-semibold">{w.transitDetail.from}</span>
                                                        <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                                        <span className="truncate max-w-[130px] font-semibold">{w.transitDetail.to}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                                            {w.transitDetail.miles} mi
                                                        </span>
                                                        <span className="bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                                            ~{w.transitDetail.durationMinutes}m drive
                                                        </span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                                            w.transitDetail.trafficLevel === 'severe' ? 'bg-red-100 text-red-800' :
                                                            w.transitDetail.trafficLevel === 'heavy' ? 'bg-orange-100 text-orange-800' :
                                                            'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {w.transitDetail.trafficLevel.toUpperCase()} traffic
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Time Info */}
                            <div className="px-6 pb-3">
                                <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>Target: <strong>{format(dropWarning.startTime, 'h:mm a')}</strong></span>
                                    </div>
                                    {dropWarning.suggestedAdjustTime && (
                                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                            Recommended: {format(dropWarning.suggestedAdjustTime, 'h:mm a')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-end gap-2.5">
                                <button
                                    onClick={() => setDropWarning(null)}
                                    className="px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>

                                {dropWarning.suggestedAdjustTime && (
                                    <button
                                        onClick={async () => {
                                            if (!dropWarning.suggestedAdjustTime) return;
                                            await executeSchedule(dropWarning.jobId, dropWarning.techId, dropWarning.suggestedAdjustTime);
                                            setDropWarning(null);
                                        }}
                                        className="px-3.5 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        Auto-Adjust to {format(dropWarning.suggestedAdjustTime, 'h:mm a')}
                                    </button>
                                )}

                                <button
                                    onClick={handleConfirmDrop}
                                    className="px-3.5 py-2 text-sm font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors shadow-sm"
                                >
                                    Override & Schedule
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Auto-Schedule Modal */}
                <AutoScheduleModal
                    isOpen={isAutoScheduleModalOpen}
                    onClose={() => setIsAutoScheduleModalOpen(false)}
                    currentDate={viewDate}
                    jobs={jobs}
                    technicians={technicians}
                    materials={materials}
                    tools={tools}
                    orgSettings={{
                        materialSchedulingMode: (organization as any)?.materialSchedulingMode as any,
                        materialBufferDays: (organization as any)?.materialBufferDays || 0
                    }}
                    onApplySchedule={handleApplyAutoSchedule}
                />
        </DndProvider>
    );
};

// ============================================================================
// KPI Stat Pill
// ============================================================================
const KpiStat = ({
    icon, label, value, color, bgColor, pulse
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    color: string;
    bgColor: string;
    pulse?: boolean;
}) => (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${bgColor} ${color} ${pulse ? 'animate-pulse' : ''}`}>
        {icon}
        <span className="font-bold">{value}</span>
        <span className="text-gray-500 font-medium">{label}</span>
    </div>
);
