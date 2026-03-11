import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { JobPipelineData } from '../../../services/ReportingService';
import { Loader2 } from 'lucide-react';

interface JobPipelineWidgetProps {
    data: JobPipelineData[];
    loading: boolean;
    onDrillDown?: (status: string) => void;
}

export const JobPipelineWidget: React.FC<JobPipelineWidgetProps> = ({ data, loading, onDrillDown }) => {
    if (loading && !data.length) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin w-8 h-8 text-gray-400" />
            </div>
        );
    }

    if (!data.length) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                No job data for this period
            </div>
        );
    }

    const total = data.reduce((sum, d) => sum + d.count, 0);

    return (
        <div className="h-full flex flex-col gap-3">
            <div className="text-xs text-gray-500 font-medium">
                {total} total jobs{onDrillDown && <span className="text-gray-400 ml-1">· click a bar to drill down</span>}
            </div>
            <div className="flex-1 min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                        <YAxis
                            dataKey="status"
                            type="category"
                            width={95}
                            tick={{ fontSize: 11, fill: '#4B5563', fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: '#F3F4F6' }}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                            formatter={(val: number) => [val, 'Jobs']}
                        />
                        <Bar
                            dataKey="count"
                            radius={[0, 6, 6, 0]}
                            barSize={20}
                            cursor={onDrillDown ? 'pointer' : 'default'}
                            onClick={(entry: any) => onDrillDown?.(entry.status)}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
