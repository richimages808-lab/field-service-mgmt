import React, { useEffect, useState, useMemo } from 'react';
import { db, functions } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Job, JobPrepChecklistItem } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { JobDetailsModal } from '../components/JobDetailsModal';
import { Bell, CheckCircle, ShieldAlert, Sparkles, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    MissionBriefingView,
    RoutePlannerView,
    SmartPriorityView,
    JobDossierView,
    WeekAtGlanceView,
    TechViewSwitcher,
    TechDashboardViewId
} from '../components/tech-views';

export const TechDashboard: React.FC = () => {
    const { user } = useAuth();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [activeView, setActiveView] = useState<TechDashboardViewId>('mission_briefing');
    const [viewLoaded, setViewLoaded] = useState(false);
    const [isAcknowledging, setIsAcknowledging] = useState(false);
    const [autoOpenNav, setAutoOpenNav] = useState<boolean>(() => {
        const saved = localStorage.getItem('tech_auto_open_nav');
        return saved !== null ? saved === 'true' : true;
    });

    // Load the user's saved dashboard view preference
    useEffect(() => {
        if (!user?.uid) return;

        const loadViewPreference = async () => {
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    const prefs = userDoc.data()?.preferences;
                    if (prefs?.dashboardView) {
                        setActiveView(prefs.dashboardView);
                    }
                    if (prefs?.autoOpenNav !== undefined) {
                        setAutoOpenNav(prefs.autoOpenNav);
                    }
                }
            } catch (err) {
                console.warn('Failed to load view preference:', err);
            } finally {
                setViewLoaded(true);
            }
        };

        loadViewPreference();
    }, [user?.uid]);

    const handleToggleAutoOpenNav = async (enabled: boolean) => {
        setAutoOpenNav(enabled);
        localStorage.setItem('tech_auto_open_nav', String(enabled));
        if (user?.uid) {
            try {
                await updateDoc(doc(db, 'users', user.uid), {
                    'preferences.autoOpenNav': enabled
                });
            } catch (err) {
                console.warn('Failed to save nav preference:', err);
            }
        }
        toast.success(`Google Maps Auto-Navigation ${enabled ? 'Enabled' : 'Disabled'}`);
    };

    // Fetch jobs assigned to this tech (by email or user ID)
    useEffect(() => {
        if (!user) return;

        const jobsRef = collection(db, 'jobs');
        const orgId = user.org_id || 'demo-org';
        // If tech has user ID and email, listen for jobs assigned to either within their organization
        const q = user.email
            ? query(jobsRef, where('org_id', '==', orgId), where('assigned_tech_email', '==', user.email))
            : query(jobsRef, where('org_id', '==', orgId), where('assigned_tech_id', '==', user.uid));

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const jobList = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Job))
                    .filter(job => job.status !== 'completed' && job.status !== 'cancelled');

                // Sort by scheduled time
                jobList.sort((a, b) => {
                    const dateA = a.scheduled_at ? (a.scheduled_at?.toDate?.() || new Date(a.scheduled_at)).getTime() : 0;
                    const dateB = b.scheduled_at ? (b.scheduled_at?.toDate?.() || new Date(b.scheduled_at)).getTime() : 0;
                    return dateA - dateB;
                });

                setJobs(jobList);
                setLoading(false);
            },
            (err) => {
                console.error("Error fetching tech schedule:", err);
                setError("Failed to load schedule. Please try again.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user]);

    // Unacknowledged jobs filter
    const unacknowledgedJobs = useMemo(() => {
        return jobs.filter(j => j.status === 'scheduled' && j.tech_alert_status?.acknowledged !== true);
    }, [jobs]);

    const handleStatusUpdate = async (jobId: string, newStatus: 'en_route' | 'in_progress' | 'completed') => {
        if (newStatus === 'in_progress') {
            await handleCheckInOnSite(jobId);
            return;
        }

        try {
            const jobRef = doc(db, 'jobs', jobId);
            const updates: any = {
                status: newStatus
            };
            if (newStatus === 'en_route') {
                updates.transit_started_at = new Date();
            } else if (newStatus === 'completed') {
                updates.actual_end = new Date();
                updates.completed_at = new Date();
                const targetJob = jobs.find(j => j.id === jobId);
                if (targetJob?.actual_start || targetJob?.arrived_at) {
                    const startRaw = targetJob.actual_start || targetJob.arrived_at;
                    const startTime = startRaw?.toDate ? startRaw.toDate().getTime() : new Date(startRaw).getTime();
                    if (!isNaN(startTime)) {
                        updates.actual_duration = Math.max(1, Math.round((Date.now() - startTime) / 60000));
                    }
                }
            }

            await updateDoc(jobRef, updates);
            toast.success(`Job marked as ${newStatus.replace('_', ' ')}! 🎉`);

            // Dispatch automated customer completion SMS
            if (newStatus === 'completed') {
                try {
                    const notifyCustomerJobCompletedFn = httpsCallable(functions, 'notifyCustomerJobCompleted');
                    await notifyCustomerJobCompletedFn({
                        jobId,
                        orgId: user?.org_id || 'demo-org'
                    });
                } catch (smsErr) {
                    console.warn('Customer completion SMS dispatch skipped or failed:', smsErr);
                }
            }
        } catch (error) {
            console.error("Error updating status:", error);
            toast.error("Failed to update status");
        }
    };

    const handleCheckInOnSite = async (jobId: string) => {
        const job = jobs.find(j => j.id === jobId);
        const now = new Date();
        const updates: any = {
            status: 'in_progress',
            arrived_at: now,
            actual_start: now
        };

        // Calculate transit duration if driving was started
        if (job?.transit_started_at) {
            const transitStart = job.transit_started_at?.toDate ? job.transit_started_at.toDate() : new Date(job.transit_started_at);
            const durationMins = Math.max(1, Math.round((now.getTime() - transitStart.getTime()) / 60000));
            updates.transit_duration_minutes = durationMins;
        }

        const executeCheckIn = async (finalUpdates: any) => {
            try {
                const jobRef = doc(db, 'jobs', jobId);
                await updateDoc(jobRef, finalUpdates);
                toast.success("Checked in on site! Work timer started ⏱️");

                // Dispatch automated customer arrival alert via Cloud Function
                try {
                    const notifyArrivalFn = httpsCallable(functions, 'notifyCustomerTechArrived');
                    await notifyArrivalFn({ jobId, orgId: user?.org_id || 'demo-org' });
                    toast.success("Customer notified of your arrival 📱");
                } catch (smsErr) {
                    console.warn("Customer arrival alert warning:", smsErr);
                }
            } catch (error) {
                console.error("Error during on-site check-in:", error);
                toast.error("Failed to complete on-site check-in");
            }
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    updates.checkin_location = {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                        timestamp: new Date()
                    };
                    executeCheckIn(updates);
                },
                () => {
                    executeCheckIn(updates);
                },
                { timeout: 3500, enableHighAccuracy: true }
            );
        } else {
            executeCheckIn(updates);
        }
    };

    const handleStartTransit = async (jobId: string, destinationAddress: string) => {
        try {
            const jobRef = doc(db, 'jobs', jobId);
            await updateDoc(jobRef, {
                status: 'en_route',
                transit_started_at: new Date()
            });
            toast.success("Transit started! Marked En Route 🚗");

            // Dispatch automated customer en-route alert via Cloud Function
            try {
                const notifyEnRouteFn = httpsCallable(functions, 'notifyCustomerTechEnRoute');
                await notifyEnRouteFn({ jobId, orgId: user?.org_id || 'demo-org', overrideCustomerPhone: '8082829726' });
                toast.success("Customer notified: Tech on the way! 📱");
            } catch (smsErr) {
                console.warn("Customer en-route SMS alert warning:", smsErr);
            }

            if (autoOpenNav && destinationAddress) {
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationAddress)}&travelmode=driving`, '_blank', 'noopener,noreferrer');
            }
        } catch (error) {
            console.error("Error starting transit:", error);
            toast.error("Failed to start transit");
        }
    };

    const handleNotifyDelay = async (jobId: string, delayMinutes: number = 30, reason: string = 'traffic and previous job complexity') => {
        try {
            const jobRef = doc(db, 'jobs', jobId);
            await updateDoc(jobRef, {
                customer_delayed: true,
                delay_minutes: delayMinutes,
                delay_reason: reason,
                delay_notified_at: new Date()
            });

            // Dispatch automated customer delay alert via Cloud Function
            try {
                const notifyDelayFn = httpsCallable(functions, 'notifyCustomerTechDelayed');
                await notifyDelayFn({
                    jobId,
                    orgId: user?.org_id || 'demo-org',
                    delayMinutes,
                    reason,
                    overrideCustomerPhone: '8082829726'
                });
                toast.success(`Customer notified of ${delayMinutes}m delay via SMS 📱`);
            } catch (smsErr) {
                console.warn("Customer delay SMS alert warning:", smsErr);
                toast.success(`Delay of ${delayMinutes}m recorded for customer`);
            }
        } catch (err) {
            console.error("Error updating delay status:", err);
            toast.error("Failed to record delay");
        }
    };

    const handleAcknowledgeJob = async (jobId: string) => {
        try {
            const jobRef = doc(db, 'jobs', jobId);
            await updateDoc(jobRef, {
                'tech_alert_status.acknowledged': true,
                'tech_alert_status.acknowledgedAt': new Date(),
                'tech_alert_status.acknowledgedBy': user?.uid || null
            });
            toast.success("Assignment acknowledged! Dispatch notified.");
        } catch (err) {
            console.error("Error acknowledging job:", err);
            toast.error("Failed to acknowledge assignment");
        }
    };

    const handleAcknowledgeAll = async () => {
        if (unacknowledgedJobs.length === 0) return;
        setIsAcknowledging(true);
        try {
            await Promise.all(
                unacknowledgedJobs.map(job => {
                    const jobRef = doc(db, 'jobs', job.id);
                    return updateDoc(jobRef, {
                        'tech_alert_status.acknowledged': true,
                        'tech_alert_status.acknowledgedAt': new Date(),
                        'tech_alert_status.acknowledgedBy': user?.uid || null
                    });
                })
            );
            toast.success(`Acknowledged all ${unacknowledgedJobs.length} assignments!`);
        } catch (err) {
            console.error("Error acknowledging all jobs:", err);
            toast.error("Failed to acknowledge all jobs");
        } finally {
            setIsAcknowledging(false);
        }
    };

    const handleTogglePrepChecklist = async (jobId: string, itemLabel: string, checked: boolean) => {
        try {
            const job = jobs.find(j => j.id === jobId);
            if (!job) return;
            const techName = (user as any)?.name || user?.displayName || 'Tech';
            const currentList: JobPrepChecklistItem[] = job.prep_checklist || [];
            const existingIdx = currentList.findIndex(i => i.label === itemLabel);
            let updatedList: JobPrepChecklistItem[];
            if (existingIdx >= 0) {
                updatedList = currentList.map((item, idx) => idx === existingIdx ? { ...item, checked, checkedAt: new Date(), checkedBy: techName } : item);
            } else {
                updatedList = [...currentList, { id: `${Date.now()}`, label: itemLabel, category: 'tool', checked, checkedAt: new Date(), checkedBy: techName }];
            }
            await updateDoc(doc(db, 'jobs', jobId), { prep_checklist: updatedList });
        } catch (err) {
            console.error('Failed to update prep checklist:', err);
        }
    };

    const renderView = () => {
        const viewProps = {
            jobs,
            onStatusUpdate: handleStatusUpdate,
            onCheckInJob: handleCheckInOnSite,
            onSelectJob: setSelectedJob,
            onAcknowledgeJob: handleAcknowledgeJob,
            onTogglePrepChecklist: handleTogglePrepChecklist,
            onStartTransit: handleStartTransit,
            onNotifyDelay: handleNotifyDelay,
            autoOpenNav,
            onToggleAutoOpenNav: handleToggleAutoOpenNav
        };

        switch (activeView) {
            case 'mission_briefing': return <MissionBriefingView {...viewProps} />;
            case 'route_planner': return <RoutePlannerView {...viewProps} />;
            case 'smart_priority': return <SmartPriorityView {...viewProps} />;
            case 'job_dossier': return <JobDossierView {...viewProps} />;
            case 'week_glance': return <WeekAtGlanceView {...viewProps} />;
            default: return <MissionBriefingView {...viewProps} />;
        }
    };

    if (loading || !viewLoaded) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm">Loading your schedule...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center text-red-600">
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-6">
            {/* Header */}
            <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {jobs.length} active job{jobs.length !== 1 ? 's' : ''} • {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                </div>

                {/* View Switcher */}
                <TechViewSwitcher
                    currentView={activeView}
                    onViewChange={setActiveView}
                    userId={user?.uid}
                />
            </header>

            {/* Unacknowledged Job Alert Banner */}
            {unacknowledgedJobs.length > 0 && (
                <div className="mb-6 p-4 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm animate-pulse">
                            <Bell className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                                {unacknowledgedJobs.length} New Job Assignment{unacknowledgedJobs.length > 1 ? 's' : ''} Awaiting Acknowledgment
                            </h3>
                            <p className="text-xs text-amber-800 mt-0.5">
                                Please confirm receipt of your dispatched stops so dispatch knows you've received your work orders.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleAcknowledgeAll}
                        disabled={isAcknowledging}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5 whitespace-nowrap self-stretch sm:self-auto justify-center disabled:opacity-50"
                    >
                        <CheckCircle className="w-4 h-4" />
                        {isAcknowledging ? 'Confirming...' : `Acknowledge All (${unacknowledgedJobs.length})`}
                    </button>
                </div>
            )}

            {/* Active View */}
            {renderView()}

            {/* Job Details Modal */}
            {selectedJob && (
                <JobDetailsModal
                    job={selectedJob}
                    onClose={() => setSelectedJob(null)}
                    onUpdate={() => setSelectedJob(null)}
                />
            )}
        </div>
    );
};
