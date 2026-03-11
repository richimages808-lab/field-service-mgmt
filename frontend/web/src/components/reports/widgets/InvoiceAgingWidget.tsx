import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { InvoiceAgingData } from '../../../services/ReportingService';
import { Loader2, AlertTriangle } from 'lucide-react';

interface InvoiceAgingWidgetProps {
    data: InvoiceAgingData[];
    loading: boolean;
    onDrillDown?: (bucket: string) => void;
}

export const InvoiceAgingWidget: React.FC<InvoiceAgingWidgetProps> = ({ data, loading, onDrillDown }) => {
    if (loading && !data.length) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin w-8 h-8 text-gray-400" />
            </div>
        );
    }

    const totalOutstanding = data.reduce((sum, d) => sum + d.amount, 0);
    const totalOverdue = data.filter(d => d.bucket !== '0-30 days').reduce((sum, d) => sum + d.amount, 0);

    return (
        <div className="h-full flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-2xl font-bold text-gray-900">${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-xs text-gray-500">Total Outstanding</div>
                </div>
                {totalOverdue > 0 && (
                    <div className="flex items-center gap-1.5 bg-red-50 text-red-600 px-2.5 py-1 rounded-lg">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span className="text-xs font-semibold">${totalOverdue.toLocaleString(undefined, { maximumFractionDigits: 0 })} overdue</span>
                    </div>
                )}
            </div>

            <div className="flex-1 min-h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                        <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} axisLine={false} tickLine={false} />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                            formatter={(val: number, _name: string, props: any) => [
                                `$${val.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${props.payload.count} invoices)`,
                                'Amount'
                            ]}
                        />
                        <Bar
                            dataKey="amount"
                            radius={[6, 6, 0, 0]}
                            barSize={40}
                            cursor={onDrillDown ? 'pointer' : 'default'}
                            onClick={(entry: any) => onDrillDown?.(entry.bucket)}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {onDrillDown && <div className="text-[10px] text-gray-400 text-center">Click a bar to view invoices</div>}
        </div>
    );
};
