import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PendingJobsQueue } from '../components/PendingJobsQueue';
import { JobReviewModal } from '../components/JobReviewModal';
import { Job } from '../types';
import { ArrowLeft, Inbox } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { ModuleHeader } from '../components/ui';

export const JobIntakeDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);

    // Check if a job was passed via navigation state
    useEffect(() => {
        if (location.state?.selectedJob) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedJob(location.state.selectedJob);
            // Clear the state so it doesn't persist on refresh
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    const handleApproveJob = (job: Job) => {
        // After approval, redirect to appropriate calendar based on user role
        const role = user?.role;
        const techType = user?.techType;

        console.log('[JobIntakeDashboard] Routing after approval - role:', role, 'techType:', techType);

        if (role === 'dispatcher') {
            navigate('/calendar', { state: { jobToSchedule: job } });
        } else if (role === 'technician' && techType === 'solopreneur') {
            navigate('/solo-calendar', { state: { jobToSchedule: job } });
        } else if (role === 'technician') {
            navigate('/schedule', { state: { jobToSchedule: job } });
        } else {
            navigate('/solo-calendar', { state: { jobToSchedule: job } });
        }
    };

    const handleRejectJob = (job: Job) => {
        // Handle post-rejection state
        setSelectedJob(null);
    };

    const handleQuoteRequested = (job: Job) => {
        // Navigate to quote creation page for this job
        console.log('[JobIntakeDashboard] Navigating to quote creation for job:', job.id);
        navigate(`/quotes/new/${job.id}`);
    };

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-5 max-w-[1600px] mx-auto min-h-screen">
            {/* Harmonized Module Header */}
            <ModuleHeader
                title="Job Intake Dashboard"
                subtitle="Review, approve, convert, or reject incoming customer job requests."
                icon={Inbox}
                iconGradient="bg-gradient-to-br from-indigo-500 to-blue-600"
                actions={
                    <button
                        onClick={() => navigate(-1)}
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </button>
                }
            />

            {/* Content Queue */}
            <div>
                <PendingJobsQueue onSelectJob={setSelectedJob} />
            </div>

            {/* Review Modal */}
            {selectedJob && (
                <JobReviewModal
                    job={selectedJob}
                    onClose={() => setSelectedJob(null)}
                    onApprove={handleApproveJob}
                    onQuoteRequested={handleQuoteRequested}
                />
            )}
        </div>
    );
};
