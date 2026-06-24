import React from 'react';
import {
    TechViewProps, getJobPriorityDot, getStatusBadge,
    getCategoryEmoji, formatJobTime, getJobReadiness,
    MapPin, Phone, Play, CheckCircle, Clock
} from './shared';
import { Zap, AlertOctagon, PackageCheck, ChevronRight } from 'lucide-react';

interface LaneConfig {
    id: 'ready' | 'needs_prep' | 'blocked';
    label: string;
    emoji: string;
    icon: any;
    headerBg: string;
    borderColor: string;
    emptyText: string;
}

const LANES: LaneConfig[] = [
    {
        id: 'ready',
        label: 'Ready to Go',
        emoji: '🟢',
        icon: PackageCheck,
        headerBg: 'bg-gradient-to-r from-green-500 to-emerald-600',
        borderColor: 'border-green-200',
        emptyText: 'No jobs ready — check Needs Prep'
    },
    {
        id: 'needs_prep',
        label: 'Needs Prep',
        emoji: '🟡',
        icon: Clock,
        headerBg: 'bg-gradient-to-r from-amber-500 to-orange-500',
        borderColor: 'border-amber-200',
        emptyText: 'Nothing pending prep'
    },
    {
        id: 'blocked',
        label: 'Blocked',
        emoji: '🔴',
        icon: AlertOctagon,
        headerBg: 'bg-gradient-to-r from-red-500 to-rose-600',
        borderColor: 'border-red-200',
        emptyText: 'No blocked jobs — nice!'
    }
];

export const SmartPriorityView: React.FC<TechViewProps> = ({ jobs, onStatusUpdate, onSelectJob }) => {
    // Bucket jobs into lanes
    const lanes: Record<string, typeof jobs> = {
        ready: [],
        needs_prep: [],
        blocked: []
    };

    jobs.forEach(job => {
        const readiness = getJobReadiness(job);
        lanes[readiness].push(job);
    });

    // Sort ready lane: earliest scheduled first
    lanes.ready.sort((a, b) => {
        const dateA = a.scheduled_at?.toDate?.()?.getTime?.() || 0;
        const dateB = b.scheduled_at?.toDate?.()?.getTime?.() || 0;
        return dateA - dateB;
    });

    const totalJobs = jobs.length;

    if (totalJobs === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Zap className="w-16 h-16 mb-4 text-yellow-300" />
                <p className="text-xl font-semibold text-gray-600">No jobs to prioritize</p>
                <p className="text-sm mt-1">Relax — your queue is empty 🎉</p>
            </div>
        );
    }

    return (
        <div>
            {/* AI Recommendation Banner */}
            {lanes.ready.length > 0 && (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-3 mb-5 flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Zap className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-indigo-900">
                            ⚡ AI recommends starting with: {lanes.ready[0].customer.name}
                        </p>
                        <p className="text-xs text-indigo-600">
                            Earliest scheduled and ready to go — {formatJobTime(lanes.ready[0].scheduled_at)}
                        </p>
                    </div>
                </div>
            )}

            {/* 3-Column Kanban */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {LANES.map(lane => {
                    const laneJobs = lanes[lane.id];
                    const LaneIcon = lane.icon;

                    return (
                        <div key={lane.id} className={`rounded-xl border ${lane.borderColor} overflow-hidden bg-white shadow-sm`}>
                            {/* Lane Header */}
                            <div className={`${lane.headerBg} px-4 py-3 text-white`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <LaneIcon className="w-4 h-4" />
                                        <h3 className="font-bold text-sm">{lane.label}</h3>
                                    </div>
                                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">
                                        {laneJobs.length}
                                    </span>
                                </div>
                            </div>

                            {/* Lane Cards */}
                            <div className="p-3 space-y-2 min-h-[200px]">
                                {laneJobs.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400 text-xs">
                                        {lane.emptyText}
                                    </div>
                                ) : (
                                    laneJobs.map((job, idx) => {
                                        const statusBadge = getStatusBadge(job.status);
                                        const isAIRecommended = lane.id === 'ready' && idx === 0;

                                        return (
                                            <div
                                                key={job.id}
                                                className={`rounded-lg border p-3 hover:shadow-md transition-all cursor-pointer ${isAIRecommended ? 'ring-2 ring-indigo-300 bg-indigo-50/30' : 'bg-white hover:bg-gray-50'}`}
                                                onClick={() => onSelectJob(job)}
                                            >
                                                {isAIRecommended && (
                                                    <div className="text-[10px] font-bold text-indigo-600 mb-1 flex items-center gap-1">
                                                        <Zap className="w-3 h-3" /> START HERE
                                                    </div>
                                                )}
                                                <div className="flex items-start justify-between mb-1">
                                                    <h4 className="font-bold text-sm text-gray-900 leading-tight">{job.customer.name}</h4>
                                                    <span className={`w-2 h-2 rounded-full mt-1 ${getJobPriorityDot(job.priority)}`} />
                                                </div>
                                                <p className="text-[11px] text-gray-500 flex items-center gap-1 mb-2">
                                                    <Clock className="w-3 h-3" />
                                                    {formatJobTime(job.scheduled_at)}
                                                    <span className="ml-1">{getCategoryEmoji(job.category)}</span>
                                                </p>
                                                <div className="flex items-center justify-between">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusBadge.bg} ${statusBadge.text}`}>
                                                        {statusBadge.label}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        {job.status === 'scheduled' && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); onStatusUpdate(job.id, 'in_progress'); }}
                                                                className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700 transition-colors"
                                                            >
                                                                Start
                                                            </button>
                                                        )}
                                                        {job.status === 'in_progress' && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); onStatusUpdate(job.id, 'completed'); }}
                                                                className="px-2 py-0.5 bg-green-600 text-white rounded text-[10px] font-bold hover:bg-green-700 transition-colors"
                                                            >
                                                                Done
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
