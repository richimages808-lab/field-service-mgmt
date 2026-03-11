import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PendingJobsQueue } from '../components/PendingJobsQueue';
import { JobReviewModal } from '../components/JobReviewModal';
import { Job } from '../types';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

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

        // Route based on user type
        if (role === 'dispatcher') {
            // Dispatchers go to the main calendar board
            navigate('/calendar', { state: { jobToSchedule: job } });
        } else if (role === 'technician' && techType === 'solopreneur') {
            // Solo technicians go to solo calendar
            navigate('/solo-calendar', { state: { jobToSchedule: job } });
        } else if (role === 'technician') {
            // Corporate technicians go to schedule board
            navigate('/schedule', { state: { jobToSchedule: job } });
        } else {
            // Default fallback to solo-calendar
            navigate('/solo-calendar', { state: { jobToSchedule: job } });
        }
    };

    const handleQuoteRequested = (job: Job) => {
        // Navigate to quote creation page for this job
        console.log('[JobIntakeDashboard] Navigating to quote creation for job:', job.id);
        navigate(`/quotes/new/${job.id}`);
    };

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            Back
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Job Intake Dashboard</h1>
                            <p className="text-sm text-gray-500">Review and approve incoming job requests</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
