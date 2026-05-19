import React from 'react';
import { Phone, PhoneCall, RefreshCw, ChevronRight } from 'lucide-react';
import { CallLogEntry } from '../types';

interface CallLogsTabProps {
    callLogs: CallLogEntry[];
    loadingCalls: boolean;
    loadCallLogs: () => void;
    expandedCall: string | null;
    setExpandedCall: React.Dispatch<React.SetStateAction<string | null>>;
    formatDuration: (seconds: number) => string;
}

export const CallLogsTab: React.FC<CallLogsTabProps> = ({
    callLogs,
    loadingCalls,
    loadCallLogs,
    expandedCall,
    setExpandedCall,
    formatDuration
}) => {
    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <PhoneCall className="w-5 h-5 text-emerald-500" />
                            Recent AI Calls
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Review transcripts and summaries from your AI agent's recent conversations</p>
                    </div>
                    <button
                        onClick={loadCallLogs}
                        disabled={loadingCalls}
                        className="btn-secondary py-2 flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${loadingCalls ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                <div className="divide-y divide-gray-100">
                    {loadingCalls ? (
                        <div className="p-12 text-center text-gray-500 flex flex-col items-center">
                            <RefreshCw className="w-8 h-8 animate-spin mb-4 text-emerald-500" />
                            <p>Loading recent calls...</p>
                        </div>
                    ) : callLogs.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <Phone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-lg font-medium text-gray-900 mb-1">No calls yet</p>
                            <p>When customers call your agent, the logs will appear here.</p>
                        </div>
                    ) : (
                        callLogs.map(call => (
                            <div key={call.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                                <div
                                    className="flex items-center justify-between cursor-pointer"
                                    onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-lg ${call.status === 'ended' ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                                            <Phone className={`w-4 h-4 ${call.status === 'ended' ? 'text-emerald-600' : 'text-amber-600'}`} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{call.callerNumber}</p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(call.startedAt).toLocaleDateString()} at {new Date(call.startedAt).toLocaleTimeString()}
                                                {' · '}{formatDuration(call.duration)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {call.summary && (
                                            <span className="text-xs text-gray-500 max-w-xs truncate hidden md:block">
                                                {call.summary}
                                            </span>
                                        )}
                                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedCall === call.id ? 'rotate-90' : ''}`} />
                                    </div>
                                </div>
                                {expandedCall === call.id && (
                                    <div className="mt-4 ml-12 space-y-3">
                                        {call.summary && (
                                            <div className="bg-violet-50 rounded-lg p-3">
                                                <p className="text-xs font-semibold text-violet-700 mb-1">AI Summary</p>
                                                <p className="text-sm text-gray-700">{call.summary}</p>
                                            </div>
                                        )}
                                        {call.transcript && (
                                            <div className="bg-gray-50 rounded-lg p-3">
                                                <p className="text-xs font-semibold text-gray-500 mb-1">Transcript</p>
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">{call.transcript}</p>
                                            </div>
                                        )}
                                        <div className="flex gap-4 text-xs text-gray-500">
                                            <span>Duration: {formatDuration(call.duration)}</span>
                                            <span>Status: {call.endedReason || call.status}</span>
                                            {call.cost > 0 && <span>Cost: ${call.cost.toFixed(4)}</span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
