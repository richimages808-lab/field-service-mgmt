import React from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { ProfitabilityData } from '../../../services/ReportingService';
import { Loader2 } from 'lucide-react';

interface ProfitabilityWidgetProps {
    data: ProfitabilityData[];
    loading: boolean;
    onDrillDown?: (date: string) => void;
}

export const ProfitabilityWidget: React.FC<ProfitabilityWidgetProps> = ({ data, loading, onDrillDown }) => {
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
                No profitability data for this period
            </div>
        );
    }

    const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
    const totalCosts = data.reduce((s, d) => s + d.costs, 0);
    const totalProfit = totalRevenue - totalCosts;
    const margin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;

    const chartData = data.map(d => ({
        ...d,
        margin: d.revenue > 0 ? Math.round((d.profit / d.revenue) * 100) : 0
    }));

    return (
        <div className="h-full flex flex-col gap-3">
            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs text-gray-500">Revenue:</span>
                    <span className="text-xs font-bold text-gray-900">${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span className="text-xs text-gray-500">Costs:</span>
                    <span className="text-xs font-bold text-gray-900">${totalCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${margin >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {margin}% margin
                </div>
            </div>

            <div className="flex-1 min-h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}
                        onClick={(e: any) => {
                            if (onDrillDown && e?.activePayload?.[0]?.payload?.date) {
                                onDrillDown(e.activePayload[0].payload.date);
                            }
                        }}
                        style={onDrillDown ? { cursor: 'pointer' } : undefined}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10, fill: '#6B7280' }}
                            tickFormatter={(val) => {
                                if (!val) return '';
                                const parts = val.split('/');
                                return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : val;
                            }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={(val) => `${val}%`} axisLine={false} tickLine={false} domain={[0, 100]} />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', fontSize: '12px' }}
                            formatter={(val: number, name: string) => {
                                if (name === 'Margin') return [`${val}%`, name];
                                return [`$${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, name];
                            }}
                        />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                        <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} barSize={16} />
                        <Bar yAxisId="left" dataKey="costs" name="Costs" fill="#f87171" radius={[4, 4, 0, 0]} barSize={16} />
                        <Line yAxisId="right" type="monotone" dataKey="margin" name="Margin" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            {onDrillDown && <div className="text-[10px] text-gray-400 text-center">Click a date to view invoices</div>}
        </div>
    );
};
