import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore';
import { Job } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { format, startOfDay, endOfDay, isSameDay, addMinutes } from 'date-fns';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import toast from 'react-hot-toast';
import {
    optimizeScheduleWithAI,
    generateGoogleMapsRoute,
    calculateDayStatistics
} from '../lib/aiScheduler';

interface ScheduledJob extends Job {
    driveTimeMinutes?: number;
    arrivalTime?: Date;
    departureTime?: Date;
}

const ITEM_TYPE = 'JOB';

interface DraggableJobProps {
    job: ScheduledJob;
    index: number;
    moveJob: (fromIndex: number, toIndex: number) => void;
}

const DraggableJob: React.FC<DraggableJobProps> = ({ job, index, moveJob }) => {
    const [{ isDragging }, drag] = useDrag({
        type: ITEM_TYPE,
        item: { index },
        collect: (monitor) => ({
            isDragging: monitor.isDragging()
        })
    });

    const [, drop] = useDrop({
        accept: ITEM_TYPE,
        hover: (draggedItem: { index: number }) => {
            if (draggedItem.index !== index) {
                moveJob(draggedItem.index, index);
                draggedItem.index = index;
            }
        }
    });

    const isPartsRun = job.type === 'parts_run';
    const bgColor = isPartsRun ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-300';

    return (
        <div
            ref={(node) => drag(drop(node))}
            className={`p-4 rounded-lg border-2 ${bgColor} ${isDragging ? 'opacity-50' : ''} cursor-move hover:shadow-lg transition-shadow`}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                        <span className="text-lg font-bold text-blue-700">
                            {job.arrivalTime ? format(job.arrivalTime, 'h:mm a') : 'TBD'}
                        </span>
                        {job.driveTimeMinutes && (
                            <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                                🚗 {job.driveTimeMinutes}m drive
                            </span>
                        )}
                        {isPartsRun && (
                            <span className="text-xs bg-amber-200 text-amber-800 px-2 py-1 rounded font-semibold">
                                📦 PARTS RUN
                            </span>
                        )}
                    </div>
                    <h3 className="font-bold text-gray-800">{job.customer.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{job.request?.description || 'No description'}</p>
                    <div className="flex items-center mt-2 text-xs text-gray-500">
                        <span className="mr-4">📍 {job.customer.address}</span>
                        <span className="mr-4">⏱️ {job.estimated_duration}m</span>
                        <span className={`px-2 py-0.5 rounded-full capitalize ${
                            job.priority === 'critical' ? 'bg-red-100 text-red-800' :
                            job.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                            'bg-blue-100 text-blue-800'
                        }`}>
                            {job.priority}
                        </span>
                    </div>
                </div>
                <div className="flex flex-col items-end space-y-1">
                    <span className="text-xs text-gray-400">#{index + 1}</span>
                    <button
                        className="text-2xl hover:scale-110 transition-transform"
                        title="Drag to reorder"
                    >
                        ⋮⋮
                    </button>
                </div>
            </div>
        </div>
    );
};

export const SoloScheduler: React.FC = () => {
    const { user } = useAuth();
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set()); // Multi-day selection
    const [unscheduledJobs, setUnscheduledJobs] = useState<Job[]>([]);
    const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [optimizing, setOptimizing] = useState(false);
    const [homeLocation] = useState({ lat: 21.3099, lng: -157.8581 }); // Default Honolulu
    const [mapsUrl, setMapsUrl] = useState<string>('');
    const [warnings, setWarnings] = useState<string[]>([]);
    const [optimizationMode, setOptimizationMode] = useState<'single' | 'multi'>('single');
    const [calendarStartDate, setCalendarStartDate] = useState<Date>(new Date());

    useEffect(() => {
        loadJobs();
    }, [user, selectedDate]);

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

    // Generate array of 30 days starting from calendarStartDate
    const generateCalendarDays = (): Date[] => {
        const days: Date[] = [];
        for (let i = 0; i < 30; i++) {
            const date = new Date(calendarStartDate);
            date.setDate(date.getDate() + i);
            days.push(date);
        }
        return days;
    };

    const loadJobs = async () => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';
        setLoading(true);

        try {
            const jobsRef = collection(db, 'jobs');

            // Get scheduled jobs for selected date
            const dayStart = Timestamp.fromDate(startOfDay(selectedDate));
            const dayEnd = Timestamp.fromDate(endOfDay(selectedDate));

            // Simplified query - filter by org_id and status only
            const scheduledQ = query(
                jobsRef,
                where('org_id', '==', orgId),
                where('status', 'in', ['scheduled', 'in_progress'])
            );

            const scheduledSnap = await getDocs(scheduledQ);
            const scheduled = scheduledSnap.docs
                .map(doc => {
                    const data = doc.data() as Job;
                    return {
                        ...data,
                        id: doc.id,
                        arrivalTime: data.scheduled_at ? (data.scheduled_at?.toDate?.() || new Date(data.scheduled_at)) : undefined,
                        departureTime: data.scheduled_at?.toDate
                            ? new Date((data.scheduled_at?.toDate?.() || new Date(data.scheduled_at)).getTime() + (data.estimated_duration || 60) * 60000)
                            : undefined
                    } as ScheduledJob;
                })
                // Filter in JavaScript for assigned tech and date range
                .filter(job => {
                    const isAssignedToMe = job.assigned_tech_id === user.uid;
                    const scheduledTime = job.arrivalTime;
                    if (!scheduledTime) return false;

                    const isInDateRange =
                        scheduledTime >= dayStart.toDate() &&
                        scheduledTime <= dayEnd.toDate();

                    return isAssignedToMe && isInDateRange;
                })
                .sort((a, b) => {
                    const timeA = a.arrivalTime?.getTime() || 0;
                    const timeB = b.arrivalTime?.getTime() || 0;
                    return timeA - timeB;
                });

            setScheduledJobs(scheduled);

            // Update maps URL
            if (scheduled.length > 0) {
                const url = generateGoogleMapsRoute(homeLocation, scheduled);
                setMapsUrl(url);
            }

            // Get unscheduled jobs - simplified query
            const unscheduledQ = query(
                jobsRef,
                where('org_id', '==', orgId),
                where('status', '==', 'pending')
            );

            const unscheduledSnap = await getDocs(unscheduledQ);
            const unscheduled = unscheduledSnap.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as Job))
                // Filter in JavaScript for assigned tech
                .filter(job => job.assigned_tech_id === user.uid);

            setUnscheduledJobs(unscheduled);
        } catch (error) {
            console.error('Error loading jobs:', error);
            toast.error('Failed to load jobs');
        } finally {
            setLoading(false);
        }
    };

    const handleOptimize = async () => {
        // Determine which dates to optimize
        let datesToOptimize: Date[] = [];

        if (optimizationMode === 'single') {
            datesToOptimize = [selectedDate];
        } else {
            // Multi-day mode: use selected dates
            if (selectedDates.size === 0) {
                toast.error('Please select at least one day to optimize');
                return;
            }
            // Convert selected date strings to Date objects and sort
            datesToOptimize = Array.from(selectedDates)
                .map(dateStr => new Date(dateStr))
                .sort((a, b) => a.getTime() - b.getTime());
        }

        const daysCount = datesToOptimize.length;

        // Only use unscheduled jobs (never include manually scheduled jobs)
        const jobsToOptimize = unscheduledJobs;
        if (jobsToOptimize.length === 0) {
            toast("No unscheduled jobs to optimize", { icon: 'ℹ️' });
            return;
        }

        setOptimizing(true);
        const loadingToast = toast.loading(`🤖 AI is optimizing ${jobsToOptimize.length} jobs across ${daysCount} day(s)...`);

        try {
            const allScheduledJobs: ScheduledJob[] = [];
            const allUnschedulableJobs: Job[] = [];
            const allWarnings: string[] = [];
            let remainingJobs = [...jobsToOptimize];

            // Optimize for each selected day
            for (let i = 0; i < datesToOptimize.length; i++) {
                const currentDay = new Date(datesToOptimize[i]);
                currentDay.setHours(8, 0, 0, 0);

                const dayLabel = format(currentDay, 'MMM d, yyyy');
                console.log(`Optimizing ${dayLabel}...`);

                if (remainingJobs.length === 0) break;

                // Run AI optimization for this day
                const result = await optimizeScheduleWithAI(
                    remainingJobs,
                    homeLocation,
                    currentDay,
                    true // Use real Google Maps API
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
                    status: 'scheduled'
                });
            });
            await batch.commit();

            // Update UI state
            setUnscheduledJobs(allUnschedulableJobs);
            setWarnings(allWarnings);

            // Clear selected dates after successful optimization
            if (optimizationMode === 'multi') {
                clearSelectedDates();
            }

            // Show results
            if (allWarnings.length > 0) {
                toast(`⚠️ Scheduled ${allScheduledJobs.length} jobs, ${allUnschedulableJobs.length} need special handling`, {
                    id: loadingToast,
                    duration: 6000,
                    icon: '⚠️'
                });
            } else {
                toast.success(
                    `✅ Optimized ${allScheduledJobs.length} jobs across ${daysCount} day(s)!`,
                    { id: loadingToast, duration: 4000 }
                );
            }

            // Reload to show updated schedule
            await loadJobs();
        } catch (error) {
            console.error('Optimization failed:', error);
            toast.error('AI optimization failed', { id: loadingToast });
        } finally {
            setOptimizing(false);
        }
    };

    const moveJob = (fromIndex: number, toIndex: number) => {
        const updatedJobs = [...scheduledJobs];
        const [movedJob] = updatedJobs.splice(fromIndex, 1);
        updatedJobs.splice(toIndex, 0, movedJob);

        // Recalculate times based on new order
        let currentTime = new Date(selectedDate);
        currentTime.setHours(8, 0, 0, 0);
        let currentLoc = homeLocation;

        const recalculated = updatedJobs.map(job => {
            if (!job.location) return job;

            // Use existing drive time or estimate
            const driveTime = job.driveTimeMinutes || 20;
            currentTime = new Date(currentTime.getTime() + driveTime * 60000);

            const arrival = new Date(currentTime);
            const departure = new Date(currentTime.getTime() + (job.estimated_duration || 60) * 60000);

            currentTime = departure;
            currentLoc = job.location;

            return {
                ...job,
                arrivalTime: arrival,
                departureTime: departure,
                scheduled_at: Timestamp.fromDate(arrival)
            };
        });

        setScheduledJobs(recalculated);

        // Update maps URL
        const url = generateGoogleMapsRoute(homeLocation, recalculated);
        setMapsUrl(url);

        toast.success('Schedule reordered!');
    };

    const handleSaveSchedule = async () => {
        const loadingToast = toast.loading('Saving schedule...');

        try {
            const batch = writeBatch(db);

            scheduledJobs.forEach(job => {
                if (!job.id) return;
                const jobRef = doc(db, 'jobs', job.id);
                batch.update(jobRef, {
                    scheduled_at: job.scheduled_at,
                    status: 'scheduled'
                });
            });

            await batch.commit();
            toast.success('Schedule saved!', { id: loadingToast });
            loadJobs(); // Reload to sync
        } catch (error) {
            console.error('Save failed:', error);
            toast.error('Failed to save schedule', { id: loadingToast });
        }
    };

    const stats = calculateDayStatistics(scheduledJobs);

    if (loading) {
        return <div className="p-8">Loading scheduler...</div>;
    }

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="min-h-screen bg-gray-50 p-4 md:p-8">
                {/* Header */}
                <header className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-800">🤖 AI Route Optimizer</h1>
                            <p className="text-gray-600">Intelligent scheduling with real-time traffic data</p>
                        </div>
                        <div className="flex items-center space-x-3">
                            <select
                                value={optimizationMode}
                                onChange={(e) => setOptimizationMode(e.target.value as 'single' | 'multi')}
                                className="border rounded px-3 py-2 bg-white"
                            >
                                <option value="single">Single Day</option>
                                <option value="multi">Multi-Day Select</option>
                            </select>

                            {optimizationMode === 'single' && (
                                <input
                                    type="date"
                                    value={format(selectedDate, 'yyyy-MM-dd')}
                                    onChange={(e) => setSelectedDate(new Date(e.target.value))}
                                    className="border rounded px-3 py-2"
                                />
                            )}

                            <button
                                onClick={() => handleOptimize()}
                                disabled={optimizing || unscheduledJobs.length === 0}
                                className="bg-gradient-to-r from-blue-600 to-amber-600 hover:from-blue-700 hover:to-amber-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg disabled:opacity-50 transition-all"
                            >
                                {optimizing ? '🤖 Optimizing...' : '✨ Auto-Schedule'}
                            </button>

                            {optimizationMode === 'multi' && selectedDates.size > 0 && (
                                <button
                                    onClick={clearSelectedDates}
                                    className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded shadow"
                                >
                                    Clear ({selectedDates.size})
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Multi-Day Calendar Selector */}
                    {optimizationMode === 'multi' && (
                        <div className="bg-white p-4 rounded-lg shadow mb-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-gray-700">Select Days to Optimize ({selectedDates.size} selected)</h3>
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => {
                                            const newStart = new Date(calendarStartDate);
                                            newStart.setDate(newStart.getDate() - 30);
                                            setCalendarStartDate(newStart);
                                        }}
                                        className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                                    >
                                        ← Prev 30
                                    </button>
                                    <span className="text-sm text-gray-600">
                                        {format(calendarStartDate, 'MMM d')} - {format(new Date(calendarStartDate.getTime() + 29 * 24 * 60 * 60 * 1000), 'MMM d, yyyy')}
                                    </span>
                                    <button
                                        onClick={() => {
                                            const newStart = new Date(calendarStartDate);
                                            newStart.setDate(newStart.getDate() + 30);
                                            setCalendarStartDate(newStart);
                                        }}
                                        className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                                    >
                                        Next 30 →
                                    </button>
                                </div>
                            </div>

                            {/* Calendar Grid */}
                            <div className="grid grid-cols-10 gap-2">
                                {generateCalendarDays().map((day) => {
                                    const dateKey = formatDateKey(day);
                                    const isSelected = selectedDates.has(dateKey);
                                    const isToday = isSameDay(day, new Date());
                                    const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

                                    return (
                                        <button
                                            key={dateKey}
                                            onClick={() => !isPast && toggleDateSelection(day)}
                                            disabled={isPast}
                                            className={`
                                                p-3 rounded-lg border-2 text-center transition-all
                                                ${isSelected ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300'}
                                                ${isToday && !isSelected ? 'border-blue-400 ring-2 ring-blue-200' : ''}
                                                ${isPast ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-lg cursor-pointer'}
                                            `}
                                        >
                                            <div className="text-xs font-semibold">{format(day, 'EEE')}</div>
                                            <div className="text-lg font-bold">{format(day, 'd')}</div>
                                            <div className="text-xs">{format(day, 'MMM')}</div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-3 text-sm text-gray-600">
                                💡 Click days to select/deselect. Manually scheduled jobs will not be affected.
                            </div>
                        </div>
                    )}

                    {/* Stats Bar */}
                    <div className="grid grid-cols-5 gap-4 bg-white p-4 rounded-lg shadow">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{stats.totalJobs}</div>
                            <div className="text-xs text-gray-500 uppercase">Jobs</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-amber-600">{stats.partsRuns}</div>
                            <div className="text-xs text-gray-500 uppercase">Parts Runs</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600">{stats.totalDriveTime}m</div>
                            <div className="text-xs text-gray-500 uppercase">Drive Time</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{stats.totalWorkTime}m</div>
                            <div className="text-xs text-gray-500 uppercase">Work Time</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-600">
                                {stats.estimatedEndTime ? format(stats.estimatedEndTime, 'h:mm a') : 'TBD'}
                            </div>
                            <div className="text-xs text-gray-500 uppercase">End Time</div>
                        </div>
                    </div>

                    {/* Warnings */}
                    {warnings.length > 0 && (
                        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex items-start space-x-3">
                                <span className="text-2xl">⚠️</span>
                                <div className="flex-1">
                                    <div className="font-bold text-yellow-800 mb-2">Scheduling Warnings</div>
                                    <ul className="text-sm text-yellow-700 space-y-1">
                                        {warnings.map((warning, idx) => (
                                            <li key={idx}>• {warning}</li>
                                        ))}
                                    </ul>
                                    <p className="text-xs text-yellow-600 mt-2">
                                        These jobs need to be scheduled for a different day or require special handling.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Google Maps Route */}
                    {mapsUrl && scheduledJobs.length > 0 && (
                        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <span className="text-3xl">🗺️</span>
                                <div>
                                    <div className="font-bold text-gray-800">Full Day Route</div>
                                    <div className="text-sm text-gray-600">
                                        {scheduledJobs.length} stops • {stats.totalDriveTime}m drive time
                                    </div>
                                </div>
                            </div>
                            <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg shadow transition-colors"
                            >
                                Open in Google Maps →
                            </a>
                        </div>
                    )}
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Scheduled Jobs (Drag & Drop) */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-lg shadow p-6">
                            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                                <span className="bg-blue-100 text-blue-800 p-2 rounded-full mr-3">📅</span>
                                Scheduled ({scheduledJobs.length})
                                <span className="ml-3 text-sm font-normal text-gray-500">Drag to reorder</span>
                            </h2>

                            {scheduledJobs.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">
                                    <p className="text-lg">No jobs scheduled yet</p>
                                    <p className="text-sm">Click "Auto-Schedule" to optimize your route</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {scheduledJobs.map((job, index) => (
                                        <DraggableJob
                                            key={job.id || index}
                                            job={job}
                                            index={index}
                                            moveJob={moveJob}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Unscheduled Jobs */}
                    <div>
                        <div className="bg-white rounded-lg shadow p-6">
                            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                                <span className="bg-gray-100 text-gray-800 p-2 rounded-full mr-3">📋</span>
                                Backlog ({unscheduledJobs.length})
                            </h2>

                            {unscheduledJobs.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <p>All jobs scheduled!</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {unscheduledJobs.map(job => (
                                        <div key={job.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                                            <h3 className="font-bold text-sm text-gray-800">{job.customer.name}</h3>
                                            <p className="text-xs text-gray-600 mt-1">{job.request?.description || 'No description'}</p>
                                            <div className="flex items-center mt-2 text-xs text-gray-500">
                                                <span className={`px-2 py-0.5 rounded-full capitalize ${
                                                    job.priority === 'critical' ? 'bg-red-100 text-red-800' :
                                                    job.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                                    'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {job.priority}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </DndProvider>
    );
};
