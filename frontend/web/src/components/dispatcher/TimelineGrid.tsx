import React, { useState, useMemo, useEffect } from 'react';
import { useDrop } from 'react-dnd';
import { Job, UserProfile } from '../../types';
import { format, addMinutes, startOfDay, setHours, setMinutes, differenceInMinutes, isSameDay } from 'date-fns';
import { X, User, Clock, MapPin, Wrench, AlertTriangle } from 'lucide-react';

interface TimelineGridProps {
    technicians: UserProfile[];
    jobs: Job[];
    viewDate: Date;
    onJobDrop: (jobId: string, techId: string, startTime: Date) => void;
    selectedTechIds: string[];
}

const TIME_SLOTS_START = 7; // 7 AM
const TIME_SLOTS_END = 19; // 7 PM
const SLOT_DURATION = 30; // Minutes

// ============================================================================
// Job Detail Popover (shown on click)
// ============================================================================
const JobPopover = ({ job, onClose, position }: { job: Job; onClose: () => void; position: { x: number; y: number } }) => {
    const aiRec = job.intakeReview?.aiRecommendation;
    const startTime = job.scheduled_at?.toDate ? job.scheduled_at.toDate() : new Date(job.scheduled_at);

    return (
        <>
            <div className="fixed inset-0 z-30" onClick={onClose} />
            <div
                className="absolute z-40 bg-white rounded-lg shadow-2xl border border-gray-200 w-72 overflow-hidden"
                style={{
                    left: `${Math.min(position.x, 70)}%`,
                    top: position.y > 50 ? 'auto' : '100%',
                    bottom: position.y > 50 ? '100%' : 'auto',
                    transform: 'translateX(-50%)',
                    marginTop: position.y > 50 ? 0 : 8,
                    marginBottom: position.y > 50 ? 8 : 0
                }}
            >
                {/* Header */}
                <div className={`px-3 py-2 text-white text-sm font-semibold flex justify-between items-center ${
                    job.status === 'in_progress' ? 'bg-green-600' :
                    job.priority === 'critical' ? 'bg-red-600' :
                    job.priority === 'high' ? 'bg-orange-500' : 'bg-blue-600'
                }`}>
                    <span className="truncate">{job.customer.name}</span>
                    <button onClick={onClose} className="p-0.5 hover:bg-white/20 rounded">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="p-3 space-y-2.5 text-xs">
                    {/* Status + Priority */}
                    <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${
                            job.status === 'in_progress' ? 'bg-green-100 text-green-800' :
                            job.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-600'
                        }`}>{job.status.replace('_', ' ')}</span>
                        <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${
                            job.priority === 'critical' ? 'bg-red-100 text-red-800' :
                            job.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-600'
                        }`}>{job.priority}</span>
                    </div>

                    {/* Description */}
                    <p className="text-gray-600 leading-relaxed">{job.request?.description || 'No description'}</p>

                    {/* Details */}
                    <div className="space-y-1 text-gray-500">
                        <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {format(startTime, 'h:mm a')} • {job.estimated_duration || 60} min
                        </div>
                        <div className="flex items-center gap-1.5">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate">{job.customer.address?.split(',')[0] || 'No address'}</span>
                        </div>
                        {job.customer.phone && (
                            <div className="flex items-center gap-1.5">
                                <User className="w-3 h-3" />
                                {job.customer.phone}
                            </div>
                        )}
                    </div>

                    {/* AI recommendation */}
                    {aiRec && (
                        <div className="pt-2 border-t border-gray-100">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Complexity:</span>
                                <span className={`font-semibold capitalize ${
                                    aiRec.complexity === 'complex' ? 'text-red-600' :
                                    aiRec.complexity === 'medium' ? 'text-amber-600' : 'text-green-600'
                                }`}>{aiRec.complexity}</span>
                            </div>
                            {aiRec.skillsRequired?.length > 0 && (
                                <div className="mt-1">
                                    <span className="text-gray-500">Skills: </span>
                                    <span className="font-medium text-gray-700">{aiRec.skillsRequired.join(', ')}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

// ============================================================================
// Main TimelineGrid
// ============================================================================
export const TimelineGrid: React.FC<TimelineGridProps> = ({ technicians, jobs, viewDate, onJobDrop, selectedTechIds }) => {
    const [now, setNow] = useState(new Date());

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Generate Time Slots
    const timeSlots: Date[] = useMemo(() => {
        const slots: Date[] = [];
        let currentTime = setMinutes(setHours(startOfDay(viewDate), TIME_SLOTS_START), 0);
        const endTime = setMinutes(setHours(startOfDay(viewDate), TIME_SLOTS_END), 0);
        while (currentTime < endTime) {
            slots.push(currentTime);
            currentTime = addMinutes(currentTime, SLOT_DURATION);
        }
        return slots;
    }, [viewDate]);

    // Filter technicians
    const visibleTechnicians = technicians.filter(tech => selectedTechIds.includes(tech.id));

    // Calculate current time position
    const isToday = isSameDay(now, viewDate);
    const totalMinutes = (TIME_SLOTS_END - TIME_SLOTS_START) * 60;
    const nowMinutes = differenceInMinutes(now, setMinutes(setHours(startOfDay(now), TIME_SLOTS_START), 0));
    const nowPercent = isToday ? Math.max(0, Math.min(100, (nowMinutes / totalMinutes) * 100)) : -1;

    return (
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-white flex flex-col h-full relative">
            {/* Header Row (Time) */}
            <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
                <div className="w-60 flex-shrink-0 p-3 font-bold text-gray-700 bg-gray-50 border-r border-gray-200 text-xs uppercase tracking-wide">
                    Technicians
                </div>
                <div className="flex-1 flex relative">
                    {timeSlots.map((slot, index) => (
                        <div key={index} className={`flex-1 min-w-[50px] border-r border-gray-100 p-1.5 text-[10px] text-gray-500 text-center font-medium ${
                            slot.getMinutes() === 0 ? 'bg-gray-50/50' : ''
                        }`}>
                            {slot.getMinutes() === 0 ? format(slot, 'ha') : ''}
                        </div>
                    ))}
                    {/* Current time indicator on header */}
                    {nowPercent >= 0 && nowPercent <= 100 && (
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                            style={{ left: `${nowPercent}%` }}
                        >
                            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
                        </div>
                    )}
                </div>
            </div>

            {/* Technician Rows */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {visibleTechnicians.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                        No technicians selected. Use the filter to show technicians.
                    </div>
                ) : (
                    visibleTechnicians.map(tech => {
                        const techJobs = jobs.filter(j =>
                            j.assigned_tech_id === tech.id &&
                            j.scheduled_at?.toDate &&
                            isSameDay((j.scheduled_at?.toDate?.() || new Date(j.scheduled_at)), viewDate)
                        );
                        return (
                            <TechnicianRow
                                key={tech.id}
                                tech={tech}
                                timeSlots={timeSlots}
                                jobs={techJobs}
                                onJobDrop={onJobDrop}
                                nowPercent={nowPercent}
                            />
                        );
                    })
                )}
            </div>
        </div>
    );
};

// ============================================================================
// TechnicianRow with capacity bar
// ============================================================================
const TechnicianRow = ({ tech, timeSlots, jobs, onJobDrop, nowPercent }: {
    tech: UserProfile;
    timeSlots: Date[];
    jobs: Job[];
    onJobDrop: (jobId: string, techId: string, startTime: Date) => void;
    nowPercent: number;
}) => {
    const [activePopover, setActivePopover] = useState<{ job: Job; x: number; y: number } | null>(null);

    // Calculate capacity
    const totalScheduledMinutes = jobs.reduce((sum, j) => sum + (j.estimated_duration || 60), 0);
    const maxJobs = tech.schedulingPreferences?.jobPreferences?.maxJobsPerDay || 6;

    // Working hours
    const workStart = getWorkHour(tech, 'start');
    const workEnd = getWorkHour(tech, 'end');
    const totalWorkMinutes = (workEnd - workStart) * 60;
    const capacityPercent = totalWorkMinutes > 0 ? Math.round((totalScheduledMinutes / totalWorkMinutes) * 100) : 0;

    const capacityColor = capacityPercent > 85 ? 'bg-red-500' :
        capacityPercent > 60 ? 'bg-amber-500' : 'bg-green-500';

    const capacityTextColor = capacityPercent > 85 ? 'text-red-700' :
        capacityPercent > 60 ? 'text-amber-700' : 'text-green-700';

    return (
        <div className="flex border-b border-gray-100 h-[72px] relative group hover:bg-blue-50/30 transition-colors">
            {/* Tech Info */}
            <div className="w-60 flex-shrink-0 px-3 py-2 border-r border-gray-200 flex items-center">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm mr-2.5 flex-shrink-0">
                    {tech.name ? tech.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{tech.name || 'Unnamed Tech'}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        {/* Capacity bar */}
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-[60px]">
                            <div className={`h-full rounded-full transition-all ${capacityColor}`}
                                style={{ width: `${Math.min(100, capacityPercent)}%` }} />
                        </div>
                        <span className={`text-[10px] font-medium ${capacityTextColor}`}>
                            {capacityPercent}%
                        </span>
                        <span className="text-[10px] text-gray-400">
                            {jobs.length}/{maxJobs}
                        </span>
                    </div>
                </div>
            </div>

            {/* Time Slots */}
            <div className="flex-1 flex relative">
                {/* Working hours background */}
                <WorkingHoursOverlay workStart={workStart} workEnd={workEnd} />

                {timeSlots.map((slot, index) => (
                    <TimeSlotCell
                        key={index}
                        slot={slot}
                        techId={tech.id}
                        onDrop={onJobDrop}
                    />
                ))}

                {/* Scheduled Jobs Overlay */}
                {jobs.map(job => {
                    if (!job.scheduled_at?.toDate) return null;
                    const startTime = (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at));
                    const startMinutes = differenceInMinutes(startTime, setMinutes(setHours(startTime, TIME_SLOTS_START), 0));
                    const duration = job.estimated_duration || 60;
                    const totalMinutes = (TIME_SLOTS_END - TIME_SLOTS_START) * 60;
                    const leftPercent = (startMinutes / totalMinutes) * 100;
                    const widthPercent = (duration / totalMinutes) * 100;

                    const isOverdue = job.status === 'scheduled' && new Date() > new Date(startTime.getTime() + duration * 60000);

                    return (
                        <div
                            key={job.id}
                            onClick={(e) => {
                                const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                                setActivePopover({
                                    job,
                                    x: leftPercent + widthPercent / 2,
                                    y: ((e.clientY - rect.top) / rect.height) * 100
                                });
                            }}
                            className={`absolute top-1.5 bottom-1.5 rounded-md shadow-sm px-2 py-1 text-[11px] text-white overflow-hidden cursor-pointer transition-all hover:brightness-110 hover:shadow-md flex flex-col justify-center ${
                                isOverdue ? 'bg-red-500 ring-2 ring-red-300' :
                                job.status === 'in_progress' ? 'bg-green-500 animate-pulse-subtle' :
                                job.status === 'completed' ? 'bg-gray-400' :
                                job.priority === 'critical' ? 'bg-red-500' :
                                job.priority === 'high' ? 'bg-orange-500' :
                                'bg-blue-500'
                            }`}
                            style={{ left: `${leftPercent}%`, width: `${Math.max(widthPercent, 2)}%` }}
                            title={`${job.customer.name} — ${format(startTime, 'h:mm a')} (${duration}m)`}
                        >
                            <div className="font-bold truncate leading-tight">{job.customer.name}</div>
                            {widthPercent > 8 && (
                                <div className="truncate opacity-80 leading-tight">
                                    {format(startTime, 'h:mm a')} • {duration}m
                                </div>
                            )}
                            {isOverdue && (
                                <AlertTriangle className="absolute top-1 right-1 w-3 h-3 text-yellow-200" />
                            )}
                        </div>
                    );
                })}

                {/* Current time line */}
                {nowPercent >= 0 && nowPercent <= 100 && (
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
                        style={{ left: `${nowPercent}%` }}
                    />
                )}

                {/* Job Popover */}
                {activePopover && (
                    <JobPopover
                        job={activePopover.job}
                        onClose={() => setActivePopover(null)}
                        position={{ x: activePopover.x, y: activePopover.y }}
                    />
                )}
            </div>
        </div>
    );
};

// ============================================================================
// Working Hours Overlay (grays out non-working hours)
// ============================================================================
const WorkingHoursOverlay = ({ workStart, workEnd }: { workStart: number; workEnd: number }) => {
    const totalMinutes = (TIME_SLOTS_END - TIME_SLOTS_START) * 60;

    const beforePercent = ((workStart - TIME_SLOTS_START) * 60 / totalMinutes) * 100;
    const afterPercent = ((TIME_SLOTS_END - workEnd) * 60 / totalMinutes) * 100;

    return (
        <>
            {beforePercent > 0 && (
                <div
                    className="absolute top-0 bottom-0 bg-gray-100/60 z-[1] pointer-events-none border-r border-dashed border-gray-300"
                    style={{ left: 0, width: `${beforePercent}%` }}
                />
            )}
            {afterPercent > 0 && (
                <div
                    className="absolute top-0 bottom-0 bg-gray-100/60 z-[1] pointer-events-none border-l border-dashed border-gray-300"
                    style={{ right: 0, width: `${afterPercent}%` }}
                />
            )}
        </>
    );
};

// ============================================================================
// TimeSlotCell (drop target)
// ============================================================================
const TimeSlotCell = ({ slot, techId, onDrop }: { slot: Date; techId: string; onDrop: (jobId: string, techId: string, startTime: Date) => void }) => {
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'JOB',
        drop: (item: { id: string }) => onDrop(item.id, techId, slot),
        collect: (monitor) => ({
            isOver: !!monitor.isOver(),
        }),
    }));

    return (
        <div
            ref={drop}
            className={`flex-1 min-w-[50px] border-r border-gray-100 h-full transition-colors z-[2] ${
                isOver ? 'bg-green-100 ring-2 ring-inset ring-green-400' : ''
            } ${slot.getMinutes() === 0 ? 'border-r-gray-200' : ''}`}
        />
    );
};

// ============================================================================
// Helpers
// ============================================================================
function getWorkHour(tech: UserProfile, type: 'start' | 'end'): number {
    const dayOfWeek = new Date().getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayNames[dayOfWeek] as keyof NonNullable<UserProfile['weeklyAvailability']>;

    const dayAvail = tech.weeklyAvailability?.[dayKey];
    if (dayAvail && 'available' in dayAvail && dayAvail.available) {
        const timeStr = type === 'start' ? dayAvail.startTime : dayAvail.endTime;
        if (timeStr) return parseInt(timeStr.split(':')[0]);
    }

    const prefs = tech.preferences?.working_hours;
    if (prefs) {
        const timeStr = type === 'start' ? prefs.start : prefs.end;
        if (timeStr) return parseInt(timeStr.split(':')[0]);
    }

    return type === 'start' ? 8 : 17;
}
