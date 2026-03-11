import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Job } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { generateJobRecommendation } from '../lib/jobIntakeAI';
import { Clock, AlertTriangle, CheckCircle, XCircle, MessageSquare, Wrench, FileText, MapPin, User } from 'lucide-react';

interface PendingJobsQueueProps {
    onSelectJob: (job: Job) => void;
}

export const PendingJobsQueue: React.FC<PendingJobsQueueProps> = ({ onSelectJob }) => {
    const { user } = useAuth();
    const [pendingJobs, setPendingJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'new' | 'in_review' | 'needs_info'>('all');

    useEffect(() => {
        if (!user?.org_id) return;

        console.log('[PendingJobsQueue] Starting to fetch jobs for org:', user.org_id);

        // Query for jobs that need review (status: pending)
        const q = query(
            collection(db, 'jobs'),
            where('org_id', '==', user.org_id),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            console.log('[PendingJobsQueue] Received snapshot with', snapshot.docs.length, 'jobs');
            const jobs: Job[] = [];

            for (const docSnap of snapshot.docs) {
                const jobData = { id: docSnap.id, ...docSnap.data() } as Job;
                console.log('[PendingJobsQueue] Processing job:', jobData.id, jobData.customer?.name);

                // Initialize intake review if not exists
                if (!jobData.intakeReview) {
                    jobData.intakeReview = {
                        status: 'new',
                        questionsForCustomer: []
                    };

                    // Generate AI recommendation in background
                    try {
                        console.log('[PendingJobsQueue] Generating AI recommendation for:', jobData.id);
                        const recommendation = await generateJobRecommendation(jobData, user);
                        jobData.intakeReview.aiRecommendation = recommendation;

                        // Update Firestore with recommendation
                        await updateDoc(doc(db, 'jobs', jobData.id), {
                            'intakeReview': jobData.intakeReview
                        });
                        console.log('[PendingJobsQueue] AI recommendation saved for:', jobData.id);
                    } catch (error) {
                        console.error('[PendingJobsQueue] Failed to generate AI recommendation:', error);
                    }
                }

                jobs.push(jobData);
            }

            console.log('[PendingJobsQueue] Setting pending jobs:', jobs.length);
            setPendingJobs(jobs);
            setLoading(false);
        }, (error) => {
            console.error('[PendingJobsQueue] Error fetching jobs:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.org_id, user]);

    const filteredJobs = pendingJobs.filter(job => {
        if (filter === 'all') return true;
        return job.intakeReview?.status === filter;
    });

    const getStatusBadge = (status: string) => {
        const badges = {
            new: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'New' },
            in_review: { color: 'bg-yellow-100 text-yellow-800', icon: FileText, label: 'In Review' },
            needs_info: { color: 'bg-orange-100 text-orange-800', icon: MessageSquare, label: 'Needs Info' },
            approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Approved' },
            rejected: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Rejected' }
        };

        const badge = badges[status as keyof typeof badges] || badges.new;
        const Icon = badge.icon;

        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                <Icon className="w-3 h-3 mr-1" />
                {badge.label}
            </span>
        );
    };

    const getPriorityBadge = (priority: string) => {
        const colors = {
            critical: 'bg-red-600 text-white',
            high: 'bg-orange-500 text-white',
            medium: 'bg-yellow-500 text-white',
            low: 'bg-gray-500 text-white'
        };

        return (
            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${colors[priority as keyof typeof colors]}`}>
                {priority === 'critical' && <AlertTriangle className="w-3 h-3 mr-1" />}
                {priority.toUpperCase()}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading job requests...</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900">Job Requests</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            Review and approve incoming job requests
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-gray-700">Total Pending:</span>
                        <span className="px-3 py-1 bg-blue-600 text-white rounded-full font-semibold">
                            {filteredJobs.length}
                        </span>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex gap-2">
                    {(['all', 'new', 'in_review', 'needs_info'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                filter === f
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                            }`}
                        >
                            {f === 'all' ? 'All' : f.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            <span className="ml-2 text-xs opacity-75">
                                ({pendingJobs.filter(j => f === 'all' || j.intakeReview?.status === f).length})
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Job Cards Grid */}
            {filteredJobs.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                    <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No pending requests</h3>
                    <p className="text-gray-500 mb-4">
                        {filter === 'all'
                            ? 'All job requests have been reviewed.'
                            : `No jobs with status: ${filter.replace('_', ' ')}`}
                    </p>
                    <button
                        onClick={() => setFilter('all')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        View All Requests
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredJobs.map((job) => (
                        <div
                            key={job.id}
                            onClick={() => onSelectJob(job)}
                            className="bg-white rounded-lg shadow-md border border-gray-200 hover:shadow-xl hover:border-blue-300 transition-all duration-200 cursor-pointer overflow-hidden"
                        >
                            {/* Card Header */}
                            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-bold truncate flex items-center gap-2">
                                            <User className="w-5 h-5" />
                                            {job.customer.name}
                                        </h3>
                                        <p className="text-blue-100 text-sm flex items-center gap-1 mt-1">
                                            <MapPin className="w-4 h-4" />
                                            {job.customer.address.split(',')[0]}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    {getStatusBadge(job.intakeReview?.status || 'new')}
                                    {job.intakeReview?.aiRecommendation &&
                                        getPriorityBadge(job.intakeReview.aiRecommendation.priority)
                                    }
                                </div>
                            </div>

                            {/* Card Body */}
                            <div className="p-4">
                                {/* Description */}
                                <p className="text-sm text-gray-700 mb-4 line-clamp-3 min-h-[60px]">
                                    {job.request.description}
                                </p>

                                {/* AI Recommendation Summary */}
                                {job.intakeReview?.aiRecommendation ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-1 text-gray-600">
                                                <Clock className="w-4 h-4" />
                                                Duration
                                            </span>
                                            <span className="font-semibold text-gray-900">
                                                {job.intakeReview.aiRecommendation.estimatedDuration} min
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-1 text-gray-600">
                                                <Wrench className="w-4 h-4" />
                                                Tools Needed
                                            </span>
                                            <span className="font-semibold text-gray-900">
                                                {job.intakeReview.aiRecommendation.requiredTools.filter(t => !t.owned).length > 0 ? (
                                                    <span className="text-orange-600">
                                                        {job.intakeReview.aiRecommendation.requiredTools.filter(t => !t.owned).length} missing
                                                    </span>
                                                ) : (
                                                    <span className="text-green-600">All owned ✓</span>
                                                )}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-600">Complexity</span>
                                            <span className={`font-semibold capitalize ${
                                                job.intakeReview.aiRecommendation.complexity === 'complex' ? 'text-red-600' :
                                                job.intakeReview.aiRecommendation.complexity === 'medium' ? 'text-yellow-600' :
                                                'text-green-600'
                                            }`}>
                                                {job.intakeReview.aiRecommendation.complexity}
                                            </span>
                                        </div>

                                        {/* Priority Reason */}
                                        <div className="pt-3 border-t border-gray-100">
                                            <p className="text-xs text-gray-600 italic">
                                                "{job.intakeReview.aiRecommendation.priorityReason}"
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-4">
                                        <div className="animate-pulse flex flex-col items-center">
                                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                                                <span className="text-blue-600 font-bold text-xs">AI</span>
                                            </div>
                                            <p className="text-xs text-gray-500">Analyzing job...</p>
                                        </div>
                                    </div>
                                )}

                                {/* Questions for customer */}
                                {job.intakeReview?.questionsForCustomer && job.intakeReview.questionsForCustomer.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-gray-100">
                                        <div className="flex items-center gap-2 text-sm text-orange-600">
                                            <MessageSquare className="w-4 h-4" />
                                            <span className="font-medium">
                                                {job.intakeReview.questionsForCustomer.filter(q => !q.answer).length} question(s) pending
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Card Footer */}
                            <div className="bg-gray-50 px-4 py-3 border-t border-gray-100">
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span className="capitalize">via {job.request.source || 'web'}</span>
                                    <span className="font-medium text-blue-600">Click to review →</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
