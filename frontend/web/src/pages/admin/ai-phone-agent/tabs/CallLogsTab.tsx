import React, { useMemo, useState } from 'react';
import { Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, RefreshCw, ChevronRight, Search, Sparkles } from 'lucide-react';
import { CallLogEntry } from '../types';

interface CallLogsTabProps {
    callLogs: CallLogEntry[];
    loadingCalls: boolean;
    loadCallLogs: () => void;
    expandedCall: string | null;
    setExpandedCall: React.Dispatch<React.SetStateAction<string | null>>;
    formatDuration: (seconds: number) => string;
}

function getOutcomeBadge(call: CallLogEntry) {
    const raw = (call.rawStatus || call.endedReason || call.status || '').toLowerCase();
    if (raw.includes('scheduled')) {
        return { label: 'Quote Approved & Scheduled', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    if (raw.includes('change_requested') || raw.includes('tech_review')) {
        return { label: 'Change Requested → Tech Review', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    if (raw.includes('text_sent') || raw.includes('schedule_sms') || raw.includes('fallback')) {
        return { label: 'Quote / Schedule Link Sent', cls: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
    if (raw.includes('human_requested')) {
        return { label: 'Human Follow-Up Queued', cls: 'bg-purple-100 text-purple-800 border-purple-200' };
    }
    if (raw.includes('declined')) {
        return { label: 'Quote Declined', cls: 'bg-rose-100 text-rose-800 border-rose-200' };
    }
    if (raw.includes('completed')) {
        return { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    }
    return { label: call.endedReason || call.status || 'Ended', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
}

export const CallLogsTab: React.FC<CallLogsTabProps> = ({
    callLogs,
    loadingCalls,
    loadCallLogs,
    expandedCall,
    setExpandedCall,
    formatDuration
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'outbound' | 'inbound'>('all');

    const filteredLogs = useMemo(() => {
        return callLogs.filter(call => {
            if (typeFilter === 'outbound' && call.type !== 'outboundPhoneCall') return false;
            if (typeFilter === 'inbound' && call.type === 'outboundPhoneCall') return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const hay = `${call.customerName || ''} ${call.callerNumber || ''} ${call.summary || ''} ${call.transcript || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [callLogs, typeFilter, searchQuery]);

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-slate-50/50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <PhoneCall className="w-5 h-5 text-emerald-500" />
                            Recent AI Quote, Scheduling & Intake Calls
                            <span className="ml-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <Sparkles className="w-3 h-3" />
                                Gemini 3.8 Flash
                            </span>
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Review full turn-by-turn transcripts and outcomes from outbound quote callbacks, scheduling calls, and inbound requests
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search customer, quote, transcript..."
                                className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
                            <button
                                onClick={() => setTypeFilter('all')}
                                className={`px-2.5 py-1 rounded-md font-medium ${typeFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                All ({callLogs.length})
                            </button>
                            <button
                                onClick={() => setTypeFilter('outbound')}
                                className={`px-2.5 py-1 rounded-md font-medium ${typeFilter === 'outbound' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Quote & Schedule
                            </button>
                            <button
                                onClick={() => setTypeFilter('inbound')}
                                className={`px-2.5 py-1 rounded-md font-medium ${typeFilter === 'inbound' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Inbound
                            </button>
                        </div>
                        <button
                            onClick={loadCallLogs}
                            disabled={loadingCalls}
                            className="btn-secondary py-1.5 px-3 text-sm flex items-center gap-1.5"
                        >
                            <RefreshCw className={`w-4 h-4 ${loadingCalls ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                </div>

                <div className="divide-y divide-gray-100">
                    {loadingCalls ? (
                        <div className="p-12 text-center text-gray-500 flex flex-col items-center">
                            <RefreshCw className="w-8 h-8 animate-spin mb-4 text-emerald-500" />
                            <p>Loading recent calls...</p>
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <Phone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-lg font-medium text-gray-900 mb-1">No matching calls found</p>
                            <p>When your AI agent places quote/scheduling calls or answers inbound calls, full transcripts appear here.</p>
                        </div>
                    ) : (
                        filteredLogs.map(call => {
                            const isOutbound = call.type === 'outboundPhoneCall';
                            const badge = getOutcomeBadge(call);
                            const turns = (call.transcript || '')
                                .split(/\n\n+/)
                                .map(line => line.trim())
                                .filter(Boolean);

                            return (
                                <div key={call.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                                    <div
                                        className="flex items-center justify-between cursor-pointer gap-4"
                                        onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className={`p-2.5 rounded-xl shrink-0 ${isOutbound ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                {isOutbound ? <PhoneOutgoing className="w-4 h-4" /> : <PhoneIncoming className="w-4 h-4" />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-semibold text-gray-900">
                                                        {call.customerName ? `${call.customerName} (${call.callerNumber})` : call.callerNumber}
                                                    </p>
                                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${badge.cls}`}>
                                                        {badge.label}
                                                    </span>
                                                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                                        {isOutbound ? 'Outbound Quote / Schedule' : 'Inbound Call'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5 truncate">
                                                    {new Date(call.startedAt).toLocaleDateString()} at {new Date(call.startedAt).toLocaleTimeString()}
                                                    {' · '}{formatDuration(call.duration)}
                                                    {call.summary ? ` · ${call.summary}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs text-indigo-600 font-medium hidden sm:inline">
                                                {expandedCall === call.id ? 'Hide Transcript' : `View Transcript (${turns.length} turns)`}
                                            </span>
                                            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedCall === call.id ? 'rotate-90' : ''}`} />
                                        </div>
                                    </div>
                                    {expandedCall === call.id && (
                                        <div className="mt-4 ml-12 space-y-3">
                                            {call.summary && (
                                                <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5">
                                                    <p className="text-xs font-semibold text-indigo-700 mb-1">Call Outcome & Summary</p>
                                                    <p className="text-sm text-gray-800">{call.summary}</p>
                                                </div>
                                            )}
                                            {turns.length > 0 && (
                                                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2.5 max-h-96 overflow-y-auto">
                                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                        Verbatim Conversation Log ({turns.length} Turns)
                                                    </p>
                                                    {turns.map((turn, idx) => {
                                                        const isAI = /^AI:/i.test(turn);
                                                        const cleanText = turn.replace(/^(AI|Customer|Caller|User):\s*/i, '');
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className={`flex flex-col rounded-lg p-3 text-sm ${isAI
                                                                        ? 'bg-white border border-indigo-100 text-slate-800 mr-6'
                                                                        : 'bg-emerald-50/80 border border-emerald-200/70 text-slate-900 ml-6'
                                                                    }`}
                                                            >
                                                                <span className={`text-[11px] font-bold uppercase tracking-wide mb-0.5 ${isAI ? 'text-indigo-600' : 'text-emerald-700'}`}>
                                                                    {isAI ? 'AI Agent (Amy)' : `Customer (${call.customerName || call.callerNumber})`}
                                                                </span>
                                                                <p className="leading-relaxed">{cleanText}</p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <div className="flex flex-wrap gap-4 text-xs text-gray-500 pt-1">
                                                <span>Session ID: <code className="text-gray-700">{call.id}</code></span>
                                                <span>Duration: {formatDuration(call.duration)}</span>
                                                {call.quoteId && <span>Quote ID: <code className="text-gray-700">{call.quoteId}</code></span>}
                                                {call.jobId && <span>Job ID: <code className="text-gray-700">{call.jobId}</code></span>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
