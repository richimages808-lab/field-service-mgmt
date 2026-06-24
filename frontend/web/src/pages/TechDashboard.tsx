import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { Job } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { JobDetailsModal } from '../components/JobDetailsModal';
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
                }
            } catch (err) {
                console.warn('Failed to load view preference:', err);
            } finally {
                setViewLoaded(true);
            }
        };

        loadViewPreference();
    }, [user?.uid]);

    // Fetch jobs assigned to this tech
    useEffect(() => {
        if (!user) return;

        const jobsRef = collection(db, 'jobs');
        const q = query(
            jobsRef,
            where('assigned_tech_email', '==', user.email)
        );

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const jobList = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Job))
                    .filter(job => job.status !== 'completed');

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

    const handleStatusUpdate = async (jobId: string, newStatus: 'in_progress' | 'completed') => {
        try {
            const jobRef = doc(db, 'jobs', jobId);
            await updateDoc(jobRef, {
                status: newStatus,
                ...(newStatus === 'in_progress' ? { actual_start: new Date() } : {}),
                ...(newStatus === 'completed' ? { actual_end: new Date() } : {})
            });
        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const renderView = () => {
        const viewProps = {
            jobs,
            onStatusUpdate: handleStatusUpdate,
            onSelectJob: setSelectedJob
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
