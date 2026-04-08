import React from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Clock, MapPin, Package, AlertTriangle, Sparkles, X, ExternalLink } from 'lucide-react';

interface ScheduledJob {
    id: string;
    customer: { name: string; address: string };
    arrivalTime?: Date;
    estimated_duration?: number;
    driveTimeMinutes?: number;
    driveDistanceMiles?: number;
    priority?: string;
    type?: string;
}

interface OptimizationStats {
    totalDriveTime: number;
    totalWorkTime: number;
    totalJobs: number;
    partsRuns: number;
    estimatedEndTime?: Date;
}

interface OptimizationPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    scheduledJobs: ScheduledJob[];
    unschedulableJobs: any[];
    warnings: string[];
    stats: OptimizationStats;
    daysOptimized: number;
    mapsUrl?: string;
}

export const OptimizationPreviewModal: React.FC<OptimizationPreviewModalProps> = ({
    isOpen,
    onClose,
    scheduledJobs,
    unschedulableJobs,
    warnings,
    stats,
    daysOptimized,
    mapsUrl
}) => {
    if (!isOpen) return null;

    const hasWarnings = warnings.length > 0 || unschedulableJobs.length > 0;

    // Group scheduled jobs by date
    const jobsByDate = scheduledJobs.reduce<Record<string, ScheduledJob[]>>((acc, job) => {
        if (job.arrivalTime) {
            const dateKey = format(job.arrivalTime, 'yyyy-MM-dd');
            if (!acc[dateKey]) acc[dateKey] = [];
            acc[dateKey].push(job);
        }
        return acc;
    }, {});

    const sortedDates = Object.keys(jobsByDate).sort();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className={`p-4 flex items-center justify-between ${hasWarnings
                    ? 'bg-gradient-to-r from-orange-500 to-yellow-500'
                    : 'bg-gradient-to-r from-green-500 to-emerald-500'
                    }`}>
                    <div className="flex items-center gap-3">
                        {hasWarnings
                            ? <AlertTriangle className="w-6 h-6 text-white" />
                            : <CheckCircle2 className="w-6 h-6 text-white" />
                        }
                        <div>
                            <h3 className="text-lg font-bold text-white">
                                {hasWarnings ? 'Optimization Complete (with warnings)' : 'Optimization Complete!'}
                            </h3>
                            <p className="text-sm text-white text-opacity-90">
                                {stats.totalJobs} jobs scheduled across {daysOptimized} day{daysOptimized !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white hover:text-gray-200 p-1">
                        <X size={20} />
                    </button>
                </div>

                {/* Stats Strip */}
                <div className="grid grid-cols-4 gap-0 border-b">
                    <div className="p-3 text-center border-r">
                        <div className="text-xl font-bold text-blue-600">{stats.totalJobs}</div>
                        <div className="text-xs text-gray-500">Jobs Scheduled</div>
                    </div>
                    <div className="p-3 text-center border-r">
                        <div className="text-xl font-bold text-amber-600">{stats.totalDriveTime}m</div>
                        <div className="text-xs text-gray-500">Total Drive Time</div>
                    </div>
                    <div className="p-3 text-center border-r">
                        <div className="text-xl font-bold text-green-600">{stats.totalWorkTime}m</div>
                        <div className="text-xs text-gray-500">Total Work Time</div>
                    </div>
                    <div className="p-3 text-center">
                        <div className="text-xl font-bold text-gray-700">
                            {stats.estimatedEndTime
                                ? format(stats.estimatedEndTime, 'h:mm a')
                                : '--'}
                        </div>
                        <div className="text-xs text-gray-500">Est. Finish</div>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Warnings */}
                    {warnings.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                            <h4 className="font-semibold text-orange-800 flex items-center gap-2 mb-2">
                                <AlertTriangle size={16} /> Warnings
                            </h4>
                            <ul className="space-y-1">
                                {warnings.map((w, i) => (
                                    <li key={i} className="text-sm text-orange-700">• {w}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Unschedulable Jobs */}
                    {unschedulableJobs.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <h4 className="font-semibold text-red-800 flex items-center gap-2 mb-2">
                                <AlertTriangle size={16} /> {unschedulableJobs.length} Job{unschedulableJobs.length !== 1 ? 's' : ''} Need Manual Scheduling
                            </h4>
                            <ul className="space-y-1">
                                {unschedulableJobs.map((j: any, i: number) => (
                                    <li key={i} className="text-sm text-red-700">
                                        • {j.customer?.name || 'Unknown'} — {j.request?.description?.substring(0, 60) || 'No description'}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Schedule by Day */}
                    {sortedDates.map(dateKey => {
                        const dayJobs = jobsByDate[dateKey]
                            .filter(j => j.type !== 'parts_run')
                            .sort((a, b) => (a.arrivalTime?.getTime() || 0) - (b.arrivalTime?.getTime() || 0));

                        const partsRuns = jobsByDate[dateKey].filter(j => j.type === 'parts_run');
                        const dayDrive = dayJobs.reduce((s, j) => s + (j.driveTimeMinutes || 0), 0);

                        return (
                            <div key={dateKey} className="border rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b">
                                    <h4 className="font-semibold text-gray-800">
                                        {format(new Date(dateKey + 'T12:00:00'), 'EEEE, MMMM d')}
                                    </h4>
                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Sparkles size={12} className="text-blue-500" />
                                            {dayJobs.length} jobs
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock size={12} /> {dayDrive}m driving
                                        </span>
                                        {partsRuns.length > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Package size={12} className="text-yellow-600" />
                                                {partsRuns.length} parts run{partsRuns.length !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="divide-y">
                                    {dayJobs.map((job, i) => (
                                        <div key={job.id || i} className="px-4 py-2 flex items-center gap-3 hover:bg-gray-50">
                                            <div className="text-sm font-mono text-blue-600 w-16 flex-shrink-0">
                                                {job.arrivalTime ? format(job.arrivalTime, 'h:mm a') : '--'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                    {job.customer.name}
                                                </p>
                                                <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                                                    <MapPin size={10} />
                                                    {job.customer.address?.split(',')[0]}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-gray-400 flex-shrink-0">
                                                {job.driveTimeMinutes != null && job.driveTimeMinutes > 0 && (
                                                    <span>{job.driveTimeMinutes}m drive</span>
                                                )}
                                                <span>{job.estimated_duration || 60}m work</span>
                                            </div>
                                            {job.priority && (
                                                <span className={`text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${job.priority === 'critical' ? 'bg-red-100 text-red-800' :
                                                        job.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                                            job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                                'bg-green-100 text-green-800'
                                                    }`}>{job.priority}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="border-t px-5 py-4 bg-gray-50 flex items-center justify-between">
                    <div className="text-xs text-gray-400">
                        {stats.partsRuns > 0 && `Includes ${stats.partsRuns} parts pickup run${stats.partsRuns !== 1 ? 's' : ''}`}
                    </div>
                    <div className="flex items-center gap-3">
                        {mapsUrl && (
                            <button
                                onClick={() => window.open(mapsUrl, '_blank')}
                                className="px-4 py-2 text-blue-600 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition font-medium flex items-center gap-2 text-sm"
                            >
                                <ExternalLink size={14} />
                                Open in Maps
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-amber-600 hover:from-blue-700 hover:to-amber-700 text-white rounded-lg shadow transition font-semibold"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
