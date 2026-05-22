import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { db, functions } from '../../firebase';
import { collection, query, orderBy, limit, getDocs, where, doc, updateDoc, deleteDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    ArrowLeft, Mail, MessageSquare, Phone, AlertTriangle, CheckCircle2,
    XCircle, RefreshCw, Search, Filter, Shield, ShieldOff, Eye,
    ChevronDown, ChevronRight, Clock, Ban, Trash2, RotateCcw
} from 'lucide-react';

// ─── Types ───
interface EmailEvent {
    id: string;
    email: string;
    event: string;
    reason?: string;
    status?: string;
    response?: string;
    bounceType?: string;
    bounceClassification?: string;
    timestamp?: any;
    createdAt?: any;
    resolved?: boolean;
    orgId?: string;
}

interface EmailSuppression {
    id: string;
    email: string;
    reason: string;
    details: string;
    eventCount: number;
    active: boolean;
    orgId?: string;
    suppressedAt?: any;
    unsuppressedAt?: any;
}

interface EmailLog {
    id: string;
    to: string;
    subject: string;
    status: string;
    error?: string;
    createdAt?: any;
}

interface VoiceSession {
    id: string;
    callerPhone: string;
    calledNumber: string;
    orgId: string;
    orgName?: string;
    customerName?: string;
    intent?: string;
    status?: string;
    transcript?: string[];
    createdAt?: any;
}

type TabId = 'email-events' | 'email-logs' | 'suppressions' | 'voice-sessions';

const TAB_CONFIG: { id: TabId; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'email-events', label: 'Email Events', icon: <AlertTriangle className="w-4 h-4" />, color: 'text-amber-600' },
    { id: 'email-logs', label: 'Email Logs', icon: <Mail className="w-4 h-4" />, color: 'text-blue-600' },
    { id: 'suppressions', label: 'Suppressions', icon: <Ban className="w-4 h-4" />, color: 'text-red-600' },
    { id: 'voice-sessions', label: 'Voice & Calls', icon: <Phone className="w-4 h-4" />, color: 'text-emerald-600' },
];

const EVENT_COLORS: Record<string, string> = {
    bounce: 'bg-red-100 text-red-700 border-red-200',
    dropped: 'bg-red-100 text-red-700 border-red-200',
    spam_report: 'bg-rose-100 text-rose-700 border-rose-200',
    unsubscribe: 'bg-amber-100 text-amber-700 border-amber-200',
    deferred: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    open: 'bg-blue-100 text-blue-700 border-blue-200',
    click: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    processed: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_COLORS: Record<string, string> = {
    sent: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    skipped_suppressed: 'bg-amber-100 text-amber-700',
    skipped_no_api_key: 'bg-gray-100 text-gray-600',
};

function formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const PlatformCommsMonitor: React.FC = () => {
    const { user } = useAuth();
    const isSiteAdmin = (user as any)?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com';

    const [activeTab, setActiveTab] = useState<TabId>('email-events');
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Data
    const [emailEvents, setEmailEvents] = useState<EmailEvent[]>([]);
    const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
    const [suppressions, setSuppressions] = useState<EmailSuppression[]>([]);
    const [voiceSessions, setVoiceSessions] = useState<VoiceSession[]>([]);

    // Stats
    const [stats, setStats] = useState({ bounces: 0, delivered: 0, suppressed: 0, calls: 0 });

    if (!isSiteAdmin) return <Navigate to="/" replace />;

    // ─── Fetch Data ───
    const fetchData = async () => {
        setLoading(true);
        try {
            // Email Events (last 200)
            const eventsSnap = await getDocs(query(collection(db, 'email_events'), orderBy('createdAt', 'desc'), limit(200)));
            const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as EmailEvent));
            setEmailEvents(events);

            // Email Logs (last 200)
            const logsSnap = await getDocs(query(collection(db, 'email_logs'), orderBy('createdAt', 'desc'), limit(200)));
            const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as EmailLog));
            setEmailLogs(logs);

            // Suppressions (all active)
            const suppSnap = await getDocs(collection(db, 'email_suppressions'));
            const supps = suppSnap.docs.map(d => ({ id: d.id, ...d.data() } as EmailSuppression));
            setSuppressions(supps);

            // Voice Sessions (last 100)
            const vsSnap = await getDocs(query(collection(db, 'voice_sessions'), orderBy('createdAt', 'desc'), limit(100)));
            const vs = vsSnap.docs.map(d => ({ id: d.id, ...d.data() } as VoiceSession));
            setVoiceSessions(vs);

            // Compute stats
            setStats({
                bounces: events.filter(e => ['bounce', 'dropped', 'spam_report'].includes(e.event)).length,
                delivered: events.filter(e => e.event === 'delivered').length,
                suppressed: supps.filter(s => s.active).length,
                calls: vs.length,
            });
        } catch (err) {
            console.error('Failed to fetch comms data:', err);
            toast.error('Failed to load communications data');
        }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    // ─── Unsuppress ───
    const handleUnsuppress = async (supp: EmailSuppression) => {
        if (!confirm(`Remove ${supp.email} from suppression list? Emails will resume.`)) return;
        try {
            const unsuppressEmail = httpsCallable(functions, 'unsuppressEmail');
            await unsuppressEmail({ email: supp.email });
            setSuppressions(prev => prev.map(s => s.id === supp.id ? { ...s, active: false } : s));
            toast.success(`${supp.email} unsuppressed`);
        } catch (err) {
            toast.error('Failed to unsuppress');
        }
    };

    // ─── Filter ───
    const filterBySearch = <T extends Record<string, any>>(items: T[], keys: string[]): T[] => {
        if (!searchTerm.trim()) return items;
        const term = searchTerm.toLowerCase();
        return items.filter(item => keys.some(k => String(item[k] || '').toLowerCase().includes(term)));
    };

    const filteredEvents = filterBySearch(emailEvents, ['email', 'event', 'reason', 'response']);
    const filteredLogs = filterBySearch(emailLogs, ['to', 'subject', 'status', 'error']);
    const filteredSuppressions = filterBySearch(suppressions, ['email', 'reason', 'details']);
    const filteredVoice = filterBySearch(voiceSessions, ['callerPhone', 'orgId', 'orgName', 'customerName', 'intent', 'status']);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 sticky top-0 z-10">
                <div className="px-4 sm:px-5 lg:px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link to="/site-admin" className="text-gray-400 hover:text-gray-600 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-violet-500 to-blue-600 p-2.5 rounded-xl shadow-lg shadow-violet-200/50">
                                <Shield className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-blue-600">
                                    Communications Monitor
                                </h1>
                                <p className="text-sm text-gray-500">Platform-wide email, SMS & voice logs</p>
                            </div>
                        </div>
                        <div className="ml-auto flex items-center gap-3">
                            <button onClick={fetchData} disabled={loading} className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50">
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-4 sm:px-5 lg:px-6 py-5 space-y-6">
                {/* Stats Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Bounces / Issues', value: stats.bounces, color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: <XCircle className="w-5 h-5" /> },
                        { label: 'Delivered', value: stats.delivered, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle2 className="w-5 h-5" /> },
                        { label: 'Suppressed Addresses', value: stats.suppressed, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: <Ban className="w-5 h-5" /> },
                        { label: 'Voice Sessions', value: stats.calls, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: <Phone className="w-5 h-5" /> },
                    ].map(s => (
                        <div key={s.label} className={`${s.bg} border rounded-xl p-4 flex items-center gap-3`}>
                            <div className={s.color}>{s.icon}</div>
                            <div>
                                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                                <p className="text-xs text-gray-500">{s.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tabs + Search */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
                        {TAB_CONFIG.map(tab => (
                            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setExpandedId(null); }}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeTab === tab.id ? 'bg-gradient-to-r from-violet-500 to-blue-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 bg-white" />
                    </div>
                </div>

                {/* Content */}
                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <RefreshCw className="w-6 h-6 text-violet-500 animate-spin" />
                            <span className="ml-3 text-gray-500">Loading...</span>
                        </div>
                    ) : (
                        <>
                            {/* ═══ Email Events ═══ */}
                            {activeTab === 'email-events' && (
                                <div className="divide-y divide-gray-100">
                                    <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        <div className="col-span-3">Email</div>
                                        <div className="col-span-2">Event</div>
                                        <div className="col-span-4">Reason</div>
                                        <div className="col-span-2">Time</div>
                                        <div className="col-span-1"></div>
                                    </div>
                                    {filteredEvents.length === 0 ? (
                                        <div className="text-center py-16 text-gray-400">
                                            <Mail className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                            <p>No email events yet. Events will appear here once the SendGrid webhook is configured.</p>
                                        </div>
                                    ) : filteredEvents.map(ev => (
                                        <div key={ev.id} className="hover:bg-slate-50/50 transition-colors">
                                            <div className="grid grid-cols-12 gap-2 px-5 py-3 items-center cursor-pointer" onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}>
                                                <div className="col-span-3 text-sm font-medium text-gray-900 truncate">{ev.email}</div>
                                                <div className="col-span-2">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${EVENT_COLORS[ev.event] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                        {ev.event}
                                                    </span>
                                                </div>
                                                <div className="col-span-4 text-sm text-gray-500 truncate">{ev.reason || ev.response || '—'}</div>
                                                <div className="col-span-2 text-xs text-gray-400">{formatDate(ev.timestamp || ev.createdAt)}</div>
                                                <div className="col-span-1 text-right">
                                                    {expandedId === ev.id ? <ChevronDown className="w-4 h-4 text-gray-400 inline" /> : <ChevronRight className="w-4 h-4 text-gray-400 inline" />}
                                                </div>
                                            </div>
                                            {expandedId === ev.id && (
                                                <div className="px-5 pb-4 bg-slate-50 border-t border-gray-100">
                                                    <div className="grid grid-cols-2 gap-3 text-sm py-3">
                                                        <div><span className="text-gray-500">Status:</span> <span className="font-medium">{ev.status || '—'}</span></div>
                                                        <div><span className="text-gray-500">Bounce Type:</span> <span className="font-medium">{ev.bounceType || '—'}</span></div>
                                                        <div><span className="text-gray-500">Classification:</span> <span className="font-medium">{ev.bounceClassification || '—'}</span></div>
                                                        <div><span className="text-gray-500">Org:</span> <span className="font-medium">{ev.orgId || '—'}</span></div>
                                                        <div className="col-span-2"><span className="text-gray-500">Full Response:</span> <span className="font-medium break-all">{ev.response || '—'}</span></div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ═══ Email Logs ═══ */}
                            {activeTab === 'email-logs' && (
                                <div className="divide-y divide-gray-100">
                                    <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        <div className="col-span-3">To</div>
                                        <div className="col-span-4">Subject</div>
                                        <div className="col-span-2">Status</div>
                                        <div className="col-span-3">Time</div>
                                    </div>
                                    {filteredLogs.length === 0 ? (
                                        <div className="text-center py-16 text-gray-400">
                                            <Mail className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                            <p>No email logs found.</p>
                                        </div>
                                    ) : filteredLogs.map(log => (
                                        <div key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                            <div className="grid grid-cols-12 gap-2 px-5 py-3 items-center cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                                                <div className="col-span-3 text-sm font-medium text-gray-900 truncate">{log.to}</div>
                                                <div className="col-span-4 text-sm text-gray-600 truncate">{log.subject}</div>
                                                <div className="col-span-2">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[log.status] || 'bg-gray-100 text-gray-600'}`}>
                                                        {log.status?.replace(/_/g, ' ')}
                                                    </span>
                                                </div>
                                                <div className="col-span-3 text-xs text-gray-400">{formatDate(log.createdAt)}</div>
                                            </div>
                                            {expandedId === log.id && log.error && (
                                                <div className="px-5 pb-4 bg-red-50 border-t border-red-100">
                                                    <p className="text-sm text-red-700 py-2"><span className="font-semibold">Error:</span> {log.error}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ═══ Suppressions ═══ */}
                            {activeTab === 'suppressions' && (
                                <div className="divide-y divide-gray-100">
                                    <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        <div className="col-span-3">Email</div>
                                        <div className="col-span-2">Reason</div>
                                        <div className="col-span-3">Details</div>
                                        <div className="col-span-1">Events</div>
                                        <div className="col-span-1">Status</div>
                                        <div className="col-span-2 text-right">Actions</div>
                                    </div>
                                    {filteredSuppressions.length === 0 ? (
                                        <div className="text-center py-16 text-gray-400">
                                            <Ban className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                            <p>No suppressed addresses. Addresses that bounce or get spam complaints will appear here.</p>
                                        </div>
                                    ) : filteredSuppressions.map(supp => (
                                        <div key={supp.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-slate-50/50 transition-colors">
                                            <div className="col-span-3 text-sm font-medium text-gray-900 truncate">{supp.email}</div>
                                            <div className="col-span-2">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${EVENT_COLORS[supp.reason] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                    {supp.reason}
                                                </span>
                                            </div>
                                            <div className="col-span-3 text-sm text-gray-500 truncate">{supp.details || '—'}</div>
                                            <div className="col-span-1 text-sm text-gray-600 font-medium">{supp.eventCount}</div>
                                            <div className="col-span-1">
                                                {supp.active ? (
                                                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Blocked</span>
                                                ) : (
                                                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Cleared</span>
                                                )}
                                            </div>
                                            <div className="col-span-2 text-right">
                                                {supp.active && (
                                                    <button onClick={() => handleUnsuppress(supp)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors cursor-pointer">
                                                        <RotateCcw className="w-3 h-3" /> Unsuppress
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ═══ Voice Sessions ═══ */}
                            {activeTab === 'voice-sessions' && (
                                <div className="divide-y divide-gray-100">
                                    <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        <div className="col-span-2">Caller</div>
                                        <div className="col-span-2">Customer</div>
                                        <div className="col-span-2">Org</div>
                                        <div className="col-span-2">Intent</div>
                                        <div className="col-span-1">Status</div>
                                        <div className="col-span-2">Time</div>
                                        <div className="col-span-1"></div>
                                    </div>
                                    {filteredVoice.length === 0 ? (
                                        <div className="text-center py-16 text-gray-400">
                                            <Phone className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                            <p>No voice sessions found.</p>
                                        </div>
                                    ) : filteredVoice.map(vs => (
                                        <div key={vs.id} className="hover:bg-slate-50/50 transition-colors">
                                            <div className="grid grid-cols-12 gap-2 px-5 py-3 items-center cursor-pointer" onClick={() => setExpandedId(expandedId === vs.id ? null : vs.id)}>
                                                <div className="col-span-2 text-sm font-medium text-gray-900 truncate">{vs.callerPhone}</div>
                                                <div className="col-span-2 text-sm text-gray-600 truncate">{vs.customerName || '—'}</div>
                                                <div className="col-span-2 text-sm text-gray-500 truncate">{vs.orgName || vs.orgId || '—'}</div>
                                                <div className="col-span-2">
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200">
                                                        {vs.intent || '—'}
                                                    </span>
                                                </div>
                                                <div className="col-span-1">
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${vs.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : vs.status === 'active' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                                        {vs.status || '—'}
                                                    </span>
                                                </div>
                                                <div className="col-span-2 text-xs text-gray-400">{formatDate(vs.createdAt)}</div>
                                                <div className="col-span-1 text-right">
                                                    {expandedId === vs.id ? <ChevronDown className="w-4 h-4 text-gray-400 inline" /> : <ChevronRight className="w-4 h-4 text-gray-400 inline" />}
                                                </div>
                                            </div>
                                            {expandedId === vs.id && vs.transcript && vs.transcript.length > 0 && (
                                                <div className="px-5 pb-4 bg-slate-50 border-t border-gray-100">
                                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider py-2">Transcript</p>
                                                    <div className="space-y-1 max-h-64 overflow-y-auto">
                                                        {vs.transcript.map((line, i) => {
                                                            const isAI = line.startsWith('AI:');
                                                            return (
                                                                <div key={i} className={`text-sm px-3 py-1.5 rounded-lg ${isAI ? 'bg-violet-50 text-violet-800 ml-4' : 'bg-white text-gray-800 mr-4 border border-gray-200'}`}>
                                                                    {line}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
