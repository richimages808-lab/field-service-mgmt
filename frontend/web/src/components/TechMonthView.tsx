import React, { useMemo } from 'react';
import { Job } from '../types';
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval,
    getDay, isSameDay, isToday, addMonths
} from 'date-fns';
import { getSmartDuration } from '../lib/scheduler';
import { ChevronLeft, ChevronRight, Calendar, Clock, MapPin } from 'lucide-react';

interface TechMonthViewProps {
    techId: string;
    techName: string;
    jobs: Job[];
    viewDate: Date;
    onDateChange: (date: Date) => void;
    onDayClick: (day: Date) => void;
    onJobClick: (job: Job) => void;
    onSlotClick?: (day: Date, hour: number) => void;
}

export const TechMonthView: React.FC<TechMonthViewProps> = ({
    techId,
    techName,
    jobs,
    viewDate,
    onDateChange,
    onDayClick,
    onJobClick,
    onSlotClick
}) => {
    // Build month grid
    const monthGrid = useMemo(() => {
        const monthStart = startOfMonth(viewDate);
        const monthEnd = endOfMonth(viewDate);
        const startDay = getDay(monthStart);
        // Adjust for Monday start
        const paddingDays = startDay === 0 ? 6 : startDay - 1;

        const grid: (Date | null)[] = [];
        for (let i = 0; i < paddingDays; i++) grid.push(null);

        const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
        grid.push(...daysInMonth);

        // Pad to complete last week
        const remainingCells = 7 - (grid.length % 7);
        if (remainingCells < 7) {
            for (let i = 0; i < remainingCells; i++) grid.push(null);
        }

        return grid;
    }, [viewDate]);

    // Group jobs by day
    const jobsByDay = useMemo(() => {
        const map = new Map<string, Job[]>();
        jobs
            .filter(j => j.assigned_tech_id === techId && j.scheduled_at)
            .forEach(job => {
                const jobTime = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
                const key = format(jobTime, 'yyyy-MM-dd');
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(job);
            });

        // Sort jobs within each day by time
        map.forEach((dayJobs, key) => {
            dayJobs.sort((a, b) => {
                const aTime = (a.scheduled_at?.toDate?.() || new Date(a.scheduled_at)).getTime();
                const bTime = (b.scheduled_at?.toDate?.() || new Date(b.scheduled_at)).getTime();
                return aTime - bTime;
            });
        });

        return map;
    }, [jobs, techId]);

    // Count total hours per day
    const dayHours = useMemo(() => {
        const map = new Map<string, number>();
        jobsByDay.forEach((dayJobs, key) => {
            const totalMinutes = dayJobs.reduce((sum, j) => sum + getSmartDuration(j), 0);
            map.set(key, totalMinutes);
        });
        return map;
    }, [jobsByDay]);

    const priorityDot: Record<string, string> = {
        critical: 'bg-red-500',
        high: 'bg-orange-500',
        medium: 'bg-yellow-500',
        low: 'bg-green-500'
    };

    const weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className="flex flex-col h-full">
            {/* Month Navigation */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
                <button
                    onClick={() => onDateChange(addMonths(viewDate, -1))}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="text-center">
                    <h3 className="text-lg font-bold text-gray-900">
                        {format(viewDate, 'MMMM yyyy')}
                    </h3>
                    <p className="text-xs text-gray-500">{techName}'s Schedule</p>
                </div>
                <button
                    onClick={() => onDateChange(addMonths(viewDate, 1))}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                {weekDayLabels.map(label => (
                    <div key={label} className="px-2 py-2 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {label}
                    </div>
                ))}
            </div>

            {/* Month Grid */}
            <div className="flex-1 overflow-auto">
                <div className="grid grid-cols-7 auto-rows-fr min-h-full">
                    {monthGrid.map((day, idx) => {
                        if (!day) {
                            return (
                                <div key={`empty-${idx}`} className="border-b border-r border-gray-100 bg-gray-50/50" />
                            );
                        }

                        const dateKey = format(day, 'yyyy-MM-dd');
                        const dayJobs = jobsByDay.get(dateKey) || [];
                        const totalMinutes = dayHours.get(dateKey) || 0;
                        const isCurrentDay = isToday(day);
                        const hasJobs = dayJobs.length > 0;
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                        return (
                            <div
                                key={dateKey}
                                className={`border-b border-r border-gray-200 p-1.5 cursor-pointer transition-all hover:bg-violet-50 group relative ${
                                    isCurrentDay ? 'bg-violet-50/50 ring-2 ring-inset ring-violet-300' :
                                    isWeekend ? 'bg-gray-50/80' : 'bg-white'
                                }`}
                                onClick={() => onDayClick(day)}
                            >
                                {/* Day Number */}
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${
                                        isCurrentDay
                                            ? 'bg-violet-600 text-white'
                                            : 'text-gray-700 group-hover:bg-violet-100'
                                    }`}>
                                        {format(day, 'd')}
                                    </span>
                                    {hasJobs && (
                                        <span className="text-[10px] font-bold text-gray-400 flex items-center gap-0.5">
                                            <Clock className="w-3 h-3" />
                                            {Math.round(totalMinutes / 60 * 10) / 10}h
                                        </span>
                                    )}
                                </div>

                                {/* Job Pills */}
                                <div className="space-y-0.5">
                                    {dayJobs.slice(0, 3).map(job => {
                                        const jobTime = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
                                        return (
                                            <div
                                                key={job.id}
                                                onClick={e => { e.stopPropagation(); onJobClick(job); }}
                                                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 cursor-pointer transition-colors"
                                                title={`${job.customer.name} — ${job.request?.description || ''}`}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDot[job.priority]}`} />
                                                <span className="text-[10px] font-medium text-gray-700 truncate">
                                                    {format(jobTime, 'h:mm')} {job.customer.name}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {dayJobs.length > 3 && (
                                        <div className="text-[10px] text-gray-500 font-medium pl-1">
                                            +{dayJobs.length - 3} more
                                        </div>
                                    )}
                                </div>

                                {/* Empty day — add job CTA on hover */}
                                {!hasJobs && !isWeekend && (
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-xs text-violet-400 font-medium">+ Add Job</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
