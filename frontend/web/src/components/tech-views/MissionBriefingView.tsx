import React from 'react';
import { format } from 'date-fns';
import {
    TechViewProps, getJobPriorityColor, getJobPriorityDot, getStatusBadge,
    getCategoryEmoji, formatJobTime, getJobDate,
    MapPin, Phone, Play, CheckCircle, Clock, Wrench, Package, Navigation
} from './shared';
import { ExternalLink, ChevronRight, Timer, Shield } from 'lucide-react';

export const MissionBriefingView: React.FC<TechViewProps> = ({ jobs, onStatusUpdate, onSelectJob }) => {
    if (jobs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <CheckCircle className="w-16 h-16 mb-4 text-green-300" />
                <p className="text-xl font-semibold text-gray-600">All clear — no active jobs</p>
                <p className="text-sm mt-1">Enjoy your day! 🌺</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {jobs.map((job, idx) => {
                const priorityClass = getJobPriorityColor(job.priority);
                const priorityDot = getJobPriorityDot(job.priority);
                const statusBadge = getStatusBadge(job.status);
                const date = getJobDate(job.scheduled_at);
                const tools = job.aiRecommendation?.requiredTools || job.intakeReview?.aiRecommendation?.requiredTools || [];
                const materials = job.aiRecommendation?.recommendedMaterials || job.intakeReview?.aiRecommendation?.recommendedMaterials || [];
                const safety = job.aiRecommendation?.safetyConsiderations || job.intakeReview?.aiRecommendation?.safetyConsiderations || [];

                return (
                    <div
                        key={job.id}
                        className={`rounded-xl border-l-4 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${priorityClass}`}
                    >
                        {/* Top Bar — Time + Duration + Priority */}
                        <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white px-5 py-2.5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-lg font-bold font-mono">
                                    {formatJobTime(job.scheduled_at)}
                                </span>
                                {job.estimated_duration && (
                                    <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Timer className="w-3 h-3" />
                                        {job.estimated_duration >= 60
                                            ? `${Math.floor(job.estimated_duration / 60)}h ${job.estimated_duration % 60 > 0 ? `${job.estimated_duration % 60}m` : ''}`
                                            : `${job.estimated_duration}m`
                                        }
                                    </span>
                                )}
                                {job.category && (
                                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">
                                        {getCategoryEmoji(job.category)} {job.category}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${priorityDot}`} />
                                <span className="text-xs font-medium uppercase tracking-wider">
                                    {job.priority}
                                </span>
                                <span className="text-xs text-gray-400">#{idx + 1}</span>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-5 py-4 bg-white">
                            {/* Customer Name + Address */}
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">{job.customer.name}</h3>
                                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                        <a
                                            href={`https://maps.google.com/?q=${encodeURIComponent(job.customer.address)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <MapPin className="w-3.5 h-3.5" />
                                            {job.customer.address}
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusBadge.bg} ${statusBadge.text}`}>
                                    {statusBadge.label}
                                </span>
                            </div>

                            {/* Description */}
                            <p className="text-sm text-gray-700 mb-4 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
                                {job.request?.description || 'No description provided'}
                            </p>

                            {/* Tools & Materials Checklists */}
                            {(tools.length > 0 || materials.length > 0) && (
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    {tools.length > 0 && (
                                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                                            <h4 className="text-xs font-bold text-blue-800 uppercase mb-2 flex items-center gap-1">
                                                <Wrench className="w-3.5 h-3.5" /> Tools Required
                                            </h4>
                                            <ul className="space-y-1">
                                                {tools.map((tool, i) => (
                                                    <li key={i} className="flex items-center gap-2 text-xs text-blue-900">
                                                        <span className={tool.owned ? 'text-green-600' : 'text-red-500'}>
                                                            {tool.owned ? '✅' : '❌'}
                                                        </span>
                                                        <span className={tool.essential ? 'font-medium' : 'text-blue-700'}>
                                                            {tool.name}
                                                        </span>
                                                        {tool.essential && (
                                                            <span className="text-[10px] bg-blue-200 text-blue-800 px-1 rounded">REQ</span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {materials.length > 0 && (
                                        <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                                            <h4 className="text-xs font-bold text-amber-800 uppercase mb-2 flex items-center gap-1">
                                                <Package className="w-3.5 h-3.5" /> Materials Needed
                                            </h4>
                                            <ul className="space-y-1">
                                                {materials.map((mat, i) => (
                                                    <li key={i} className="flex items-center justify-between text-xs text-amber-900">
                                                        <span>{mat.name} {mat.quantity && `(${mat.quantity})`}</span>
                                                        {mat.estimatedCost && (
                                                            <span className="text-amber-600 font-mono">${mat.estimatedCost}</span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Safety Warnings */}
                            {safety.length > 0 && (
                                <div className="bg-red-50 rounded-lg p-3 border border-red-100 mb-4">
                                    <h4 className="text-xs font-bold text-red-800 uppercase mb-1 flex items-center gap-1">
                                        <Shield className="w-3.5 h-3.5" /> Safety Notes
                                    </h4>
                                    <ul className="space-y-0.5">
                                        {safety.map((note, i) => (
                                            <li key={i} className="text-xs text-red-700">⚠️ {note}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Quick Actions */}
                            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                                {job.status === 'scheduled' && (
                                    <button
                                        onClick={() => onStatusUpdate(job.id, 'in_progress')}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors shadow-sm"
                                    >
                                        <Play className="w-4 h-4" /> Start Job
                                    </button>
                                )}
                                {job.status === 'in_progress' && (
                                    <button
                                        onClick={() => onStatusUpdate(job.id, 'completed')}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold transition-colors shadow-sm"
                                    >
                                        <CheckCircle className="w-4 h-4" /> Complete
                                    </button>
                                )}
                                <a
                                    href={`tel:${job.customer.phone}`}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Phone className="w-4 h-4" /> Call
                                </a>
                                <a
                                    href={`https://maps.google.com/?q=${encodeURIComponent(job.customer.address)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Navigation className="w-4 h-4" /> Navigate
                                </a>
                                <button
                                    onClick={() => onSelectJob(job)}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors ml-auto"
                                >
                                    Details <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
