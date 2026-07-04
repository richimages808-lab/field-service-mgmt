import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import { Job, UserProfile } from '../../types';
import { format, addMinutes, startOfDay, setHours, setMinutes, differenceInMinutes, isSameDay, addDays, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, differenceInDays } from 'date-fns';
import { X, User, Clock, MapPin, Wrench, AlertTriangle, ChevronRight, Star, Shield, CheckCircle, XCircle } from 'lucide-react';
import { rankTechnicians, TechRecommendation } from '../../lib/techMatchingEngine';

export type ViewMode = 'day' | 'week' | 'month';

interface TimelineGridProps {
    technicians: UserProfile[];
    jobs: Job[];
    viewDate: Date;
    onJobDrop: (jobId: string, techId: string, startTime: Date) => void;
    selectedTechIds: string[];
    viewMode?: ViewMode;
    focusedJob?: Job | null;
    onDayClick?: (date: Date) => void;
    allTechnicians?: UserProfile[];
    onScheduledJobDragStart?: (job: Job) => void;
    onScheduledJobDragEnd?: () => void;
}

const TIME_SLOTS_START = 7; // 7 AM
const TIME_SLOTS_END = 19; // 7 PM
const SLOT_DURATION = 30; // Minutes

// ============================================================================
// Availability Matching Helper
// ============================================================================
const isAvailabilityMatch = (
    window: { day: string; startTime: string; endTime: string },
    slotDate: Date,
    slotHour: number
): boolean => {
    try {
        const dayOfWeek = format(slotDate, 'EEEE').toLowerCase();
        const dateStr = format(slotDate, 'yyyy-MM-dd');
        const windowDay = window.day.toLowerCase();

        let isDateMatch = false;
        if (windowDay === dateStr) {
            isDateMatch = true;
        } else if (windowDay === dayOfWeek) {
            const daysDiff = differenceInDays(slotDate, new Date());
            if (daysDiff >= -1 && daysDiff <= 14) {
                isDateMatch = true;
            }
        }
        if (!isDateMatch) return false;

        const [startHour] = window.startTime.split(':').map(Number);
        const [endHour] = window.endTime.split(':').map(Number);
        const slotStartMinutes = slotHour * 60;
        const slotEndMinutes = (slotHour + 1) * 60;
        const windowStartMinutes = startHour * 60;
        const windowEndMinutes = endHour * 60;

        return slotStartMinutes < windowEndMinutes && slotEndMinutes > windowStartMinutes;
    } catch {
        return false;
    }
};

// Check if a date has any availability match for the focused job
const dateHasAvailability = (
    job: Job | null | undefined,
    date: Date
): boolean => {
    if (!job?.request?.availabilityWindows?.length) return false;
    for (let hour = TIME_SLOTS_START; hour < TIME_SLOTS_END; hour++) {
        for (const w of job.request.availabilityWindows) {
            if (isAvailabilityMatch(w, date, hour)) return true;
        }
    }
    return false;
};

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
                    <p className="text-gray-600 leading-relaxed">{job.request?.description || 'No description'}</p>
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
export const TimelineGrid: React.FC<TimelineGridProps> = ({
    technicians, jobs, viewDate, onJobDrop, selectedTechIds,
    viewMode = 'day', focusedJob, onDayClick, allTechnicians,
    onScheduledJobDragStart, onScheduledJobDragEnd
}) => {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    const visibleTechnicians = technicians.filter(tech => selectedTechIds.includes(tech.id));

    // Compute tech match scores when a job is focused
    const techMatchScores = useMemo(() => {
        if (!focusedJob) return new Map<string, TechRecommendation>();
        const techPool = allTechnicians || technicians;
        const ranked = rankTechnicians(techPool, focusedJob, jobs, viewDate);
        const map = new Map<string, TechRecommendation>();
        for (const rec of ranked) {
            map.set(rec.tech.id, rec);
        }
        return map;
    }, [focusedJob, allTechnicians, technicians, jobs, viewDate]);

    if (viewMode === 'month') {
        return (
            <MonthView
                viewDate={viewDate}
                technicians={visibleTechnicians}
                jobs={jobs}
                focusedJob={focusedJob}
                onDayClick={onDayClick}
                techMatchScores={techMatchScores}
            />
        );
    }

    if (viewMode === 'week') {
        return (
            <WeekView
                viewDate={viewDate}
                technicians={visibleTechnicians}
                jobs={jobs}
                onJobDrop={onJobDrop}
                focusedJob={focusedJob}
                onDayClick={onDayClick}
                techMatchScores={techMatchScores}
                onScheduledJobDragStart={onScheduledJobDragStart}
                onScheduledJobDragEnd={onScheduledJobDragEnd}
            />
        );
    }

    return (
        <DayView
            viewDate={viewDate}
            technicians={visibleTechnicians}
            jobs={jobs}
            onJobDrop={onJobDrop}
            focusedJob={focusedJob}
            now={now}
            techMatchScores={techMatchScores}
            onScheduledJobDragStart={onScheduledJobDragStart}
            onScheduledJobDragEnd={onScheduledJobDragEnd}
        />
    );
};

// ============================================================================
// DAY VIEW (original timeline)
// ============================================================================
const DayView = ({ viewDate, technicians, jobs, onJobDrop, focusedJob, now, techMatchScores, onScheduledJobDragStart, onScheduledJobDragEnd }: {
    viewDate: Date;
    technicians: UserProfile[];
    jobs: Job[];
    onJobDrop: (jobId: string, techId: string, startTime: Date) => void;
    focusedJob?: Job | null;
    now: Date;
    techMatchScores?: Map<string, TechRecommendation>;
    onScheduledJobDragStart?: (job: Job) => void;
    onScheduledJobDragEnd?: () => void;
}) => {
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
                    {timeSlots.map((slot, index) => {
                        const hour = slot.getHours();
                        const isHourMark = slot.getMinutes() === 0;
                        const hasAvailability = focusedJob && isHourMark &&
                            focusedJob.request?.availabilityWindows?.some(w =>
                                isAvailabilityMatch(w, viewDate, hour)
                            );

                        return (
                            <div key={index} className={`flex-1 min-w-[50px] border-r border-gray-100 p-1.5 text-[10px] text-center font-medium ${
                                hasAvailability
                                    ? 'bg-green-100 text-green-800 font-bold'
                                    : isHourMark ? 'bg-gray-50/50 text-gray-500' : 'text-gray-500'
                            }`}>
                                {isHourMark ? format(slot, 'ha') : ''}
                                {hasAvailability && isHourMark && (
                                    <div className="text-[8px] text-green-600 font-semibold leading-tight">Requested</div>
                                )}
                            </div>
                        );
                    })}
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
                {technicians.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                        No technicians selected. Use the filter to show technicians.
                    </div>
                ) : (
                    technicians.map(tech => {
                        const techJobs = jobs.filter(j =>
                            j.assigned_tech_id === tech.id &&
                            j.scheduled_at?.toDate &&
                            isSameDay((j.scheduled_at?.toDate?.() || new Date(j.scheduled_at)), viewDate)
                        );
                        const matchRec = techMatchScores?.get(tech.id);
                        return (
                            <TechnicianRow
                                key={tech.id}
                                tech={tech}
                                timeSlots={timeSlots}
                                jobs={techJobs}
                                onJobDrop={onJobDrop}
                                nowPercent={nowPercent}
                                focusedJob={focusedJob}
                                viewDate={viewDate}
                                matchRec={matchRec}
                                hasSelectedJob={!!focusedJob}
                                onScheduledJobDragStart={onScheduledJobDragStart}
                                onScheduledJobDragEnd={onScheduledJobDragEnd}
                            />
                        );
                    })
                )}
            </div>
        </div>
    );
};

// ============================================================================
// WEEK VIEW
// ============================================================================
const WeekView = ({ viewDate, technicians, jobs, onJobDrop, focusedJob, onDayClick, techMatchScores, onScheduledJobDragStart, onScheduledJobDragEnd }: {
    viewDate: Date;
    technicians: UserProfile[];
    jobs: Job[];
    onJobDrop: (jobId: string, techId: string, startTime: Date) => void;
    focusedJob?: Job | null;
    onDayClick?: (date: Date) => void;
    techMatchScores?: Map<string, TechRecommendation>;
    onScheduledJobDragStart?: (job: Job) => void;
    onScheduledJobDragEnd?: () => void;
}) => {
    const weekStart = startOfWeek(viewDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
        <div className="flex-1 overflow-auto bg-white flex flex-col h-full">
            {/* Header Row (Days) */}
            <div className="flex border-b-2 border-gray-300 sticky top-0 bg-white z-10">
                <div className="w-48 flex-shrink-0 p-2 font-bold text-gray-700 bg-gray-50 border-r border-gray-200 text-xs uppercase tracking-wide flex items-center">
                    Technicians
                </div>
                {weekDays.map(day => {
                    const dayIsToday = isSameDay(day, new Date());
                    const dayJobCount = jobs.filter(j =>
                        j.scheduled_at &&
                        isSameDay(j.scheduled_at?.toDate?.() || new Date(j.scheduled_at), day)
                    ).length;
                    const hasAvail = dateHasAvailability(focusedJob, day);

                    return (
                        <div
                            key={day.toISOString()}
                            className={`flex-1 min-w-[120px] p-2 text-center border-r border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors ${
                                dayIsToday ? 'bg-blue-50' : hasAvail ? 'bg-green-50' : 'bg-white'
                            }`}
                            onClick={() => onDayClick?.(day)}
                        >
                            <div className={`text-[10px] font-bold uppercase tracking-wider ${
                                dayIsToday ? 'text-blue-700' : hasAvail ? 'text-green-700' : 'text-gray-500'
                            }`}>
                                {format(day, 'EEE')}
                            </div>
                            <div className={`text-lg font-bold ${
                                dayIsToday ? 'text-blue-700' : hasAvail ? 'text-green-700' : 'text-gray-800'
                            }`}>
                                {format(day, 'd')}
                            </div>
                            {dayJobCount > 0 && (
                                <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${
                                    dayIsToday ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-600'
                                }`}>
                                    {dayJobCount} job{dayJobCount !== 1 ? 's' : ''}
                                </span>
                            )}
                            {hasAvail && (
                                <div className="text-[9px] text-green-600 font-semibold mt-0.5">\u2726 Requested</div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Tech Rows with daily cells */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {technicians.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                        No technicians selected.
                    </div>
                ) : (
                    technicians.map(tech => {
                        const matchRec = techMatchScores?.get(tech.id);
                        const matchScore = matchRec?.compositeScore ?? 0;
                        const isDimmed = !!focusedJob && matchScore < 30;

                        return (
                        <div key={tech.id} className={`flex border-b border-gray-100 min-h-[72px] transition-all ${
                            isDimmed ? 'opacity-40' :
                            focusedJob && matchScore >= 70 ? 'bg-green-50/40 hover:bg-green-50/60 border-l-[3px] border-l-green-500' :
                            focusedJob && matchScore >= 40 ? 'hover:bg-amber-50/20 border-l-[3px] border-l-amber-400' :
                            focusedJob && matchScore < 40 ? 'border-l-[3px] border-l-transparent' :
                            'hover:bg-blue-50/20'
                        }`}>
                            {/* Tech Info */}
                            <div className="w-48 flex-shrink-0 px-3 py-2 border-r border-gray-200 bg-white">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm mr-2 flex-shrink-0">
                                        {tech.name ? tech.name.charAt(0).toUpperCase() : '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-gray-900 truncate">{tech.name || 'Unnamed'}</div>
                                        <div className="text-[10px] text-gray-400 truncate">{tech.specialties?.join(', ') || 'General'}</div>
                                    </div>
                                </div>
                                {/* Qualification status when a job is focused */}
                                {focusedJob && matchRec && (
                                    <div className="mt-1.5">
                                        {matchRec.missingSkills.length === 0 ? (
                                            <div className="flex items-center gap-1 text-[9px] font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5">
                                                <CheckCircle className="w-2.5 h-2.5" />
                                                <span>Qualified</span>
                                                <span className="text-green-500 ml-auto">{matchScore}%</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 text-[9px] font-bold text-red-700 bg-red-50 rounded px-1.5 py-0.5">
                                                <XCircle className="w-2.5 h-2.5" />
                                                <span className="truncate">Missing: {matchRec.missingSkills.join(', ')}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Day Cells */}
                            {weekDays.map(day => {
                                const dayJobs = jobs.filter(j =>
                                    j.assigned_tech_id === tech.id &&
                                    j.scheduled_at &&
                                    isSameDay(j.scheduled_at?.toDate?.() || new Date(j.scheduled_at), day)
                                );
                                const hasAvail = dateHasAvailability(focusedJob, day);

                                return (
                                    <WeekDayCell
                                        key={`${tech.id}-${day.toISOString()}`}
                                        date={day}
                                        techId={tech.id}
                                        jobs={dayJobs}
                                        onJobDrop={onJobDrop}
                                        hasAvailability={hasAvail}
                                        focusedJob={focusedJob}
                                        onDayClick={onDayClick}
                                        onScheduledJobDragStart={onScheduledJobDragStart}
                                        onScheduledJobDragEnd={onScheduledJobDragEnd}
                                    />
                                );
                            })}
                        </div>
                    );})
                )}
            </div>
        </div>
    );
};

// ============================================================================
// Week Day Cell (drop target for week view)
// ============================================================================
const WeekDayCell = ({ date, techId, jobs, onJobDrop, hasAvailability, focusedJob, onDayClick, onScheduledJobDragStart, onScheduledJobDragEnd }: {
    date: Date;
    techId: string;
    jobs: Job[];
    onJobDrop: (jobId: string, techId: string, startTime: Date) => void;
    hasAvailability: boolean;
    focusedJob?: Job | null;
    onDayClick?: (date: Date) => void;
    onScheduledJobDragStart?: (job: Job) => void;
    onScheduledJobDragEnd?: () => void;
}) => {
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'JOB',
        drop: (item: { id: string }) => {
            let dropTime = setMinutes(setHours(date, 9), 0);
            if (focusedJob?.request?.availabilityWindows) {
                for (const w of focusedJob.request.availabilityWindows) {
                    for (let hour = TIME_SLOTS_START; hour < TIME_SLOTS_END; hour++) {
                        if (isAvailabilityMatch(w, date, hour)) {
                            dropTime = setMinutes(setHours(date, hour), 0);
                            break;
                        }
                    }
                }
            }
            onJobDrop(item.id, techId, dropTime);
        },
        collect: (monitor) => ({
            isOver: !!monitor.isOver(),
        }),
    }));

    const dayIsToday = isSameDay(date, new Date());

    return (
        <div
            ref={drop}
            className={`flex-1 min-w-[120px] border-r border-gray-200 p-1.5 transition-colors cursor-pointer ${
                isOver ? 'bg-green-100 ring-2 ring-inset ring-green-400' :
                hasAvailability ? 'bg-green-50/70' :
                dayIsToday ? 'bg-blue-50/30' : ''
            }`}
            onClick={() => onDayClick?.(date)}
        >
            {jobs.length === 0 ? (
                hasAvailability ? (
                    <div className="flex items-center justify-center h-full">
                        <span className="text-[10px] text-green-600 font-medium bg-green-100 px-2 py-0.5 rounded-full">
                            \u2726 Available
                        </span>
                    </div>
                ) : null
            ) : (
                <div className="space-y-1">
                    {jobs.slice(0, 3).map(job => (
                        <DraggableWeekJobChip
                            key={job.id}
                            job={job}
                            onDragStart={onScheduledJobDragStart}
                            onDragEnd={onScheduledJobDragEnd}
                        />
                    ))}
                    {jobs.length > 3 && (
                        <div className="text-[10px] text-gray-500 text-center font-medium">
                            +{jobs.length - 3} more
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// MONTH VIEW
// ============================================================================
const MonthView = ({ viewDate, technicians, jobs, focusedJob, onDayClick, techMatchScores }: {
    viewDate: Date;
    technicians: UserProfile[];
    jobs: Job[];
    focusedJob?: Job | null;
    onDayClick?: (date: Date) => void;
    techMatchScores?: Map<string, TechRecommendation>;
}) => {
    const monthStart = startOfMonth(viewDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfMonth(viewDate);
    const calendarEndWeek = addDays(startOfWeek(calendarEnd, { weekStartsOn: 1 }), 6);
    const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEndWeek });

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className="flex-1 overflow-auto bg-white flex flex-col h-full p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
                {dayNames.map(day => (
                    <div key={day} className="text-center text-xs font-bold text-gray-500 uppercase tracking-wider py-2">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px flex-1 bg-gray-200 rounded-lg overflow-hidden">
                {allDays.map(day => {
                    const isCurrentMonth = day.getMonth() === viewDate.getMonth();
                    const dayIsToday = isSameDay(day, new Date());
                    const dayJobs = jobs.filter(j =>
                        j.scheduled_at &&
                        isSameDay(j.scheduled_at?.toDate?.() || new Date(j.scheduled_at), day)
                    );
                    const hasAvail = dateHasAvailability(focusedJob, day);

                    return (
                        <div
                            key={day.toISOString()}
                            className={`min-h-[100px] p-2 cursor-pointer hover:bg-blue-50 transition-colors ${
                                !isCurrentMonth ? 'bg-gray-50 opacity-50' :
                                dayIsToday ? 'bg-blue-50' :
                                hasAvail ? 'bg-green-50' :
                                'bg-white'
                            }`}
                            onClick={() => onDayClick?.(day)}
                        >
                            {/* Day number */}
                            <div className={`text-sm font-bold mb-1 ${
                                dayIsToday ? 'text-white bg-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-xs' :
                                isCurrentMonth ? 'text-gray-800' : 'text-gray-400'
                            }`}>
                                {format(day, 'd')}
                            </div>

                            {/* Availability indicator */}
                            {hasAvail && isCurrentMonth && (
                                <div className="text-[9px] text-green-700 font-semibold bg-green-100 px-1.5 py-0.5 rounded mb-1 inline-block animate-pulse">
                                    ✦ Requested
                                </div>
                            )}

                            {/* Available techs count when job selected */}
                            {hasAvail && isCurrentMonth && focusedJob && techMatchScores && (
                                <div className="text-[8px] text-blue-600 font-medium mb-0.5">
                                    {Array.from(techMatchScores.values()).filter(r => r.compositeScore >= 40).length} techs available
                                </div>
                            )}

                            {/* Job chips */}
                            {isCurrentMonth && dayJobs.length > 0 && (
                                <div className="space-y-0.5">
                                    {dayJobs.slice(0, 3).map(job => (
                                        <div
                                            key={job.id}
                                            className={`text-[9px] rounded px-1 py-0.5 text-white truncate ${
                                                job.status === 'in_progress' ? 'bg-green-500' :
                                                job.priority === 'critical' ? 'bg-red-500' :
                                                job.priority === 'high' ? 'bg-orange-500' :
                                                'bg-blue-500'
                                            }`}
                                        >
                                            {job.customer.name}
                                        </div>
                                    ))}
                                    {dayJobs.length > 3 && (
                                        <div className="text-[9px] text-gray-500 font-medium">
                                            +{dayJobs.length - 3} more
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ============================================================================
// TechnicianRow with capacity bar (Day View)
// ============================================================================
const TechnicianRow = ({ tech, timeSlots, jobs, onJobDrop, nowPercent, focusedJob, viewDate, matchRec, hasSelectedJob, onScheduledJobDragStart, onScheduledJobDragEnd }: {
    tech: UserProfile;
    timeSlots: Date[];
    jobs: Job[];
    onJobDrop: (jobId: string, techId: string, startTime: Date) => void;
    nowPercent: number;
    focusedJob?: Job | null;
    viewDate: Date;
    matchRec?: TechRecommendation;
    hasSelectedJob?: boolean;
    onScheduledJobDragStart?: (job: Job) => void;
    onScheduledJobDragEnd?: () => void;
}) => {
    const [activePopover, setActivePopover] = useState<{ job: Job; x: number; y: number } | null>(null);

    const totalScheduledMinutes = jobs.reduce((sum, j) => sum + (j.estimated_duration || 60), 0);
    const maxJobs = tech.schedulingPreferences?.jobPreferences?.maxJobsPerDay || 6;

    const workStart = getWorkHour(tech, 'start');
    const workEnd = getWorkHour(tech, 'end');
    const totalWorkMinutes = (workEnd - workStart) * 60;
    const capacityPercent = totalWorkMinutes > 0 ? Math.round((totalScheduledMinutes / totalWorkMinutes) * 100) : 0;

    const capacityColor = capacityPercent > 85 ? 'bg-red-500' :
        capacityPercent > 60 ? 'bg-amber-500' : 'bg-green-500';

    const capacityTextColor = capacityPercent > 85 ? 'text-red-700' :
        capacityPercent > 60 ? 'text-amber-700' : 'text-green-700';

    // Match quality
    const matchScore = matchRec?.compositeScore ?? 0;
    const isDimmed = hasSelectedJob && matchScore < 30;
    const isHighMatch = hasSelectedJob && matchScore >= 70;
    const isMedMatch = hasSelectedJob && matchScore >= 40 && matchScore < 70;

    return (
        <div className={`flex border-b border-gray-100 h-[72px] relative group transition-all ${
            isDimmed ? 'opacity-40' :
            isHighMatch ? 'bg-green-50/40 hover:bg-green-50/70' :
            isMedMatch ? 'hover:bg-amber-50/30' :
            'hover:bg-blue-50/30'
        }`}>
            {/* Tech Info */}
            <div className={`w-60 flex-shrink-0 px-3 py-2 border-r border-gray-200 ${
                isHighMatch ? 'border-l-[3px] border-l-green-500' :
                isMedMatch ? 'border-l-[3px] border-l-amber-400' :
                hasSelectedJob ? 'border-l-[3px] border-l-transparent' : ''
            }`}>
                <div className="flex items-center">
                    <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-sm mr-2.5 flex-shrink-0 ${
                        isHighMatch ? 'bg-gradient-to-br from-green-500 to-emerald-600 ring-2 ring-green-300' :
                        isMedMatch ? 'bg-gradient-to-br from-amber-500 to-orange-600' :
                        'bg-gradient-to-br from-blue-500 to-indigo-600'
                    }`}>
                        {tech.name ? tech.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{tech.name || 'Unnamed Tech'}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
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
                {/* Qualification status */}
                {hasSelectedJob && matchRec && (
                    <div className="mt-1.5 ml-[42px]">
                        {matchRec.missingSkills.length === 0 ? (
                            <div className="flex items-center gap-1 text-[9px] font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5 w-fit">
                                <CheckCircle className="w-2.5 h-2.5" />
                                <span>Qualified</span>
                                <span className="text-green-500 ml-1">{matchScore}%</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 text-[9px] font-bold text-red-700 bg-red-50 rounded px-1.5 py-0.5 w-fit max-w-full">
                                <XCircle className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate">Missing: {matchRec.missingSkills.join(', ')}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Time Slots */}
            <div className="flex-1 flex relative">
                <WorkingHoursOverlay workStart={workStart} workEnd={workEnd} />

                {timeSlots.map((slot, index) => {
                    const slotHour = slot.getHours();
                    const hasAvailability = focusedJob?.request?.availabilityWindows?.some(w =>
                        isAvailabilityMatch(w, viewDate, slotHour)
                    ) || false;

                    return (
                        <TimeSlotCell
                            key={index}
                            slot={slot}
                            techId={tech.id}
                            onDrop={onJobDrop}
                            hasAvailability={hasAvailability}
                        />
                    );
                })}

                {/* Scheduled Jobs Overlay */}
                {jobs.map(job => {
                    if (!job.scheduled_at?.toDate) return null;
                    return (
                        <DraggableScheduledJob
                            key={job.id}
                            job={job}
                            onPopover={(job, x, y) => setActivePopover({ job, x, y })}
                            onDragStart={onScheduledJobDragStart}
                            onDragEnd={onScheduledJobDragEnd}
                        />
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
// DraggableScheduledJob (Day View) — makes scheduled job blocks draggable
// ============================================================================
const DraggableScheduledJob = ({ job, onPopover, onDragStart, onDragEnd }: {
    job: Job;
    onPopover: (job: Job, x: number, y: number) => void;
    onDragStart?: (job: Job) => void;
    onDragEnd?: () => void;
}) => {
    const clickGuard = useRef(false);

    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'JOB',
        item: () => {
            clickGuard.current = true;
            onDragStart?.(job);
            return { id: job.id, type: 'SCHEDULED' };
        },
        end: () => {
            onDragEnd?.();
            // Reset click guard after a short delay so the mouseup doesn't trigger a click
            setTimeout(() => { clickGuard.current = false; }, 100);
        },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }), [job, onDragStart, onDragEnd]);

    const startTime = (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at));
    const startMinutes = differenceInMinutes(startTime, setMinutes(setHours(startTime, TIME_SLOTS_START), 0));
    const duration = job.estimated_duration || 60;
    const totalMinutes = (TIME_SLOTS_END - TIME_SLOTS_START) * 60;
    const leftPercent = (startMinutes / totalMinutes) * 100;
    const widthPercent = (duration / totalMinutes) * 100;

    const isOverdue = job.status === 'scheduled' && new Date() > new Date(startTime.getTime() + duration * 60000);

    return (
        <div
            ref={drag}
            onClick={(e) => {
                if (clickGuard.current) return;
                const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                onPopover(
                    job,
                    leftPercent + widthPercent / 2,
                    ((e.clientY - rect.top) / rect.height) * 100
                );
            }}
            className={`absolute top-1.5 bottom-1.5 z-[5] rounded-md shadow-sm px-2 py-1 text-[11px] text-white overflow-hidden cursor-grab transition-all hover:brightness-110 hover:shadow-md flex flex-col justify-center ${
                isDragging ? 'opacity-30 scale-95 ring-2 ring-blue-300' :
                isOverdue ? 'bg-red-500 ring-2 ring-red-300' :
                job.status === 'in_progress' ? 'bg-green-500 animate-pulse-subtle' :
                job.status === 'completed' ? 'bg-gray-400' :
                job.priority === 'critical' ? 'bg-red-500' :
                job.priority === 'high' ? 'bg-orange-500' :
                'bg-blue-500'
            }`}
            style={{ left: `${leftPercent}%`, width: `${Math.max(widthPercent, 2)}%` }}
            title={`${job.customer.name} \u2014 ${format(startTime, 'h:mm a')} (${duration}m) — drag to reschedule`}
        >
            <div className="font-bold truncate leading-tight">{job.customer.name}</div>
            {widthPercent > 8 && (
                <div className="truncate opacity-80 leading-tight">
                    {format(startTime, 'h:mm a')} \u2022 {duration}m
                </div>
            )}
            {isOverdue && (
                <AlertTriangle className="absolute top-1 right-1 w-3 h-3 text-yellow-200" />
            )}
        </div>
    );
};

// ============================================================================
// DraggableWeekJobChip — makes week-view job pills draggable
// ============================================================================
const DraggableWeekJobChip = ({ job, onDragStart, onDragEnd }: {
    job: Job;
    onDragStart?: (job: Job) => void;
    onDragEnd?: () => void;
}) => {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'JOB',
        item: () => {
            onDragStart?.(job);
            return { id: job.id, type: 'SCHEDULED' };
        },
        end: () => {
            onDragEnd?.();
        },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }), [job, onDragStart, onDragEnd]);

    const startTime = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);

    return (
        <div
            ref={drag}
            className={`text-[10px] rounded px-1.5 py-1 text-white truncate cursor-grab transition-all ${
                isDragging ? 'opacity-30 scale-95' :
                job.status === 'in_progress' ? 'bg-green-500' :
                job.priority === 'critical' ? 'bg-red-500' :
                job.priority === 'high' ? 'bg-orange-500' :
                'bg-blue-500'
            }`}
            title={`${job.customer.name} @ ${format(startTime, 'h:mm a')} — drag to reschedule`}
        >
            <span className="font-semibold">{job.customer.name}</span>
            <span className="opacity-80 ml-1">{format(startTime, 'h:mma')}</span>
        </div>
    );
};

// ============================================================================
// Working Hours Overlay
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
// TimeSlotCell with availability highlighting
// ============================================================================
const TimeSlotCell = ({ slot, techId, onDrop, hasAvailability }: {
    slot: Date;
    techId: string;
    onDrop: (jobId: string, techId: string, startTime: Date) => void;
    hasAvailability?: boolean;
}) => {
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
                isOver ? 'bg-green-100 ring-2 ring-inset ring-green-400' :
                hasAvailability ? 'bg-green-50 border-green-200' : ''
            } ${slot.getMinutes() === 0 ? 'border-r-gray-200' : ''}`}
        >
            {hasAvailability && !isOver && (
                <div className="w-full h-full flex items-center justify-center pointer-events-none">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full opacity-60" />
                </div>
            )}
        </div>
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
