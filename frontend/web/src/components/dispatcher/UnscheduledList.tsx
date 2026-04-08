import React from 'react';
import { useDrag } from 'react-dnd';
import { Job } from '../../types';
import { MapPin, Clock, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface UnscheduledListProps {
    jobs: Job[];
}

const DraggableJobCard = ({ job }: { job: Job }) => {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'JOB',
        item: { id: job.id, type: 'UNSCHEDULED' },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }));

    return (
        <div
            ref={drag}
            className={`bg-white p-3 rounded-lg shadow-sm mb-2 border-l-4 cursor-move hover:shadow-md transition-all
                ${isDragging ? 'opacity-50' : 'opacity-100'}
                ${job.priority === 'critical' ? 'border-red-500' :
                    job.priority === 'high' ? 'border-orange-500' :
                        job.priority === 'medium' ? 'border-blue-500' : 'border-gray-300'}`}
        >
            <div className="flex justify-between items-start mb-1">
                <h4 className="font-bold text-gray-800 text-sm truncate">{job.customer.name}</h4>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize
                    ${job.priority === 'critical' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                    {job.priority}
                </span>
            </div>
            <p className="text-xs text-gray-600 mb-2 line-clamp-2">{job.request?.description || 'No description'}</p>

            <div className="flex items-center text-xs text-gray-500 mb-1">
                <MapPin className="w-3 h-3 mr-1" />
                <span className="truncate">{job.customer.address}</span>
            </div>

            <div className="flex justify-between items-center text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
                <div className="flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {job.estimated_duration || 60}m
                </div>
                {(() => {
                    if (!job.createdAt) return null;
                    const date = job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt);
                    if (!(date instanceof Date) || isNaN(date.getTime())) return null;
                    return (
                        <div className="flex items-center" title="Created">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {formatDistanceToNow(date)} ago
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

export const UnscheduledList: React.FC<UnscheduledListProps> = ({ jobs }) => {
    return (
        <div className="h-full flex flex-col bg-gray-50 border-r border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-white">
                <h2 className="font-bold text-gray-700 flex justify-between items-center">
                    Unscheduled Jobs
                    <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">{jobs.length}</span>
                </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {jobs.length === 0 ? (
                    <div className="text-center text-gray-400 mt-10 text-sm">
                        No pending jobs.
                    </div>
                ) : (
                    jobs.map(job => <DraggableJobCard key={job.id} job={job} />)
                )}
            </div>
        </div>
    );
};
