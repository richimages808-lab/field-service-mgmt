import React from 'react';
import { useDrop } from 'react-dnd';
import { Job, UserProfile } from '../../types';
import { format, addMinutes, startOfDay, setHours, setMinutes, differenceInMinutes, isSameDay } from 'date-fns';

interface TimelineGridProps {
    technicians: UserProfile[];
    jobs: Job[];
    viewDate: Date;
    onJobDrop: (jobId: string, techId: string, startTime: Date) => void;
    selectedTechIds: string[];
}

const TIME_SLOTS_START = 8; // 8 AM
const TIME_SLOTS_END = 18; // 6 PM
const SLOT_DURATION = 30; // Minutes

export const TimelineGrid: React.FC<TimelineGridProps> = ({ technicians, jobs, viewDate, onJobDrop, selectedTechIds }) => {
    // Generate Time Slots
    const timeSlots: Date[] = [];
    let currentTime = setMinutes(setHours(startOfDay(viewDate), TIME_SLOTS_START), 0);
    const endTime = setMinutes(setHours(startOfDay(viewDate), TIME_SLOTS_END), 0);

    while (currentTime < endTime) {
        timeSlots.push(currentTime);
        currentTime = addMinutes(currentTime, SLOT_DURATION);
    }

    // Filter technicians
    const visibleTechnicians = technicians.filter(tech => selectedTechIds.includes(tech.id));

    return (
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-white flex flex-col h-full">
            {/* Header Row (Time) */}
            <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
                <div className="w-48 flex-shrink-0 p-3 font-bold text-gray-700 bg-gray-50 border-r border-gray-200">
                    Technicians
                </div>
                <div className="flex-1 flex">
                    {timeSlots.map((slot, index) => (
                        <div key={index} className="flex-1 min-w-[60px] border-r border-gray-100 p-2 text-xs text-gray-500 text-center">
                            {format(slot, 'h:mm a')}
                        </div>
                    ))}
                </div>
            </div>

            {/* Technician Rows */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {visibleTechnicians.map(tech => (
                    <TechnicianRow
                        key={tech.id}
                        tech={tech}
                        timeSlots={timeSlots}
                        jobs={jobs.filter(j => j.assigned_tech_id === tech.id && j.scheduled_at?.toDate && isSameDay(j.scheduled_at.toDate(), viewDate))}
                        onJobDrop={onJobDrop}
                    />
                ))}
            </div>
        </div>
    );
};

const TechnicianRow = ({ tech, timeSlots, jobs, onJobDrop }: { tech: UserProfile, timeSlots: Date[], jobs: Job[], onJobDrop: (jobId: string, techId: string, startTime: Date) => void }) => {
    return (
        <div className="flex border-b border-gray-100 h-20 relative group hover:bg-gray-50 transition-colors">
            {/* Tech Name */}
            <div className="w-48 flex-shrink-0 p-3 border-r border-gray-200 flex items-center">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold mr-3">
                    {tech.name.charAt(0)}
                </div>
                <div>
                    <div className="text-sm font-medium text-gray-900">{tech.name}</div>
                    <div className="text-xs text-gray-500 capitalize">{tech.role}</div>
                </div>
            </div>

            {/* Time Slots */}
            <div className="flex-1 flex relative">
                {timeSlots.map((slot, index) => (
                    <TimeSlotCell
                        key={index}
                        slot={slot}
                        techId={tech.id}
                        onDrop={onJobDrop}
                    />
                ))}

                {/* Render Scheduled Jobs Overlay */}
                {jobs.map(job => {
                    if (!job.scheduled_at?.toDate) return null;
                    const startTime = job.scheduled_at.toDate();
                    const startMinutes = differenceInMinutes(startTime, setMinutes(setHours(startTime, TIME_SLOTS_START), 0));
                    const duration = job.estimated_duration || 60;

                    // Calculate positioning (assuming 60px min-width per 30 min slot)
                    // This is a simplified calculation; for production, use exact pixel widths or grid columns
                    // Here we use percentage based on total slots
                    const totalMinutes = (TIME_SLOTS_END - TIME_SLOTS_START) * 60;
                    const leftPercent = (startMinutes / totalMinutes) * 100;
                    const widthPercent = (duration / totalMinutes) * 100;

                    return (
                        <div
                            key={job.id}
                            className={`absolute top-2 bottom-2 rounded-md shadow-sm p-2 text-xs text-white overflow-hidden cursor-pointer hover:brightness-110 transition-all
                                ${job.status === 'completed' ? 'bg-green-500' :
                                    job.status === 'in_progress' ? 'bg-blue-500' : 'bg-indigo-500'}`}
                            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                            title={`${job.customer.name} - ${format(startTime, 'h:mm a')}`}
                        >
                            <div className="font-bold truncate">{job.customer.name}</div>
                            <div className="truncate opacity-90">{job.request.description}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const TimeSlotCell = ({ slot, techId, onDrop }: { slot: Date, techId: string, onDrop: (jobId: string, techId: string, startTime: Date) => void }) => {
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'JOB',
        drop: (item: { id: string }) => onDrop(item.id, techId, slot),
        collect: (monitor) => ({
            isOver: !!monitor.isOver(),
        }),
    }));

    return (
        <div
            ref={drop}
            className={`flex-1 min-w-[60px] border-r border-gray-100 h-full transition-colors
                ${isOver ? 'bg-green-50' : ''}`}
        />
    );
};
