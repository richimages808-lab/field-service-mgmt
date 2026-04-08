import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { DndProvider, useDrag } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Job, UserProfile } from '../types';
import { useAuth } from '../auth/AuthProvider';

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

// Draggable Job Item
const DraggableJob = ({ job }: { job: Job }) => {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'JOB',
        item: { id: job.id },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }));

    return (
        <div
            ref={drag}
            className={`p-3 mb-2 bg-white rounded shadow cursor-move border-l-4 ${job.priority === 'high' ? 'border-red-500' : 'border-blue-500'
                } ${isDragging ? 'opacity-50' : 'opacity-100'}`}
        >
            <div className="font-bold text-sm">{job.customer.name}</div>
            <div className="text-xs text-gray-600 truncate">{(job.request?.description || 'No description')}</div>
            <div className="text-xs text-gray-500 mt-1">{job.priority}</div>
        </div>
    );
};

export const ScheduleBoard: React.FC = () => {
    const { user } = useAuth();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [techs, setTechs] = useState<UserProfile[]>([]);
    const [events, setEvents] = useState<any[]>([]);

    useEffect(() => {
        if (!user) return;
        const orgId = 'demo-org';

        // Fetch Jobs
        const jobsRef = collection(db, 'jobs');
        const q = query(jobsRef, where('org_id', '==', orgId));
        const unsubscribeJobs = onSnapshot(q, (snapshot) => {
            const jobList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
            setJobs(jobList);

            // Convert scheduled jobs to calendar events
            const calendarEvents = jobList
                .filter(j => j.status === 'scheduled' && j.scheduled_at)
                .map(j => ({
                    id: j.id,
                    title: `${j.customer.name} - ${j.assigned_tech_name}`,
                    start: (j.scheduled_at?.toDate?.() || new Date(j.scheduled_at)),
                    end: new Date((j.scheduled_at?.toDate?.() || new Date(j.scheduled_at)).getTime() + (j.estimated_duration || 60) * 60000),
                    resourceId: j.assigned_tech_id,
                    status: j.status
                }));
            setEvents(calendarEvents);
        });

        // Fetch Techs
        const usersRef = collection(db, 'users');
        const usersQ = query(usersRef, where('org_id', '==', orgId), where('role', '==', 'technician'));
        const unsubscribeTechs = onSnapshot(usersQ, (snapshot) => {
            const techList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
            setTechs(techList);
        });

        return () => {
            unsubscribeJobs();
            unsubscribeTechs();
        };
    }, [user]);

    const handleDrop = async (item: { id: string }, start: Date, resourceId?: string) => {
        const job = jobs.find(j => j.id === item.id);
        if (!job) return;

        const tech = techs.find(t => t.id === resourceId);

        try {
            const jobRef = doc(db, 'jobs', item.id);
            await updateDoc(jobRef, {
                status: 'scheduled',
                scheduled_at: start,
                assigned_tech_id: resourceId || job.assigned_tech_id, // Keep existing if dropping on time only
                assigned_tech_name: tech ? tech.name : job.assigned_tech_name
            });
        } catch (error) {
            console.error("Error updating job schedule:", error);
        }
    };

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="flex h-screen bg-gray-100">
                {/* Sidebar: Unassigned Jobs */}
                <div className="w-80 bg-white shadow-lg p-4 overflow-y-auto">
                    <h2 className="text-xl font-bold mb-4 text-gray-800">Unassigned Jobs</h2>
                    <div className="space-y-2">
                        {jobs.filter(j => j.status === 'pending').map(job => (
                            <DraggableJob key={job.id} job={job} />
                        ))}
                        {jobs.filter(j => j.status === 'pending').length === 0 && (
                            <p className="text-gray-500 text-sm">No unassigned jobs.</p>
                        )}
                    </div>
                </div>

                {/* Main Content: Calendar */}
                <div className="flex-1 p-4">
                    <div className="bg-white rounded-lg shadow h-full p-4">
                        <h2 className="text-2xl font-bold mb-4 text-gray-800">Schedule Board</h2>
                        <div style={{ height: 'calc(100% - 60px)' }}>
                            <Calendar
                                localizer={localizer}
                                events={events}
                                startAccessor="start"
                                endAccessor="end"
                                defaultView="week"
                                views={['month', 'week', 'day']}
                                onSelectEvent={(event) => alert(`${event.title}\n${event.start.toLocaleString()}`)}
                                onSelectSlot={(slotInfo) => {
                                    // Simple assignment flow for MVP
                                    const unassigned = jobs.filter(j => j.status === 'pending');
                                    if (unassigned.length === 0) {
                                        alert("No unassigned jobs to schedule.");
                                        return;
                                    }

                                    // In a real app, this would be a nice modal
                                    const jobIndex = parseInt(prompt(`Select Job to Schedule:\n${unassigned.map((j, i) => `${i}: ${j.customer.name} (${j.priority})`).join('\n')}`) || '-1');

                                    if (jobIndex >= 0 && jobIndex < unassigned.length) {
                                        const job = unassigned[jobIndex];
                                        // Select Tech
                                        const techIndex = parseInt(prompt(`Select Technician:\n${techs.map((t, i) => `${i}: ${t.name}`).join('\n')}`) || '0');
                                        if (techIndex >= 0 && techIndex < techs.length) {
                                            handleDrop({ id: job.id }, slotInfo.start as Date, techs[techIndex].id);
                                        }
                                    }
                                }}
                                selectable
                                min={new Date(0, 0, 0, 6, 0, 0)}
                                max={new Date(0, 0, 0, 22, 0, 0)}
                                step={30}
                                timeslots={2}
                                dayLayoutAlgorithm="no-overlap"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </DndProvider>
    );
};
