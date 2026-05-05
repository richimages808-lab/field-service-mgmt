import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Job, Invoice, UserProfile, PortalTicket } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../auth/AuthProvider';
import { Link, useNavigate } from 'react-router-dom';
import {
    Plus, User, Mail, Phone, Wrench, Edit2, AlertTriangle, Clock,
    MessageSquareWarning, CheckCircle2, ArrowRight, MapPin, Send,
    FileText, UserPlus, X, Zap, PhoneCall, ExternalLink, Inbox, Sparkles, Globe, Briefcase
} from 'lucide-react';
import { AddTechnicianModal } from '../components/dispatcher/AddTechnicianModal';
import { EditTechnicianModal } from '../components/dispatcher/EditTechnicianModal';
import { InlineAIQuotePanel } from '../components/InlineAIQuotePanel';
import toast from 'react-hot-toast';

/* ── Time Ago Helper ── */
function timeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export const AdminDashboard: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        revenue: 0,
        openTickets: 0,
        activeTechs: 0
    });
    interface RevenueData { name: string; revenue: number;[key: string]: any; }
    interface StatusData { name: string; value: number;[key: string]: any; }
    const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
    const [jobStatusData, setJobStatusData] = useState<StatusData[]>([]);
    const [unassignedJobs, setUnassignedJobs] = useState<Job[]>([]);
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [isAddTechModalOpen, setIsAddTechModalOpen] = useState(false);
    const [isEditTechModalOpen, setIsEditTechModalOpen] = useState(false);
    const [selectedTech, setSelectedTech] = useState<UserProfile | null>(null);

    // ── Customer Inquiries ──
    const [inquiries, setInquiries] = useState<PortalTicket[]>([]);
    const [dismissingId, setDismissingId] = useState<string | null>(null);
    const [convertingId, setConvertingId] = useState<string | null>(null);
    const [expandedInquiryId, setExpandedInquiryId] = useState<string | null>(null);

    const handleEditTech = (tech: UserProfile) => {
        setSelectedTech(tech);
        setIsEditTechModalOpen(true);
    };

    // ── Real-time listener for portal inquiries ──
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';

        const ticketsRef = collection(db, 'tickets');
        const q = query(
            ticketsRef,
            where('organizationId', '==', orgId),
            where('status', '==', 'PENDING')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tickets = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as PortalTicket));
            // Sort by newest first
            tickets.sort((a, b) => {
                const aTime = a.createdAt?.toDate?.() || new Date(0);
                const bTime = b.createdAt?.toDate?.() || new Date(0);
                return bTime.getTime() - aTime.getTime();
            });
            setInquiries(tickets);
        });

        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            const orgId = user.org_id || 'demo-org'; // Get from user's org_id claim

            try {
                // 1. Fetch Jobs
                const jobsRef = collection(db, 'jobs');
                const jobsQ = query(jobsRef, where('org_id', '==', orgId));
                const jobsSnapshot = await getDocs(jobsQ);
                const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

                // 2. Fetch Invoices
                const invoicesRef = collection(db, 'invoices');
                const invoicesQ = query(invoicesRef, where('org_id', '==', orgId));
                const invoicesSnapshot = await getDocs(invoicesQ);
                const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));

                // 3. Fetch Techs (Users)
                const usersRef = collection(db, 'users');
                const usersQ = query(usersRef, where('org_id', '==', orgId), where('role', '==', 'technician'));
                const usersSnapshot = await getDocs(usersQ);
                const techCount = usersSnapshot.size;

                // --- Calculate Stats ---

                // Revenue
                const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

                // Open Tickets
                const openTickets = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled').length;

                // Unassigned Jobs
                const unassigned = jobs.filter(j => j.status === 'pending' && !j.assigned_tech_id);

                setStats({
                    revenue: totalRevenue,
                    openTickets: openTickets,
                    activeTechs: techCount
                });
                setUnassignedJobs(unassigned);

                // --- Prepare Chart Data ---

                // Revenue Trend (Mocking monthly data from invoices for demo)
                // In a real app, we'd group by month. Here we'll just show last 6 months mock or real if available.
                const monthlyRevenue = [
                    { name: 'Jun', revenue: 4000 },
                    { name: 'Jul', revenue: 3000 },
                    { name: 'Aug', revenue: 2000 },
                    { name: 'Sep', revenue: 2780 },
                    { name: 'Oct', revenue: 1890 },
                    { name: 'Nov', revenue: 2390 },
                ];
                // Overwrite with real data if we had enough... for now let's mix real total into a "Current" bar
                monthlyRevenue.push({ name: 'Current', revenue: totalRevenue });
                setRevenueData(monthlyRevenue);

                // Job Status Distribution
                const statusCounts = jobs.reduce((acc: any, job) => {
                    acc[job.status] = (acc[job.status] || 0) + 1;
                    return acc;
                }, {});
                const statusData = Object.keys(statusCounts).map(key => ({
                    name: key.charAt(0).toUpperCase() + key.slice(1),
                    value: statusCounts[key]
                }));
                setJobStatusData(statusData);

                setLoading(false);

            } catch (error) {
                console.error("Error fetching dashboard data:", error);
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    // Real-time subscription for technicians
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('org_id', '==', orgId), where('role', '==', 'technician'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const techs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
            setTechnicians(techs);
            setStats(prev => ({ ...prev, activeTechs: techs.length }));
        });

        return () => unsubscribe();
    }, [user]);

    /* ── Inquiry Actions ── */
    const handleDismiss = async (ticket: PortalTicket) => {
        setDismissingId(ticket.id);
        try {
            await updateDoc(doc(db, 'tickets', ticket.id), {
                status: 'ACKNOWLEDGED',
                acknowledgedAt: serverTimestamp(),
                acknowledgedBy: user?.uid || 'unknown'
            });
            toast.success('Inquiry dismissed');
        } catch (err) {
            console.error('Dismiss failed:', err);
            toast.error('Failed to dismiss');
        } finally {
            setDismissingId(null);
        }
    };

    const handleCreateJob = async (ticket: PortalTicket) => {
        setConvertingId(ticket.id);
        try {
            if ((ticket as any).autoJobId) {
                // The job was already created (e.g., via auto-quote generation). Just mark as converted.
                await updateDoc(doc(db, 'tickets', ticket.id), {
                    status: 'CONVERTED',
                    convertedJobId: (ticket as any).autoJobId,
                    acknowledgedAt: serverTimestamp(),
                    acknowledgedBy: user?.uid || 'unknown'
                });
                toast.success('Job created from inquiry');
                return (ticket as any).autoJobId;
            }

            const orgId = user?.org_id || 'demo-org';
            const urgency = ticket.metadata?.urgency || 'normal';

            // Create a job from the ticket
            const jobData: any = {
                org_id: orgId,
                customer: {
                    name: ticket.requestorName || 'Unknown Customer',
                    phone: ticket.requestorPhone || '',
                    email: ticket.requestorEmail || '',
                    address: ticket.address || ''
                },
                request: {
                    description: cleanDescription(ticket.description),
                    source: 'portal'
                },
                status: 'pending',
                priority: urgency === 'emergency' ? 'high' : 'medium',
                createdAt: serverTimestamp(),
                createdBy: user?.uid || 'system',
                source: 'WEBSITE_PORTAL'
            };

            if (ticket.address) {
                jobData.location = { address: ticket.address };
            }
            
            // Copy AI data if it exists
            if ((ticket.metadata as any)?.aiRecommendation) {
                jobData.aiRecommendation = (ticket.metadata as any).aiRecommendation;
            } else if ((ticket as any).aiRecommendation) {
                jobData.aiRecommendation = (ticket as any).aiRecommendation;
            }
            if ((ticket as any).autoQuoteId) {
                jobData.active_quote_id = (ticket as any).autoQuoteId;
                jobData.status = 'quote_pending';
            }

            const jobRef = await addDoc(collection(db, 'jobs'), jobData);

            // Mark ticket as converted
            await updateDoc(doc(db, 'tickets', ticket.id), {
                status: 'CONVERTED',
                convertedJobId: jobRef.id,
                acknowledgedAt: serverTimestamp(),
                acknowledgedBy: user?.uid || 'unknown'
            });

            toast.success('Job created from inquiry');
            return jobRef.id;
        } catch (err) {
            console.error('Job creation failed:', err);
            toast.error('Failed to create job');
            return null;
        } finally {
            setConvertingId(null);
        }
    };

    const handleSendQuote = async (ticket: PortalTicket) => {
        setConvertingId(ticket.id);
        try {
            const jobId = await handleCreateJob(ticket);
            if (jobId) {
                navigate(`/quotes/new/${jobId}`);
            }
        } catch (err) {
            console.error('Quote flow failed:', err);
            toast.error('Failed to start quote');
        } finally {
            setConvertingId(null);
        }
    };

    const handleViewJob = async (ticket: PortalTicket) => {
        const jobId = await handleCreateJob(ticket);
        if (jobId) {
            navigate(`/jobs/${jobId}`);
        }
    };

    const handleAddCustomer = (ticket: PortalTicket) => {
        // Navigate to contacts page with pre-fill state
        navigate('/contacts', {
            state: {
                prefill: {
                    name: ticket.requestorName || 'Unknown Customer',
                    phone: ticket.requestorPhone || '',
                    email: ticket.requestorEmail || '',
                    address: ticket.address || '',
                    source: 'website',
                    sourceTicketId: ticket.id
                }
            }
        });
    };

    /* ── Helper: strip portal prefix from description ── */
    function cleanDescription(desc: string): string {
        return desc
            .replace(/^\[Public Portal Request\]\s*/i, '')
            .replace(/^Urgency:\s*(Normal|Emergency)\s*/i, '')
            .trim();
    }

    if (loading) return <div className="p-8">Loading Dashboard...</div>;

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-6">
                <div className="flex-shrink-0">
                    <h1 className="text-3xl font-bold text-gray-800">Corporate Admin Dashboard</h1>
                    <p className="text-gray-600">Overview of organization performance</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto justify-start xl:justify-end">
                    <Link to="/admin/integrations" className="text-gray-600 hover:text-blue-600 text-sm font-medium whitespace-nowrap">
                        Integrations & Finance
                    </Link>
                    <Link to="/admin/services" className="text-gray-600 hover:text-blue-600 text-sm font-medium whitespace-nowrap">
                        Services Catalog
                    </Link>
                    <Link to="/admin/communications" className="text-gray-600 hover:text-amber-600 text-sm font-medium whitespace-nowrap">
                        📡 Communications Hub
                    </Link>
                    <Link to="/dispatcher" className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-4 rounded whitespace-nowrap">
                        Manage Schedule
                    </Link>
                    <Link to="/jobs/new" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded whitespace-nowrap">
                        + New Job
                    </Link>
                </div>
            </header>

            {/* ═══════════════════════════════════════════════════════════════
             *  CUSTOMER INQUIRIES — Always first, highlighted prominently
             * ═══════════════════════════════════════════════════════════════ */}
            <div className="mb-8">
                {inquiries.length > 0 ? (
                    <div className="bg-white rounded-xl shadow-lg border-2 border-amber-200 overflow-hidden">
                        {/* Header banner */}
                        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <MessageSquareWarning className="w-6 h-6 text-white" />
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Customer Inquiries</h2>
                                    <p className="text-amber-100 text-sm">
                                        {inquiries.length} pending {inquiries.length === 1 ? 'request' : 'requests'} from your website portal
                                    </p>
                                </div>
                            </div>
                            <span className="bg-white/20 backdrop-blur-sm text-white font-bold text-2xl px-4 py-1 rounded-full">
                                {inquiries.length}
                            </span>
                        </div>

                        {/* Inquiry cards */}
                        <div className="divide-y divide-gray-100">
                            {inquiries.map((ticket) => {
                                const isEmergency = ticket.metadata?.urgency === 'emergency';
                                const createdAt = ticket.createdAt?.toDate?.() || new Date();
                                const isConverting = convertingId === ticket.id;
                                const isDismissing = dismissingId === ticket.id;

                                return (
                                    <div key={ticket.id}
                                        className={`p-5 hover:bg-gray-50/80 transition-colors ${isEmergency ? 'border-l-4 border-l-red-500 bg-red-50/10' : 'border-l-4 border-l-amber-400'}`}>
                                        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                                            {/* Left: Customer info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                    <h3 className="text-base font-semibold text-gray-900 truncate">
                                                        {ticket.requestorName || 'Unknown Customer'}
                                                    </h3>
                                                    {isEmergency && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 animate-pulse">
                                                            <AlertTriangle className="w-3 h-3" /> EMERGENCY
                                                        </span>
                                                    )}
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                                                        ticket.source === 'PHONE' ? 'bg-purple-100 text-purple-700' :
                                                        ticket.source === 'WEBSITE_PORTAL' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {ticket.source === 'PHONE' ? <PhoneCall className="w-3 h-3" /> :
                                                         ticket.source === 'WEBSITE_PORTAL' ? <Globe className="w-3 h-3" /> :
                                                         <Inbox className="w-3 h-3" />}
                                                        {ticket.source === 'PHONE' ? 'Phone Call' :
                                                         ticket.source === 'WEBSITE_PORTAL' ? 'Website Portal' : 'Other'}
                                                    </span>
                                                    {ticket.customerRef && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                                            <User className="w-3 h-3 mr-1" /> Existing Customer
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {timeAgo(createdAt)}
                                                    </span>
                                                </div>

                                                {/* Contact details */}
                                                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                                                    {ticket.requestorPhone && (
                                                        <a href={`tel:${ticket.requestorPhone}`}
                                                            className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                                                            <Phone className="w-3.5 h-3.5" /> {ticket.requestorPhone}
                                                        </a>
                                                    )}
                                                    {ticket.requestorEmail && (
                                                        <a href={`mailto:${ticket.requestorEmail}`}
                                                            className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                                                            <Mail className="w-3.5 h-3.5" /> {ticket.requestorEmail}
                                                        </a>
                                                    )}
                                                    {ticket.address && (
                                                        <span className="flex items-center gap-1 text-gray-500">
                                                            <MapPin className="w-3.5 h-3.5" /> {ticket.address}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Description */}
                                                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed">
                                                    {cleanDescription(ticket.description)}
                                                </p>
                                                
                                                {(ticket as any).autoQuoteError && !(ticket as any).autoQuoteId && (
                                                    <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                                                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                                                        <span className="text-xs text-amber-600">Auto-quote failed — use manual actions</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right: Quick actions (Communications Portal Style) */}
                                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                {/* Toggle AI Panel */}
                                                <button onClick={() => setExpandedInquiryId(expandedInquiryId === ticket.id ? null : ticket.id)}
                                                    className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap shadow-md hover:shadow-lg">
                                                    <Sparkles className="w-4 h-4" />
                                                    {expandedInquiryId === ticket.id ? 'Hide' : 'Review'} AI Quote
                                                    {(ticket as any).autoQuoteTotal && (ticket as any).autoQuoteTotal > 0 && (
                                                        <span className="bg-white/20 text-white px-1.5 py-0.5 rounded text-[10px] font-bold ml-1">
                                                            ${(ticket as any).autoQuoteTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                        </span>
                                                    )}
                                                </button>
                                                <button onClick={() => handleViewJob(ticket)}
                                                    disabled={isConverting}
                                                    className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">
                                                    <Briefcase className="w-3.5 h-3.5" /> Convert to Job
                                                </button>
                                                <button onClick={() => handleAddCustomer(ticket)}
                                                    className="flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                                                    <UserPlus className="w-3.5 h-3.5" /> Add Customer
                                                </button>
                                                <button onClick={() => handleDismiss(ticket)}
                                                    disabled={isDismissing}
                                                    className="flex items-center justify-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                                                    <X className="w-3.5 h-3.5" /> Dismiss
                                                </button>
                                            </div>
                                        </div>

                                        {/* ═══ Inline AI Quote Panel ═══ */}
                                        {expandedInquiryId === ticket.id && (
                                            <div className="space-y-4 mt-4 border-t border-gray-100 pt-4">
                                                {/* Voice Call Collected Info */}
                                                {(ticket as any).collectedInfo && Object.keys((ticket as any).collectedInfo).length > 0 && (
                                                    <div className="bg-white rounded-xl p-4 border border-gray-200">
                                                        <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                                            <UserPlus className="w-4 h-4 text-indigo-600" />
                                                            AI Extracted Details
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {Object.entries((ticket as any).collectedInfo).map(([key, val]) => (
                                                                <div key={key} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{key}</div>
                                                                    <div className="text-sm font-medium text-gray-900">{String(val)}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Voice Call Transcript (if available) */}
                                                {(ticket as any).transcript && Array.isArray((ticket as any).transcript) && (ticket as any).transcript.length > 0 && (
                                                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                                        <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                                            <PhoneCall className="w-4 h-4 text-purple-600" />
                                                            Call Transcript
                                                        </h4>
                                                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                                            {(ticket as any).transcript.map((msg: any, idx: number) => (
                                                                <div key={idx} className={`flex ${msg.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                                                                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${msg.role === 'assistant'
                                                                        ? 'bg-purple-100 text-purple-900 rounded-tl-sm'
                                                                        : 'bg-blue-600 text-white rounded-tr-sm'
                                                                        }`}>
                                                                        <span className="text-[10px] font-bold opacity-50 uppercase tracking-wider block mb-0.5">
                                                                            {msg.role === 'assistant' ? 'AI Agent' : 'Caller'}
                                                                        </span>
                                                                        {msg.content}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <InlineAIQuotePanel
                                                    ticket={ticket}
                                                    onQuoteSent={() => setExpandedInquiryId(null)}
                                                    onNavigateToQuote={(jobId, quoteId) => navigate(`/quotes/new/${jobId}?quoteId=${quoteId}`)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    /* Empty state — subtle confirmation */
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl px-6 py-4 flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        <div>
                            <span className="text-sm font-medium text-emerald-800">All caught up!</span>
                            <span className="text-sm text-emerald-600 ml-1.5">No pending customer inquiries from your website portal.</span>
                        </div>
                    </div>
                )}
            </div>

            {/* KPI Cards — now with 4th card for inquiries */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-emerald-500">
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Total Revenue</h3>
                    <p className="text-3xl font-bold text-gray-800">${stats.revenue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Open Tickets</h3>
                    <p className="text-3xl font-bold text-gray-800">{stats.openTickets}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-cyan-500">
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Active Techs</h3>
                    <p className="text-3xl font-bold text-gray-800">{stats.activeTechs}</p>
                </div>
                <div className={`bg-white p-6 rounded-lg shadow border-l-4 ${inquiries.length > 0 ? 'border-amber-500' : 'border-gray-300'}`}>
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Pending Inquiries</h3>
                    <p className={`text-3xl font-bold ${inquiries.length > 0 ? 'text-amber-600' : 'text-gray-800'}`}>
                        {inquiries.length}
                    </p>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Revenue Trend</h3>
                    <div className="h-64 w-full" style={{ minWidth: 0 }}>
                        <ResponsiveContainer width="99%" height={250}>
                            <BarChart data={revenueData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="revenue" fill="#82ca9d" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Job Status Distribution</h3>
                    <div className="h-64 w-full" style={{ minWidth: 0 }}>
                        <ResponsiveContainer width="99%" height={250}>
                            <PieChart>
                                <Pie
                                    data={jobStatusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                    label
                                >
                                    {jobStatusData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Active Technicians Section */}
            <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Active Technicians ({technicians.length})</h3>
                        <p className="text-sm text-gray-500">Manage your field service team</p>
                    </div>
                    <div className="flex space-x-3">
                        <Link to="/techs" className="text-blue-600 hover:text-blue-800 text-sm font-medium py-2 px-3">
                            View All &rarr;
                        </Link>
                        <button
                            onClick={() => setIsAddTechModalOpen(true)}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-slate-800 hover:bg-slate-900"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Technician
                        </button>
                    </div>
                </div>
                <div className="p-6">
                    {technicians.length === 0 ? (
                        <div className="text-center py-8">
                            <User className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No technicians yet</h3>
                            <p className="mt-1 text-sm text-gray-500">Get started by adding your first technician.</p>
                            <div className="mt-4">
                                <button
                                    onClick={() => setIsAddTechModalOpen(true)}
                                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-slate-800 hover:bg-slate-900"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Technician
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {technicians.slice(0, 6).map((tech) => (
                                <div
                                    key={tech.id}
                                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                                    onClick={() => handleEditTech(tech)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start">
                                            <div className="flex-shrink-0 bg-blue-50 rounded-full p-2">
                                                <User className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <div className="ml-3 flex-1 min-w-0">
                                                <h4 className="text-sm font-medium text-gray-900 truncate">{tech.name}</h4>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tech.techType === 'solopreneur'
                                                    ? 'bg-amber-100 text-amber-800'
                                                    : 'bg-emerald-100 text-emerald-800'
                                                    }`}>
                                                    {tech.techType === 'solopreneur' ? 'Contractor' : 'Employee'}
                                                </span>
                                            </div>
                                        </div>
                                        <Edit2 className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <div className="mt-3 space-y-1">
                                        <div className="flex items-center text-xs text-gray-500">
                                            <Mail className="flex-shrink-0 mr-1.5 h-3 w-3 text-gray-400" />
                                            <span className="truncate">{tech.email}</span>
                                        </div>
                                        <div className="flex items-center text-xs text-gray-500">
                                            <Phone className="flex-shrink-0 mr-1.5 h-3 w-3 text-gray-400" />
                                            {tech.phone || 'No phone'}
                                        </div>
                                        {tech.specialties && tech.specialties.length > 0 && (
                                            <div className="flex items-start text-xs text-gray-500">
                                                <Wrench className="flex-shrink-0 mr-1.5 h-3 w-3 text-gray-400 mt-0.5" />
                                                <div className="flex flex-wrap gap-1">
                                                    {tech.specialties.slice(0, 3).map((skill) => (
                                                        <span key={skill} className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                                                            {skill}
                                                        </span>
                                                    ))}
                                                    {tech.specialties.length > 3 && (
                                                        <span className="text-gray-400">+{tech.specialties.length - 3}</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {technicians.length > 6 && (
                                <div className="mt-4 text-center">
                                    <Link to="/techs" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                                        View all {technicians.length} technicians &rarr;
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Unassigned Jobs List */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800">Unassigned Jobs ({unassignedJobs.length})</h3>
                    <Link to="/schedule" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        View Schedule Board &rarr;
                    </Link>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {unassignedJobs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">No unassigned jobs.</td>
                                </tr>
                            ) : (
                                unassignedJobs.map(job => (
                                    <tr key={job.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{job.customer?.name || 'Unknown'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{job.request?.description || 'No description'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                                ${job.priority === 'high' ? 'bg-red-100 text-red-800' :
                                                    job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-green-100 text-green-800'}`}>
                                                {job.priority}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {job.createdAt?.toDate ? job.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <Link to={`/schedule?jobId=${job.id}`} className="text-blue-600 hover:text-blue-900">Assign</Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Technician Modal */}
            <AddTechnicianModal
                isOpen={isAddTechModalOpen}
                onClose={() => setIsAddTechModalOpen(false)}
            />

            {/* Edit Technician Modal */}
            <EditTechnicianModal
                isOpen={isEditTechModalOpen}
                onClose={() => {
                    setIsEditTechModalOpen(false);
                    setSelectedTech(null);
                }}
                technician={selectedTech}
            />
        </div>
    );
};
