import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { AvgJobMetricsData } from '../../../services/ReportingService';
import { Loader2, Clock, DollarSign } from 'lucide-react';

interface AvgJobMetricsWidgetProps {
    data: AvgJobMetricsData[];
    loading: boolean;
    onDrillDown?: (category: string) => void;
}

export const AvgJobMetricsWidget: React.FC<AvgJobMetricsWidgetProps> = ({ data, loading, onDrillDown }) => {
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
                No completed jobs for this period
            </div>
        );
    }

    const totalJobs = data.reduce((s, d) => s + d.jobCount, 0);
    const weightedDuration = data.reduce((s, d) => s + d.avgDurationMinutes * d.jobCount, 0);
    const weightedValue = data.reduce((s, d) => s + d.avgValue * d.jobCount, 0);
    const globalAvgDuration = totalJobs > 0 ? Math.round(weightedDuration / totalJobs) : 0;
    const globalAvgValue = totalJobs > 0 ? Math.round((weightedValue / totalJobs) * 100) / 100 : 0;

    const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6b7280'];

    return (
        <div className="h-full flex flex-col gap-3">
            <div className="flex gap-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                        <div className="text-lg font-bold text-gray-900">{globalAvgDuration} min</div>
                        <div className="text-[10px] text-gray-500">Avg Duration</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                        <div className="text-lg font-bold text-gray-900">${globalAvgValue.toLocaleString()}</div>
                        <div className="text-[10px] text-gray-500">Avg Job Value</div>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={(val) => `${val}m`} axisLine={false} tickLine={false} />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', fontSize: '12px' }}
                            formatter={(val: number, name: string, props: any) => [
                                `${val} min (${props.payload.jobCount} jobs, avg $${props.payload.avgValue.toFixed(0)})`,
                                'Avg Duration'
                            ]}
                        />
                        <Bar
                            dataKey="avgDurationMinutes"
                            name="Avg Duration (min)"
                            radius={[6, 6, 0, 0]}
                            barSize={28}
                            cursor={onDrillDown ? 'pointer' : 'default'}
                            onClick={(entry: any) => onDrillDown?.(entry.category)}
                        >
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {onDrillDown && <div className="text-[10px] text-gray-400 text-center">Click a bar to view jobs</div>}
        </div>
    );
};
