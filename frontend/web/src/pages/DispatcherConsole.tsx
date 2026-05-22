import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import { Job, UserProfile } from '../types';
import { UnscheduledList } from '../components/dispatcher/UnscheduledList';
import { TimelineGrid } from '../components/dispatcher/TimelineGrid';
import { TechnicianMap } from '../components/dispatcher/TechnicianMap';
import { TechStatusPanel } from '../components/dispatcher/TechStatusPanel';
import { AssignTechModal } from '../components/AssignTechModal';
import { AddTechnicianModal } from '../components/dispatcher/AddTechnicianModal';
import { getAutoAssignment } from '../lib/techMatchingEngine';
import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus,
    AlertCircle, Users, Clock, CheckCircle, MapIcon
} from 'lucide-react';
import { format, addDays, subDays, isToday, isSameDay } from 'date-fns';
import { useAuth } from '../auth/AuthProvider';

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
    const [isTechPanelOpen, setIsTechPanelOpen] = useState(true);

    // Quick assign modal state
    const [assignModalJob, setAssignModalJob] = useState<Job | null>(null);

    const initialized = React.useRef(false);

    const ROUTE_COLORS = ['#7c3aed', '#db2777', '#059669', '#d97706', '#2563eb'];

    // ========================================================================
    // Data Fetching
    // ========================================================================
    useEffect(() => {
        if (!user) return;

        const orgId = user.org_id || 'demo-org';
        const role = user?.role;
        const email = user?.email;

        // 1. Fetch Technicians
        const usersRef = collection(db, 'users');
        let techQuery;
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

    // ========================================================================
    // Keyboard Shortcuts
    // ========================================================================
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if user is in an input
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    setViewDate(prev => subDays(prev, 1));
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    setViewDate(prev => addDays(prev, 1));
                    break;
                case 't':
                case 'T':
                    e.preventDefault();
                    setShowMap(prev => !prev);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ========================================================================
    // KPI Stats
    // ========================================================================
    const kpiStats = useMemo(() => {
        const unassigned = jobs.filter(j => j.status === 'pending').length;
        const todayScheduled = jobs.filter(j =>
            j.status === 'scheduled' &&
            j.scheduled_at &&
            isSameDay(j.scheduled_at?.toDate ? j.scheduled_at.toDate() : new Date(j.scheduled_at), viewDate)
        ).length;
        const inProgress = jobs.filter(j => j.status === 'in_progress').length;
        const availableTechs = technicians.filter(t => t.status !== 'inactive').length;

        // Check for scheduling conflicts
        let conflicts = 0;
        for (const tech of technicians) {
            const techJobs = jobs.filter(j =>
                j.assigned_tech_id === tech.id &&
                j.scheduled_at &&
                ['scheduled', 'in_progress'].includes(j.status)
            );
            for (let i = 0; i < techJobs.length; i++) {
                for (let k = i + 1; k < techJobs.length; k++) {
                    const a = techJobs[i];
                    const b = techJobs[k];
                    const aStart = a.scheduled_at?.toDate ? a.scheduled_at.toDate() : new Date(a.scheduled_at);
                    const bStart = b.scheduled_at?.toDate ? b.scheduled_at.toDate() : new Date(b.scheduled_at);
                    const aEnd = new Date(aStart.getTime() + (a.estimated_duration || 60) * 60000);
                    const bEnd = new Date(bStart.getTime() + (b.estimated_duration || 60) * 60000);
                    if (aStart < bEnd && aEnd > bStart) conflicts++;
                }
            }
        }

        return { unassigned, todayScheduled, inProgress, availableTechs, conflicts };
    }, [jobs, technicians, viewDate]);

    // ========================================================================
    // Handlers
    // ========================================================================
    const toggleTech = (techId: string) => {
        setSelectedTechIds(prev =>
            prev.includes(techId)
                ? prev.filter(id => id !== techId)
                : [...prev, techId]
        );
    };

    const handleJobDrop = async (jobId: string, techId: string, startTime: Date) => {
        const tech = technicians.find(t => t.id === techId);
        const job = jobs.find(j => j.id === jobId);
        if (!tech || !job) return;

        // Use actual job duration instead of hardcoded 60
        const jobDuration = job.estimated_duration || 60;
        const endTime = new Date(startTime.getTime() + jobDuration * 60000);

        const hasConflict = jobs.some(j => {
            if (j.assigned_tech_id !== techId || j.id === jobId || !j.scheduled_at?.toDate) return false;
            const jStart = (j.scheduled_at?.toDate?.() || new Date(j.scheduled_at));
            const jEnd = new Date(jStart.getTime() + (j.estimated_duration || 60) * 60000);
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

    const handleQuickAssign = useCallback((job: Job) => {
        setAssignModalJob(job);
    }, []);

    const handleAutoAssignFromPanel = useCallback((techId: string) => {
        const unscheduled = jobs.filter(j => j.status === 'pending');
        if (unscheduled.length === 0) {
            toast.error('No unscheduled jobs to assign');
            return;
        }
        // Pick the highest priority unscheduled job
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const sorted = [...unscheduled].sort((a, b) =>
            (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
        );
        const nextJob = sorted[0];
        const result = getAutoAssignment(technicians, nextJob, jobs, viewDate);
        if (result) {
            handleJobDrop(nextJob.id, techId, result.slot.start);
        } else {
            toast.error('No available time slots for this technician today');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobs, technicians, viewDate]);

    const handleAssignFromModal = async (techId: string, techName: string, scheduledTime?: Date) => {
        if (!assignModalJob) return;
        if (scheduledTime) {
            await handleJobDrop(assignModalJob.id, techId, scheduledTime);
        } else {
            // Assign without specific time — auto-pick earliest slot
            const result = getAutoAssignment(technicians, assignModalJob, jobs, viewDate);
            if (result) {
                await handleJobDrop(assignModalJob.id, techId, result.slot.start);
            } else {
                // Fallback: assign at 9 AM
                const fallbackTime = new Date(viewDate);
                fallbackTime.setHours(9, 0, 0, 0);
                await handleJobDrop(assignModalJob.id, techId, fallbackTime);
            }
        }
        setAssignModalJob(null);
    };

    // ========================================================================
    // Render
    // ========================================================================
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <div className="text-center space-y-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent mx-auto" />
                    <p className="text-gray-500 font-medium">Loading Dispatch Console...</p>
                </div>
            </div>
        );
    }

    const unscheduledJobs = jobs.filter(j => j.status === 'pending');

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="flex flex-col h-[calc(100vh-48px)] bg-gray-100">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 px-5 py-2.5 flex justify-between items-center shadow-sm z-20">
                    <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-blue-600" />
                        Dispatch Console
                    </h1>

                    {/* Date Navigator */}
                    <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-0.5 border border-gray-200">
                        <button onClick={() => setViewDate(subDays(viewDate, 1))} className="p-1.5 hover:bg-white rounded transition-all" title="Previous day (← key)">
                            <ChevronLeft className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                            onClick={() => setViewDate(new Date())}
                            className={`px-3 py-1 text-sm font-medium rounded transition-all ${
                                isToday(viewDate) ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-white'
                            }`}
                        >
                            Today
                        </button>
                        <span className="font-medium text-gray-700 w-28 text-center text-sm">
                            {format(viewDate, 'MMM d, yyyy')}
                        </span>
                        <button onClick={() => setViewDate(addDays(viewDate, 1))} className="p-1.5 hover:bg-white rounded transition-all" title="Next day (→ key)">
                            <ChevronRight className="w-4 h-4 text-gray-600" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* View Toggle */}
                        <div className="flex bg-gray-100 p-0.5 rounded-lg">
                            <button
                                onClick={() => setShowMap(false)}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${!showMap ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                title="Timeline view (T key)"
                            >
                                Timeline
                            </button>
                            <button
                                onClick={() => setShowMap(true)}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${showMap ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                title="Map view (T key)"
                            >
                                Map
                            </button>
                        </div>

                        {/* Tech Filter Dropdown */}
                        <div className="relative border-l pl-3 border-gray-200">
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                <Users className="w-4 h-4 text-gray-400" />
                                <span>{selectedTechIds.length} Tech{selectedTechIds.length !== 1 ? 's' : ''}</span>
                                <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${isFilterOpen ? '-rotate-90' : 'rotate-0'}`} />
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
                                                className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100"
                                            >
                                                <Plus className="w-3 h-3" />
                                                <span>Add Tech</span>
                                            </button>
                                        </div>
                                        <div className="space-y-0.5">
                                            {technicians.map((tech, index) => {
                                                const techJobCount = jobs.filter(j =>
                                                    j.assigned_tech_id === tech.id &&
                                                    ['scheduled', 'in_progress'].includes(j.status) &&
                                                    j.scheduled_at &&
                                                    isSameDay(j.scheduled_at?.toDate ? j.scheduled_at.toDate() : new Date(j.scheduled_at), viewDate)
                                                ).length;
                                                const isActive = tech.status !== 'inactive';

                                                return (
                                                    <label key={tech.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedTechIds.includes(tech.id)}
                                                            onChange={() => toggleTech(tech.id)}
                                                            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300"
                                                        />
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }} />
                                                            <span className="text-sm text-gray-700 truncate font-medium">{tech.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] text-gray-400 font-medium">{techJobCount} jobs</span>
                                                            <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* KPI Stats Bar */}
                <div className="bg-white border-b border-gray-200 px-5 py-1.5 flex items-center gap-5 text-xs">
                    <KpiStat
                        icon={<AlertCircle className="w-3.5 h-3.5" />}
                        label="Unassigned"
                        value={kpiStats.unassigned}
                        color={kpiStats.unassigned > 0 ? 'text-orange-600' : 'text-green-600'}
                        bgColor={kpiStats.unassigned > 0 ? 'bg-orange-50' : 'bg-green-50'}
                    />
                    <div className="w-px h-5 bg-gray-200" />
                    <KpiStat
                        icon={<CheckCircle className="w-3.5 h-3.5" />}
                        label="Scheduled Today"
                        value={kpiStats.todayScheduled}
                        color="text-blue-600"
                        bgColor="bg-blue-50"
                    />
                    <div className="w-px h-5 bg-gray-200" />
                    <KpiStat
                        icon={<Clock className="w-3.5 h-3.5" />}
                        label="In Progress"
                        value={kpiStats.inProgress}
                        color="text-green-600"
                        bgColor="bg-green-50"
                    />
                    <div className="w-px h-5 bg-gray-200" />
                    <KpiStat
                        icon={<Users className="w-3.5 h-3.5" />}
                        label="Techs"
                        value={kpiStats.availableTechs}
                        color="text-indigo-600"
                        bgColor="bg-indigo-50"
                    />
                    {kpiStats.conflicts > 0 && (
                        <>
                            <div className="w-px h-5 bg-gray-200" />
                            <KpiStat
                                icon={<AlertCircle className="w-3.5 h-3.5" />}
                                label="Conflicts"
                                value={kpiStats.conflicts}
                                color="text-red-600"
                                bgColor="bg-red-50"
                                pulse
                            />
                        </>
                    )}
                </div>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: Unscheduled Jobs */}
                    <div className="w-72 xl:w-96 flex-shrink-0 z-10 shadow-lg bg-white border-r border-gray-200">
                        <UnscheduledList
                            jobs={unscheduledJobs}
                            onQuickAssign={handleQuickAssign}
                        />
                    </div>

                    {/* Center Panel: Timeline or Map */}
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

                    {/* Right Panel: Tech Status */}
                    <TechStatusPanel
                        technicians={technicians}
                        jobs={jobs}
                        viewDate={viewDate}
                        isCollapsed={!isTechPanelOpen}
                        onToggleCollapse={() => setIsTechPanelOpen(prev => !prev)}
                        onQuickAssign={handleAutoAssignFromPanel}
                    />
                </div>

                {/* Modals */}
                <AddTechnicianModal
                    isOpen={isAddTechModalOpen}
                    onClose={() => setIsAddTechModalOpen(false)}
                />

                <AssignTechModal
                    job={assignModalJob}
                    isOpen={!!assignModalJob}
                    onClose={() => setAssignModalJob(null)}
                    onAssign={handleAssignFromModal}
                    technicians={technicians}
                    allJobs={jobs}
                    targetDate={viewDate}
                />
            </div>
        </DndProvider>
    );
};

// ============================================================================
// KPI Stat Pill
// ============================================================================
const KpiStat = ({
    icon, label, value, color, bgColor, pulse
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    color: string;
    bgColor: string;
    pulse?: boolean;
}) => (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${bgColor} ${color} ${pulse ? 'animate-pulse' : ''}`}>
        {icon}
        <span className="font-bold">{value}</span>
        <span className="text-gray-500 font-medium">{label}</span>
    </div>
);
