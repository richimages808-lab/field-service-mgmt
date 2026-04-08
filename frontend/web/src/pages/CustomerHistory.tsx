import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { Job } from '../types';
import { Link } from 'react-router-dom';
import { EditJobModal } from '../components/EditJobModal';

export const CustomerHistory: React.FC = () => {
    const [email, setEmail] = useState('');
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedJob, setSelectedJob] = useState<Job | null>(null);

    // Initial load - fetch recent history
    const fetchJobs = async (searchEmail?: string) => {
        setLoading(true);
        setError(null);
        try {
            let q;
            if (!searchEmail?.trim()) {
                q = query(
                    collection(db, 'jobs'),
                    // orderBy('createdAt', 'desc'), // Removed to avoid index issues
                    limit(50)
                );
            } else {
                q = query(
                    collection(db, 'jobs'),
                    where('customer.email', '==', searchEmail),
                    // orderBy('createdAt', 'desc'), // Removed to avoid index issues
                    limit(50)
                );
            }

            const snapshot = await getDocs(q);
            const results = snapshot.docs.map(doc => {
                return { id: doc.id, ...(doc.data() as Omit<Job, 'id'>) } as Job;
            });

            // Client-side sort
            results.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return dateB - dateA; // Descending
            });

            setJobs(results);
        } catch (error: unknown) {
            console.error("Error fetching history:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            setError("Failed to load records. " + errorMessage);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();

        fetchJobs(email);
    };

    const handleModalClose = () => {
        setSelectedJob(null);
        fetchJobs(email); // Refresh after potential edit/view
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Job Records</h1>
                <div className="space-x-4">
                    <Link to="/jobs/new" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                        + New Job
                    </Link>
                    <Link to="/" className="text-blue-600 hover:underline">Back to Dashboard</Link>
                </div>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                </div>
            )}

            <form onSubmit={handleSearch} className="flex gap-4 mb-8">
                <input
                    type="email"
                    placeholder="Search by Customer Email (leave empty for all recent)"
                    className="flex-1 border rounded p-2"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </form>

            <div className="bg-white rounded shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {jobs.map(job => (
                            <tr key={job.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {job.createdAt?.toDate ? job.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{job.customer?.name || 'Unknown Customer'}</div>
                                    <div className="text-sm text-gray-500">{job.site_name || 'N/A'}</div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                                    {job.request?.description || 'No description provided'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                        ${job.status === 'completed' ? 'bg-green-100 text-green-800' :
                                            job.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                                job.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {job.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                                    {job.priority || 'medium'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button
                                        onClick={() => setSelectedJob(job)}
                                        className="text-blue-600 hover:text-blue-900"
                                    >
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {jobs.length === 0 && !loading && (
                    <div className="p-6 text-center text-gray-500">No records found.</div>
                )}
            </div>

            {selectedJob && (
                <EditJobModal
                    job={selectedJob}
                    onClose={handleModalClose}
                />
            )}
        </div>
    );
};
