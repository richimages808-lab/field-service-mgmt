import React from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { RevenueData } from '../../../services/ReportingService';
import { Loader2 } from 'lucide-react';

interface RevenueTrendWidgetProps {
    data: RevenueData[];
    loading: boolean;
    onDrillDown?: (date: string) => void;
}

export const RevenueTrendWidget: React.FC<RevenueTrendWidgetProps> = ({ data, loading, onDrillDown }) => {
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
                <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                        dataKey="date"
                        tickFormatter={(val) => {
                            if (!val) return '';
                            if (val.includes('-')) {
                                const parts = val.split('-');
                                return `${parts[1]}/${parts[2]}`;
                            }
                            const parts = val.split('/');
                            if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
                            return val;
                        }}
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                    />
                    <YAxis
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                        tickFormatter={(val) => `$${val}`}
                        axisLine={false}
                        tickLine={false}
                        dx={-10}
                    />
                    <Tooltip
                        formatter={(val: number) => [`$${val.toFixed(2)}`, 'Revenue']}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="amount"
                        stroke="#2563eb"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }}
                        activeDot={{
                            r: 6, stroke: '#DBEAFE', strokeWidth: 4,
                            cursor: onDrillDown ? 'pointer' : 'default',
                            onClick: (_: any, payload: any) => {
                                if (onDrillDown && payload?.payload?.date) {
                                    onDrillDown(payload.payload.date);
                                }
                            }
                        }}
                    />
                </LineChart>
            </ResponsiveContainer>
            {onDrillDown && <div className="text-[10px] text-gray-400 text-center mt-1">Click a data point to view details</div>}
        </div>
    );
};
