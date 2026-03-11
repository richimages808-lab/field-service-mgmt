import React from 'react';
import { CustomerRankData } from '../../../services/ReportingService';
import { Loader2, Crown } from 'lucide-react';

interface CustomerLeaderboardWidgetProps {
    data: CustomerRankData[];
    loading: boolean;
    onDrillDown?: (customerId: string, customerName: string) => void;
}

export const CustomerLeaderboardWidget: React.FC<CustomerLeaderboardWidgetProps> = ({ data, loading, onDrillDown }) => {
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
                No customer data for this period
            </div>
        );
    }

    const maxRevenue = data[0]?.totalRevenue || 1;

    return (
        <div className="h-full overflow-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-1 text-xs font-semibold text-gray-500 w-8">#</th>
                        <th className="text-left py-2 px-1 text-xs font-semibold text-gray-500">Customer</th>
                        <th className="text-right py-2 px-1 text-xs font-semibold text-gray-500">Revenue</th>
                        <th className="text-right py-2 px-1 text-xs font-semibold text-gray-500">Jobs</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((customer, index) => (
                        <tr
                            key={customer.customerId}
                            className={`border-b border-gray-50 transition-colors ${onDrillDown ? 'hover:bg-blue-50 cursor-pointer' : 'hover:bg-gray-50/50'}`}
                            onClick={() => onDrillDown?.(customer.customerId, customer.customerName)}
                        >
                            <td className="py-2 px-1">
                                {index === 0 ? (
                                    <Crown className="w-4 h-4 text-amber-500" />
                                ) : (
                                    <span className="text-xs text-gray-400 font-medium">{index + 1}</span>
                                )}
                            </td>
                            <td className="py-2 px-1">
                                <div className="flex flex-col">
                                    <span className="font-medium text-gray-900 text-xs truncate max-w-[150px]">{customer.customerName}</span>
                                    {customer.lastJobDate && (
                                        <span className="text-[10px] text-gray-400">Last: {customer.lastJobDate}</span>
                                    )}
                                </div>
                            </td>
                            <td className="py-2 px-1 text-right">
                                <div className="flex flex-col items-end gap-1">
                                    <span className="font-semibold text-gray-900 text-xs">
                                        ${customer.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                            style={{ width: `${(customer.totalRevenue / maxRevenue) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            </td>
                            <td className="py-2 px-1 text-right">
                                <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                                    {customer.jobCount}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
