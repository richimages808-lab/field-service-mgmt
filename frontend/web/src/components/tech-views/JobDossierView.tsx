import React, { useState, useEffect } from 'react';
import {
    TechViewProps, getJobPriorityDot, getStatusBadge,
    getCategoryEmoji, formatJobTime,
    MapPin, Phone, Play, CheckCircle, Wrench, Package
} from './shared';
import { FileSearch, ExternalLink, Navigation, MessageSquare, Camera, Timer } from 'lucide-react';

export const JobDossierView: React.FC<TechViewProps> = ({
    jobs, onStatusUpdate, onCheckInJob, onSelectJob, onAcknowledgeJob, onTogglePrepChecklist
}) => {
    const [selectedId, setSelectedId] = useState<string>(jobs[0]?.id || '');
    const [activeTab, setActiveTab] = useState<'description' | 'materials' | 'notes'>('description');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    const selectedJob = jobs.find(j => j.id === selectedId) || jobs[0] || null;
    const isAcked = selectedJob?.tech_alert_status?.acknowledged === true;

    // Timer for in-progress jobs
    useEffect(() => {
        if (!selectedJob || selectedJob.status !== 'in_progress') {
            setElapsedSeconds(0);
            return;
        }

        const start = selectedJob.actual_start
            ? new Date(selectedJob.actual_start).getTime()
            : Date.now();

        const interval = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [selectedJob?.id, selectedJob?.status, selectedJob?.actual_start]);

    if (jobs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <CheckCircle className="w-16 h-16 mb-4 text-green-300" />
                <p className="text-xl font-semibold text-gray-600">No jobs to inspect</p>
                <p className="text-sm mt-1">Check back when new jobs are assigned! 📋</p>
            </div>
        );
    }

    const tools = selectedJob?.aiRecommendation?.requiredTools || selectedJob?.intakeReview?.aiRecommendation?.requiredTools || [];
    const materials = selectedJob?.aiRecommendation?.recommendedMaterials || selectedJob?.intakeReview?.aiRecommendation?.recommendedMaterials || [];
    const prepChecklist = selectedJob?.prep_checklist || [];
    const isItemChecked = (label: string) => {
        return prepChecklist.some(p => p.label === label && p.checked);
    };

    const formatElapsed = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? `${h}h ` : ''}${m}m ${s.toString().padStart(2, '0')}s`;
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-12rem)]">
            {/* Left Sidebar — Job List */}
            <div className="w-full lg:w-80 flex-shrink-0 bg-white rounded-xl border shadow-sm p-4 flex flex-col">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Jobs ({jobs.length})
                </h3>
                <div className="space-y-2 flex-1 overflow-y-auto">
                    {jobs.map(job => {
                        const isSelected = job.id === (selectedJob?.id || '');
                        const statusBadge = getStatusBadge(job.status);
                        const jobAcked = job.tech_alert_status?.acknowledged === true;
                        return (
                            <button
                                key={job.id}
                                onClick={() => setSelectedId(job.id)}
                                className={`w-full text-left p-3 rounded-lg border transition-all ${
                                    isSelected
                                        ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                                        : 'border-gray-150 hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sm text-gray-900 truncate">
                                        {job.customer?.name || (job as any).customer_name || 'Customer'}
                                    </span>
                                    <span className={`w-2 h-2 rounded-full ${getJobPriorityDot(job.priority)}`} />
                                </div>
                                <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                                    <span>{formatJobTime(job.scheduled_at)}</span>
                                    <div className="flex items-center gap-1">
                                        {jobAcked ? (
                                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">Ack'd</span>
                                        ) : (
                                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 rounded">New</span>
                                        )}
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                                            {statusBadge.label}
                                        </span>
                                    </div>
                                </div>
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
                                <div className="flex items-center gap-2">
                                    <h2 className="text-2xl font-bold">{selectedJob.customer?.name || (selectedJob as any).customer_name || 'Customer'}</h2>
                                    {isAcked ? (
                                        <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                                            ✓ Acknowledged
                                        </span>
                                    ) : (
                                        <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                                            ⏳ Pending Ack
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 mt-2 text-sm text-gray-300">
                                    {(selectedJob.customer?.address || (selectedJob as any).location?.address) && (
                                        <a
                                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedJob.customer?.address || (selectedJob as any).location?.address || '')}&travelmode=driving&dir_action=navigate`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1 hover:text-white transition-colors"
                                        >
                                            <MapPin className="w-4 h-4 text-red-400" /> {selectedJob.customer?.address || (selectedJob as any).location?.address}
                                        </a>
                                    )}
                                    {selectedJob.customer?.phone && (
                                        <a href={`tel:${selectedJob.customer.phone}`} className="flex items-center gap-1 hover:text-white transition-colors">
                                            <Phone className="w-4 h-4 text-blue-400" /> {selectedJob.customer.phone}
                                        </a>
                                    )}
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

                        {/* Unacknowledged Banner in Dossier */}
                        {!isAcked && onAcknowledgeJob && (
                            <div className="mt-4 bg-amber-500 text-white rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs font-semibold">
                                <span>⚡ Please confirm you've received this dispatched work order.</span>
                                <button
                                    onClick={() => onAcknowledgeJob(selectedJob.id)}
                                    className="px-3 py-1.5 bg-white text-amber-950 hover:bg-amber-50 font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1 text-xs"
                                >
                                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                                    Acknowledge & Confirm Stop
                                </button>
                            </div>
                        )}

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
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-xs font-bold text-blue-800 uppercase flex items-center gap-1">
                                                <Wrench className="w-3.5 h-3.5" /> Required Tools Check
                                            </h4>
                                            <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded font-semibold">
                                                {tools.filter(t => isItemChecked(t.name)).length}/{tools.length} Loaded
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {tools.map((tool, i) => {
                                                const checked = isItemChecked(tool.name);
                                                return (
                                                    <div
                                                        key={i}
                                                        onClick={() => onTogglePrepChecklist?.(selectedJob.id, tool.name, !checked)}
                                                        className={`flex items-center justify-between rounded-lg px-3 py-2 border cursor-pointer transition-colors ${
                                                            checked ? 'bg-green-50/80 border-green-300' : 'bg-white hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => {}}
                                                                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                                                            />
                                                            <span className="text-sm font-medium text-gray-900">{tool.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {tool.essential && (
                                                                <span className="text-[10px] bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded font-bold">REQUIRED</span>
                                                            )}
                                                            <span className={`text-sm ${tool.owned ? 'text-green-600' : 'text-red-500'}`}>
                                                                {tool.owned ? '✅ In Truck' : '❌ Missing'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {materials.length > 0 && (
                                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-xs font-bold text-amber-800 uppercase flex items-center gap-1">
                                                <Package className="w-3.5 h-3.5" /> Materials & Parts Check
                                            </h4>
                                            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded font-semibold">
                                                {materials.filter(m => isItemChecked(m.name)).length}/{materials.length} Picked
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {materials.map((mat, i) => {
                                                const checked = isItemChecked(mat.name);
                                                return (
                                                    <div
                                                        key={i}
                                                        onClick={() => onTogglePrepChecklist?.(selectedJob.id, mat.name, !checked)}
                                                        className={`flex items-center justify-between rounded-lg px-3 py-2 border cursor-pointer transition-colors ${
                                                            checked ? 'bg-green-50/80 border-green-300' : 'bg-white hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => {}}
                                                                className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                                                            />
                                                            <span className="text-sm font-medium text-gray-900">
                                                                {mat.name} {mat.quantity && <span className="text-gray-500">({mat.quantity})</span>}
                                                            </span>
                                                        </div>
                                                        {mat.estimatedCost && (
                                                            <span className="font-mono text-sm text-amber-700">${mat.estimatedCost.toFixed(2)}</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
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
                                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedJob.customer?.address || (selectedJob as any).location?.address || '')}&travelmode=driving&dir_action=navigate`}
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
                            {(selectedJob.status === 'scheduled' || selectedJob.status === 'en_route') && (
                                <button
                                    onClick={() => onCheckInJob ? onCheckInJob(selectedJob.id) : onStatusUpdate(selectedJob.id, 'in_progress')}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-bold transition-all shadow-md active:scale-95"
                                >
                                    <Play className="w-5 h-5 fill-white" /> Arrived & Start Work
                                </button>
                            )}
                            {selectedJob.status === 'in_progress' && (
                                <button
                                    onClick={() => onStatusUpdate(selectedJob.id, 'completed')}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-colors shadow-md active:scale-95"
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
