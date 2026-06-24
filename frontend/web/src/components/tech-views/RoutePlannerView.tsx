import React, { useState, useEffect } from 'react';
import {
    TechViewProps, getJobPriorityDot, getStatusBadge,
    getCategoryEmoji, formatJobTime, getJobDate, fetchRealDriveTime,
    MapPin, Phone, Play, CheckCircle, Clock, Navigation
} from './shared';
import { ChevronDown, ChevronUp, Car, ExternalLink, Loader2, AlertCircle } from 'lucide-react';

interface DriveSegment {
    fromAddress: string;
    toAddress: string;
    durationMinutes: number;
    distanceMiles: string;
    isFallback: boolean;
    loading: boolean;
}

export const RoutePlannerView: React.FC<TechViewProps> = ({ jobs, onStatusUpdate, onSelectJob }) => {
    const [expandedJob, setExpandedJob] = useState<string | null>(null);
    const [driveSegments, setDriveSegments] = useState<DriveSegment[]>([]);
    const [loadingDriveTimes, setLoadingDriveTimes] = useState(true);

    // Sort jobs by scheduled time
    const sortedJobs = [...jobs].sort((a, b) => {
        const dateA = getJobDate(a.scheduled_at)?.getTime() || 0;
        const dateB = getJobDate(b.scheduled_at)?.getTime() || 0;
        return dateA - dateB;
    });

    // Fetch real drive times between sequential jobs
    useEffect(() => {
        if (sortedJobs.length < 2) {
            setDriveSegments([]);
            setLoadingDriveTimes(false);
            return;
        }

        const fetchDriveTimes = async () => {
            setLoadingDriveTimes(true);
            const segments: DriveSegment[] = [];

            // Create initial loading segments
            for (let i = 0; i < sortedJobs.length - 1; i++) {
                segments.push({
                    fromAddress: sortedJobs[i].customer.address,
                    toAddress: sortedJobs[i + 1].customer.address,
                    durationMinutes: 0,
                    distanceMiles: '—',
                    isFallback: false,
                    loading: true
                });
            }
            setDriveSegments([...segments]);

            // Fetch all drive times in parallel
            const promises = segments.map(async (seg, idx) => {
                try {
                    const result = await fetchRealDriveTime(seg.fromAddress, seg.toAddress);
                    segments[idx] = {
                        ...seg,
                        durationMinutes: result.durationMinutes,
                        distanceMiles: result.distanceMiles,
                        isFallback: result.isFallback,
                        loading: false
                    };
                } catch {
                    segments[idx] = {
                        ...seg,
                        durationMinutes: 15,
                        distanceMiles: '—',
                        isFallback: true,
                        loading: false
                    };
                }
            });

            await Promise.all(promises);
            setDriveSegments([...segments]);
            setLoadingDriveTimes(false);
        };

        fetchDriveTimes();
    }, [jobs.length, jobs.map(j => j.id).join(',')]);

    if (jobs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Car className="w-16 h-16 mb-4 text-blue-300" />
                <p className="text-xl font-semibold text-gray-600">No route to plan today</p>
                <p className="text-sm mt-1">All clear — enjoy the ride! 🚗</p>
            </div>
        );
    }

    const totalDriveMinutes = driveSegments.reduce((sum, seg) => sum + seg.durationMinutes, 0);
    const allLoaded = driveSegments.every(s => !s.loading);

    const getBorderColor = (job: typeof sortedJobs[0]) => {
        if (job.priority === 'critical' || job.priority === 'high') return 'border-red-500';
        if (job.status === 'in_progress') return 'border-amber-500';
        if (job.status === 'pending' || job.status === 'unscheduled') return 'border-yellow-400';
        return 'border-green-500';
    };

    const getDotColor = (job: typeof sortedJobs[0]) => {
        if (job.priority === 'critical' || job.priority === 'high') return 'bg-red-500';
        if (job.status === 'in_progress') return 'bg-amber-500';
        if (job.status === 'pending' || job.status === 'unscheduled') return 'bg-yellow-400';
        return 'bg-green-500';
    };

    return (
        <div className="max-w-2xl mx-auto">
            {/* Route Summary */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-4 mb-6 text-white shadow-lg">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-lg">Today's Route</h3>
                        <p className="text-blue-100 text-sm">{sortedJobs.length} stop{sortedJobs.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right">
                        {allLoaded ? (
                            <>
                                <p className="text-2xl font-bold font-mono">{totalDriveMinutes} min</p>
                                <p className="text-blue-200 text-xs flex items-center gap-1 justify-end">
                                    <Car className="w-3 h-3" /> Total drive (live traffic)
                                </p>
                            </>
                        ) : (
                            <div className="flex items-center gap-2 text-blue-200">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-sm">Calculating routes...</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />

                {sortedJobs.map((job, idx) => {
                    const isExpanded = expandedJob === job.id;
                    const statusBadge = getStatusBadge(job.status);
                    const segment = idx > 0 ? driveSegments[idx - 1] : null;

                    return (
                        <React.Fragment key={job.id}>
                            {/* Drive Time Connector */}
                            {segment && (
                                <div className="relative flex items-center gap-3 pl-3 py-2">
                                    <div className="w-5 h-5 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center z-10">
                                        <Car className="w-3 h-3 text-gray-400" />
                                    </div>
                                    <div className={`rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 border ${
                                        segment.loading
                                            ? 'bg-blue-50 border-blue-200 text-blue-500'
                                            : segment.isFallback
                                                ? 'bg-amber-50 border-amber-200 text-amber-600'
                                                : 'bg-green-50 border-green-200 text-green-700'
                                    }`}>
                                        {segment.loading ? (
                                            <>
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                <span>Calculating drive time...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Clock className="w-3 h-3" />
                                                <span className="font-bold">{segment.durationMinutes} min</span>
                                                {segment.distanceMiles !== '—' && (
                                                    <span className="text-gray-400">• {segment.distanceMiles} mi</span>
                                                )}
                                                {!segment.isFallback && (
                                                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                                                        🟢 Live traffic
                                                    </span>
                                                )}
                                                {segment.isFallback && (
                                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                                                        <AlertCircle className="w-2.5 h-2.5" /> Est.
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Job Card */}
                            <div className="relative pl-3 pb-2">
                                <div className={`flex items-start gap-3`}>
                                    {/* Timeline Dot */}
                                    <div className={`w-5 h-5 rounded-full ${getDotColor(job)} border-2 border-white shadow-md z-10 mt-4 flex-shrink-0 ${job.priority === 'critical' ? 'animate-pulse' : ''}`} />

                                    {/* Card */}
                                    <div className={`flex-1 bg-white rounded-xl shadow-sm border-l-4 ${getBorderColor(job)} hover:shadow-md transition-all cursor-pointer overflow-hidden`}>
                                        <div
                                            className="px-4 py-3 flex items-center justify-between"
                                            onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold font-mono text-gray-500">
                                                            {formatJobTime(job.scheduled_at)}
                                                        </span>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${getJobPriorityDot(job.priority)}`} />
                                                    </div>
                                                    <h4 className="font-bold text-gray-900">{job.customer.name}</h4>
                                                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                        <MapPin className="w-3 h-3" />
                                                        {job.customer.address}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm">{getCategoryEmoji(job.category)}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge.bg} ${statusBadge.text}`}>
                                                    {statusBadge.label}
                                                </span>
                                                {isExpanded
                                                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                                                    : <ChevronDown className="w-4 h-4 text-gray-400" />
                                                }
                                            </div>
                                        </div>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3 animate-in fade-in duration-200">
                                                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                                                    {job.request?.description || 'No description'}
                                                </p>

                                                {job.estimated_duration && (
                                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        Estimated: {job.estimated_duration} min
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-2 pt-2">
                                                    {job.status === 'scheduled' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onStatusUpdate(job.id, 'in_progress'); }}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors"
                                                        >
                                                            <Play className="w-3 h-3" /> Start
                                                        </button>
                                                    )}
                                                    {job.status === 'in_progress' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onStatusUpdate(job.id, 'completed'); }}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors"
                                                        >
                                                            <CheckCircle className="w-3 h-3" /> Complete
                                                        </button>
                                                    )}
                                                    <a
                                                        href={`tel:${job.customer.phone}`}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Phone className="w-3 h-3" /> Call
                                                    </a>
                                                    <a
                                                        href={`https://maps.google.com/?q=${encodeURIComponent(job.customer.address)}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Navigation className="w-3 h-3" /> Navigate
                                                    </a>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onSelectJob(job); }}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors ml-auto"
                                                    >
                                                        Full Details <ExternalLink className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};
