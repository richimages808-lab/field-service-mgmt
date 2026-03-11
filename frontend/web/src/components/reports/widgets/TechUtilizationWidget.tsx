import React from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { TechUtilizationData } from '../../../services/ReportingService';
import { Loader2 } from 'lucide-react';

interface TechUtilizationWidgetProps {
    data: TechUtilizationData[];
    loading: boolean;
    onDrillDown?: (techName: string) => void;
}

export const TechUtilizationWidget: React.FC<TechUtilizationWidgetProps> = ({ data, loading, onDrillDown }) => {
    if (loading && !data.length) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin w-8 h-8 text-gray-400" />
            </div>
        );
    }

    return (
        <div className="h-full w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="techName" type="category" width={100} tick={{ fontSize: 12, fill: '#4B5563', fontWeight: 500 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar
                        dataKey="completedJobs"
                        fill="#8b5cf6"
                        name="Completed Jobs"
                        radius={[0, 4, 4, 0]}
                        barSize={32}
                        cursor={onDrillDown ? 'pointer' : 'default'}
                        onClick={(entry: any) => onDrillDown?.(entry.techName)}
                    />
                </BarChart>
            </ResponsiveContainer>
            {onDrillDown && <div className="text-[10px] text-gray-400 text-center mt-1">Click a bar to view jobs</div>}
        </div>
    );
};
