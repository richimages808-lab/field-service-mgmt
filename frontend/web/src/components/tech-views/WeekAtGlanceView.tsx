import React, { useState } from 'react';
import { addDays, startOfWeek, format, isSameDay } from 'date-fns';
import {
    TechViewProps, getJobPriorityDot, getStatusBadge,
    getCategoryEmoji, formatJobTime, getJobDate,
    Play, CheckCircle, Clock
} from './shared';
import { ChevronLeft, ChevronRight, CalendarRange, Expand, X } from 'lucide-react';

export const WeekAtGlanceView: React.FC<TechViewProps> = ({ jobs, onStatusUpdate, onSelectJob }) => {
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

    const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

    // Group jobs by day
    const jobsByDay = new Map<string, typeof jobs>();
    days.forEach(day => {
        const dayKey = format(day, 'yyyy-MM-dd');
        jobsByDay.set(dayKey, []);
    });

    jobs.forEach(job => {
        const jobDate = getJobDate(job.scheduled_at);
        if (jobDate) {
            const dayKey = format(jobDate, 'yyyy-MM-dd');
            const dayJobs = jobsByDay.get(dayKey);
            if (dayJobs) dayJobs.push(job);
        }
    });

    const navigateWeek = (direction: -1 | 1) => {
        setWeekStart(prev => addDays(prev, direction * 7));
        setExpandedJobId(null);
    };

    const goToThisWeek = () => {
        setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
        setExpandedJobId(null);
    };

    const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));

    return (
        <div>
            {/* Week Navigation */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigateWeek(-1)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <h3 className="text-lg font-bold text-gray-800">
                        {format(weekStart, 'MMM d')} — {format(addDays(weekStart, 4), 'MMM d, yyyy')}
                    </h3>
                    <button
                        onClick={() => navigateWeek(1)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                    {!isCurrentWeek && (
                        <button
                            onClick={goToThisWeek}
                            className="ml-2 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded-full transition-colors"
                        >
                            This Week
                        </button>
                    )}
                </div>
            </div>

            {/* 5-Column Grid */}
            <div className="grid grid-cols-5 gap-2">
                {days.map(day => {
                    const dayKey = format(day, 'yyyy-MM-dd');
                    const dayJobs = jobsByDay.get(dayKey) || [];
                    const isToday = isSameDay(day, new Date());
                    const totalHours = dayJobs.reduce((sum, j) => sum + (j.estimated_duration || 60), 0) / 60;

                    return (
                        <div
                            key={dayKey}
                            className={`rounded-xl border overflow-hidden bg-white shadow-sm ${
                                isToday ? 'ring-2 ring-blue-500 border-blue-300' : 'border-gray-200'
                            }`}
                        >
                            {/* Day Header */}
                            <div className={`px-3 py-2 ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700'}`}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold uppercase">{format(day, 'EEE')}</p>
                                        <p className="text-lg font-bold leading-tight">{format(day, 'd')}</p>
                                    </div>
                                    {dayJobs.length > 0 && (
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                            isToday ? 'bg-white/20' : 'bg-gray-200'
                                        }`}>
                                            {dayJobs.length}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Jobs Stack */}
                            <div className="p-1.5 space-y-1 min-h-[180px]">
                                {dayJobs.length === 0 ? (
                                    <div className="text-center py-8 text-gray-300 text-xs">
                                        No jobs
                                    </div>
                                ) : (
                                    dayJobs.map(job => {
                                        const statusBadge = getStatusBadge(job.status);
                                        const isExpanded = expandedJobId === job.id;

                                        const statusColor = {
                                            scheduled: 'border-l-blue-500',
                                            in_progress: 'border-l-amber-500',
                                            completed: 'border-l-green-500',
                                            pending: 'border-l-gray-400',
                                            cancelled: 'border-l-red-400',
                                        }[job.status] || 'border-l-gray-300';

                                        return (
                                            <div key={job.id}>
                                                {/* Mini Card */}
                                                <div
                                                    className={`border-l-2 ${statusColor} rounded-md px-2 py-1.5 cursor-pointer transition-all text-left w-full ${
                                                        isExpanded ? 'bg-blue-50 shadow-md' : 'bg-white hover:bg-gray-50 hover:shadow-sm'
                                                    }`}
                                                    onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-[10px] font-mono text-gray-400">
                                                            {formatJobTime(job.scheduled_at)}
                                                        </span>
                                                        <span className="text-[10px]">{getCategoryEmoji(job.category)}</span>
                                                    </div>
                                                    <p className="text-xs font-bold text-gray-900 truncate leading-tight mt-0.5">
                                                        {job.customer.name}
                                                    </p>
                                                    <div className="flex items-center justify-between mt-0.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${getJobPriorityDot(job.priority)}`} />
                                                        {job.estimates?.total && (
                                                            <span className="text-[10px] font-mono text-green-600">
                                                                ${job.estimates.total}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Expanded Detail */}
                                                {isExpanded && (
                                                    <div className="bg-white rounded-lg border shadow-lg p-3 mt-1 space-y-2 animate-in fade-in duration-150">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="text-sm font-bold text-gray-900">{job.customer.name}</h4>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setExpandedJobId(null); }}
                                                                className="p-0.5 hover:bg-gray-100 rounded"
                                                            >
                                                                <X className="w-3 h-3 text-gray-400" />
                                                            </button>
                                                        </div>
                                                        <p className="text-[11px] text-gray-500">{job.customer.address}</p>
                                                        <p className="text-xs text-gray-700 line-clamp-2">
                                                            {job.request?.description || 'No description'}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 pt-1">
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusBadge.bg} ${statusBadge.text}`}>
                                                                {statusBadge.label}
                                                            </span>
                                                            {job.estimated_duration && (
                                                                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                                                    <Clock className="w-2.5 h-2.5" /> {job.estimated_duration}m
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 pt-1 border-t border-gray-100">
                                                            {job.status === 'scheduled' && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); onStatusUpdate(job.id, 'in_progress'); }}
                                                                    className="flex items-center gap-0.5 px-2 py-1 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700"
                                                                >
                                                                    <Play className="w-2.5 h-2.5" /> Start
                                                                </button>
                                                            )}
                                                            {job.status === 'in_progress' && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); onStatusUpdate(job.id, 'completed'); }}
                                                                    className="flex items-center gap-0.5 px-2 py-1 bg-green-600 text-white rounded text-[10px] font-bold hover:bg-green-700"
                                                                >
                                                                    <CheckCircle className="w-2.5 h-2.5" /> Done
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); onSelectJob(job); }}
                                                                className="flex items-center gap-0.5 px-2 py-1 bg-gray-100 text-gray-700 rounded text-[10px] font-medium hover:bg-gray-200 ml-auto"
                                                            >
                                                                <Expand className="w-2.5 h-2.5" /> Details
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Day Summary Footer */}
                            {dayJobs.length > 0 && (
                                <div className="px-2 py-1.5 bg-gray-50 border-t text-[10px] text-gray-500 flex justify-between">
                                    <span>{dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''}</span>
                                    <span>{totalHours.toFixed(1)}h</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
