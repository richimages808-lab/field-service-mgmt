import React, { useState, useEffect, useRef } from 'react';
import {
    TechViewProps, getJobPriorityDot, getStatusBadge,
    getCategoryEmoji, formatJobTime, getJobDate,
    MapPin, Phone, Play, CheckCircle, Clock, Wrench, Package
} from './shared';
import { FileSearch, ChevronRight, Timer, ExternalLink, Navigation, MessageSquare, Camera } from 'lucide-react';

export const JobDossierView: React.FC<TechViewProps> = ({ jobs, onStatusUpdate, onSelectJob }) => {
    const [selectedId, setSelectedId] = useState<string | null>(jobs[0]?.id || null);
    const [activeTab, setActiveTab] = useState<'description' | 'materials' | 'notes'>('description');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const selectedJob = jobs.find(j => j.id === selectedId) || null;

    // Timer for in-progress jobs
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);

        if (selectedJob?.status === 'in_progress' && selectedJob?.actual_start) {
            const startTime = selectedJob.actual_start?.toDate?.()?.getTime?.() || new Date(selectedJob.actual_start).getTime();
            const updateTimer = () => {
                setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
            };
            updateTimer();
            timerRef.current = setInterval(updateTimer, 1000);
        } else {
            setElapsedSeconds(0);
        }

        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [selectedJob?.id, selectedJob?.status]);

    const formatElapsed = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? `${h}h ` : ''}${m}m ${s.toString().padStart(2, '0')}s`;
    };

    if (jobs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <FileSearch className="w-16 h-16 mb-4 text-purple-300" />
                <p className="text-xl font-semibold text-gray-600">No jobs to review</p>
                <p className="text-sm mt-1">Your dossier is empty 📂</p>
            </div>
        );
    }

    const tools = selectedJob?.aiRecommendation?.requiredTools || selectedJob?.intakeReview?.aiRecommendation?.requiredTools || [];
    const materials = selectedJob?.aiRecommendation?.recommendedMaterials || selectedJob?.intakeReview?.aiRecommendation?.recommendedMaterials || [];

    return (
        <div className="flex gap-4 h-[calc(100vh-220px)]">
            {/* Sidebar — Job List */}
            <div className="w-64 flex-shrink-0 bg-white rounded-xl border shadow-sm overflow-y-auto">
                <div className="px-3 py-3 border-b bg-gray-50">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Today's Jobs</h3>
                </div>
                <div className="p-2 space-y-1">
                    {jobs.map(job => {
                        const isActive = job.id === selectedId;
                        const statusBadge = getStatusBadge(job.status);

                        return (
                            <button
                                key={job.id}
                                onClick={() => { setSelectedId(job.id); setActiveTab('description'); }}
                                className={`w-full text-left rounded-lg px-3 py-2.5 transition-all ${
                                    isActive
                                        ? 'bg-blue-50 border border-blue-200 shadow-sm'
                                        : 'hover:bg-gray-50 border border-transparent'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-xs font-mono text-gray-400">{formatJobTime(job.scheduled_at)}</span>
                                    <span className={`w-1.5 h-1.5 rounded-full ${getJobPriorityDot(job.priority)}`} />
                                </div>
                                <p className={`text-sm font-bold truncate ${isActive ? 'text-blue-900' : 'text-gray-900'}`}>
                                    {job.customer.name}
                                </p>
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mt-1 ${statusBadge.bg} ${statusBadge.text}`}>
                                    {statusBadge.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Main Dossier Panel */}
            {selectedJob ? (
                <div className="flex-1 bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden">
                    {/* Hero Header */}
                    <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white px-6 py-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-2xl font-bold">{selectedJob.customer.name}</h2>
                                <div className="flex items-center gap-4 mt-2 text-sm text-gray-300">
                                    <a
                                        href={`https://maps.google.com/?q=${encodeURIComponent(selectedJob.customer.address)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-1 hover:text-white transition-colors"
                                    >
                                        <MapPin className="w-4 h-4" /> {selectedJob.customer.address}
                                    </a>
                                    <a href={`tel:${selectedJob.customer.phone}`} className="flex items-center gap-1 hover:text-white transition-colors">
                                        <Phone className="w-4 h-4" /> {selectedJob.customer.phone}
                                    </a>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="flex items-center gap-2">
                                    {selectedJob.category && (
                                        <span className="text-sm bg-white/10 px-2 py-0.5 rounded-full">
                                            {getCategoryEmoji(selectedJob.category)} {selectedJob.category}
                                        </span>
                                    )}
                                    <span className={`w-2 h-2 rounded-full ${getJobPriorityDot(selectedJob.priority)}`} />
                                    <span className="text-xs uppercase">{selectedJob.priority}</span>
                                </div>
                                <p className="text-lg font-mono mt-1">{formatJobTime(selectedJob.scheduled_at)}</p>
                            </div>
                        </div>

                        {/* Timer Bar (in-progress only) */}
                        {selectedJob.status === 'in_progress' && (
                            <div className="mt-3 bg-white/10 rounded-lg px-4 py-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Timer className="w-5 h-5 text-amber-400 animate-pulse" />
                                    <span className="text-sm font-medium">Job Timer</span>
                                </div>
                                <span className="text-xl font-bold font-mono text-amber-300">{formatElapsed(elapsedSeconds)}</span>
                                {selectedJob.estimated_duration && (
                                    <span className="text-xs text-gray-400">
                                        Est: {selectedJob.estimated_duration}m
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b px-6 bg-gray-50">
                        {(['description', 'materials', 'notes'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === tab
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {tab === 'description' && '📝 Description'}
                                {tab === 'materials' && '🔧 Materials & Quote'}
                                {tab === 'notes' && '💬 Notes'}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {activeTab === 'description' && (
                            <div className="space-y-4">
                                <div className="bg-gray-50 rounded-lg p-4 border">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Job Description</h4>
                                    <p className="text-gray-800 leading-relaxed">{selectedJob.request?.description || 'No description provided'}</p>
                                </div>

                                {selectedJob.request?.photos && selectedJob.request.photos.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                            <Camera className="w-3.5 h-3.5" /> Customer Photos
                                        </h4>
                                        <div className="grid grid-cols-3 gap-2">
                                            {selectedJob.request.photos.map((photo, i) => (
                                                <img
                                                    key={i}
                                                    src={photo}
                                                    alt={`Customer photo ${i + 1}`}
                                                    className="rounded-lg w-full h-32 object-cover border cursor-pointer hover:opacity-80 transition-opacity"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* AI Checklist */}
                                {(selectedJob.aiRecommendation || selectedJob.intakeReview?.aiRecommendation) && (
                                    <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                                        <h4 className="text-xs font-bold text-indigo-800 uppercase mb-2">🤖 AI Pre-Job Checklist</h4>
                                        <ul className="space-y-1 text-sm text-indigo-900">
                                            <li>✅ Review customer photos above</li>
                                            <li>✅ Verify tools list (Materials tab)</li>
                                            <li>✅ Check safety requirements</li>
                                            <li>✅ Confirm customer availability</li>
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'materials' && (
                            <div className="space-y-4">
                                {tools.length > 0 && (
                                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                                        <h4 className="text-xs font-bold text-blue-800 uppercase mb-3 flex items-center gap-1">
                                            <Wrench className="w-3.5 h-3.5" /> Required Tools
                                        </h4>
                                        <div className="space-y-2">
                                            {tools.map((tool, i) => (
                                                <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                                                    <span className="text-sm font-medium text-gray-900">{tool.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        {tool.essential && (
                                                            <span className="text-[10px] bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded font-bold">REQUIRED</span>
                                                        )}
                                                        <span className={`text-sm ${tool.owned ? 'text-green-600' : 'text-red-500'}`}>
                                                            {tool.owned ? '✅ Have' : '❌ Missing'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {materials.length > 0 && (
                                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                                        <h4 className="text-xs font-bold text-amber-800 uppercase mb-3 flex items-center gap-1">
                                            <Package className="w-3.5 h-3.5" /> Materials Needed
                                        </h4>
                                        <div className="space-y-2">
                                            {materials.map((mat, i) => (
                                                <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                                                    <span className="text-sm font-medium text-gray-900">
                                                        {mat.name} {mat.quantity && <span className="text-gray-500">({mat.quantity})</span>}
                                                    </span>
                                                    {mat.estimatedCost && (
                                                        <span className="font-mono text-sm text-amber-700">${mat.estimatedCost.toFixed(2)}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {tools.length === 0 && materials.length === 0 && (
                                    <div className="text-center py-12 text-gray-400">
                                        <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                        <p className="text-sm">No AI-generated materials list available for this job.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'notes' && (
                            <div className="space-y-4">
                                {selectedJob.notes?.public && (
                                    <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                                        <h4 className="text-xs font-bold text-green-800 uppercase mb-2 flex items-center gap-1">
                                            <MessageSquare className="w-3.5 h-3.5" /> Public Notes
                                        </h4>
                                        <p className="text-sm text-green-900">{selectedJob.notes.public}</p>
                                    </div>
                                )}
                                {selectedJob.notes?.internal && (
                                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                                        <h4 className="text-xs font-bold text-purple-800 uppercase mb-2 flex items-center gap-1">
                                            <MessageSquare className="w-3.5 h-3.5" /> Internal Notes
                                        </h4>
                                        <p className="text-sm text-purple-900">{selectedJob.notes.internal}</p>
                                    </div>
                                )}
                                {!selectedJob.notes?.public && !selectedJob.notes?.internal && (
                                    <div className="text-center py-12 text-gray-400">
                                        <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                        <p className="text-sm">No notes on this job yet.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="border-t bg-gray-50 px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <a
                                href={`tel:${selectedJob.customer.phone}`}
                                className="flex items-center gap-1.5 px-3 py-2 bg-white border rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <Phone className="w-4 h-4" /> Call
                            </a>
                            <a
                                href={`https://maps.google.com/?q=${encodeURIComponent(selectedJob.customer.address)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 px-3 py-2 bg-white border rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <Navigation className="w-4 h-4" /> Navigate
                            </a>
                            <button
                                onClick={() => onSelectJob(selectedJob)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-white border rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" /> Full Details
                            </button>
                        </div>
                        <div>
                            {selectedJob.status === 'scheduled' && (
                                <button
                                    onClick={() => onStatusUpdate(selectedJob.id, 'in_progress')}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors shadow-md"
                                >
                                    <Play className="w-5 h-5" /> Start Job
                                </button>
                            )}
                            {selectedJob.status === 'in_progress' && (
                                <button
                                    onClick={() => onStatusUpdate(selectedJob.id, 'completed')}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-colors shadow-md"
                                >
                                    <CheckCircle className="w-5 h-5" /> Complete Job
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                    <p className="text-sm">Select a job from the sidebar</p>
                </div>
            )}
        </div>
    );
};
