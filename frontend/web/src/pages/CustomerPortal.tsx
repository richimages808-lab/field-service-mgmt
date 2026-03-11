import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Job } from '../types';
import { useSearchParams } from 'react-router-dom';

export const CustomerPortal: React.FC = () => {
    const [searchParams] = useSearchParams();
    const email = searchParams.get('email');

    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!email) {
            setLoading(false);
            return;
        }

        const fetchHistory = async () => {
            try {
                const q = query(
                    collection(db, 'jobs'),
                    where('customer.email', '==', email),
                    where('status', '==', 'completed'), // Only completed jobs for portal
                    orderBy('createdAt', 'desc')
                );
                const snapshot = await getDocs(q);
                const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
                setJobs(results);
            } catch (error) {
                console.error("Error fetching portal history:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [email]);

    if (!email) {
        return <div className="p-8 text-center">Please provide a valid email link.</div>;
    }

    // Group by Site
    const jobsBySite = jobs.reduce((acc, job) => {
        const site = job.site_name || 'Unspecified Site';
        if (!acc[site]) acc[site] = [];
        acc[site].push(job);
        return acc;
    }, {} as Record<string, Job[]>);

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow p-4 mb-8">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-2xl font-bold text-gray-800">Customer Portal</h1>
                    <p className="text-gray-500">History for {email}</p>
                </div>
            </header>

            <div className="max-w-4xl mx-auto p-4">
                {loading ? (
                    <p>Loading history...</p>
                ) : jobs.length === 0 ? (
                    <p className="text-center text-gray-500">No completed service history found.</p>
                ) : (
                    Object.entries(jobsBySite).map(([site, siteJobs]) => (
                        <div key={site} className="mb-8 bg-white rounded shadow overflow-hidden">
                            <div className="bg-blue-50 p-4 border-b border-blue-100">
                                <h2 className="text-xl font-bold text-blue-900">{site}</h2>
                            </div>
                            <div className="divide-y">
                                {siteJobs.map(job => (
                                    <div key={job.id} className="p-6">
                                        <div className="flex justify-between mb-4">
                                            <div>
                                                <p className="font-bold text-lg">{job.request.description}</p>
                                                <p className="text-sm text-gray-500">Completed on: {job.finished_at?.toDate().toLocaleDateString() || 'N/A'}</p>
                                            </div>
                                            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-bold h-fit">
                                                COMPLETED
                                            </span>
                                        </div>

                                        {/* Public Notes Only */}
                                        {job.notes?.public && (
                                            <div className="mb-4 p-3 bg-gray-50 rounded text-gray-700">
                                                <span className="font-bold">Technician Note:</span> {job.notes.public}
                                            </div>
                                        )}

                                        {/* Photos */}
                                        {job.request.photos && job.request.photos.length > 0 && (
                                            <div>
                                                <p className="text-sm font-bold text-gray-500 mb-2">Photos:</p>
                                                <div className="flex gap-2">
                                                    {job.request.photos.map((url, idx) => (
                                                        <a key={idx} href={url} target="_blank" rel="noreferrer">
                                                            <img src={url} alt="Job" className="w-24 h-24 object-cover rounded border hover:opacity-75 transition" />
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
