import React from 'react';
import { TrendingUp, Users } from 'lucide-react';

interface MetricWidgetProps {
    value: string | number;
    trend?: string;
    icon?: 'trendingUp' | 'users';
}

export const RevenueKPIWidget: React.FC<MetricWidgetProps> = ({ value, trend }) => {
    return (
        <div className="flex flex-col h-full justify-center">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                    <div className="text-3xl font-bold text-gray-900">{value}</div>
                    {trend && <div className="text-sm text-gray-500 mt-1">{trend}</div>}
                </div>
            </div>
        </div>
    );
};

export const ActiveTechsKPIWidget: React.FC<MetricWidgetProps> = ({ value }) => {
    return (
        <div className="flex flex-col h-full justify-center">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                    <div className="text-3xl font-bold text-gray-900">{value}</div>
                </div>
            </div>
        </div>
    );
};
