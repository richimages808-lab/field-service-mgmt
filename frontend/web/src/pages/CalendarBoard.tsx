import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Job, UserProfile } from '../types';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { format, addDays, startOfWeek, isSameDay, setHours, setMinutes, addMinutes, parse } from 'date-fns';
import { TechnicianMap } from '../components/dispatcher/TechnicianMap';
import { optimizeSchedule, getSmartDuration } from '../lib/scheduler';
import { autoAssignJobs } from '../lib/smartScheduler';
import { Clock, MapPin, Wrench, Calendar, Zap, Users, CheckCircle2 } from 'lucide-react';
import { EditJobModal } from '../components/EditJobModal';

const HOUR_HEIGHT = 60; // pixels per hour
const START_HOUR = 7; // 7am
const END_HOUR = 19; // 7pm
const HOURS_DISPLAY = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

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
        in_progress: 'bg-purple-50',
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
            </div>
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
}

const TimeSlot: React.FC<TimeSlotProps> = ({ date, hour, techId, jobs, unassignedJobs, onDrop, onJobClick }) => {
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
        const jobTime = job.scheduled_at.toDate();
        return isSameDay(jobTime, date) && jobTime.getHours() === hour && job.assigned_tech_id === techId;
    });

    // Check if any unassigned job has availability window matching this time slot
    const hasCustomerAvailability = unassignedJobs.some(job => {
        if (!job.request?.availabilityWindows || job.request.availabilityWindows.length === 0) {
            return false;
        }

        // Check if any availability window matches this date/time
        return job.request.availabilityWindows.some(window => {
            try {
                // Parse window day (could be day name or specific date)
                const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const windowDay = window.day.toLowerCase();
                const currentDayName = dayNames[date.getDay()];

                // Check if day matches
                const dayMatches = windowDay === currentDayName || window.day === format(date, 'yyyy-MM-dd');

                if (!dayMatches) return false;

                // Parse time range
                const [startHour, startMin] = window.startTime.split(':').map(Number);
                const [endHour, endMin] = window.endTime.split(':').map(Number);

                // Check if current hour falls within the window
                return hour >= startHour && hour < endHour;
            } catch (error) {
                console.error('Error parsing availability window:', error);
                return false;
            }
        });
    });

    return (
        <div
            ref={drop}
            className={`border-b border-r border-gray-200 relative ${
                isOver
                    ? 'bg-blue-100'
                    : hasCustomerAvailability
                    ? 'bg-green-50 hover:bg-green-100'
                    : 'bg-white hover:bg-gray-50'
            }`}
            style={{ height: `${HOUR_HEIGHT}px` }}
            title={hasCustomerAvailability ? 'Customer requested time window' : ''}
        >
            {hasCustomerAvailability && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" title="Customer availability" />
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
    const [jobs, setJobs] = useState<Job[]>([]);
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [viewDate, setViewDate] = useState<Date>(new Date());
    const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
    const [editingJob, setEditingJob] = useState<Job | null>(null);
    const [showUnassigned, setShowUnassigned] = useState(true);
    const [showMap, setShowMap] = useState(true);

    const orgId = (user as any)?.org_id || 'demo-org';

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
            const techsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
            setTechnicians(techsData);
            // Auto-select all techs on load
            if (selectedTechIds.length === 0) {
                setSelectedTechIds(techsData.map(t => t.id));
            }
        });
        return unsubscribe;
    }, [orgId]);

    // Calculate week range
    const weekStart = startOfWeek(viewDate, { weekStartsOn: 1 }); // Monday
    const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)); // Mon-Fri

    // Unassigned jobs
    const unassignedJobs = useMemo(() => {
        return jobs.filter(j => !j.assigned_tech_id && j.status === 'pending');
    }, [jobs]);

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
                            className={`px-4 py-2 rounded flex items-center gap-2 ${showMap ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                                }`}
                        >
                            <MapPin size={16} />
                            {showMap ? 'Hide Map' : 'Show Map'}
                        </button>
                    </div>
                </div>

                {/* Main Content: Calendar + Map */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Calendar View */}
                    <div className={`${showMap ? 'w-2/3' : 'w-full'} flex flex-col overflow-hidden border-r border-gray-200`}>
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

                        {/* Calendar Grid */}
                        <div className="flex-1 overflow-auto">
                            <div className="inline-block min-w-full">
                                {/* Header Row */}
                                <div className="flex sticky top-0 z-20 bg-white border-b-2 border-gray-300">
                                    <div className="w-16 flex-shrink-0 border-r border-gray-300"></div>
                                    {showUnassigned && (
                                        <div className="w-32 flex-shrink-0 border-r border-gray-300 p-2 text-center font-semibold text-sm bg-gray-100">
                                            Unassigned
                                        </div>
                                    )}
                                    {selectedTechIds.map(techId => {
                                        const tech = technicians.find(t => t.id === techId);
                                        return (
                                            <div key={techId} className="flex-1 min-w-[150px] border-r border-gray-300">
                                                <div className="p-2 text-center">
                                                    <div className="font-semibold text-sm">{tech?.name}</div>
                                                    <div className="text-xs text-gray-500">{tech?.specialties?.join(', ')}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Day Headers */}
                                <div className="flex sticky top-12 z-20 bg-white border-b border-gray-300">
                                    <div className="w-16 flex-shrink-0 border-r border-gray-300"></div>
                                    {showUnassigned && <div className="w-32 flex-shrink-0 border-r border-gray-300"></div>}
                                    {weekDays.map(day => (
                                        <div
                                            key={day.toISOString()}
                                            className="flex-1 border-r border-gray-300 p-1 text-center bg-gray-50"
                                            style={{ minWidth: `${150 * selectedTechIds.length}px` }}
                                        >
                                            <div className="font-semibold text-sm">{format(day, 'EEE')}</div>
                                            <div className="text-xs text-gray-600">{format(day, 'MMM d')}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Time Slots */}
                                {HOURS_DISPLAY.map(hour => (
                                    <div key={hour} className="flex">
                                        {/* Hour Label */}
                                        <div className="w-16 flex-shrink-0 border-r border-gray-300 text-xs text-gray-600 text-right pr-2 pt-1">
                                            {format(setHours(new Date(), hour), 'ha')}
                                        </div>

                                        {/* Unassigned Column */}
                                        {showUnassigned && (
                                            <div className="w-32 flex-shrink-0 border-r border-gray-300">
                                                {weekDays.map(day => (
                                                    <TimeSlot
                                                        key={`unassigned-${day.toISOString()}-${hour}`}
                                                        date={day}
                                                        hour={hour}
                                                        techId={null}
                                                        jobs={unassignedJobs}
                                                        unassignedJobs={unassignedJobs}
                                                        onDrop={handleJobDrop}
                                                        onJobClick={setEditingJob}
                                                    />
                                                ))}
                                            </div>
                                        )}

                                        {/* Tech Columns */}
                                        {selectedTechIds.map(techId =>
                                            weekDays.map(day => (
                                                <div key={`${techId}-${day.toISOString()}`} className="flex-1 min-w-[150px]">
                                                    <TimeSlot
                                                        date={day}
                                                        hour={hour}
                                                        techId={techId}
                                                        jobs={jobs}
                                                        unassignedJobs={unassignedJobs}
                                                        onDrop={handleJobDrop}
                                                        onJobClick={setEditingJob}
                                                    />
                                                </div>
                                            ))
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Map View */}
                    {showMap && (
                        <div className="w-1/3 bg-white flex flex-col">
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
                    )}
                </div>

                {/* Edit Job Modal */}
                {editingJob && (
                    <EditJobModal
                        job={editingJob}
                        onClose={() => setEditingJob(null)}
                    />
                )}
            </div>
        </DndProvider>
    );
};
