import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import { Job, UserProfile } from '../../types';
import { format, addMinutes, startOfDay, setHours, setMinutes, differenceInMinutes, isSameDay, addDays, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, differenceInDays } from 'date-fns';
import { X, User, Clock, MapPin, Wrench, AlertTriangle, ChevronRight, Star, Shield, CheckCircle, XCircle, Car, Navigation } from 'lucide-react';
import { rankTechnicians, TechRecommendation } from '../../lib/techMatchingEngine';
import { evaluateSlotViability, estimateDriveTime, SlotViabilityResult } from '../../lib/travelEstimator';

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

// ============================================================================
// Availability Matching Helper
// ============================================================================
const isAvailabilityMatch = (
    window: { day: string; startTime: string; endTime: string },
    slotDate: Date,
    slotHour: number
): boolean => {
    try {
        const [startHour, startMin = 0] = window.startTime.split(':').map(Number);
        const [endHour, endMin = 0] = window.endTime.split(':').map(Number);

        // 1. Only match time slots in the future
        const now = new Date();
        const slotEnd = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), slotHour + 1, 0, 0, 0);
        if (slotEnd <= now) {
            return false;
        }

        // 2. Check Date Match
        const dayOfWeek = format(slotDate, 'EEEE').toLowerCase();
        const dateStr = format(slotDate, 'yyyy-MM-dd');
        const windowDay = (window.day || '').trim().toLowerCase();

        let isDateMatch = false;
        if (windowDay === dateStr) {
            // Exact date match (e.g. "2026-08-21")
            isDateMatch = true;
        } else if (windowDay === dayOfWeek || (windowDay.length >= 3 && dayOfWeek.startsWith(windowDay))) {
            // Generic recurring day of week match (e.g. "monday" or "mon")
            // Only match if within next 14 days and not in the past
            const daysDiff = differenceInDays(slotDate, now);
            if (daysDiff >= 0 && daysDiff <= 14) {
                isDateMatch = true;
            }
        }

        if (!isDateMatch) return false;

        // 3. Check Time Window Overlap
        const slotStartMinutes = slotHour * 60;
        const slotEndMinutes = (slotHour + 1) * 60;
        const windowStartMinutes = startHour * 60 + startMin;
        const windowEndMinutes = endHour * 60 + endMin;

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

// Compute which hours match for a given day and return compact labels
const getMatchingHoursForDay = (
    job: Job | null | undefined,
    date: Date
): string[] => {
    const hours: string[] = [];
    if (!job?.request?.availabilityWindows?.length) return hours;
    for (let hour = TIME_SLOTS_START; hour < TIME_SLOTS_END; hour++) {
        for (const w of job.request.availabilityWindows) {
            if (isAvailabilityMatch(w, date, hour)) {
                const h = hour > 12 ? hour - 12 : hour;
                const ampm = hour >= 12 ? 'PM' : 'AM';
                hours.push(`${h}${ampm}`);
                break;
            }
        }
    }
    return hours;
};

// Convert matching hours array into a readable time range label
// e.g. ["8AM","9AM","10AM","11AM"] -> "8AM - 12PM"
// e.g. ["12PM","1PM","2PM","3PM"] -> "12PM - 4PM"
const getTimeRangeLabel = (hours: string[]): string => {
    if (hours.length === 0) return '';
    const first = hours[0];
    // End time = last hour + 1
    const lastRaw = hours[hours.length - 1];
    const lastNum = parseInt(lastRaw);
    const lastIsPM = lastRaw.includes('PM');
    let endNum = lastNum + 1;
    let endSuffix = lastIsPM ? 'PM' : 'AM';
    if (endNum === 12 && !lastIsPM) endSuffix = 'PM';
    if (endNum === 13) { endNum = 1; endSuffix = 'PM'; }
    return `${first} - ${endNum}${endSuffix}`;
};

// ============================================================================
// Job Detail Popover (shown on click)
// ============================================================================
const JobPopover = ({ job, onClose, position }: { job: Job; onClose: () => void; position: { x: number; y: number } }) => {
    const aiRec = job.intakeReview?.aiRecommendation;
    const startTime = parseFirestoreTimestamp(job.scheduled_at) || new Date();

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
                <div className="w-44 flex-shrink-0 p-2 font-bold text-gray-700 bg-gray-50 border-r border-gray-200 text-xs uppercase tracking-wide">
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
                            <div key={index} className={`flex-1 min-w-[40px] border-r border-gray-100 p-1 text-[10px] text-center font-medium ${
                                hasAvailability
                                    ? 'customer-request-header text-green-900 font-bold'
                                    : isHourMark ? 'bg-gray-50/50 text-gray-500' : 'text-gray-500'
                            }`}>
                                {isHourMark ? format(slot, 'ha') : ''}
                                {hasAvailability && isHourMark && (
                                    <div className="customer-request-badge bg-green-500 text-white text-[7px] font-extrabold px-1 py-0.5 rounded mt-0.5 leading-tight tracking-wide uppercase whitespace-nowrap">
                                        Requested
                                    </div>
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
                        const techJobs = jobs.filter(j => {
                            const schedDate = parseFirestoreTimestamp(j.scheduled_at);
                            return j.assigned_tech_id === tech.id &&
                                   schedDate &&
                                   isSameDay(schedDate, viewDate);
                        });
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
                <div className="w-40 flex-shrink-0 p-2 font-bold text-gray-700 bg-gray-50 border-r border-gray-200 text-xs uppercase tracking-wide flex items-center">
                    Technicians
                </div>
                {weekDays.map(day => {
                    const dayIsToday = isSameDay(day, new Date());
                    const dayJobCount = jobs.filter(j => {
                        const schedDate = parseFirestoreTimestamp(j.scheduled_at);
                        return schedDate && isSameDay(schedDate, day);
                    }).length;
                    const hasAvail = dateHasAvailability(focusedJob, day);
                    const dayMatchHours = hasAvail ? getMatchingHoursForDay(focusedJob, day) : [];
                    const timeLabel = getTimeRangeLabel(dayMatchHours);

                    return (
                        <div
                            key={day.toISOString()}
                            className={`flex-1 min-w-[100px] p-2 text-center border-r border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors ${
                                dayIsToday ? 'bg-blue-50' : hasAvail ? 'customer-request-header' : 'bg-white'
                            }`}
                            onClick={() => onDayClick?.(day)}
                        >
                            <div className={`text-[10px] font-bold uppercase tracking-wider ${
                                dayIsToday ? 'text-blue-700' : hasAvail ? 'text-green-800' : 'text-gray-500'
                            }`}>
                                {format(day, 'EEE')}
                            </div>
                            <div className={`text-lg font-bold ${
                                dayIsToday ? 'text-blue-700' : hasAvail ? 'text-green-800' : 'text-gray-800'
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
                                <div className="customer-request-badge bg-green-500 text-white text-[8px] font-extrabold px-1.5 py-0.5 rounded mt-1 inline-block tracking-wide uppercase leading-tight">
                                    <div>Requested</div>
                                    {timeLabel && <div className="text-[7px] font-bold opacity-90 mt-0.5">{timeLabel}</div>}
                                </div>
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
                            <div className="w-40 flex-shrink-0 px-2 py-2 border-r border-gray-200 bg-white">
                                <div className="flex items-center">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs mr-1.5 flex-shrink-0">
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
                                const dayJobs = jobs.filter(j => {
                                    const schedDate = parseFirestoreTimestamp(j.scheduled_at);
                                    return j.assigned_tech_id === tech.id &&
                                           schedDate &&
                                           isSameDay(schedDate, day);
                                });
                                const hasAvail = dateHasAvailability(focusedJob, day);
                                const matchingHours = hasAvail ? getMatchingHoursForDay(focusedJob, day) : [];

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
                                        matchingHours={matchingHours}
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
const WeekDayCell = ({ date, techId, jobs, onJobDrop, hasAvailability, focusedJob, onDayClick, onScheduledJobDragStart, onScheduledJobDragEnd, matchingHours }: {
    date: Date;
    techId: string;
    jobs: Job[];
    onJobDrop: (jobId: string, techId: string, startTime: Date) => void;
    hasAvailability: boolean;
    focusedJob?: Job | null;
    onDayClick?: (date: Date) => void;
    onScheduledJobDragStart?: (job: Job) => void;
    onScheduledJobDragEnd?: () => void;
    matchingHours?: string[];
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
    }), [date, techId, focusedJob, onJobDrop]);

    const dayIsToday = isSameDay(date, new Date());

    return (
        <div
            ref={drop}
            className={`flex-1 min-w-[100px] border-r border-gray-200 p-1.5 transition-colors cursor-pointer relative ${
                isOver ? 'bg-green-100 ring-2 ring-inset ring-green-400' :
                hasAvailability ? 'customer-request-cell customer-request-stripes' :
                dayIsToday ? 'bg-blue-50/30' : ''
            }`}
            onClick={() => onDayClick?.(date)}
        >
            {hasAvailability && !isOver && (
                <div className="absolute top-1 left-1 right-1 z-10">
                    <div className="customer-request-badge bg-green-500 text-white text-[7px] font-extrabold px-1 py-0.5 rounded text-center tracking-wide uppercase leading-tight">
                        <div>Requested</div>
                        {matchingHours && matchingHours.length > 0 && (
                            <div className="text-[6px] font-bold opacity-90">
                                {matchingHours[0]} - {matchingHours[matchingHours.length - 1]}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {jobs.length === 0 ? (
                hasAvailability ? (
                    <div className="flex items-center justify-center h-full pt-6">
                        <span className="text-[10px] text-green-700 font-semibold">
                            Drop here ↓
                        </span>
                    </div>
                ) : null
            ) : (
                <div className={`space-y-1 ${hasAvailability ? 'pt-7' : ''}`}>
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
                    const dayJobs = jobs.filter(j => {
                        const schedDate = parseFirestoreTimestamp(j.scheduled_at);
                        return schedDate && isSameDay(schedDate, day);
                    });
                    const hasAvail = dateHasAvailability(focusedJob, day);
                    const monthMatchHours = hasAvail ? getMatchingHoursForDay(focusedJob, day) : [];
                    const monthTimeLabel = getTimeRangeLabel(monthMatchHours);

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
                                <div className="customer-request-badge bg-green-500 text-white text-[8px] font-extrabold px-1.5 py-0.5 rounded mb-1 inline-block tracking-wide uppercase leading-tight">
                                    <div>Requested</div>
                                    {monthTimeLabel && <div className="text-[7px] font-bold opacity-90">{monthTimeLabel}</div>}
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
            hasSelectedJob ? 'bg-white hover:bg-gray-50/50' :
            isHighMatch ? 'bg-green-50/40 hover:bg-green-50/70' :
            isMedMatch ? 'hover:bg-amber-50/30' :
            'hover:bg-blue-50/30'
        }`}>
            {/* Tech Info */}
            <div className={`w-44 flex-shrink-0 px-2 py-2 border-r border-gray-200 ${
                isHighMatch ? 'border-l-[3px] border-l-green-500' :
                isMedMatch ? 'border-l-[3px] border-l-amber-400' :
                hasSelectedJob ? 'border-l-[3px] border-l-transparent' : ''
            }`}>
                <div className="flex items-center">
                    <div className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs mr-1.5 flex-shrink-0 ${
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

                {/* Travel Transit Connectors Between Scheduled Jobs */}
                {(() => {
                    const sorted = [...jobs]
                        .map(j => {
                            const s = parseFirestoreTimestamp(j.scheduled_at);
                            const d = j.estimated_duration || 60;
                            return s ? { job: j, start: s, end: new Date(s.getTime() + d * 60000) } : null;
                        })
                        .filter((x): x is { job: Job; start: Date; end: Date } => Boolean(x))
                        .sort((a, b) => a.start.getTime() - b.start.getTime());

                    const totalMinutes = (TIME_SLOTS_END - TIME_SLOTS_START) * 60;
                    const baseDayStart = setMinutes(setHours(startOfDay(viewDate), TIME_SLOTS_START), 0);

                    const connectors = [];
                    for (let i = 0; i < sorted.length - 1; i++) {
                        const fromLeg = sorted[i];
                        const toLeg = sorted[i + 1];
                        const gapMinutes = differenceInMinutes(toLeg.start, fromLeg.end);
                        if (gapMinutes > 0) {
                            const estimate = estimateDriveTime(fromLeg.job, toLeg.job, fromLeg.end);
                            const startMinutes = differenceInMinutes(fromLeg.end, baseDayStart);
                            const startPercent = Math.max(0, (startMinutes / totalMinutes) * 100);
                            const widthPercent = (gapMinutes / totalMinutes) * 100;
                            const isDeficit = gapMinutes < estimate.trafficDurationMinutes;

                            connectors.push(
                                <div
                                    key={`transit-${fromLeg.job.id}-${toLeg.job.id}`}
                                    className={`absolute top-2.5 bottom-2.5 z-[3] rounded-sm border flex items-center justify-center px-1 text-[8px] font-bold pointer-events-auto transition-all select-none ${
                                        isDeficit
                                            ? 'bg-rose-100/90 border-rose-400 text-rose-800 ring-1 ring-rose-400 shadow-sm animate-pulse'
                                            : 'bg-slate-100/80 border-slate-300 text-slate-600 hover:bg-blue-50/90 hover:border-blue-300'
                                    }`}
                                    style={{
                                        left: `${startPercent}%`,
                                        width: `${Math.max(widthPercent, 1.5)}%`
                                    }}
                                    title={`Route Transit: ${fromLeg.job.customer.name} ➔ ${toLeg.job.customer.name}\n• Distance: ${estimate.distanceMiles} mi\n• Estimated Drive: ~${estimate.trafficDurationMinutes}m (${estimate.trafficLevel} traffic, ${estimate.trafficReason})\n• Gap on schedule: ${gapMinutes}m${isDeficit ? ` ⚠️ DEFICIT OF ${estimate.trafficDurationMinutes - gapMinutes} MIN!` : ' (Sufficient travel buffer)'}`}
                                >
                                    {widthPercent > 4.5 && (
                                        <div className="flex items-center gap-0.5 truncate">
                                            <Car className="w-2.5 h-2.5 flex-shrink-0 opacity-80" />
                                            <span className="truncate">{estimate.trafficDurationMinutes}m</span>
                                            {isDeficit && <span className="text-red-600 font-black">!</span>}
                                        </div>
                                    )}
                                </div>
                            );
                        }
                    }
                    return connectors;
                })()}

                {timeSlots.map((slot, index) => {
                    const slotHour = slot.getHours();
                    const hasCustomerAvailability = focusedJob?.request?.availabilityWindows?.some(w =>
                        isAvailabilityMatch(w, viewDate, slotHour)
                    ) || false;

                    const viability = focusedJob
                        ? evaluateSlotViability(focusedJob, tech, jobs, slot, focusedJob.estimated_duration || 60)
                        : undefined;

                    return (
                        <TimeSlotCell
                            key={index}
                            slot={slot}
                            techId={tech.id}
                            onDrop={onJobDrop}
                            hasCustomerAvailability={hasCustomerAvailability}
                            viability={viability}
                            hasSelectedJob={hasSelectedJob}
                        />
                    );
                })}

                {/* Scheduled Jobs Overlay */}
                {jobs.map(job => {
                    const schedDate = parseFirestoreTimestamp(job.scheduled_at);
                    if (!schedDate) return null;
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

    const startTime = parseFirestoreTimestamp(job.scheduled_at) || new Date();
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

    const startTime = parseFirestoreTimestamp(job.scheduled_at) || new Date();

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
// TimeSlotCell with travel viability & availability highlighting
// ============================================================================
const TimeSlotCell = ({
    slot,
    techId,
    onDrop,
    hasCustomerAvailability,
    viability,
    hasSelectedJob
}: {
    slot: Date;
    techId: string;
    onDrop: (jobId: string, techId: string, startTime: Date) => void;
    hasCustomerAvailability?: boolean;
    viability?: SlotViabilityResult;
    hasSelectedJob?: boolean;
}) => {
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'JOB',
        drop: (item: { id: string }) => onDrop(item.id, techId, slot),
        collect: (monitor) => ({
            isOver: !!monitor.isOver(),
        }),
    }), [slot, techId, onDrop]);

    const isConflict = viability && (
        viability.status === 'conflict_incoming' ||
        viability.status === 'conflict_outgoing' ||
        viability.status === 'conflict_both'
    );
    const isOptimal = viability?.status === 'optimal';
    const isTight = viability?.status === 'tight';

    let cellClass = '';
    let tooltip = '';

    if (isOver) {
        cellClass = isConflict
            ? 'bg-rose-100 ring-2 ring-inset ring-rose-400'
            : 'bg-green-100 ring-2 ring-inset ring-green-400';
    } else if (hasSelectedJob && viability) {
        if (isOptimal && hasCustomerAvailability) {
            cellClass = 'travel-optimal-cell border-emerald-400';
            tooltip = `🟢 Recommended: Customer requested time & allows ~${viability.incomingTransit?.trafficDurationMinutes || 10}m travel from ${viability.incomingTransit?.originLabel} (${viability.incomingTransit?.trafficLevel} traffic)`;
        } else if (isOptimal) {
            cellClass = 'bg-emerald-50/40 border-emerald-200';
            tooltip = `Viable slot: Fits ~${viability.incomingTransit?.trafficDurationMinutes}m drive time (Outside customer preferred window)`;
        } else if (isTight) {
            cellClass = 'travel-tight-cell border-amber-300';
            tooltip = `⚠️ Tight travel buffer: ~${viability.incomingTransit?.trafficDurationMinutes}m drive required (${viability.incomingTransit?.trafficReason})`;
        } else if (isConflict) {
            if (hasCustomerAvailability) {
                cellClass = 'travel-conflict-cell border-red-300';
                tooltip = `🚫 Travel conflict: Customer requested this time, but technician needs ~${viability.incomingTransit?.trafficDurationMinutes}m drive from ${viability.incomingTransit?.originLabel}. Earliest arrival: ${viability.earliestViableStart ? format(viability.earliestViableStart, 'h:mm a') : 'later'}.`;
            } else {
                cellClass = 'bg-red-50/30 border-red-200 opacity-60';
                tooltip = `🚫 Travel conflict: Insufficient transit time from previous stop`;
            }
        }
    } else if (hasCustomerAvailability) {
        cellClass = 'customer-request-cell customer-request-stripes border-green-300';
    }

    return (
        <div
            ref={drop}
            className={`flex-1 min-w-[50px] border-r border-gray-100 h-full transition-colors z-[2] relative ${cellClass} ${slot.getMinutes() === 0 ? 'border-r-gray-200' : ''}`}
            title={tooltip || undefined}
        >
            {hasSelectedJob && isOptimal && hasCustomerAvailability && !isOver && (
                <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none p-0.5">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse mb-0.5" />
                    {viability?.incomingTransit && (
                        <span className="text-[7px] font-extrabold text-emerald-700 bg-emerald-100/90 px-1 py-0.2 rounded leading-tight whitespace-nowrap shadow-xs">
                            🚗 {viability.incomingTransit.trafficDurationMinutes}m
                        </span>
                    )}
                </div>
            )}
            {hasSelectedJob && isConflict && hasCustomerAvailability && !isOver && (
                <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none p-0.5">
                    <span className="text-[7px] font-bold text-red-600 bg-red-100/95 px-1 py-0.2 rounded leading-tight whitespace-nowrap border border-red-300 shadow-xs">
                        🚫 +{viability.deficitMinutes || 15}m drive
                    </span>
                </div>
            )}
            {!hasSelectedJob && hasCustomerAvailability && !isOver && (
                <div className="w-full h-full flex items-center justify-center pointer-events-none">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
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
