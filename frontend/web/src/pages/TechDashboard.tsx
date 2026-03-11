import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Job } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { JobDetailsModal } from '../components/JobDetailsModal';
import { LayoutList, Calendar as CalendarIcon } from 'lucide-react';
import { optimizeSchedule } from '../lib/scheduler';

const locales = {
    'en-US': enUS,
};

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

export const TechDashboard: React.FC = () => {
    const { user } = useAuth();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [partsFlags, setPartsFlags] = useState<Record<string, boolean>>({});
    const [isOptimizing, setIsOptimizing] = useState(false);

    // New State
    const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);

    useEffect(() => {
        if (!user) return;

        // Fetch jobs assigned to this tech
        const jobsRef = collection(db, 'jobs');

        // Query by Email for robustness (since IDs change on seed)
        // Fallback to ID if email is missing (though it shouldn't be)
        const q = query(
            jobsRef,
            where('assigned_tech_email', '==', user.email)
        );

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const jobList = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Job))
                    .filter(job => job.status !== 'completed'); // Client-side filtering

                // Sort by scheduled time
                jobList.sort((a, b) => {
                    const dateA = a.scheduled_at?.toDate ? a.scheduled_at.toDate().getTime() : 0;
                    const dateB = b.scheduled_at?.toDate ? b.scheduled_at.toDate().getTime() : 0;
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
            await updateDoc(jobRef, { status: newStatus });
        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const togglePartsNeeded = (jobId: string) => {
        setPartsFlags(prev => ({
            ...prev,
            [jobId]: !prev[jobId]
        }));
    };

    const handleAutoSchedule = async () => {
        if (!user || jobs.length === 0) return;
        setIsOptimizing(true);

        try {
            // 1. Get current location (Mock: Home Base or First Job)
            // For now, assume starting from the first job's location or a default
            const startLocation = jobs[0]?.location || { lat: 21.3069, lng: -157.8583 }; // Honolulu default

            // 2. Run Optimization
            const optimizedJobs = optimizeSchedule(jobs, startLocation, partsFlags);

            // 3. Batch Update Firestore
            const batch = writeBatch(db);

            // Delete old parts runs (optional, but good for cleanup if we re-run)
            // For simplicity, we'll just update existing jobs and add new parts runs

            for (const job of optimizedJobs) {
                if (job.id.startsWith('parts-run-')) {
                    // It's a new parts run, create it
                    const newJobRef = doc(collection(db, 'jobs'));
                    batch.set(newJobRef, { ...job, id: newJobRef.id }); // Remove temp ID
                } else {
                    // It's an existing job, update schedule
                    const jobRef = doc(db, 'jobs', job.id);
                    batch.update(jobRef, {
                        scheduled_at: job.scheduled_at,
                        status: 'scheduled'
                    });
                }
            }

            await batch.commit();
            setPartsFlags({}); // Reset flags
            alert("Schedule Optimized! Parts runs added.");

        } catch (err) {
            console.error("Optimization failed:", err);
            alert("Failed to optimize schedule.");
        } finally {
            setIsOptimizing(false);
        }
    };

    // Calendar Events Mapper
    const events = jobs.map(job => {
        const start = job.scheduled_at?.toDate ? job.scheduled_at.toDate() : new Date();
        const end = new Date(start.getTime() + (job.estimated_duration || 60) * 60000);
        return {
            id: job.id,
            title: job.customer.name,
            start,
            end,
            resource: job,
        };
    });

    if (loading) return <div className="p-8">Loading Schedule...</div>;
    if (error) return <div className="p-8 text-red-600">{error}</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">My Schedule</h1>
                    <p className="text-gray-600">Morning Routine: Review tickets, flag parts, then Auto-Schedule.</p>
                </div>
                <div className="flex gap-3">
                    <div className="bg-white rounded-lg shadow p-1 flex">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded ${viewMode === 'list' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
                            title="List View"
                        >
                            <LayoutList className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('timeline')}
                            className={`p-2 rounded ${viewMode === 'timeline' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
                            title="Timeline View"
                        >
                            <CalendarIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <button
                        onClick={handleAutoSchedule}
                        disabled={isOptimizing}
                        className={`px-6 py-3 rounded-lg font-bold text-white shadow-lg transition-colors
                            ${isOptimizing ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                        {isOptimizing ? 'Optimizing...' : '✨ Auto-Schedule Day'}
                    </button>
                </div>
            </header>

            {viewMode === 'list' ? (
                <div className="space-y-6">
                    {jobs.length === 0 ? (
                        <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
                            No active jobs assigned. Enjoy your day!
                        </div>
                    ) : (
                        jobs.map(job => (
                            <div key={job.id} className={`bg-white rounded-lg shadow-md overflow-hidden border-l-4 
                                ${job.type === 'parts_run' ? 'border-orange-500 bg-orange-50' : 'border-blue-500'}`}>
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                                {job.type === 'parts_run' && <span>🛠️</span>}
                                                {job.customer.name}
                                            </h2>
                                            <p className="text-gray-600">{job.customer.address}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-semibold text-gray-500">
                                                {job.scheduled_at?.toDate ? format(job.scheduled_at.toDate(), 'h:mm a') : 'Unscheduled'}
                                            </div>
                                            <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mt-1
                                                ${job.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                                                {job.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <h3 className="text-sm font-medium text-gray-500 uppercase mb-1">Description</h3>
                                        <p className="text-gray-800">{job.request.description}</p>
                                    </div>

                                    <div className="flex flex-wrap gap-4 items-center justify-between border-t border-gray-100 pt-4">
                                        {/* Parts Toggle */}
                                        {job.type !== 'parts_run' && (
                                            <label className="flex items-center space-x-2 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={!!partsFlags[job.id]}
                                                    onChange={() => togglePartsNeeded(job.id)}
                                                    className="form-checkbox h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500"
                                                />
                                                <span className="text-sm font-medium text-gray-700">Needs Parts?</span>
                                            </label>
                                        )}

                                        {/* Status Actions */}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setSelectedJob(job)}
                                                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded text-sm"
                                            >
                                                View Details
                                            </button>

                                            {job.status === 'scheduled' && (
                                                <button
                                                    onClick={() => handleStatusUpdate(job.id, 'in_progress')}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm"
                                                >
                                                    Start Job
                                                </button>
                                            )}
                                            {job.status === 'in_progress' && (
                                                <button
                                                    onClick={() => handleStatusUpdate(job.id, 'completed')}
                                                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-sm"
                                                >
                                                    Complete Job
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <div className="bg-white p-6 rounded-lg shadow h-[calc(100vh-200px)]">
                    <BigCalendar
                        localizer={localizer}
                        events={events}
                        startAccessor="start"
                        endAccessor="end"
                        defaultView="day"
                        views={['day', 'week']}
                        step={30}
                        timeslots={2}
                        min={new Date(0, 0, 0, 6, 0, 0)}
                        max={new Date(0, 0, 0, 22, 0, 0)}
                        onSelectEvent={(event) => setSelectedJob(event.resource)}
                    />
                </div>
            )}

            {selectedJob && (
                <JobDetailsModal
                    job={selectedJob}
                    onClose={() => setSelectedJob(null)}
                    onUpdate={() => setSelectedJob(null)} // Close on update to refresh
                />
            )}
        </div>
    );
};
