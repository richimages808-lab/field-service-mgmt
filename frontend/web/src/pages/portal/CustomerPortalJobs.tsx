/**
 * CustomerPortalJobs - Customer's job history and upcoming jobs
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePortalContext } from './CustomerPortalLayout';
import { db } from '../../firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { Job } from '../../types';

// Job List Component
export const CustomerPortalJobs: React.FC = () => {
    const { customer } = usePortalContext();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('all');

    useEffect(() => {
        const fetchJobs = async () => {
            if (!customer) {
                setLoading(false);
                return;
            }

            try {
                const jobsQuery = query(
                    collection(db, 'jobs'),
                    where('customer_id', '==', customer.id),
                    orderBy('createdAt', 'desc')
                );
                const snapshot = await getDocs(jobsQuery);
                setJobs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
            } catch (error) {
                console.error('Error fetching jobs:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchJobs();
    }, [customer]);

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'Not scheduled';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            pending: 'bg-orange-100 text-orange-800 border-orange-200',
            unscheduled: 'bg-gray-100 text-gray-800 border-gray-200',
            scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
            in_progress: 'bg-yellow-100 text-yellow-800 border-yellow-200',
            completed: 'bg-green-100 text-green-800 border-green-200',
            cancelled: 'bg-red-100 text-red-800 border-red-200'
        };
        return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
    };

    const filteredJobs = jobs.filter(job => {
        if (filter === 'upcoming') {
            return ['scheduled', 'in_progress', 'pending'].includes(job.status);
        }
        if (filter === 'completed') {
            return job.status === 'completed';
        }
        return true;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Jobs</h1>
                    <p className="text-gray-600">View your service history and upcoming appointments</p>
                </div>

                {/* Filter Tabs */}
                <div className="flex bg-gray-100 rounded-lg p-1">
                    {['all', 'upcoming', 'completed'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f as any)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition capitalize ${filter === f
                                ? 'bg-white shadow text-gray-900'
                                : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Job Cards */}
            {filteredJobs.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                    <p className="text-gray-500 mb-2">
                        {filter === 'all'
                            ? 'No jobs found'
                            : filter === 'upcoming'
                                ? 'No upcoming appointments'
                                : 'No completed jobs yet'}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredJobs.map((job) => (
                        <Link
                            key={job.id}
                            to={`/portal/jobs/${job.id}`}
                            className="block bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition"
                        >
                            <div className="p-6">
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-gray-900 text-lg mb-1">
                                            {job.request?.description || 'Service Visit'}
                                        </h3>
                                        <p className="text-gray-600 text-sm">
                                            📍 {job.customer?.address}
                                        </p>
                                    </div>
                                    <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getStatusColor(job.status)} whitespace-nowrap`}>
                                        {job.status.replace('_', ' ').toUpperCase()}
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                                    {job.scheduled_at && (
                                        <div className="flex items-center gap-1">
                                            <span>📅</span>
                                            <span>{formatDate(job.scheduled_at)}</span>
                                        </div>
                                    )}
                                    {job.assigned_tech_name && (
                                        <div className="flex items-center gap-1">
                                            <span>👷</span>
                                            <span>{job.assigned_tech_name}</span>
                                        </div>
                                    )}
                                    {job.estimated_duration && (
                                        <div className="flex items-center gap-1">
                                            <span>⏱️</span>
                                            <span>{job.estimated_duration} min</span>
                                        </div>
                                    )}
                                </div>

                                {/* Show public notes preview */}
                                {job.notes?.public && (
                                    <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                                        <span className="font-medium">Note:</span> {job.notes.public.substring(0, 100)}
                                        {job.notes.public.length > 100 && '...'}
                                    </div>
                                )}
                            </div>

                            {/* Photos Preview */}
                            {job.request?.photos && job.request.photos.length > 0 && (
                                <div className="border-t p-4 flex gap-2 overflow-x-auto">
                                    {job.request.photos.slice(0, 4).map((url, idx) => (
                                        <img
                                            key={idx}
                                            src={url}
                                            alt={`Job photo ${idx + 1}`}
                                            className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                                        />
                                    ))}
                                    {job.request.photos.length > 4 && (
                                        <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 text-sm flex-shrink-0">
                                            +{job.request.photos.length - 4}
                                        </div>
                                    )}
                                </div>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

// Job Detail Component
export const CustomerPortalJobDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { customer } = usePortalContext();
    const [job, setJob] = useState<Job | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchJob = async () => {
            if (!id) {
                setLoading(false);
                return;
            }

            try {
                const jobDoc = await getDoc(doc(db, 'jobs', id));
                if (jobDoc.exists()) {
                    const jobData = { id: jobDoc.id, ...jobDoc.data() } as Job;
                    // Verify customer owns this job
                    if (jobData.customer_id === customer?.id) {
                        setJob(jobData);
                    }
                }
            } catch (error) {
                console.error('Error fetching job:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchJob();
    }, [id, customer]);

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'Not scheduled';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            pending: 'bg-orange-100 text-orange-800',
            unscheduled: 'bg-gray-100 text-gray-800',
            scheduled: 'bg-blue-100 text-blue-800',
            in_progress: 'bg-yellow-100 text-yellow-800',
            completed: 'bg-green-100 text-green-800',
            cancelled: 'bg-red-100 text-red-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!job) {
        return (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Job Not Found</h2>
                <p className="text-gray-600 mb-4">This job doesn't exist or you don't have access to it.</p>
                <Link to="/portal/jobs" className="text-blue-600 hover:text-blue-800">
                    ← Back to Jobs
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Back Link */}
            <Link to="/portal/jobs" className="inline-flex items-center text-gray-600 hover:text-gray-900">
                ← Back to Jobs
            </Link>

            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">
                            {job.request?.description || 'Service Visit'}
                        </h1>
                        <p className="text-gray-600">📍 {job.customer?.address}</p>
                    </div>
                    <span className={`px-4 py-2 text-sm font-semibold rounded-full ${getStatusColor(job.status)}`}>
                        {job.status.replace('_', ' ').toUpperCase()}
                    </span>
                </div>

                {/* Key Details */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500 mb-1">Scheduled</p>
                        <p className="font-medium text-gray-900">{formatDate(job.scheduled_at)}</p>
                    </div>
                    {job.assigned_tech_name && (
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-500 mb-1">Technician</p>
                            <p className="font-medium text-gray-900">{job.assigned_tech_name}</p>
                        </div>
                    )}
                    {job.estimated_duration && (
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-500 mb-1">Duration</p>
                            <p className="font-medium text-gray-900">{job.estimated_duration} minutes</p>
                        </div>
                    )}
                    {job.finished_at && (
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-500 mb-1">Completed</p>
                            <p className="font-medium text-gray-900">{formatDate(job.finished_at)}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Notes */}
            {job.notes?.public && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold text-gray-900 mb-4">Technician Notes</h2>
                    <p className="text-gray-700 whitespace-pre-wrap">{job.notes.public}</p>
                </div>
            )}

            {/* Photos */}
            {job.request?.photos && job.request.photos.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold text-gray-900 mb-4">Photos</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {job.request.photos.map((url, idx) => (
                            <a
                                key={idx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="aspect-square rounded-lg overflow-hidden hover:opacity-90 transition"
                            >
                                <img
                                    src={url}
                                    alt={`Job photo ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                />
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-4">
                <Link
                    to="/portal/messages"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                    💬 Ask a Question
                </Link>
                {job.id && (
                    <Link
                        to={`/portal/invoices?job=${job.id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                    >
                        💰 View Invoice
                    </Link>
                )}
            </div>
        </div>
    );
};
