import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { db, functions } from '../../firebase';
import {
    collection, query, where, orderBy, onSnapshot, getDocs,
    doc, getDoc, limit, Timestamp
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'react-hot-toast';
import {
    MessageSquare, Smartphone, Search, Filter, Calendar, Clock,
    Send, Shield, CheckCircle2, AlertTriangle, RefreshCw, User,
    FileText, Tag, ArrowLeft, Phone, PhoneCall, ChevronRight,
    Sliders, Settings, Sparkles, Loader2, ArrowUpRight, Check,
    Inbox, Info, Paperclip, CornerDownLeft, Eye
} from 'lucide-react';
import { SMSAutomationManager } from '../../components/admin/SMSAutomationManager';
import { A2PRegistrationForm } from '../../components/admin/A2PRegistrationForm';

export interface SMSMessage {
    id: string;
    sid?: string;
    orgId: string;
    direction: 'inbound' | 'outbound';
    from: string;
    to: string;
    body: string;
    customerPhone: string;
    customerName?: string | null;
    customerId?: string | null;
    jobId?: string | null;
    quoteNumber?: string | null;
    status?: string;
    createdAt?: any;
    timestamp?: string;
}

export interface ConversationThread {
    phone: string;
    customerName: string;
    customerId?: string | null;
    lastMessage: SMSMessage;
    messages: SMSMessage[];
    unreadCount: number;
    jobIds: string[];
    quoteNumbers: string[];
}

export const TextingHub: React.FC = () => {
    const { user, organization } = useAuth();
    const orgId = user?.org_id || '';
    
    // Main Tabs: 'history' (Messages & Chat) vs 'setup' (Rules, Templates, Settings)
    const [activeTab, setActiveTab] = useState<'history' | 'setup'>('history');

    // Messages State
    const [messages, setMessages] = useState<SMSMessage[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(true);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

    // Filter & Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [orderFilter, setOrderFilter] = useState('');
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all');

    // Direct Reply Input
    const [replyText, setReplyText] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Subscription & Phone Info
    const [subscription, setSubscription] = useState<any>(null);
    const [usage, setUsage] = useState<any>(null);
    const [loadingSub, setLoadingSub] = useState(true);
    const [refreshingA2p, setRefreshingA2p] = useState(false);

    // Load Subscription
    const loadSubscription = async () => {
        if (!orgId) return;
        setLoadingSub(true);
        try {
            const subDoc = await getDoc(doc(db, 'org_texting_subscriptions', orgId));
            if (subDoc.exists()) {
                setSubscription(subDoc.data());
            }

            const monthKey = new Date().toISOString().substring(0, 7);
            const usageDoc = await getDoc(
                doc(db, 'org_texting_usage', orgId, 'months', monthKey)
            );
            if (usageDoc.exists()) {
                setUsage(usageDoc.data());
            }
        } catch (err) {
            console.error('Error loading texting subscription:', err);
        } finally {
            setLoadingSub(false);
        }
    };

    useEffect(() => {
        loadSubscription();
    }, [orgId]);

    // Real-Time SMS Messages Listener
    useEffect(() => {
        if (!orgId) return;
        setLoadingMessages(true);

        const q = query(
            collection(db, 'sms_messages'),
            where('orgId', 'in', [orgId, 'default', '']),
            orderBy('createdAt', 'desc'),
            limit(300)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs: SMSMessage[] = [];
            snapshot.forEach(docSnap => {
                msgs.push({ id: docSnap.id, ...docSnap.data() } as SMSMessage);
            });
            setMessages(msgs);
            setLoadingMessages(false);

            // Auto-select first thread if none selected
            if (!selectedPhone && msgs.length > 0) {
                const firstPhone = msgs[0].customerPhone || (msgs[0].direction === 'inbound' ? msgs[0].from : msgs[0].to);
                setSelectedPhone(firstPhone);
            }
        }, (error) => {
            console.warn('Fallback: listening to all sms_messages without composite index:', error.message);
            // Fallback query if composite index is indexing
            const fallbackQ = query(
                collection(db, 'sms_messages'),
                orderBy('createdAt', 'desc'),
                limit(100)
            );
            onSnapshot(fallbackQ, (fallbackSnap) => {
                const msgs: SMSMessage[] = [];
                fallbackSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.orgId === orgId || !data.orgId || data.orgId === 'default') {
                        msgs.push({ id: docSnap.id, ...data } as SMSMessage);
                    }
                });
                setMessages(msgs);
                setLoadingMessages(false);
            });
        });

        return () => unsubscribe();
    }, [orgId]);

    // Group Messages into Threads by Customer Phone
    const threads: ConversationThread[] = useMemo(() => {
        const threadMap = new Map<string, ConversationThread>();

        messages.forEach(msg => {
            const phoneKey = msg.customerPhone || (msg.direction === 'inbound' ? msg.from : msg.to);
            if (!phoneKey) return;

            if (!threadMap.has(phoneKey)) {
                threadMap.set(phoneKey, {
                    phone: phoneKey,
                    customerName: msg.customerName || 'Customer',
                    customerId: msg.customerId || null,
                    lastMessage: msg,
                    messages: [msg],
                    unreadCount: 0,
                    jobIds: msg.jobId ? [msg.jobId] : [],
                    quoteNumbers: msg.quoteNumber ? [msg.quoteNumber] : []
                });
            } else {
                const t = threadMap.get(phoneKey)!;
                t.messages.push(msg);
                if (msg.jobId && !t.jobIds.includes(msg.jobId)) t.jobIds.push(msg.jobId);
                if (msg.quoteNumber && !t.quoteNumbers.includes(msg.quoteNumber)) t.quoteNumbers.push(msg.quoteNumber);
                if (!t.customerName || t.customerName === 'Customer') {
                    if (msg.customerName) t.customerName = msg.customerName;
                }
            }
        });

        return Array.from(threadMap.values());
    }, [messages]);

    // Filtered Threads based on Search, Order #, Date, and Time
    const filteredThreads = useMemo(() => {
        return threads.filter(thread => {
            // Search Query: Customer Name, Phone, Message Content
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchName = thread.customerName.toLowerCase().includes(q);
                const matchPhone = thread.phone.toLowerCase().includes(q);
                const matchContent = thread.messages.some(m => m.body.toLowerCase().includes(q));
                if (!matchName && !matchPhone && !matchContent) return false;
            }

            // Order / Job / Quote Filter
            if (orderFilter.trim()) {
                const o = orderFilter.toLowerCase();
                const matchJob = thread.jobIds.some(j => j.toLowerCase().includes(o));
                const matchQuote = thread.quoteNumbers.some(q => q.toLowerCase().includes(o));
                const matchTextOrder = thread.messages.some(m => m.body.toLowerCase().includes(o));
                if (!matchJob && !matchQuote && !matchTextOrder) return false;
            }

            // Direction Filter
            if (directionFilter !== 'all') {
                const hasDirection = thread.messages.some(m => m.direction === directionFilter);
                if (!hasDirection) return false;
            }

            // Date Filter
            if (dateFilter !== 'all') {
                const now = new Date();
                const lastMsgDate = thread.lastMessage.createdAt?.toDate?.() || 
                    (thread.lastMessage.timestamp ? new Date(thread.lastMessage.timestamp) : new Date());

                if (dateFilter === 'today') {
                    const isToday = lastMsgDate.toDateString() === now.toDateString();
                    if (!isToday) return false;
                } else if (dateFilter === '7days') {
                    const diffDays = (now.getTime() - lastMsgDate.getTime()) / (1000 * 3600 * 24);
                    if (diffDays > 7) return false;
                } else if (dateFilter === '30days') {
                    const diffDays = (now.getTime() - lastMsgDate.getTime()) / (1000 * 3600 * 24);
                    if (diffDays > 30) return false;
                } else if (dateFilter === 'custom') {
                    if (customStartDate) {
                        const start = new Date(customStartDate);
                        if (lastMsgDate < start) return false;
                    }
                    if (customEndDate) {
                        const end = new Date(customEndDate);
                        end.setHours(23, 59, 59, 999);
                        if (lastMsgDate > end) return false;
                    }
                }
            }

            return true;
        });
    }, [threads, searchQuery, orderFilter, dateFilter, customStartDate, customEndDate, directionFilter]);

    // Active Thread Details
    const activeThread = useMemo(() => {
        if (!selectedPhone) return filteredThreads[0] || null;
        return threads.find(t => t.phone === selectedPhone) || null;
    }, [threads, selectedPhone, filteredThreads]);

    // Scroll to bottom of message chat when active thread changes
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeThread?.messages]);

    // Format Phone Helper
    const formatPhone = (phone: string) => {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 11 && cleaned.startsWith('1')) {
            return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
        }
        if (cleaned.length === 10) {
            return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        return phone;
    };

    // Format Date/Time
    const formatMsgTime = (timestamp: any) => {
        if (!timestamp) return '';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatThreadDate = (timestamp: any) => {
        if (!timestamp) return '';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    // Send Direct Reply SMS
    const handleSendReply = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!replyText.trim() || !activeThread || !orgId) return;

        setSendingReply(true);
        try {
            const sendSms = httpsCallable(functions, 'sendDirectSMS');
            await sendSms({
                to: activeThread.phone,
                body: replyText.trim(),
                orgId,
                customerName: activeThread.customerName,
                customerId: activeThread.customerId
            });

            toast.success('Message sent!');
            setReplyText('');
        } catch (err: any) {
            console.error('Error sending reply SMS:', err);
            toast.error(err.message || 'Failed to send SMS');
        } finally {
            setSendingReply(false);
        }
    };

    const handleRefreshA2P = async () => {
        setRefreshingA2p(true);
        try {
            const checkStatus = httpsCallable(functions, 'checkA2pCampaignStatus');
            const result: any = await checkStatus({ orgId });
            toast.success(result.data?.message || 'Status checked');
            loadSubscription();
        } catch (err: any) {
            toast.error(err.message || 'Status check failed');
        } finally {
            setRefreshingA2p(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50/70 pb-12">
            {/* Top Navigation & Status Bar */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-0">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl text-white shadow-md">
                                <Smartphone className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <h1 className="text-2xl font-bold text-gray-900">Text Messaging Hub</h1>
                                    {subscription && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> 10DLC Verified & Active
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Dedicated Business Line: <span className="font-mono font-bold text-gray-800">{subscription?.phoneNumber ? formatPhone(subscription.phoneNumber) : '(808) 435-2635'}</span> • Two-way SMS customer conversations & automated alerts
                                </p>
                            </div>
                        </div>

                        {/* Quick Stats Pill */}
                        {usage && (
                            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200/80 px-4 py-2 rounded-xl text-xs">
                                <div>
                                    <span className="text-gray-400 block text-[10px] uppercase font-bold">This Month</span>
                                    <span className="font-bold text-gray-800">{usage.totalMessages || 0} msgs</span>
                                </div>
                                <div className="h-6 w-px bg-gray-200" />
                                <div>
                                    <span className="text-gray-400 block text-[10px] uppercase font-bold">Plan Limit</span>
                                    <span className="font-bold text-indigo-600">{subscription?.includedMessages || 2000} msgs</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Main Tabs */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-2 px-5 py-3 rounded-t-xl text-sm font-bold border-b-2 transition-all ${
                                activeTab === 'history'
                                    ? 'bg-indigo-50/50 text-indigo-700 border-indigo-600'
                                    : 'text-gray-500 hover:text-gray-900 border-transparent hover:bg-gray-50'
                            }`}
                        >
                            <MessageSquare className="w-4 h-4" />
                            <span>Text History & Conversations</span>
                            {threads.length > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700">
                                    {threads.length}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => setActiveTab('setup')}
                            className={`flex items-center gap-2 px-5 py-3 rounded-t-xl text-sm font-bold border-b-2 transition-all ${
                                activeTab === 'setup'
                                    ? 'bg-indigo-50/50 text-indigo-700 border-indigo-600'
                                    : 'text-gray-500 hover:text-gray-900 border-transparent hover:bg-gray-50'
                            }`}
                        >
                            <Sliders className="w-4 h-4" />
                            <span>Text Setup & Rules</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Tab 1: Text History & Conversations */}
            {activeTab === 'history' && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    {/* Search & Filter Toolbar */}
                    <div className="bg-white rounded-2xl border border-gray-200/80 p-4 mb-6 shadow-sm space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            {/* Customer / Text Search */}
                            <div className="md:col-span-4 relative">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search customer, phone, or text..."
                                    className="w-full text-xs font-medium pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
                                />
                            </div>

                            {/* Order / Quote # Filter */}
                            <div className="md:col-span-3 relative">
                                <Tag className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                                <input
                                    type="text"
                                    value={orderFilter}
                                    onChange={e => setOrderFilter(e.target.value)}
                                    placeholder="Order / Job # or Quote # (e.g. 7081)"
                                    className="w-full text-xs font-medium pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
                                />
                            </div>

                            {/* Date Presets */}
                            <div className="md:col-span-3">
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <select
                                        value={dateFilter}
                                        onChange={e => setDateFilter(e.target.value as any)}
                                        className="w-full text-xs font-medium border border-gray-300 rounded-xl px-3 py-2.5 bg-gray-50/50 focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="all">All Dates & Times</option>
                                        <option value="today">Today</option>
                                        <option value="7days">Last 7 Days</option>
                                        <option value="30days">Last 30 Days</option>
                                        <option value="custom">Custom Date Range...</option>
                                    </select>
                                </div>
                            </div>

                            {/* Direction Filter */}
                            <div className="md:col-span-2">
                                <select
                                    value={directionFilter}
                                    onChange={e => setDirectionFilter(e.target.value as any)}
                                    className="w-full text-xs font-medium border border-gray-300 rounded-xl px-3 py-2.5 bg-gray-50/50 focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="all">All Messages</option>
                                    <option value="inbound">Inbound Only</option>
                                    <option value="outbound">Outbound Only</option>
                                </select>
                            </div>
                        </div>

                        {/* Custom Date Range Row if selected */}
                        {dateFilter === 'custom' && (
                            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 text-xs">
                                <span className="font-bold text-gray-600">Date Range:</span>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={e => setCustomStartDate(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
                                />
                                <span className="text-gray-400">to</span>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={e => setCustomEndDate(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
                                />
                            </div>
                        )}
                    </div>

                    {/* Main Split Chat View: Left Thread List | Right Interactive Message Stream */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
                        {/* Left: Conversation Thread List */}
                        <div className="lg:col-span-4 border-r border-gray-200 flex flex-col">
                            <div className="p-3.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Conversations ({filteredThreads.length})
                                </span>
                                <span className="text-[11px] text-gray-400">Most Recent First</span>
                            </div>

                            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 max-h-[600px]">
                                {loadingMessages ? (
                                    <div className="p-8 text-center text-gray-400 text-xs flex flex-col items-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
                                        Loading text exchanges...
                                    </div>
                                ) : filteredThreads.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 text-xs space-y-2">
                                        <Inbox className="w-8 h-8 mx-auto text-gray-300" />
                                        <p className="font-medium text-gray-600">No message exchanges found</p>
                                        <p className="text-[11px] text-gray-400">Try adjusting your search or filters.</p>
                                    </div>
                                ) : (
                                    filteredThreads.map(thread => {
                                        const isSelected = thread.phone === selectedPhone;
                                        return (
                                            <div
                                                key={thread.phone}
                                                onClick={() => setSelectedPhone(thread.phone)}
                                                className={`p-4 transition cursor-pointer hover:bg-gray-50 ${
                                                    isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : ''
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                                                            {thread.customerName.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <h4 className="text-xs font-bold text-gray-900">{thread.customerName}</h4>
                                                            <p className="text-[11px] font-mono text-gray-400">{formatPhone(thread.phone)}</p>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                                                        {formatThreadDate(thread.lastMessage.createdAt)}
                                                    </span>
                                                </div>

                                                <p className="text-xs text-gray-600 line-clamp-2 mt-1 leading-relaxed">
                                                    <span className="font-semibold text-gray-400 mr-1">
                                                        {thread.lastMessage.direction === 'outbound' ? 'You:' : 'Customer:'}
                                                    </span>
                                                    {thread.lastMessage.body}
                                                </p>

                                                {/* Job & Quote Reference Badges */}
                                                {(thread.jobIds.length > 0 || thread.quoteNumbers.length > 0) && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {thread.jobIds.map(jobId => (
                                                            <span key={jobId} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                                                Job #{jobId.substring(0, 8)}
                                                            </span>
                                                        ))}
                                                        {thread.quoteNumbers.map(qNum => (
                                                            <span key={qNum} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                Quote #{qNum}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Right: Message Stream & Reply Box */}
                        <div className="lg:col-span-8 flex flex-col justify-between bg-slate-50/40">
                            {activeThread ? (
                                <>
                                    {/* Chat Header */}
                                    <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                                                {activeThread.customerName.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-bold text-gray-900">{activeThread.customerName}</h3>
                                                <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                                                    <span>{formatPhone(activeThread.phone)}</span>
                                                    {activeThread.jobIds.length > 0 && (
                                                        <span className="text-indigo-600 font-semibold">• Job #{activeThread.jobIds[0].substring(0, 8)}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <a
                                                href={`tel:${activeThread.phone}`}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                                            >
                                                <Phone className="w-3.5 h-3.5 text-gray-600" />
                                                <span>Call Customer</span>
                                            </a>
                                        </div>
                                    </div>

                                    {/* Messages Bubble Stream */}
                                    <div className="flex-1 p-6 overflow-y-auto space-y-4 max-h-[460px]">
                                        {/* Sort chronological for chat view */}
                                        {[...activeThread.messages].reverse().map(msg => {
                                            const isOutbound = msg.direction === 'outbound';
                                            return (
                                                <div
                                                    key={msg.id}
                                                    className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                                                >
                                                    <div className="flex items-center gap-1.5 mb-1 px-1">
                                                        <span className="text-[10px] font-bold text-gray-400">
                                                            {isOutbound ? `${organization?.name || 'You'}` : activeThread.customerName}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400">
                                                            • {formatMsgTime(msg.createdAt || msg.timestamp)}
                                                        </span>
                                                    </div>

                                                    <div
                                                        className={`max-w-[75%] p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
                                                            isOutbound
                                                                ? 'bg-indigo-600 text-white rounded-tr-sm'
                                                                : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm'
                                                        }`}
                                                    >
                                                        {msg.body}
                                                    </div>

                                                    {isOutbound && (
                                                        <span className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                                                            <Check className="w-3 h-3 text-emerald-500" /> Delivered via Twilio 10DLC
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Direct SMS Reply Input Box */}
                                    <form onSubmit={handleSendReply} className="p-4 bg-white border-t border-gray-200">
                                        <div className="flex items-end gap-3">
                                            <div className="flex-1">
                                                <textarea
                                                    rows={2}
                                                    value={replyText}
                                                    onChange={e => setReplyText(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleSendReply();
                                                        }
                                                    }}
                                                    placeholder={`Type a text message to ${activeThread.customerName} (Press Enter to send)...`}
                                                    className="w-full text-xs border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 resize-none shadow-inner"
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={sendingReply || !replyText.trim()}
                                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl font-bold text-xs flex items-center gap-2 shadow-md transition disabled:opacity-50 flex-shrink-0"
                                            >
                                                {sendingReply ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Send className="w-4 h-4" />
                                                )}
                                                <span>Send SMS</span>
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-gray-400 mt-2 px-1">
                                            <span>Replies will be delivered directly from your dedicated business number.</span>
                                            <span>Shift + Enter for new line</span>
                                        </div>
                                    </form>
                                </>
                            ) : (
                                <div className="p-12 text-center text-gray-400 text-sm flex flex-col items-center justify-center my-auto">
                                    <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
                                    <p className="font-bold text-gray-600">Select a conversation</p>
                                    <p className="text-xs text-gray-400 mt-1">Choose a customer thread from the left to view message history and send direct SMS.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 2: Text Setup & Rules */}
            {activeTab === 'setup' && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
                    {/* Active Subscription Banner / A2P Carrier Verified Card */}
                    {subscription && (
                        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl text-white shadow-md">
                                        <Shield className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold text-gray-900">
                                                {formatPhone(subscription.phoneNumber)}
                                            </h2>
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                                10DLC A2P Verified & Active
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {subscription.planName || 'Pro'} Plan • ${subscription.monthlyPrice}/mo • {subscription.includedMessages || 2000} msgs included
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleRefreshA2P}
                                        disabled={refreshingA2p}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition disabled:opacity-50"
                                    >
                                        {refreshingA2p ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                        Check Carrier Status
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Full SMS Automation Rules & Custom Templates Manager */}
                    <SMSAutomationManager
                        orgId={orgId}
                        orgName={organization?.name || 'Our Company'}
                        twilioPhoneNumber={subscription?.phoneNumber}
                    />
                </div>
            )}
        </div>
    );
};
