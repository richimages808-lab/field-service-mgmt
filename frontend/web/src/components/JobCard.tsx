import React from 'react';
import { Job } from '../types';

interface JobCardProps {
    job: Job;
    onAssign: (job: Job) => void;
}

const priorityColors = {
    low: 'bg-gray-200 text-gray-800',
    medium: 'bg-blue-100 text-blue-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
};

export const JobCard: React.FC<JobCardProps> = ({ job, onAssign }) => {
    return (
        <div className="bg-white p-4 rounded shadow mb-4 border-l-4 border-blue-500">
            <div className="flex justify-between items-start mb-2">
                <span className={`text-xs px-2 py-1 rounded font-semibold ${priorityColors[job.priority] || priorityColors.medium}`}>
                    {job.priority.toUpperCase()}
                </span>
                <span className="text-xs text-gray-500">
                    {new Date(job.createdAt.seconds * 1000).toLocaleDateString()}
                </span>
            </div>

            <h3 className="font-bold text-lg mb-1">{job.customer.name}</h3>
            <p className="text-sm text-gray-600 mb-2">{job.customer.address}</p>

            <p className="text-sm text-gray-800 mb-4 line-clamp-2">{(job.request?.description || 'No description')}</p>

            {job.status === 'pending' && (
                <button
                    onClick={() => onAssign(job)}
                    className="w-full bg-blue-600 text-white py-1 rounded text-sm hover:bg-blue-700"
                >
                    Assign Tech
                </button>
            )}

            {job.assigned_tech_name && (
                <div className="text-sm text-gray-500 mt-2">
                    Tech: <span className="font-semibold">{job.assigned_tech_name}</span>
                </div>
            )}
        </div>
    );
};
