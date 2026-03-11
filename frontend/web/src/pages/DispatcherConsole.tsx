import React, { useState, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import { Job, UserProfile } from '../types';
import { UnscheduledList } from '../components/dispatcher/UnscheduledList';
import { TimelineGrid } from '../components/dispatcher/TimelineGrid';
import { TechnicianMap } from '../components/dispatcher/TechnicianMap';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { useAuth } from '../auth/AuthProvider';
import { AddTechnicianModal } from '../components/dispatcher/AddTechnicianModal';

export const DispatcherConsole: React.FC = () => {
    const { user } = useAuth();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [viewDate, setViewDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [showMap, setShowMap] = useState(false);

    const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isAddTechModalOpen, setIsAddTechModalOpen] = useState(false);
    const initialized = React.useRef(false);

    // Import colors for the dropdown
    const ROUTE_COLORS = ['#7c3aed', '#db2777', '#059669', '#d97706', '#2563eb'];

    useEffect(() => {
        if (!user) return;

        // 1. Fetch Technicians
        const usersRef = collection(db, 'users');
        let techQuery;

        const role = user?.role;
        const email = user?.email;
        const orgId = user.org_id || 'demo-org';

        if (role === 'technician') {
            techQuery = query(usersRef, where('email', '==', email), where('org_id', '==', orgId));
        } else {
            techQuery = query(usersRef, where('role', '==', 'technician'), where('org_id', '==', orgId));
        }

        const unsubscribeTechs = onSnapshot(techQuery, (snapshot) => {
            const techs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
            setTechnicians(techs);
        }, (error) => {
            console.error("Error fetching technicians:", error);
            setLoading(false);
        });

        // 2. Fetch Jobs
        const jobsRef = collection(db, 'jobs');
        const jobsQuery = query(jobsRef,
            where('org_id', '==', orgId),
            where('status', 'in', ['pending', 'scheduled', 'in_progress'])
        );

        const unsubscribeJobs = onSnapshot(jobsQuery, (snapshot) => {
            const fetchedJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
            setJobs(fetchedJobs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching jobs:", error);
            setLoading(false);
        });

        return () => {
            unsubscribeTechs();
            unsubscribeJobs();
        };
    }, [user]);

    // Initialize selected techs
    useEffect(() => {
        if (!initialized.current && technicians.length > 0) {
            setSelectedTechIds(technicians.map(t => t.id));
            initialized.current = true;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [technicians]);

    const toggleTech = (techId: string) => {
        setSelectedTechIds(prev =>
            prev.includes(techId)
                ? prev.filter(id => id !== techId)
                : [...prev, techId]
        );
    };

    const handleJobDrop = async (jobId: string, techId: string, startTime: Date) => {
        const tech = technicians.find(t => t.id === techId);
        if (!tech) return;

        // Conflict Detection
        const jobDuration = 60; // Default 60 mins, should get from job
        const endTime = new Date(startTime.getTime() + jobDuration * 60000);

        const hasConflict = jobs.some(j => {
            if (j.assigned_tech_id !== techId || j.id === jobId || !j.scheduled_at?.toDate) return false;
            const jStart = j.scheduled_at.toDate();
            const jEnd = new Date(jStart.getTime() + (j.estimated_duration || 60) * 60000);

            // Check overlap
            return (startTime < jEnd && endTime > jStart);
        });

        if (hasConflict) {
            toast.error("This time slot overlaps with another job!", { duration: 4000 });
            return;
        }

        try {
            const jobRef = doc(db, 'jobs', jobId);
            await updateDoc(jobRef, {
                assigned_tech_id: techId,
                assigned_tech_name: tech.name,
                scheduled_at: Timestamp.fromDate(startTime),
                status: 'scheduled'
            });
            toast.success(`Job scheduled for ${tech.name} at ${format(startTime, 'h:mm a')}`);
        } catch (error) {
            console.error("Error scheduling job:", error);
            toast.error("Failed to schedule job. Please try again.");
        }
    };

    if (loading) return <div className="p-8 flex items-center justify-center h-screen">Loading Dispatch Console...</div>;

    const unscheduledJobs = jobs.filter(j => j.status === 'pending');

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-100">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shadow-sm z-20">
                    <h1 className="text-xl font-bold text-gray-800 flex items-center">
                        <CalendarIcon className="w-5 h-5 mr-2 text-indigo-600" />
                        Dispatcher Console
                    </h1>

                    <div className="flex items-center space-x-4 bg-gray-50 rounded-lg p-1 border border-gray-200">
                        <button onClick={() => setViewDate(subDays(viewDate, 1))} className="p-1 hover:bg-white rounded shadow-sm transition-all">
                            <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <span className="font-medium text-gray-700 w-32 text-center">
                            {isToday(viewDate) ? "Today" : format(viewDate, 'MMM d, yyyy')}
                        </span>
                        <button onClick={() => setViewDate(addDays(viewDate, 1))} className="p-1 hover:bg-white rounded shadow-sm transition-all">
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>

                    <div className="flex items-center space-x-4">
                        {/* Debug Info */}
                        <div className="hidden md:flex flex-col items-end mr-2">
                            <span className="text-xs text-gray-500">{(user as any)?.email}</span>
                            <span className="text-xs font-bold text-gray-400 uppercase">{(user as any)?.role || 'Unknown Role'}</span>
                        </div>

                        <button
                            onClick={async () => {
                                if (window.confirm("Generate test data? This will clear existing data.")) {
                                    try {
                                        setLoading(true);
                                        const { seedData } = await import('../lib/seeding');
                                        await seedData(user?.uid);
                                        window.location.reload();
                                    } catch (error) {
                                        console.error("Seeding failed:", error);
                                        alert("Failed to seed data. Check console for details.");
                                        setLoading(false);
                                    }
                                }
                            }}
                            className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
                        >
                            Seed Data
                        </button>

                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setShowMap(false)}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${!showMap ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Timeline
                            </button>
                            <button
                                onClick={() => setShowMap(true)}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${showMap ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Map
                            </button>
                        </div>

                        {/* Tech Filter Dropdown */}
                        <div className="relative border-l pl-4 border-gray-300 ml-4">
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className="flex items-center space-x-2 px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                <span>{selectedTechIds.length} Techs</span>
                                <ChevronLeft className={`w-4 h-4 transition-transform ${isFilterOpen ? '-rotate-90' : 'rotate-0'}`} />
                            </button>

                            {isFilterOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)} />
                                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 p-2 max-h-80 overflow-y-auto z-20">
                                        <div className="mb-2 pb-2 border-b border-gray-100 flex justify-between items-center">
                                            <div className="space-x-2">
                                                <button
                                                    onClick={() => setSelectedTechIds(technicians.map(t => t.id))}
                                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                                >
                                                    All
                                                </button>
                                                <span className="text-gray-300">|</span>
                                                <button
                                                    onClick={() => setSelectedTechIds([])}
                                                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                                                >
                                                    None
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setIsFilterOpen(false);
                                                    setIsAddTechModalOpen(true);
                                                }}
                                                className="flex items-center space-x-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-100"
                                            >
                                                <Plus className="w-3 h-3" />
                                                <span>Add Tech</span>
                                            </button>
                                        </div>
                                        <div className="space-y-1">
                                            {technicians.map((tech, index) => (
                                                <label key={tech.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedTechIds.includes(tech.id)}
                                                        onChange={() => toggleTech(tech.id)}
                                                        className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300"
                                                    />
                                                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }} />
                                                        <span className="text-sm text-gray-700 truncate font-medium">{tech.name}</span>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: Unscheduled Jobs */}
                    <div className="w-80 flex-shrink-0 z-10 shadow-lg bg-white border-r border-gray-200">
                        <UnscheduledList jobs={unscheduledJobs} />
                    </div>

                    {/* Right Panel: Timeline or Map */}
                    <div className="flex-1 overflow-hidden relative bg-gray-50">
                        {showMap ? (
                            <TechnicianMap
                                technicians={technicians}
                                jobs={jobs}
                                viewDate={viewDate}
                                selectedTechIds={selectedTechIds}
                            />
                        ) : (
                            <TimelineGrid
                                technicians={technicians}
                                jobs={jobs}
                                viewDate={viewDate}
                                onJobDrop={handleJobDrop}
                                selectedTechIds={selectedTechIds}
                            />
                        )}
                    </div>
                </div>

                <AddTechnicianModal
                    isOpen={isAddTechModalOpen}
                    onClose={() => setIsAddTechModalOpen(false)}
                />
            </div>
        </DndProvider>
    );
};
