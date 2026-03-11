import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { JobSourceData } from '../../../services/ReportingService';
import { Loader2 } from 'lucide-react';

interface JobSourceWidgetProps {
    data: JobSourceData[];
    loading: boolean;
    onDrillDown?: (source: string) => void;
}

const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};

export const JobSourceWidget: React.FC<JobSourceWidgetProps> = ({ data, loading, onDrillDown }) => {
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
                No jobs for this period
            </div>
        );
    }

    return (
        <div className="h-full w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="45%"
                        labelLine={false}
                        label={renderLabel}
                        outerRadius="80%"
                        innerRadius="40%"
                        dataKey="count"
                        nameKey="source"
                        paddingAngle={3}
                        strokeWidth={2}
                        stroke="#fff"
                        cursor={onDrillDown ? 'pointer' : 'default'}
                        onClick={(entry: any) => onDrillDown?.(entry.source)}
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', fontSize: '12px' }}
                        formatter={(val: number) => [val, 'Jobs']}
                    />
                    <Legend verticalAlign="bottom" iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                </PieChart>
            </ResponsiveContainer>
            {onDrillDown && <div className="text-[10px] text-gray-400 text-center -mt-2">Click a slice to view jobs</div>}
        </div>
    );
};
