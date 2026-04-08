import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { Job } from '../types';
// import { useAuth } from '../auth/AuthProvider';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { SchedulingSettingsModal } from '../components/SchedulingSettingsModal';
import { SchedulingSettings, DEFAULT_SETTINGS } from '../types';
import { Settings, Layout, List, AlertCircle, History, MapPin, Clock, Calendar, Wrench, Phone, Mail, MessageSquare, Navigation } from 'lucide-react';
import { EditJobModal } from '../components/EditJobModal';
import { differenceInDays, format, isToday, startOfWeek, addDays, isSameDay } from 'date-fns';
import { optimizeSchedule, getCurrentLocation } from '../lib/scheduler';

// Priority Score for Sorting (Updated to use settings)
const getPriorityScore = (job: Job, settings: SchedulingSettings) => {
    let score = 0;

    // Base Priority
    switch (job.priority) {
        case 'critical': score += 100; break;
        case 'high': score += 50; break;
        case 'medium': score += 25; break;
        case 'low': score += 10; break;
    }

    // Aging Boost
    const daysOpen = job.createdAt ? differenceInDays(new Date(), job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt)) : 0;

    if (daysOpen >= settings.agingThresholds.critical) score += 80; // Almost critical
    else if (daysOpen >= settings.agingThresholds.high) score += 40;
    else if (daysOpen >= settings.agingThresholds.medium) score += 20;

    return score;
};

const JobCard = ({ job, onClick, settings }: { job: Job, onClick: () => void, settings: SchedulingSettings }) => {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'JOB',
        item: { id: job.id },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }));

    const incrementTime = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const jobRef = doc(db, 'jobs', job.id);
        const currentDuration = job.estimated_duration || 60;
        await updateDoc(jobRef, { estimated_duration: currentDuration + 60 });
    };

    const toggleParts = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const jobRef = doc(db, 'jobs', job.id);
        await updateDoc(jobRef, { parts_needed: !job.parts_needed });
    };

    const handleContact = (e: React.MouseEvent, type: 'phone' | 'email') => {
        e.stopPropagation();
        if (type === 'phone' && job.customer.phone) window.open(`tel:${job.customer.phone}`);
        if (type === 'email' && job.customer.email) window.open(`mailto:${job.customer.email}`);
    };

    const handleRequestInfo = (e: React.MouseEvent) => {
        e.stopPropagation();
        toast("Request Info feature coming soon!", { icon: 'ℹ️' });
    };

    // Calculate Aging
    const daysOpen = job.createdAt ? differenceInDays(new Date(), job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt)) : 0;

    // Determine Aging Color
    let agingColor = 'text-gray-400';
    if (daysOpen >= settings.agingThresholds.critical) agingColor = 'text-red-600 font-bold';
    else if (daysOpen >= settings.agingThresholds.high) agingColor = 'text-orange-500 font-medium';
    else if (daysOpen >= settings.agingThresholds.medium) agingColor = 'text-blue-500';

    return (
        <div
            ref={drag}
            onClick={onClick}
            className={`bg-white p-4 rounded-lg shadow-sm mb-3 border-l-4 cursor-pointer transition-all hover:shadow-md
                ${isDragging ? 'opacity-50' : 'opacity-100'}
                ${job.priority === 'critical' ? 'border-red-600' :
                    job.priority === 'high' ? 'border-orange-500' :
                        job.priority === 'medium' ? 'border-blue-500' : 'border-gray-300'}`}
        >
            {/* ... (Header) */}
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-gray-800 text-sm">{job.customer.name}</h4>
                <div className="flex flex-col items-end">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize mb-1
                        ${job.priority === 'critical' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                        {job.priority}
                    </span>
                    {daysOpen > 0 && (
                        <span className={`text-[10px] flex items-center ${agingColor}`} title={`Created ${daysOpen} days ago`}>
                            <History className="w-3 h-3 mr-1" />
                            {daysOpen}d
                        </span>
                    )}
                </div>
            </div>

            {/* ... (Rest of Card) */}
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">{(job.request?.description || 'No description')}</p>

            <div className="flex items-center text-xs text-gray-500 mb-2">
                <MapPin className="w-3 h-3 mr-1" />
                <span className="truncate">{job.customer.address}</span>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded">
                <button onClick={incrementTime} className="flex items-center hover:bg-gray-200 rounded px-1 -ml-1 transition-colors" title="Click to add 60m">
                    <Clock className="w-3 h-3 mr-1 text-gray-400" />
                    <span>{job.estimated_duration || 60} min</span>
                </button>
                {job.scheduled_at?.toDate && (
                    <div className="flex items-center text-blue-600 font-medium" title="Scheduled Time">
                        <Calendar className="w-3 h-3 mr-1" />
                        <span>{format((job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)), 'h:mm a')}</span>
                    </div>
                )}
            </div>

            {/* Quick Toggles */}
            <div className="flex justify-between items-center mb-3">
                <button
                    onClick={toggleParts}
                    className={`text-xs px-2 py-1 rounded border flex items-center ${job.parts_needed ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                    title={job.parts_description || "Click to add parts"}
                >
                    <Wrench className="w-3 h-3 mr-1" />
                    {job.parts_needed ? 'Parts' : 'No Parts'}
                </button>
            </div>

            <div className="flex justify-between border-t pt-2 mt-2">
                <div className="flex space-x-2">
                    <button onClick={(e) => handleContact(e, 'phone')} className="text-gray-400 hover:text-green-600" title="Call">
                        <Phone className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => handleContact(e, 'email')} className="text-gray-400 hover:text-blue-600" title="Email">
                        <Mail className="w-4 h-4" />
                    </button>
                </div>
                <button onClick={handleRequestInfo} className="text-blue-600 text-xs font-medium hover:underline flex items-center">
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Request Info
                </button>
            </div>
        </div>
    );
};

const Column = ({ title, id, jobs, onDrop, icon, onOptimize, onJobClick, settings }: { title: string, id: string, jobs: Job[], onDrop: (id: string, targetCol: string) => void, icon?: React.ReactNode, onOptimize?: () => void, onJobClick: (job: Job) => void, settings: SchedulingSettings }) => {
    // ... (drop hook)
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'JOB',
        drop: (item: { id: string }) => onDrop(item.id, id),
        collect: (monitor) => ({
            isOver: !!monitor.isOver(),
        }),
    }));

    return (
        <div ref={drop} className={`flex-1 min-w-[280px] bg-gray-100 rounded-lg p-4 flex flex-col h-full ${isOver ? 'bg-blue-50 ring-2 ring-blue-200' : ''}`}>
            <h3 className="font-bold text-gray-700 mb-4 flex justify-between items-center">
                <div className="flex items-center">
                    {icon && <span className="mr-2">{icon}</span>}
                    {title}
                </div>
                <div className="flex items-center space-x-2">
                    {onOptimize && (
                        <button onClick={onOptimize} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 flex items-center" title="Optimize Route">
                            <Navigation className="w-3 h-3 mr-1" /> Auto
                        </button>
                    )}
                    <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">{jobs.length}</span>
                </div>
            </h3>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {jobs.map(job => <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} settings={settings} />)}
            </div>
        </div>
    );
};

export const KanbanBoard: React.FC = () => {
    // const { user } = useAuth();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [settings, setSettings] = useState<SchedulingSettings>(DEFAULT_SETTINGS);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'jobs'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
            setJobs(jobsData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleDrop = async (jobId: string, targetColId: string) => {
        const job = jobs.find(j => j.id === jobId);
        if (!job) return;

        const jobRef = doc(db, 'jobs', jobId);
        let updates: Partial<Job> = {};

        if (targetColId === 'backlog') {
            updates = { status: 'pending', scheduled_at: null };
        } else if (targetColId === 'today') {
            updates = { status: 'scheduled', scheduled_at: Timestamp.fromDate(new Date()) };
        } else if (targetColId === 'in_progress') {
            updates = { status: 'in_progress' };
        } else if (targetColId === 'done') {
            updates = { status: 'completed', finished_at: Timestamp.fromDate(new Date()) };
        }

        await updateDoc(jobRef, updates);
    };

    const optimizeToday = async () => {
        const todayJobs = jobs.filter(j => j.status === 'scheduled' && j.scheduled_at?.toDate && isToday((j.scheduled_at?.toDate?.() || new Date(j.scheduled_at))));
        if (todayJobs.length === 0) return;

        const location = await getCurrentLocation();

        // Create parts flags from job data
        const partsFlags = todayJobs.reduce((acc, job) => {
            acc[job.id] = job.parts_needed || false;
            return acc;
        }, {} as Record<string, boolean>);

        // Optimize
        const optimizedSchedule = optimizeSchedule(todayJobs, location, partsFlags);

        // Update Firestore
        for (const job of optimizedSchedule) {
            // Skip parts runs for now as they are virtual in this context
            if (job.type === 'parts_run') continue;

            if (job.id && job.scheduled_at) {
                const jobRef = doc(db, 'jobs', job.id);
                await updateDoc(jobRef, {
                    scheduled_at: job.scheduled_at
                });
            }
        }
        toast.success(`Optimized ${todayJobs.length} jobs with new settings!`);
    };

    const smartSort = async () => {
        const backlogJobs = jobs.filter(j => j.status === 'pending');
        const batch = writeBatch(db);
        let hasUpdates = false;

        backlogJobs.forEach(job => {
            const daysOpen = job.createdAt ? differenceInDays(new Date(), job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt)) : 0;
            let newPriority = job.priority;

            // Auto-escalate priority based on aging settings
            if (daysOpen >= settings.agingThresholds.critical && job.priority !== 'critical') {
                newPriority = 'critical';
            } else if (daysOpen >= settings.agingThresholds.high && job.priority !== 'critical' && job.priority !== 'high') {
                newPriority = 'high';
            } else if (daysOpen >= settings.agingThresholds.medium && job.priority === 'low') {
                newPriority = 'medium';
            }

            if (newPriority !== job.priority) {
                const jobRef = doc(db, 'jobs', job.id);
                batch.update(jobRef, { priority: newPriority });
                hasUpdates = true;
            }
        });

        if (hasUpdates) {
            await batch.commit();
            toast.success("Smart Sort: Priorities updated based on aging!");
        } else {
            toast("Smart Sort: No priority changes needed.", { icon: 'ℹ️' });
        }
    };

    // --- Data Filtering ---
    let columns: { id: string, title: string, jobs: Job[], icon?: React.ReactNode, hasOptimize?: boolean }[] = [];

    if (viewMode === 'day') {
        const backlogJobs = jobs.filter(j => j.status === 'pending');
        const todayJobs = jobs.filter(j => j.status === 'scheduled' && j.scheduled_at?.toDate && isToday((j.scheduled_at?.toDate?.() || new Date(j.scheduled_at))));
        const inProgressJobs = jobs.filter(j => j.status === 'in_progress');
        const doneJobs = jobs.filter(j => j.status === 'completed');

        // Sort Today's jobs by time
        todayJobs.sort((a, b) => ((a.scheduled_at?.toDate?.() || new Date(a.scheduled_at)).getTime() || 0) - ((b.scheduled_at?.toDate?.() || new Date(b.scheduled_at)).getTime() || 0));

        // Sort Backlog using weighted score
        backlogJobs.sort((a, b) => {
            const scoreA = getPriorityScore(a, settings);
            const scoreB = getPriorityScore(b, settings);
            return scoreB - scoreA;
        });

        columns = [
            { id: 'backlog', title: 'Backlog', jobs: backlogJobs },
            { id: 'today', title: 'Today', jobs: todayJobs, icon: <span className="text-green-600">📅</span>, hasOptimize: true },
            { id: 'in_progress', title: 'In Progress', jobs: inProgressJobs },
            { id: 'done', title: 'Done', jobs: doneJobs }
        ];
    } else {
        // Week View
        const today = new Date();
        const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 }); // Monday

        const getJobsForDay = (dayIndex: number) => {
            const targetDate = addDays(startOfCurrentWeek, dayIndex);
            return jobs.filter(j => j.status === 'scheduled' && j.scheduled_at?.toDate && isSameDay((j.scheduled_at?.toDate?.() || new Date(j.scheduled_at)), targetDate));
        };

        columns = [
            { id: 'mon', title: 'Monday', jobs: getJobsForDay(0) },
            { id: 'tue', title: 'Tuesday', jobs: getJobsForDay(1) },
            { id: 'wed', title: 'Wednesday', jobs: getJobsForDay(2) },
            { id: 'thu', title: 'Thursday', jobs: getJobsForDay(3) },
            { id: 'fri', title: 'Friday', jobs: getJobsForDay(4) },
        ];
    }

    if (loading) return <div className="p-8">Loading Board...</div>;

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="h-[calc(100vh-80px)] p-4 flex flex-col">
                <header className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Work Board</h1>
                        <p className="text-gray-500 text-sm">Manage your workflow</p>
                    </div>
                    <div className="flex space-x-4">
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                            title="Scheduling Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <div className="bg-gray-100 p-1 rounded-lg flex">
                            <button
                                onClick={() => setViewMode('day')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'day' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Layout className="w-4 h-4 inline-block mr-1" /> Daily
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'week' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <List className="w-4 h-4 inline-block mr-1" /> Weekly
                            </button>
                        </div>
                        {viewMode === 'day' && (
                            <button
                                onClick={smartSort}
                                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                                <AlertCircle className="w-4 h-4 mr-2" />
                                Smart Sort Backlog
                            </button>
                        )}
                    </div>
                </header>

                <div className="flex-1 flex space-x-4 overflow-x-auto pb-4">
                    {columns.map(col => (
                        <Column
                            key={col.id}
                            title={col.title}
                            id={col.id}
                            jobs={col.jobs}
                            onDrop={handleDrop}
                            icon={col.icon}
                            onOptimize={col.hasOptimize ? optimizeToday : undefined}
                            onJobClick={setSelectedJob}
                            settings={settings}
                        />
                    ))}
                </div>

                {selectedJob && (
                    <EditJobModal job={selectedJob} onClose={() => setSelectedJob(null)} />
                )}

                <SchedulingSettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    settings={settings}
                    onSave={setSettings}
                />
            </div>
        </DndProvider>
    );
};
