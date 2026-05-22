import React, { useMemo, useState } from 'react';
import { UserProfile, Job } from '../../types';
import { format, isSameDay, isAfter, isBefore, addMinutes } from 'date-fns';
import { ChevronRight, ChevronLeft, Zap, Phone, Clock, CheckCircle, Play, Coffee, Moon, MapPin, Users } from 'lucide-react';

interface TechStatusPanelProps {
    technicians: UserProfile[];
    jobs: Job[];
    viewDate: Date;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onQuickAssign?: (techId: string) => void;
}

type TechStatus = 'available' | 'on_job' | 'on_break' | 'off_duty' | 'at_capacity';

interface TechStatusInfo {
    tech: UserProfile;
    status: TechStatus;
    completedToday: number;
    scheduledToday: number;
    nextAvailableTime: Date | null;
    currentJob: Job | null;
    capacityPercent: number;
}

export const TechStatusPanel: React.FC<TechStatusPanelProps> = ({
    technicians, jobs, viewDate, isCollapsed, onToggleCollapse, onQuickAssign
}) => {
    const [filterStatus, setFilterStatus] = useState<TechStatus | 'all'>('all');
    const now = new Date();

    const techStatuses: TechStatusInfo[] = useMemo(() => {
        return technicians.map(tech => {
            const techJobs = jobs.filter(j =>
                j.assigned_tech_id === tech.id &&
                j.scheduled_at &&
                isSameDay(j.scheduled_at?.toDate ? j.scheduled_at.toDate() : new Date(j.scheduled_at), viewDate)
            );

            const completedToday = techJobs.filter(j => j.status === 'completed').length;
            const scheduledToday = techJobs.length;

            // Determine current status
            const isWorkday = isAvailableOnDay(tech, viewDate);
            let status: TechStatus = 'off_duty';
            let currentJob: Job | null = null;

            if (isWorkday) {
                // Check if currently on a job
                const activeJob = techJobs.find(j => {
                    if (j.status !== 'in_progress' && j.status !== 'scheduled') return false;
                    const start = j.scheduled_at?.toDate ? j.scheduled_at.toDate() : new Date(j.scheduled_at);
                    const end = addMinutes(start, j.estimated_duration || 60);
                    return isBefore(start, now) && isAfter(end, now);
                });

                if (activeJob) {
                    status = 'on_job';
                    currentJob = activeJob;
                } else {
                    const maxJobs = tech.schedulingPreferences?.jobPreferences?.maxJobsPerDay || 6;
                    if (scheduledToday >= maxJobs) {
                        status = 'at_capacity';
                    } else {
                        status = 'available';
                    }
                }
            }

            // Calculate next available time
            let nextAvailableTime: Date | null = null;
            if (currentJob) {
                const start = currentJob.scheduled_at?.toDate ? currentJob.scheduled_at.toDate() : new Date(currentJob.scheduled_at);
                nextAvailableTime = addMinutes(start, currentJob.estimated_duration || 60);
            } else if (status === 'available') {
                nextAvailableTime = now;
            }

            // Capacity percent
            const totalMinutes = techJobs.reduce((sum, j) => sum + (j.estimated_duration || 60), 0);
            const workHours = getWorkHours(tech);
            const totalWorkMinutes = workHours * 60;
            const capacityPercent = totalWorkMinutes > 0 ? Math.round((totalMinutes / totalWorkMinutes) * 100) : 0;

            return {
                tech,
                status,
                completedToday,
                scheduledToday,
                nextAvailableTime,
                currentJob,
                capacityPercent
            };
        }).sort((a, b) => {
            const statusOrder: Record<TechStatus, number> = {
                available: 0, on_job: 1, at_capacity: 2, on_break: 3, off_duty: 4
            };
            return statusOrder[a.status] - statusOrder[b.status];
        });
    }, [technicians, jobs, viewDate, now]);

    const statusCounts = useMemo(() => ({
        all: techStatuses.length,
        available: techStatuses.filter(t => t.status === 'available').length,
        on_job: techStatuses.filter(t => t.status === 'on_job').length,
        at_capacity: techStatuses.filter(t => t.status === 'at_capacity').length,
        off_duty: techStatuses.filter(t => t.status === 'off_duty').length,
    }), [techStatuses]);

    const filtered = filterStatus === 'all' ? techStatuses : techStatuses.filter(t => t.status === filterStatus);

    if (isCollapsed) {
        return (
            <div className="w-10 bg-gray-50 border-l border-gray-200 flex flex-col items-center pt-3 flex-shrink-0">
                <button
                    onClick={onToggleCollapse}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Show Tech Status"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="mt-3 flex flex-col items-center gap-1.5">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-[10px] text-gray-500 font-bold">{statusCounts.available}</span>
                    <div className="w-2 h-2 bg-green-500 rounded-full" title={`${statusCounts.available} available`} />
                </div>
            </div>
        );
    }

    return (
        <div className="w-72 xl:w-80 bg-gray-50 border-l border-gray-200 flex flex-col flex-shrink-0 h-full">
            {/* Header */}
            <div className="p-3 border-b border-gray-200 bg-white flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-sm text-gray-800">Tech Status</h3>
                    <p className="text-[11px] text-gray-500">{format(viewDate, 'MMM d, yyyy')}</p>
                </div>
                <button
                    onClick={onToggleCollapse}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Summary pills */}
            <div className="px-3 py-2 border-b border-gray-100 bg-white">
                <div className="flex gap-1 flex-wrap">
                    {[
                        { key: 'all', label: 'All', count: statusCounts.all },
                        { key: 'available', label: 'Free', count: statusCounts.available },
                        { key: 'on_job', label: 'Busy', count: statusCounts.on_job },
                    ].map(({ key, label, count }) => (
                        <button
                            key={key}
                            onClick={() => setFilterStatus(key as TechStatus | 'all')}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${
                                filterStatus === key
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {label} ({count})
                        </button>
                    ))}
                </div>
            </div>

            {/* Tech list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {filtered.length === 0 ? (
                    <div className="text-center text-gray-400 text-xs mt-10">No technicians match filter</div>
                ) : (
                    filtered.map(info => (
                        <TechStatusCard
                            key={info.tech.id}
                            info={info}
                            onQuickAssign={onQuickAssign ? () => onQuickAssign(info.tech.id) : undefined}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

// ============================================================================
// Individual Tech Status Card
// ============================================================================
const TechStatusCard = ({ info, onQuickAssign }: { info: TechStatusInfo; onQuickAssign?: () => void }) => {
    const { tech, status, completedToday, scheduledToday, nextAvailableTime, currentJob, capacityPercent } = info;

    const statusConfig: Record<TechStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
        available: { label: 'Available', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
        on_job: { label: 'On Job', color: 'text-blue-700', bg: 'bg-blue-100', icon: Play },
        on_break: { label: 'On Break', color: 'text-amber-700', bg: 'bg-amber-100', icon: Coffee },
        off_duty: { label: 'Off Duty', color: 'text-gray-500', bg: 'bg-gray-100', icon: Moon },
        at_capacity: { label: 'Full', color: 'text-red-700', bg: 'bg-red-100', icon: Clock }
    };

    const sc = statusConfig[status];
    const StatusIcon = sc.icon;

    return (
        <div className={`px-3 py-2.5 border-b border-gray-100 transition-colors group ${
            status === 'off_duty' ? 'opacity-60' : 'hover:bg-white'
        }`}>
            <div className="flex items-center gap-2.5">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                        {tech.name ? tech.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                        status === 'available' ? 'bg-green-500' :
                        status === 'on_job' ? 'bg-blue-500 animate-pulse' :
                        status === 'at_capacity' ? 'bg-red-500' :
                        'bg-gray-400'
                    }`} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-gray-900 truncate">{tech.name || 'Unnamed'}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                        <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sc.bg} ${sc.color}`}>
                            <StatusIcon className="w-2.5 h-2.5" />
                            {sc.label}
                        </span>
                    </div>
                </div>
            </div>

            {/* Stats row */}
            <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
                <span className="flex items-center gap-0.5">
                    <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                    {completedToday}/{scheduledToday} done
                </span>
                <span className="font-medium">
                    {capacityPercent}% filled
                </span>
            </div>

            {/* Capacity bar */}
            <div className="mt-1 w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                    capacityPercent > 85 ? 'bg-red-500' :
                    capacityPercent > 60 ? 'bg-amber-500' : 'bg-green-500'
                }`} style={{ width: `${Math.min(100, capacityPercent)}%` }} />
            </div>

            {/* Current job info */}
            {currentJob && (
                <div className="mt-1.5 text-[10px] text-blue-700 bg-blue-50 px-2 py-1 rounded-md truncate">
                    🔧 {currentJob.customer.name}
                </div>
            )}

            {/* Next available */}
            {nextAvailableTime && status !== 'available' && (
                <div className="mt-1 text-[10px] text-gray-500">
                    Free at {format(nextAvailableTime, 'h:mm a')}
                </div>
            )}

            {/* Quick assign button */}
            {onQuickAssign && status === 'available' && (
                <button
                    onClick={onQuickAssign}
                    className="mt-2 w-full py-1.5 text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100"
                >
                    <Zap className="w-3 h-3" />
                    Send Next Job
                </button>
            )}
        </div>
    );
};

// ============================================================================
// Helpers
// ============================================================================
function isAvailableOnDay(tech: UserProfile, date: Date): boolean {
    const dayOfWeek = date.getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayNames[dayOfWeek] as keyof NonNullable<UserProfile['weeklyAvailability']>;

    if (tech.weeklyAvailability) {
        const dayAvail = tech.weeklyAvailability[dayKey];
        if (dayAvail && 'available' in dayAvail) {
            return dayAvail.available;
        }
    }

    // Default: available Mon-Fri
    return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function getWorkHours(tech: UserProfile): number {
    if (tech.preferences?.working_hours) {
        const start = parseInt(tech.preferences.working_hours.start?.split(':')[0] || '8');
        const end = parseInt(tech.preferences.working_hours.end?.split(':')[0] || '17');
        return end - start;
    }
    return 9; // Default 8 hours
}
