import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, Timestamp, addDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Job } from '../types';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { format, addDays, startOfWeek, isSameDay, setHours, setMinutes, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, endOfWeek, addWeeks, addMonths, getDay, isSameMonth, addMinutes, differenceInDays, isAfter } from 'date-fns';
import { getSmartDuration } from '../lib/scheduler';
import { Clock, MapPin, Wrench, Calendar, AlertCircle, CheckCircle2, Lightbulb, Package, Sparkles, Settings } from 'lucide-react';
import { EditJobModal } from '../components/EditJobModal';
import { InventoryManager } from '../components/InventoryManager';
import { SchedulingPreferencesModal } from '../components/SchedulingPreferences';
import { optimizeScheduleWithAI, generateGoogleMapsRoute, calculateDayStatistics } from '../lib/aiScheduler';
import { sendScheduledConfirmation } from '../lib/NotificationService';
import { OptimizationPreviewModal } from '../components/OptimizationPreviewModal';
import toast from 'react-hot-toast';

const HOUR_HEIGHT = 60; // Compact for better screen fit
const START_HOUR = 6; // Earlier start
const END_HOUR = 20; // Later end
const HOURS_DISPLAY = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

// Helper to check if a specific time slot matches a customer's availability window
// Enforces a 14-day limit for generic day matches (e.g. 'Monday') to avoid highlighting every Monday forever
const isAvailabilityMatch = (
    window: { day: string; startTime: string; endTime: string },
    slotDate: Date,
    slotHour: number
): boolean => {
    try {
        const dayOfWeek = format(slotDate, 'EEEE').toLowerCase();
        const dateStr = format(slotDate, 'yyyy-MM-dd');
        const windowDay = window.day.toLowerCase();

        // 1. Check Date Match
        let isDateMatch = false;

        // Exact date match (e.g. "2026-01-29")
        if (windowDay === dateStr) {
            isDateMatch = true;
        }
        // Generic day match (e.g. "thursday") - Only match if within next 14 days
        else if (windowDay === dayOfWeek) {
            const daysDiff = differenceInDays(slotDate, new Date());
            // Allow if today or up to 14 days in future
            // (Using -1 to allow for timezone edge cases)
            if (daysDiff >= -1 && daysDiff <= 14) {
                isDateMatch = true;
            }
        }

        if (!isDateMatch) return false;

        // 2. Check Time Match
        const [startHour, startMinute] = window.startTime.split(':').map(Number);
        const [endHour, endMinute] = window.endTime.split(':').map(Number);

        const slotStartMinutes = slotHour * 60;
        const slotEndMinutes = (slotHour + 1) * 60;
        const windowStartMinutes = startHour * 60 + startMinute;
        const windowEndMinutes = endHour * 60 + endMinute;

        // Check for overlap
        return slotStartMinutes < windowEndMinutes && slotEndMinutes > windowStartMinutes;
    } catch (error) {
        console.error('Error checking availability match:', error);
        return false;
    }
};

interface AIRecommendation {
    diagnosis: string;
    solution: string;
    partsNeeded: Array<{ name: string; inInventory: boolean }>;
    estimatedDuration: number;
    confidence: number;
}

interface JobCardProps {
    job: Job & { aiRecommendation?: AIRecommendation };
    onClick: () => void;
    isCompact?: boolean;
}

const JobCard: React.FC<JobCardProps> = ({ job, onClick, isCompact = false }) => {
    const [{ isDragging }, drag] = useDrag({
        type: 'JOB',
        item: { job },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
        end: () => {
            // Clear dragging state when drag ends
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('jobDragEnd'));
            }
        },
    });

    // Set dragging job when drag starts
    React.useEffect(() => {
        if (isDragging && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('jobDragStart', { detail: job }));
        }
    }, [isDragging, job]);

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
    const heightInPixels = isCompact ? 'auto' : `${Math.max((duration / 60) * HOUR_HEIGHT, 60)}px`;

    // Format availability windows for display
    const availabilitySummary = React.useMemo(() => {
        if (!job.request?.availabilityWindows || job.request.availabilityWindows.length === 0) {
            return null;
        }

        // Group by day and format nicely
        const dayAbbrev: Record<string, string> = {
            'monday': 'Mon', 'tuesday': 'Tue', 'wednesday': 'Wed',
            'thursday': 'Thu', 'friday': 'Fri', 'saturday': 'Sat', 'sunday': 'Sun'
        };

        const formatted = job.request.availabilityWindows.slice(0, 3).map(w => {
            const day = dayAbbrev[w.day.toLowerCase()] || w.day.slice(0, 3);
            const startHour = parseInt(w.startTime.split(':')[0]);
            const endHour = parseInt(w.endTime.split(':')[0]);
            return `${day} ${startHour}-${endHour}`;
        });

        return formatted;
    }, [job.request?.availabilityWindows]);

    return (
        <div
            ref={drag}
            onClick={onClick}
            className={`rounded shadow-sm cursor-pointer hover:shadow-md transition-all ${priorityColors[job.priority]} ${statusColors[job.status]} ${isDragging ? 'opacity-50 scale-105' : 'opacity-100'
                } ${isCompact ? 'p-2 mb-2' : 'absolute left-0 right-0 mx-1 p-3'}`}
            style={isCompact ? {} : { height: heightInPixels, zIndex: 10 }}
        >
            <div className={`${isCompact ? 'text-xs' : 'text-sm'} h-full overflow-hidden`}>
                <div className="font-semibold truncate flex items-center justify-between">
                    <span>{job.customer.name}</span>
                    {job.aiRecommendation && (
                        <Lightbulb size={14} className="text-yellow-600 flex-shrink-0" />
                    )}
                </div>
                <div className="text-gray-600 truncate flex items-center gap-1 mt-1">
                    <MapPin size={12} />
                    <span className="truncate">{job.customer.address}</span>
                </div>
                <div className="text-gray-700 truncate mt-1">
                    {(job.request?.description || 'No description')}
                </div>

                {/* Customer Availability Summary - Shows in compact mode */}
                {isCompact && availabilitySummary && (
                    <div className="mt-2 p-1.5 bg-green-100 rounded text-xs border border-green-300">
                        <div className="font-semibold text-green-800 flex items-center gap-1 mb-1">
                            <Calendar size={10} />
                            Available:
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {availabilitySummary.map((slot, i) => (
                                <span key={i} className="bg-green-200 text-green-800 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                    {slot}
                                </span>
                            ))}
                            {job.request.availabilityWindows && job.request.availabilityWindows.length > 3 && (
                                <span className="text-green-700 text-[10px]">+{job.request.availabilityWindows.length - 3} more</span>
                            )}
                        </div>
                    </div>
                )}

                {/* AI Recommendation Preview */}
                {job.aiRecommendation && !isCompact && (
                    <div className="mt-2 p-2 bg-white/80 rounded text-xs border border-yellow-200">
                        <div className="font-semibold text-yellow-800 flex items-center gap-1">
                            <Lightbulb size={12} />
                            AI Analysis
                        </div>
                        <div className="text-gray-700 mt-1 line-clamp-2">
                            {job.aiRecommendation.diagnosis}
                        </div>
                        {job.aiRecommendation.partsNeeded.length > 0 && (
                            <div className="mt-1 flex items-center gap-1 text-orange-700">
                                <Package size={10} />
                                {job.aiRecommendation.partsNeeded.length} parts needed
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-2 mt-2 text-xs">
                    <div className="flex items-center gap-1 text-gray-600">
                        <Clock size={12} />
                        {duration}m
                    </div>
                    {job.parts_needed && (
                        <div className="flex items-center gap-1 text-orange-600">
                            <Wrench size={12} />
                            Parts
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

interface TimeSlotProps {
    date: Date;
    hour: number;
    jobs: Job[];
    unassignedJobs: Job[];
    onDrop: (job: Job, newTime: Date) => void;
    onJobClick: (job: Job) => void;
    draggingJob: Job | null;
}

const TimeSlot: React.FC<TimeSlotProps> = ({ date, hour, jobs, unassignedJobs, onDrop, onJobClick, draggingJob }) => {
    const slotTime = setMinutes(setHours(date, hour), 0);

    const [{ isOver }, drop] = useDrop({
        accept: 'JOB',
        drop: (item: { job: Job }) => {
            onDrop(item.job, slotTime);
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    });

    // Find jobs that start in this hour slot
    const slotJobs = jobs.filter(job => {
        if (!job.scheduled_at) return false;
        const jobTime = (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at));
        return isSameDay(jobTime, date) && jobTime.getHours() === hour;
    });

    const isNow = isSameDay(date, new Date()) && new Date().getHours() === hour;

    // Check if ANY unassigned job has requested this time slot
    const customerRequestInfo = React.useMemo(() => {
        const dayOfWeek = format(date, 'EEEE').toLowerCase();
        const dateStr = format(date, 'yyyy-MM-dd');
        const slotHour = hour;

        // Check all unassigned jobs for availability windows matching this slot
        const matchingJobs = unassignedJobs.filter(job => {
            if (job.request?.availabilityWindows && job.request.availabilityWindows.length > 0) {
                return job.request.availabilityWindows.some(window =>
                    isAvailabilityMatch(window, date, slotHour)
                );
            }

            // Fallback: check legacy availability array (dates/times as strings)
            if (job.request?.availability && Array.isArray(job.request.availability)) {
                return job.request.availability.some(avail => {
                    try {
                        const availDate = typeof avail === 'string' ? new Date(avail) : avail;
                        if (!availDate || isNaN(availDate.getTime())) return false;

                        return isSameDay(availDate, date) && availDate.getHours() === slotHour;
                    } catch (error) {
                        return false;
                    }
                });
            }

            return false;
        });

        return {
            hasRequests: matchingJobs.length > 0,
            count: matchingJobs.length,
            jobs: matchingJobs
        };
    }, [unassignedJobs, date, hour]);

    // Extra highlight when dragging a job that matches this slot
    const isDraggingMatchingJob = React.useMemo(() => {
        if (!draggingJob || !draggingJob.request) return false;

        const dayOfWeek = format(date, 'EEEE').toLowerCase();
        const dateStr = format(date, 'yyyy-MM-dd');
        const slotHour = hour;

        // Check new availabilityWindows format
        // Check new availabilityWindows format
        if (draggingJob.request.availabilityWindows && draggingJob.request.availabilityWindows.length > 0) {
            return draggingJob.request.availabilityWindows.some(window =>
                isAvailabilityMatch(window, date, slotHour)
            );
        }

        // Check legacy availability format
        if (draggingJob.request.availability && Array.isArray(draggingJob.request.availability)) {
            return draggingJob.request.availability.some(avail => {
                try {
                    const availDate = typeof avail === 'string' ? new Date(avail) : avail;
                    if (!availDate || isNaN(availDate.getTime())) return false;

                    return isSameDay(availDate, date) && availDate.getHours() === slotHour;
                } catch (error) {
                    return false;
                }
            });
        }

        return false;
    }, [draggingJob, date, hour]);

    return (
        <div
            ref={drop}
            className={`border-b border-gray-200 relative transition-all duration-200 ${isDraggingMatchingJob
                ? 'bg-gradient-to-r from-green-200 to-green-100 border-2 border-green-500 shadow-lg ring-4 ring-green-300 ring-opacity-60 animate-pulse'
                : customerRequestInfo.hasRequests
                    ? 'bg-green-50 hover:bg-green-100 border-l-4 border-l-green-400'
                    : isOver
                        ? 'bg-blue-100 border-2 border-blue-400'
                        : isNow
                            ? 'bg-yellow-50'
                            : 'bg-white hover:bg-gray-50'
                }`}
            style={{ height: `${HOUR_HEIGHT}px` }}
            title={customerRequestInfo.hasRequests ? `${customerRequestInfo.count} customer(s) available` : ''}
        >
            {/* Badge showing number of customers available at this time */}
            {customerRequestInfo.hasRequests && !isDraggingMatchingJob && (
                <div className="absolute top-1 right-1 z-10">
                    <div className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow">
                        {customerRequestInfo.count}
                    </div>
                </div>
            )}

            {/* Enhanced highlight when dragging a job that matches this slot */}
            {isDraggingMatchingJob && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                    <div className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-xl flex items-center gap-2 animate-bounce">
                        <span className="text-lg">✓</span>
                        <div>
                            <div>Customer Preferred!</div>
                            <div className="text-xs font-normal opacity-90">Drop here to schedule</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Scheduled jobs in this slot */}
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

export const SoloCalendar: React.FC = () => {
    const { user } = useAuth();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [viewDate, setViewDate] = useState<Date>(new Date());
    const [editingJob, setEditingJob] = useState<Job | null>(null);
    const [showInventory, setShowInventory] = useState(false);
    const [optimizing, setOptimizing] = useState(false);
    const [homeLocation] = useState({ lat: 21.3099, lng: -157.8581 }); // Default Honolulu
    const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('week');
    const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
    const [showPreferences, setShowPreferences] = useState(false);
    const [userPreferences, setUserPreferences] = useState<any>(null);
    const [draggingJob, setDraggingJob] = useState<Job | null>(null);
    const [conflictWarning, setConflictWarning] = useState<{
        show: boolean;
        existingJobs: Job[];
        selectedDates: string[];
        unscheduledCount: number;
    }>({ show: false, existingJobs: [], selectedDates: [], unscheduledCount: 0 });
    const [optimizationResults, setOptimizationResults] = useState<{
        show: boolean;
        scheduledJobs: any[];
        unschedulableJobs: any[];
        warnings: string[];
        stats: any;
        daysOptimized: number;
        mapsUrl?: string;
    } | null>(null);

    const userId = user?.uid;
    const orgId = (user as any)?.org_id || 'demo-org';

    // Helper to format date as YYYY-MM-DD for Set keys
    const formatDateKey = (date: Date): string => {
        return format(date, 'yyyy-MM-dd');
    };

    // Toggle date selection for multi-day mode
    const toggleDateSelection = (date: Date) => {
        const dateKey = formatDateKey(date);
        const newSelected = new Set(selectedDates);

        if (newSelected.has(dateKey)) {
            newSelected.delete(dateKey);
        } else {
            newSelected.add(dateKey);
        }

        setSelectedDates(newSelected);
    };

    // Clear all selected dates
    const clearSelectedDates = () => {
        setSelectedDates(new Set());
    };

    // Select current day
    const selectToday = () => {
        const today = formatDateKey(new Date());
        setSelectedDates(new Set([today]));
    };

    // Select current week
    const selectThisWeek = () => {
        const weekStart = startOfWeek(viewDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(viewDate, { weekStartsOn: 1 });
        const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
        const dateKeys = daysInWeek.map(day => formatDateKey(day));
        setSelectedDates(new Set(dateKeys));
    };

    // Select current month
    const selectThisMonth = () => {
        const monthStart = startOfMonth(viewDate);
        const monthEnd = endOfMonth(viewDate);
        const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const dateKeys = daysInMonth.map(day => formatDateKey(day));
        setSelectedDates(new Set(dateKeys));
    };

    // Generate month calendar grid with padding days
    const getMonthCalendarGrid = (): (Date | null)[] => {
        const monthStart = startOfMonth(viewDate);
        const monthEnd = endOfMonth(viewDate);
        const startDay = getDay(monthStart); // 0 = Sunday, 1 = Monday, etc.

        // Adjust for Monday start (0 = Monday)
        const paddingDays = startDay === 0 ? 6 : startDay - 1;

        const grid: (Date | null)[] = [];

        // Add padding days at start
        for (let i = 0; i < paddingDays; i++) {
            grid.push(null);
        }

        // Add actual days of month
        const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
        grid.push(...daysInMonth);

        // Add padding days at end to complete the grid
        const totalCells = grid.length;
        const remainingCells = 7 - (totalCells % 7);
        if (remainingCells < 7) {
            for (let i = 0; i < remainingCells; i++) {
                grid.push(null);
            }
        }

        return grid;
    };

    // Fetch jobs for solo tech
    useEffect(() => {
        const jobsQuery = query(
            collection(db, 'jobs'),
            where('org_id', '==', orgId)
        );
        const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
            const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

            // Debug: Log unscheduled jobs with availability info
            const unscheduled = jobsData.filter(j => !j.scheduled_at && j.status !== 'completed');
            console.log('[SoloCalendar] Unscheduled jobs:', unscheduled.length);
            unscheduled.forEach(job => {
                if (job.request?.availabilityWindows) {
                    console.log(`[SoloCalendar] Job "${job.customer.name}" has availabilityWindows:`, job.request.availabilityWindows);
                } else if (job.request?.availability) {
                    console.log(`[SoloCalendar] Job "${job.customer.name}" has legacy availability:`, job.request.availability);
                } else {
                    console.log(`[SoloCalendar] Job "${job.customer.name}" has NO availability info`);
                }
            });

            setJobs(jobsData);
        });
        return unsubscribe;
    }, [orgId]);

    // Load user preferences
    useEffect(() => {
        const loadPreferences = async () => {
            if (!userId) return;

            try {
                const userDoc = await getDoc(doc(db, 'users', userId));
                if (userDoc.exists() && userDoc.data().schedulingPreferences) {
                    setUserPreferences(userDoc.data().schedulingPreferences);
                    console.log('[SoloCalendar] Loaded user preferences:', userDoc.data().schedulingPreferences);
                } else {
                    console.log('[SoloCalendar] No custom preferences found, using defaults');
                }
            } catch (error) {
                console.error('[SoloCalendar] Failed to load preferences:', error);
            }
        };

        loadPreferences();
    }, [userId]);

    // Listen for job drag events to highlight customer requested times
    useEffect(() => {
        const handleDragStart = (e: Event) => {
            const customEvent = e as CustomEvent;
            setDraggingJob(customEvent.detail);
        };
        const handleDragEnd = () => {
            setDraggingJob(null);
        };

        window.addEventListener('jobDragStart', handleDragStart);
        window.addEventListener('jobDragEnd', handleDragEnd);

        return () => {
            window.removeEventListener('jobDragStart', handleDragStart);
            window.removeEventListener('jobDragEnd', handleDragEnd);
        };
    }, []);

    // Calculate displayed days based on view mode
    const getDisplayedDays = (): Date[] => {
        // Get work days from preferences (default to Mon-Fri if not set)
        const workDays = userPreferences?.workDays || [1, 2, 3, 4, 5];

        switch (calendarView) {
            case 'day':
                return [viewDate];
            case 'week': {
                // Show only selected work days
                const weekStart = startOfWeek(viewDate, { weekStartsOn: 0 }); // Start from Sunday
                const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
                // Filter to only show work days
                return allWeekDays.filter(day => workDays.includes(day.getDay()));
            }
            case 'month': {
                const monthStart = startOfMonth(viewDate);
                const monthEnd = endOfMonth(viewDate);
                return eachDayOfInterval({ start: monthStart, end: monthEnd });
            }
            default:
                return [viewDate];
        }
    };

    const displayedDays = getDisplayedDays();
    const weekStart = startOfWeek(viewDate, { weekStartsOn: 1 });
    const weekDays = displayedDays;

    // Categorize jobs
    const unscheduledJobs = useMemo(() => {
        return jobs.filter(j => !j.scheduled_at && j.status !== 'completed');
    }, [jobs]);

    const todayJobs = useMemo(() => {
        return jobs.filter(j => j.scheduled_at && isSameDay((j.scheduled_at?.toDate?.() || new Date(j.scheduled_at)), new Date()));
    }, [jobs]);

    // Handle job drop with conflict detection
    const handleJobDrop = async (job: Job, newTime: Date) => {
        try {
            // Check for conflicts
            const jobDuration = getSmartDuration(job);
            const jobEndTime = addMinutes(newTime, jobDuration);

            const conflictingJobs = jobs.filter(existingJob => {
                if (existingJob.id === job.id) return false; // Don't compare with itself
                if (!existingJob.scheduled_at) return false;
                if (existingJob.assigned_tech_id !== userId) return false; // Only check this tech's jobs

                const existingStart = (existingJob.scheduled_at?.toDate?.() || new Date(existingJob.scheduled_at));
                const existingDuration = getSmartDuration(existingJob);
                const existingEnd = addMinutes(existingStart, existingDuration);

                // Check if times overlap
                const overlaps = (
                    (newTime >= existingStart && newTime < existingEnd) || // New job starts during existing
                    (jobEndTime > existingStart && jobEndTime <= existingEnd) || // New job ends during existing
                    (newTime <= existingStart && jobEndTime >= existingEnd) // New job completely covers existing
                );

                return overlaps;
            });

            if (conflictingJobs.length > 0) {
                const conflictDetails = conflictingJobs.map(j =>
                    `${j.customer.name} at ${format(j.scheduled_at!.toDate(), 'h:mm a')}`
                ).join(', ');
                toast.error(`Time conflict! This overlaps with: ${conflictDetails}`);
                return;
            }

            await updateDoc(doc(db, 'jobs', job.id), {
                scheduled_at: Timestamp.fromDate(newTime),
                status: 'scheduled',
                assigned_tech_id: userId,
                assigned_tech_name: user?.email || 'Unknown',
            });
            console.log('Job scheduled:', job.customer.name, 'to', format(newTime, 'MMM d @ h:mm a'));
            toast.success(`Scheduled ${job.customer.name} at ${format(newTime, 'h:mm a')}`);

            // Send scheduling confirmation to customer
            const updatedJob = { ...job, scheduled_at: Timestamp.fromDate(newTime), assigned_tech_name: user?.displayName || user?.email || 'Your technician' };
            sendScheduledConfirmation(updatedJob, { method: 'both' }).then(results => {
                const successCount = results.filter(r => r.success).length;
                if (successCount > 0) {
                    console.log(`📧 Sent ${successCount} notification(s) to customer`);
                }
            }).catch(err => console.error('Failed to send notification:', err));
        } catch (error) {
            console.error('Failed to schedule job:', error);
            toast.error('Failed to schedule job');
        }
    };

    // Request AI analysis for a job
    const requestAIAnalysis = async (jobId: string) => {
        // This will be implemented with Firebase Function
        console.log('Requesting AI analysis for job:', jobId);
    };

    // Pre-check for conflicts before AI scheduling
    const preCheckConflicts = () => {
        const myUnscheduledJobs = unscheduledJobs.filter(j =>
            j.assigned_tech_id === userId || !j.assigned_tech_id
        );

        if (myUnscheduledJobs.length === 0) {
            toast("No unscheduled jobs to optimize", { icon: 'ℹ️' });
            return;
        }

        if (selectedDates.size === 0) {
            toast.error('Please select at least one day to optimize');
            return;
        }

        // Find jobs already scheduled on the selected dates
        const selectedDateKeys = Array.from(selectedDates);
        const existingScheduledJobs = jobs.filter(j => {
            if (!j.scheduled_at) return false;
            if (j.status === 'completed' || j.status === 'cancelled') return false;
            const jobDateKey = formatDateKey((j.scheduled_at?.toDate?.() || new Date(j.scheduled_at)));
            return selectedDateKeys.includes(jobDateKey);
        });

        if (existingScheduledJobs.length > 0) {
            // Show conflict warning modal
            setConflictWarning({
                show: true,
                existingJobs: existingScheduledJobs,
                selectedDates: selectedDateKeys,
                unscheduledCount: myUnscheduledJobs.length
            });
        } else {
            // No conflicts — proceed directly
            handleAISchedule();
        }
    };

    // AI Auto-Schedule for Selected Days
    const handleAISchedule = async () => {
        // Close any open conflict warning
        setConflictWarning({ show: false, existingJobs: [], selectedDates: [], unscheduledCount: 0 });

        // Include jobs assigned to this user OR unassigned jobs they can pick up
        const myUnscheduledJobs = unscheduledJobs.filter(j =>
            j.assigned_tech_id === userId || !j.assigned_tech_id
        );

        if (myUnscheduledJobs.length === 0) {
            toast("No unscheduled jobs to optimize", { icon: 'ℹ️' });
            return;
        }

        // Use selected dates
        if (selectedDates.size === 0) {
            toast.error('Please select at least one day to optimize');
            return;
        }

        // Convert selected date strings to Date objects and sort
        // Use parse instead of new Date() to avoid timezone issues
        const datesToOptimize = Array.from(selectedDates)
            .map(dateStr => {
                // Parse YYYY-MM-DD format in local timezone
                const [year, month, day] = dateStr.split('-').map(Number);
                return new Date(year, month - 1, day);
            })
            .sort((a, b) => a.getTime() - b.getTime());

        const daysCount = datesToOptimize.length;

        // Log selected dates for debugging
        console.log('📅 Selected dates for optimization:', datesToOptimize.map(d => format(d, 'MMM d, yyyy')));

        setOptimizing(true);
        const loadingToast = toast.loading(`🤖 AI is optimizing ${myUnscheduledJobs.length} jobs across ${daysCount} day(s)...`);

        // Use user preferences from state (already loaded in useEffect)
        if (userPreferences) {
            console.log('⚙️ Using user preferences:', userPreferences);
        } else {
            console.log('⚙️ Using default preferences (user has not set custom preferences)');
        }

        try {
            const allScheduledJobs: any[] = [];
            const allUnschedulableJobs: any[] = [];
            const allWarnings: string[] = [];
            let remainingJobs = [...myUnscheduledJobs];

            // Determine start location from preferences
            let startLocation = homeLocation; // Default
            if (userPreferences?.routePreferences?.preferredStartLocation === 'custom' && userPreferences?.routePreferences?.customStartLocation) {
                startLocation = {
                    lat: userPreferences.routePreferences.customStartLocation.lat,
                    lng: userPreferences.routePreferences.customStartLocation.lng
                };
                console.log(`📍 Using custom start location: ${userPreferences.routePreferences.customStartLocation.address}`);
            } else if (userPreferences?.routePreferences?.preferredStartLocation === 'office') {
                // Could load from org settings in the future
                console.log(`📍 Using office start location (defaults to home for now)`);
            } else {
                console.log(`📍 Using home start location`);
            }

            // Optimize for each selected day
            for (let i = 0; i < datesToOptimize.length; i++) {
                const currentDay = new Date(datesToOptimize[i]);
                const startTime = setHours(setMinutes(currentDay, 0), 8); // 8 AM

                const dayLabel = format(currentDay, 'MMM d, yyyy');
                console.log(`Optimizing ${dayLabel}...`);

                if (remainingJobs.length === 0) break;

                // Run AI optimization for this day with user preferences
                const result = await optimizeScheduleWithAI(
                    remainingJobs,
                    startLocation, // Use preferred start location
                    startTime,
                    true, // Use real Google Maps API
                    userPreferences // Pass user preferences
                );

                allScheduledJobs.push(...result.scheduledJobs);
                allWarnings.push(...result.warnings);

                // For multi-day, unschedulable jobs from one day become input for next day
                remainingJobs = result.unschedulableJobs;
            }

            // Any jobs still unschedulable after all days
            allUnschedulableJobs.push(...remainingJobs);

            // Save all optimized jobs to Firestore
            const batch = writeBatch(db);
            allScheduledJobs.forEach(job => {
                if (!job.id) return;
                const jobRef = doc(db, 'jobs', job.id);
                batch.update(jobRef, {
                    scheduled_at: job.scheduled_at,
                    status: 'scheduled',
                    assigned_tech_id: userId,
                    assigned_tech_name: user?.displayName || user?.email
                });
            });

            await batch.commit();

            // Send scheduling confirmations to all customers
            console.log(`📧 Sending scheduling confirmations to ${allScheduledJobs.length} customers...`);
            const notificationPromises = allScheduledJobs.map(job =>
                sendScheduledConfirmation(
                    { ...job, assigned_tech_name: user?.displayName || user?.email || 'Your technician' },
                    { method: 'both', includeCalendarInvite: true }
                ).catch(err => {
                    console.error(`Failed to notify ${job.customer.name}:`, err);
                    return [];
                })
            );

            // Fire and forget - don't block on notifications
            Promise.all(notificationPromises).then(results => {
                const totalSent = results.flat().filter(r => r.success).length;
                console.log(`📧 Successfully sent ${totalSent} notifications`);
            });

            const stats = calculateDayStatistics(allScheduledJobs);

            // Generate maps URL for first day's route
            let mapsUrl: string | undefined;
            if (allScheduledJobs.length > 0) {
                const todayScheduled = allScheduledJobs.filter(j =>
                    j.arrivalTime && isSameDay(j.arrivalTime, datesToOptimize[0])
                );
                if (todayScheduled.length > 0) {
                    mapsUrl = generateGoogleMapsRoute(homeLocation, todayScheduled);
                }
            }

            // Show the optimization preview modal
            setOptimizationResults({
                show: true,
                scheduledJobs: allScheduledJobs,
                unschedulableJobs: allUnschedulableJobs,
                warnings: allWarnings,
                stats,
                daysOptimized: daysCount,
                mapsUrl
            });

            // Also show a brief toast
            if (allWarnings.length > 0) {
                toast(`⚠️ Scheduled ${allScheduledJobs.length} jobs, ${allUnschedulableJobs.length} need special handling`, {
                    id: loadingToast,
                    duration: 3000,
                    icon: '⚠️'
                });
            } else {
                toast.success(
                    `✅ Optimized ${allScheduledJobs.length} jobs across ${daysCount} day(s)! ${stats.totalDriveTime}m drive time`,
                    { id: loadingToast, duration: 3000 }
                );
            }
        } catch (error) {
            console.error('Optimization failed:', error);
            toast.error('AI optimization failed', { id: loadingToast });
        } finally {
            setOptimizing(false);
        }
    };

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="h-screen flex flex-col bg-gray-50">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-4">
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <Calendar className="text-violet-600" />
                                My Schedule
                            </h1>

                            {/* View Selector */}
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                                <button
                                    onClick={() => setCalendarView('day')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${calendarView === 'day'
                                        ? 'bg-white text-violet-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    Day
                                </button>
                                <button
                                    onClick={() => setCalendarView('week')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${calendarView === 'week'
                                        ? 'bg-white text-violet-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    Week
                                </button>
                                <button
                                    onClick={() => setCalendarView('month')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${calendarView === 'month'
                                        ? 'bg-white text-violet-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    Month
                                </button>
                            </div>

                            {/* Navigation */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        if (calendarView === 'day') setViewDate(addDays(viewDate, -1));
                                        else if (calendarView === 'week') setViewDate(addWeeks(viewDate, -1));
                                        else setViewDate(addMonths(viewDate, -1));
                                    }}
                                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
                                >
                                    ← Prev
                                </button>
                                <button
                                    onClick={() => setViewDate(new Date())}
                                    className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-sm"
                                >
                                    Today
                                </button>
                                <button
                                    onClick={() => {
                                        if (calendarView === 'day') setViewDate(addDays(viewDate, 1));
                                        else if (calendarView === 'week') setViewDate(addWeeks(viewDate, 1));
                                        else setViewDate(addMonths(viewDate, 1));
                                    }}
                                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
                                >
                                    Next →
                                </button>
                                <span className="ml-2 text-sm font-medium">
                                    {calendarView === 'day' && format(viewDate, 'EEEE, MMMM d, yyyy')}
                                    {calendarView === 'week' && `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`}
                                    {calendarView === 'month' && format(viewDate, 'MMMM yyyy')}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-violet-600">{todayJobs.length}</div>
                                <div className="text-xs text-gray-600">Today</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-orange-600">{unscheduledJobs.filter(j => j.assigned_tech_id === userId).length}</div>
                                <div className="text-xs text-gray-600">Unscheduled</div>
                            </div>
                            <button
                                onClick={() => setShowPreferences(true)}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded flex items-center gap-2 transition-colors"
                            >
                                <Settings size={16} />
                                Preferences
                            </button>
                            <button
                                onClick={() => setShowInventory(!showInventory)}
                                className={`px-4 py-2 rounded flex items-center gap-2 ${showInventory ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}
                            >
                                <Package size={16} />
                                Inventory
                            </button>
                        </div>
                    </div>

                    {/* AI Optimization Controls */}
                    <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-amber-50 rounded-lg p-3 border border-blue-200">
                        <div className="flex items-center gap-3">
                            <Sparkles className="text-blue-600" size={20} />
                            <div>
                                <div className="font-semibold text-gray-900">AI Schedule Optimizer</div>
                                <div className="text-xs text-gray-600">
                                    {selectedDates.size === 0
                                        ? 'Select days to optimize, then click the button to schedule jobs'
                                        : `${selectedDates.size} day(s) selected for optimization`}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Quick Selection Buttons */}
                            <button
                                onClick={selectToday}
                                className="px-3 py-1.5 bg-white hover:bg-blue-50 border border-blue-300 text-blue-700 rounded text-sm font-medium"
                            >
                                This Day
                            </button>
                            <button
                                onClick={selectThisWeek}
                                className="px-3 py-1.5 bg-white hover:bg-blue-50 border border-blue-300 text-blue-700 rounded text-sm font-medium"
                            >
                                This Week
                            </button>
                            <button
                                onClick={selectThisMonth}
                                className="px-3 py-1.5 bg-white hover:bg-blue-50 border border-blue-300 text-blue-700 rounded text-sm font-medium"
                            >
                                This Month
                            </button>

                            {selectedDates.size > 0 && (
                                <button
                                    onClick={clearSelectedDates}
                                    className="px-3 py-1.5 bg-white hover:bg-red-50 border border-red-300 text-red-700 rounded text-sm font-medium"
                                >
                                    Clear ({selectedDates.size})
                                </button>
                            )}

                            <button
                                onClick={preCheckConflicts}
                                disabled={optimizing || unscheduledJobs.filter(j => j.assigned_tech_id === userId || !j.assigned_tech_id).length === 0 || selectedDates.size === 0}
                                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-amber-600 hover:from-blue-700 hover:to-amber-700 text-white rounded-lg shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold"
                            >
                                <Sparkles size={18} />
                                {optimizing ? 'Optimizing...' : `Optimize ${selectedDates.size || 0} Day${selectedDates.size !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Unscheduled Jobs Sidebar */}
                    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
                        <div className="p-3 border-b border-gray-200 bg-gray-50">
                            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                <AlertCircle size={18} className="text-orange-600" />
                                Unscheduled Jobs ({unscheduledJobs.length})
                            </h2>
                            <p className="text-xs text-gray-600 mt-1">Drag to schedule</p>
                        </div>
                        <div className="flex-1 overflow-auto p-3">
                            {unscheduledJobs.length === 0 ? (
                                <div className="text-center text-gray-500 mt-8">
                                    <CheckCircle2 size={48} className="mx-auto text-green-500 mb-2" />
                                    <p className="text-sm">All jobs scheduled!</p>
                                </div>
                            ) : (
                                unscheduledJobs.map(job => (
                                    <JobCard
                                        key={job.id}
                                        job={job}
                                        onClick={() => setEditingJob(job)}
                                        isCompact
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="flex-1 overflow-auto">
                        {calendarView === 'month' ? (
                            /* Month View - Compact Calendar Grid */
                            <div className="p-4">
                                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                                    {/* Day of Week Headers */}
                                    <div className="grid grid-cols-7 border-b border-gray-200">
                                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                            <div key={day} className="p-3 text-center font-semibold text-gray-700 text-sm border-r border-gray-200 last:border-r-0">
                                                {day}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Month Grid */}
                                    <div className="grid grid-cols-7">
                                        {getMonthCalendarGrid().map((day, index) => {
                                            if (!day) {
                                                // Empty padding cell
                                                return (
                                                    <div
                                                        key={`empty-${index}`}
                                                        className="min-h-[90px] border-r border-b border-gray-200 bg-gray-50 last:border-r-0"
                                                    />
                                                );
                                            }

                                            const isToday = isSameDay(day, new Date());
                                            const isSelected = selectedDates.has(formatDateKey(day));
                                            const isCurrentMonth = isSameMonth(day, viewDate);
                                            const dayJobs = jobs.filter(j => j.scheduled_at && isSameDay((j.scheduled_at?.toDate?.() || new Date(j.scheduled_at)), day));

                                            return (
                                                <div
                                                    key={day.toISOString()}
                                                    onClick={() => toggleDateSelection(day)}
                                                    className={`min-h-[90px] border-r border-b border-gray-200 last:border-r-0 p-2 cursor-pointer transition-all ${isSelected
                                                        ? 'bg-blue-50 hover:bg-blue-100 ring-2 ring-inset ring-blue-500'
                                                        : isToday
                                                            ? 'bg-violet-50 hover:bg-violet-100'
                                                            : isCurrentMonth
                                                                ? 'bg-white hover:bg-gray-50'
                                                                : 'bg-gray-50 hover:bg-gray-100'
                                                        }`}
                                                >
                                                    {/* Day Number */}
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className={`text-sm font-semibold ${isSelected
                                                            ? 'text-blue-700'
                                                            : isToday
                                                                ? 'bg-violet-600 text-white rounded-full w-6 h-6 flex items-center justify-center'
                                                                : isCurrentMonth
                                                                    ? 'text-gray-900'
                                                                    : 'text-gray-400'
                                                            }`}>
                                                            {format(day, 'd')}
                                                        </div>
                                                        {isSelected && (
                                                            <span className="text-blue-600 text-xs">✓</span>
                                                        )}
                                                    </div>

                                                    {/* Jobs List */}
                                                    <div className="space-y-1">
                                                        {dayJobs.slice(0, 3).map(job => (
                                                            <div
                                                                key={job.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingJob(job);
                                                                }}
                                                                className={`text-xs px-2 py-1 rounded truncate cursor-pointer hover:shadow-md transition-shadow ${job.priority === 'critical' ? 'bg-red-100 text-red-800 border-l-2 border-red-600' :
                                                                    job.priority === 'high' ? 'bg-orange-100 text-orange-800 border-l-2 border-orange-600' :
                                                                        job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 border-l-2 border-yellow-600' :
                                                                            'bg-green-100 text-green-800 border-l-2 border-green-600'
                                                                    }`}
                                                            >
                                                                {job.scheduled_at && format((job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)), 'h:mm a')} {job.customer.name}
                                                            </div>
                                                        ))}
                                                        {dayJobs.length > 3 && (
                                                            <div className="text-xs text-gray-500 px-2">
                                                                +{dayJobs.length - 3} more
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Day/Week View - Time Grid */
                            <div className="inline-block min-w-full">
                                {/* Day Headers */}
                                <div className="flex sticky top-0 z-20 bg-white border-b-2 border-gray-300">
                                    <div className="w-20 flex-shrink-0 border-r border-gray-300"></div>
                                    {weekDays.map(day => {
                                        const isToday = isSameDay(day, new Date());
                                        const isSelected = selectedDates.has(formatDateKey(day));
                                        const dayJobs = jobs.filter(j => j.scheduled_at && isSameDay((j.scheduled_at?.toDate?.() || new Date(j.scheduled_at)), day));
                                        return (
                                            <div
                                                key={day.toISOString()}
                                                onClick={() => toggleDateSelection(day)}
                                                className={`flex-1 min-w-[180px] border-r border-gray-300 p-2 text-center cursor-pointer transition-all ${isSelected
                                                    ? 'bg-blue-600 text-white'
                                                    : isToday
                                                        ? 'bg-violet-100 hover:bg-blue-100'
                                                        : 'bg-gray-50 hover:bg-blue-50'
                                                    }`}
                                            >
                                                <div className={`font-semibold ${isSelected ? 'text-white' : isToday ? 'text-violet-700' : 'text-gray-900'}`}>
                                                    {format(day, 'EEE')}
                                                </div>
                                                <div className={`text-sm ${isSelected ? 'text-white' : isToday ? 'text-violet-600' : 'text-gray-600'}`}>
                                                    {format(day, 'MMM d')}
                                                </div>
                                                <div className={`text-xs mt-1 ${isSelected ? 'text-white' : 'text-gray-500'}`}>
                                                    {isSelected && <span className="mr-1">✓</span>}
                                                    {dayJobs.length} jobs
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Time Slots */}
                                {HOURS_DISPLAY.map(hour => (
                                    <div key={hour} className="flex">
                                        {/* Hour Label */}
                                        <div className="w-20 flex-shrink-0 border-r border-gray-300 text-sm text-gray-600 text-right pr-3 pt-2 bg-gray-50">
                                            {format(setHours(new Date(), hour), 'h a')}
                                        </div>

                                        {/* Day Columns */}
                                        {weekDays.map(day => (
                                            <div key={`${day.toISOString()}-${hour}`} className="flex-1 min-w-[180px] border-r border-gray-200">
                                                <TimeSlot
                                                    date={day}
                                                    hour={hour}
                                                    jobs={jobs}
                                                    unassignedJobs={unscheduledJobs}
                                                    onDrop={handleJobDrop}
                                                    onJobClick={setEditingJob}
                                                    draggingJob={draggingJob}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Inventory Sidebar */}
                    {showInventory && (
                        <div className="w-96 bg-white border-l border-gray-200">
                            <InventoryManager />
                        </div>
                    )}
                </div>

                {/* Edit Job Modal */}
                {editingJob && (
                    <EditJobModal
                        job={editingJob}
                        onClose={() => setEditingJob(null)}
                    />
                )}

                {/* Scheduling Preferences Modal */}
                {showPreferences && (
                    <SchedulingPreferencesModal onClose={() => setShowPreferences(false)} />
                )}

                {/* Conflict Warning Modal */}
                {conflictWarning.show && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
                            <div className="bg-gradient-to-r from-orange-500 to-red-500 p-4 flex items-center gap-3">
                                <AlertCircle className="w-6 h-6 text-white" />
                                <h3 className="text-lg font-bold text-white">Scheduling Conflict Warning</h3>
                            </div>
                            <div className="p-5">
                                <p className="text-gray-700 mb-3">
                                    There {conflictWarning.existingJobs.length === 1 ? 'is' : 'are'}{' '}
                                    <span className="font-bold text-orange-600">
                                        {conflictWarning.existingJobs.length} existing job{conflictWarning.existingJobs.length !== 1 ? 's' : ''}
                                    </span>{' '}
                                    already scheduled on the selected date{conflictWarning.selectedDates.length !== 1 ? 's' : ''}.
                                    AI optimization will schedule <span className="font-bold text-blue-600">{conflictWarning.unscheduledCount} new jobs</span> around them.
                                </p>

                                <div className="max-h-48 overflow-y-auto border rounded-lg mb-4">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="text-left px-3 py-2 text-gray-600">Customer</th>
                                                <th className="text-left px-3 py-2 text-gray-600">Date</th>
                                                <th className="text-left px-3 py-2 text-gray-600">Time</th>
                                                <th className="text-left px-3 py-2 text-gray-600">Priority</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {conflictWarning.existingJobs.map(job => (
                                                <tr key={job.id} className="border-t hover:bg-gray-50">
                                                    <td className="px-3 py-2 font-medium">{job.customer.name}</td>
                                                    <td className="px-3 py-2 text-gray-600">
                                                        {job.scheduled_at && format((job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)), 'MMM d')}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-600">
                                                        {job.scheduled_at && format((job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)), 'h:mm a')}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${job.priority === 'critical' ? 'bg-red-100 text-red-800' :
                                                            job.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                                                job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                                    'bg-green-100 text-green-800'
                                                            }`}>{job.priority}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                                    <p className="text-sm text-blue-800">
                                        <strong>Note:</strong> Existing jobs will keep their current times.
                                        New jobs will be scheduled in available gaps around them.
                                    </p>
                                </div>
                            </div>
                            <div className="border-t px-5 py-4 bg-gray-50 flex justify-end gap-3">
                                <button
                                    onClick={() => setConflictWarning({ show: false, existingJobs: [], selectedDates: [], unscheduledCount: 0 })}
                                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAISchedule}
                                    className="px-6 py-2 bg-gradient-to-r from-blue-600 to-amber-600 hover:from-blue-700 hover:to-amber-700 text-white rounded-lg shadow transition font-semibold flex items-center gap-2"
                                >
                                    <Sparkles size={16} />
                                    Proceed with Optimization
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Optimization Results Preview Modal */}
                {optimizationResults?.show && (
                    <OptimizationPreviewModal
                        isOpen={true}
                        onClose={() => setOptimizationResults(null)}
                        scheduledJobs={optimizationResults.scheduledJobs}
                        unschedulableJobs={optimizationResults.unschedulableJobs}
                        warnings={optimizationResults.warnings}
                        stats={optimizationResults.stats}
                        daysOptimized={optimizationResults.daysOptimized}
                        mapsUrl={optimizationResults.mapsUrl}
                    />
                )}
            </div>
        </DndProvider>
    );
};
