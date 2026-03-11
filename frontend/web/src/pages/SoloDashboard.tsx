import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Job, Invoice } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { format, differenceInDays, startOfWeek, addDays, isSameDay } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { generateJobRecommendation } from '../lib/jobIntakeAI';
import { WeatherWidget } from '../components/WeatherWidget';
import { CustomerMessageModal, CustomerMessage } from '../components/CustomerMessageModal';
import {
    Clock, AlertTriangle, Wrench, MapPin, User, Inbox,
    Calendar, TrendingUp, FileText, CheckCircle, MessageSquare,
    Package, Mail, Phone, ChevronRight, AlertCircle, Mic
} from 'lucide-react';

export const SoloDashboard: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [allJobs, setAllJobs] = useState<Job[]>([]);
    const [pendingJobs, setPendingJobs] = useState<Job[]>([]);
    const [stats, setStats] = useState({ revenue: 0, openInvoices: 0 });
    const [loading, setLoading] = useState(true);
    const [selectedMessage, setSelectedMessage] = useState<CustomerMessage | null>(null);

    // Mock customer messages for demo
    const [customerMessages] = useState<CustomerMessage[]>([
        {
            id: '1',
            jobId: 'job-123',
            customerName: 'Sarah Johnson',
            customerContact: 'sarah.johnson@email.com',
            type: 'email',
            direction: 'inbound',
            content: 'Hi, I wanted to check if you can come earlier tomorrow? We have a meeting at 2pm.',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
            read: false,
            replied: false
        },
        {
            id: '2',
            jobId: 'job-456',
            customerName: 'Mike Chen',
            customerContact: '808-555-0123',
            type: 'sms',
            direction: 'inbound',
            content: 'Got the parts you mentioned. Ready when you are!',
            timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
            read: true,
            replied: false
        },
        {
            id: '3',
            jobId: 'job-789',
            customerName: 'Jennifer Lee',
            customerContact: '808-555-0456',
            type: 'voicemail',
            direction: 'inbound',
            content: '',
            timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
            read: false,
            replied: false,
            transcriptionPending: true
        }
    ]);

    useEffect(() => {
        if (!user) return;
        const orgId = 'demo-org';

        // 1. Real-time Jobs Listener - All active jobs
        const jobsRef = collection(db, 'jobs');
        const jobsQ = query(jobsRef, where('org_id', '==', orgId));

        const unsubscribeJobs = onSnapshot(jobsQ, async (snapshot) => {
            const fetchedJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
            setAllJobs(fetchedJobs);

            // Separate pending (need review) from scheduled jobs
            const pending: Job[] = [];
            const scheduled: Job[] = [];

            for (const job of fetchedJobs) {
                if (job.status === 'pending') {
                    // Initialize intake review if not exists
                    if (!job.intakeReview) {
                        job.intakeReview = {
                            status: 'new',
                            questionsForCustomer: []
                        };

                        // Generate AI recommendation
                        try {
                            const recommendation = await generateJobRecommendation(job, user);
                            job.intakeReview.aiRecommendation = recommendation;

                            // Update Firestore
                            await updateDoc(doc(db, 'jobs', job.id), {
                                'intakeReview': job.intakeReview
                            });
                        } catch (error) {
                            console.error('[SoloDashboard] Failed to generate AI recommendation:', error);
                        }
                    }
                    pending.push(job);
                } else if (job.status !== 'completed' && job.status !== 'cancelled') {
                    scheduled.push(job);
                }
            }

            // Sort scheduled jobs by date
            scheduled.sort((a, b) => {
                const dateA = a.scheduled_at?.toDate ? a.scheduled_at.toDate().getTime() : 0;
                const dateB = b.scheduled_at?.toDate ? b.scheduled_at.toDate().getTime() : 0;
                return dateA - dateB;
            });

            setPendingJobs(pending);
            setJobs(scheduled);
        });

        // 2. Fetch Invoices & Stats
        const fetchStats = async () => {
            try {
                const invoicesRef = collection(db, 'invoices');
                const invoicesQ = query(invoicesRef, where('org_id', '==', orgId));
                const invoicesSnapshot = await getDocs(invoicesQ);
                const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));

                const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
                const openInvCount = invoices.filter(i => i.status !== 'paid').length;

                setStats({ revenue: totalRevenue, openInvoices: openInvCount });
                setLoading(false);
            } catch (error) {
                console.error("Error fetching solo stats:", error);
                setLoading(false);
            }
        };

        fetchStats();

        return () => unsubscribeJobs();
    }, [user]);

    // Filter for Today's Jobs
    const today = new Date();
    const todaysJobs = jobs.filter(job => {
        if (!job.scheduled_at?.toDate) return false;
        const d = job.scheduled_at.toDate();
        return d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear();
    });

    // Week at a Glance - Get job counts for next 7 days
    const getWeekData = () => {
        const weekStart = startOfWeek(today, { weekStartsOn: 1 });
        const weekData = [];

        for (let i = 0; i < 7; i++) {
            const date = addDays(weekStart, i);
            const jobsOnDay = jobs.filter(job => {
                if (!job.scheduled_at?.toDate) return false;
                return isSameDay(job.scheduled_at.toDate(), date);
            });
            weekData.push({
                date,
                day: format(date, 'EEE'),
                count: jobsOnDay.length,
                isToday: isSameDay(date, today)
            });
        }
        return weekData;
    };

    // Jobs needing parts
    const jobsNeedingParts = pendingJobs.filter(job =>
        job.intakeReview?.aiRecommendation?.recommendedMaterials?.length ?? 0 > 0
    );

    // Overdue jobs (unscheduled for more than 3 days)
    const overdueJobs = [...pendingJobs, ...jobs.filter(j => j.status === 'unscheduled')]
        .filter(job => {
            if (!job.createdAt) return false;
            const created = job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt);
            const daysOld = differenceInDays(today, created);
            return daysOld >= 3;
        })
        .map(job => {
            const created = job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt);
            return {
                ...job,
                daysOld: differenceInDays(today, created)
            };
        })
        .sort((a, b) => b.daysOld - a.daysOld)
        .slice(0, 5);

    // Unread messages
    const unreadMessages = customerMessages.filter(m => !m.read);

    const handleSelectJob = (job: Job) => {
        navigate('/job-intake', { state: { selectedJob: job } });
    };

    const handleSendReply = async (messageId: string, reply: string, method: 'email' | 'sms') => {
        // TODO: Implement actual send via Firebase Functions
        console.log(`Sending ${method} reply to message ${messageId}:`, reply);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
    };

    if (loading) return <div className="p-8">Loading Dashboard...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-6">
            {/* Header */}
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
                        Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {user?.displayName?.split(' ')[0] || 'Partner'}
                    </h1>
                    <p className="text-gray-600">Here is your agenda for today.</p>
                </div>
                <div className="flex space-x-3">
                    <Link to="/job-intake" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center space-x-2">
                        <Inbox className="w-5 h-5" />
                        <span>All Requests ({pendingJobs.length})</span>
                    </Link>
                    <Link to="/jobs/new" className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded shadow">
                        + New Job
                    </Link>
                </div>
            </header>

            {/* Row 1: Weather + Today's Schedule + Week at a Glance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Weather Widget */}
                <div className="bg-white rounded-lg shadow">
                    <WeatherWidget compact showForecast={false} />
                </div>

                {/* Today's Schedule */}
                <div className="bg-white rounded-lg shadow p-4 border-t-4 border-blue-500">
                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                        <Calendar className="w-5 h-5 text-blue-500 mr-2" />
                        Today's Schedule
                        <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                            {todaysJobs.length}
                        </span>
                    </h3>

                    {todaysJobs.length === 0 ? (
                        <div className="text-center py-4 text-gray-500">
                            <p className="text-sm">No jobs scheduled</p>
                            <Link to="/solo-calendar" className="text-blue-600 hover:underline mt-1 inline-block text-sm">
                                View Calendar →
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {todaysJobs.slice(0, 3).map(job => (
                                <div key={job.id} className="p-2 bg-gray-50 rounded border border-gray-200 hover:border-blue-300 transition cursor-pointer">
                                    <div className="flex items-start justify-between">
                                        <span className="text-sm font-bold text-blue-600">
                                            {job.scheduled_at?.toDate ? format(job.scheduled_at.toDate(), 'h:mm a') : 'TBD'}
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${job.priority === 'critical' ? 'bg-red-100 text-red-800' :
                                            job.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                                'bg-blue-100 text-blue-800'
                                            }`}>
                                            {job.priority}
                                        </span>
                                    </div>
                                    <h4 className="font-semibold text-gray-900 text-sm">{job.customer.name}</h4>
                                    <p className="text-xs text-gray-600 truncate">{job.request.description}</p>
                                </div>
                            ))}
                            {todaysJobs.length > 3 && (
                                <Link to="/solo-calendar" className="block text-center text-sm text-blue-600 hover:text-blue-800">
                                    +{todaysJobs.length - 3} more →
                                </Link>
                            )}
                        </div>
                    )}
                </div>

                {/* Week at a Glance */}
                <div className="bg-white rounded-lg shadow p-4 border-t-4 border-purple-500">
                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                        <TrendingUp className="w-5 h-5 text-purple-500 mr-2" />
                        Week at a Glance
                    </h3>
                    <div className="flex justify-between items-end gap-1">
                        {getWeekData().map((day, i) => (
                            <div
                                key={i}
                                className={`flex-1 text-center cursor-pointer hover:opacity-80 transition ${day.isToday ? 'bg-purple-50 rounded-lg p-1' : ''}`}
                                onClick={() => navigate('/solo-calendar')}
                            >
                                <div className="text-xs text-gray-500 mb-1">{day.day}</div>
                                <div
                                    className={`mx-auto rounded-t transition-all ${day.count === 0 ? 'bg-gray-200' :
                                        day.count > 6 ? 'bg-red-500' :
                                            day.count > 4 ? 'bg-orange-500' :
                                                'bg-purple-500'
                                        }`}
                                    style={{
                                        height: `${Math.max(8, day.count * 12)}px`,
                                        width: '100%',
                                        minHeight: '8px'
                                    }}
                                />
                                <div className={`text-sm font-bold mt-1 ${day.count > 6 ? 'text-red-600' :
                                    day.isToday ? 'text-purple-700' :
                                        'text-gray-700'
                                    }`}>
                                    {day.count}
                                </div>
                            </div>
                        ))}
                    </div>
                    {getWeekData().some(d => d.count > 6) && (
                        <p className="text-xs text-red-600 mt-2 text-center">
                            ⚠️ Some days are overbooked
                        </p>
                    )}
                </div>
            </div>

            {/* Row 2: Pending Requests + Parts Alert + Overdue Jobs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                {/* Pending Requests - Takes 2 columns */}
                <div className="lg:col-span-2 bg-white rounded-lg shadow p-4 border-t-4 border-orange-500">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-gray-800 flex items-center">
                            <Inbox className="w-5 h-5 text-orange-500 mr-2" />
                            Pending Job Requests
                            <span className="ml-2 px-2 py-1 bg-orange-500 text-white rounded-full text-xs font-semibold">
                                {pendingJobs.length}
                            </span>
                        </h2>
                        {pendingJobs.length > 0 && (
                            <Link to="/job-intake" className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
                                View All <ChevronRight className="w-4 h-4" />
                            </Link>
                        )}
                    </div>

                    {pendingJobs.length === 0 ? (
                        <div className="text-center py-6 text-gray-500">
                            <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm">All caught up!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {pendingJobs.slice(0, 4).map(job => (
                                <div
                                    key={job.id}
                                    onClick={() => handleSelectJob(job)}
                                    className="bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-lg p-3 hover:shadow-md hover:border-blue-400 transition-all cursor-pointer"
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-gray-900 truncate flex items-center gap-2 text-sm">
                                                <User className="w-3 h-3 text-blue-600" />
                                                {job.customer.name}
                                            </h3>
                                            <p className="text-xs text-gray-500 flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {job.customer.address.split(',')[0]}
                                            </p>
                                        </div>
                                        {job.intakeReview?.aiRecommendation && (
                                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${job.intakeReview.aiRecommendation.priority === 'critical' ? 'bg-red-600 text-white' :
                                                job.intakeReview.aiRecommendation.priority === 'high' ? 'bg-orange-500 text-white' :
                                                    job.intakeReview.aiRecommendation.priority === 'medium' ? 'bg-yellow-500 text-white' :
                                                        'bg-gray-500 text-white'
                                                }`}>
                                                {job.intakeReview.aiRecommendation.priority.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-700 line-clamp-2">{job.request.description}</p>
                                    <div className="mt-2 flex items-center justify-between text-xs">
                                        <span className="text-gray-500 capitalize">via {job.request.source || 'web'}</span>
                                        <span className="text-blue-600 font-medium">Review →</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Parts Alert + Overdue Jobs */}
                <div className="space-y-4">
                    {/* Parts Alert */}
                    <div className="bg-white rounded-lg shadow p-4 border-t-4 border-yellow-500">
                        <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                            <Package className="w-5 h-5 text-yellow-600 mr-2" />
                            Parts Needed
                            {jobsNeedingParts.length > 0 && (
                                <span className="ml-2 px-2 py-0.5 bg-yellow-500 text-white rounded-full text-xs font-semibold">
                                    {jobsNeedingParts.length}
                                </span>
                            )}
                        </h3>
                        {jobsNeedingParts.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-2">No parts needed</p>
                        ) : (
                            <>
                                <div className="space-y-2 text-sm">
                                    {jobsNeedingParts.slice(0, 3).map(job => (
                                        <div key={job.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                                            <span className="truncate flex-1">{job.customer.name}</span>
                                            <span className="text-yellow-700 font-medium">
                                                {job.intakeReview?.aiRecommendation?.recommendedMaterials?.length || 0} items
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <button className="w-full mt-3 text-sm text-yellow-700 hover:text-yellow-800 font-medium">
                                    📋 Generate Shopping List →
                                </button>
                            </>
                        )}
                    </div>

                    {/* Overdue Jobs */}
                    <div className="bg-white rounded-lg shadow p-4 border-t-4 border-red-500">
                        <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                            Overdue Jobs
                            {overdueJobs.length > 0 && (
                                <span className="ml-2 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs font-semibold">
                                    {overdueJobs.length}
                                </span>
                            )}
                        </h3>
                        {overdueJobs.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-2">No overdue jobs ✓</p>
                        ) : (
                            <div className="space-y-2 text-sm">
                                {overdueJobs.map(job => (
                                    <div
                                        key={job.id}
                                        onClick={() => handleSelectJob(job)}
                                        className={`flex items-center justify-between p-2 rounded cursor-pointer hover:opacity-80 ${job.daysOld >= 7 ? 'bg-red-100' :
                                            job.daysOld >= 5 ? 'bg-orange-100' :
                                                'bg-yellow-100'
                                            }`}
                                    >
                                        <span className="truncate flex-1">{job.customer.name}</span>
                                        <span className={`font-medium ${job.daysOld >= 7 ? 'text-red-700' :
                                            job.daysOld >= 5 ? 'text-orange-700' :
                                                'text-yellow-700'
                                            }`}>
                                            {job.daysOld}d old
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 3: Customer Messages - Full Width, Prominent Position */}
            <div className="mb-6">
                <div className="bg-white rounded-lg shadow-lg p-5 border-t-4 border-blue-500">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-blue-500" />
                            Customer Messages
                        </span>
                        {unreadMessages.length > 0 && (
                            <span className="px-3 py-1 bg-red-500 text-white rounded-full text-sm font-semibold animate-pulse">
                                {unreadMessages.length} new
                            </span>
                        )}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                        {customerMessages.slice(0, 5).map(msg => (
                            <div
                                key={msg.id}
                                onClick={() => setSelectedMessage(msg)}
                                className={`p-4 rounded-lg cursor-pointer hover:shadow-md transition-all border ${!msg.read
                                    ? 'bg-blue-50 border-blue-300 hover:border-blue-500'
                                    : 'bg-gray-50 border-gray-200 hover:border-gray-400'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    {msg.type === 'email' && <Mail className="w-5 h-5 text-blue-600" />}
                                    {msg.type === 'sms' && <MessageSquare className="w-5 h-5 text-green-600" />}
                                    {msg.type === 'voicemail' && <Mic className="w-5 h-5 text-purple-600" />}
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${msg.type === 'email' ? 'bg-blue-100 text-blue-700' :
                                        msg.type === 'sms' ? 'bg-green-100 text-green-700' :
                                            'bg-purple-100 text-purple-700'
                                        }`}>
                                        {msg.type.toUpperCase()}
                                    </span>
                                    {!msg.read && <div className="w-2 h-2 bg-red-500 rounded-full ml-auto" />}
                                </div>
                                <p className="font-semibold text-gray-900 text-sm mb-1">{msg.customerName}</p>
                                <p className="text-xs text-gray-500 mb-2">
                                    {format(msg.timestamp, 'MMM d, h:mm a')}
                                </p>
                                <p className="text-sm text-gray-700 line-clamp-2">
                                    {msg.type === 'voicemail'
                                        ? '🎤 Voicemail - tap to listen'
                                        : msg.content.length > 60
                                            ? msg.content.slice(0, 60) + '...'
                                            : msg.content
                                    }
                                </p>
                            </div>
                        ))}
                    </div>
                    {customerMessages.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                            <p>No customer messages</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Row 4: Stats + Quick Actions (Compact) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Revenue Stat */}
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                    <h3 className="text-gray-500 text-xs font-medium uppercase flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Revenue (MTD)
                    </h3>
                    <p className="text-2xl font-bold text-gray-800">${stats.revenue.toLocaleString()}</p>
                </div>

                {/* Open Invoices Stat */}
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
                    <h3 className="text-gray-500 text-xs font-medium uppercase flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Open Invoices
                    </h3>
                    <p className="text-2xl font-bold text-gray-800">{stats.openInvoices}</p>
                </div>

                {/* Quick Actions - Inline */}
                <div className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-400 col-span-2">
                    <h3 className="text-gray-500 text-xs font-medium uppercase mb-2">Quick Actions</h3>
                    <div className="flex flex-wrap gap-4">
                        <Link to="/invoices" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            Invoices
                        </Link>
                        <Link to="/contacts" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                            <User className="w-4 h-4" />
                            Contacts
                        </Link>
                        <Link to="/solo-calendar" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            Calendar
                        </Link>
                    </div>
                </div>
            </div>

            {/* Customer Message Modal */}
            <CustomerMessageModal
                message={selectedMessage}
                onClose={() => setSelectedMessage(null)}
                onSendReply={handleSendReply}
                customerJobs={selectedMessage ?
                    [...pendingJobs, ...jobs].filter(j =>
                        j.customer.name === selectedMessage.customerName ||
                        j.customer.email === selectedMessage.customerContact ||
                        j.customer.phone === selectedMessage.customerContact
                    ) : []
                }
                communicationHistory={selectedMessage ?
                    customerMessages.filter(m =>
                        m.customerName === selectedMessage.customerName &&
                        m.id !== selectedMessage.id
                    ).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                    : []
                }
                onEditJob={(jobId) => {
                    navigate('/job-intake', { state: { selectedJobId: jobId } });
                }}
                onRescheduleJob={(jobId) => {
                    navigate('/solo-calendar', { state: { rescheduleJobId: jobId } });
                }}
                onScheduleJob={(jobId) => {
                    navigate('/solo-calendar', { state: { scheduleJobId: jobId } });
                }}
            />
        </div>
    );
};
