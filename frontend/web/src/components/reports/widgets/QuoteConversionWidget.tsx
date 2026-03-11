import React from 'react';
import { QuoteConversionData } from '../../../services/ReportingService';
import { Loader2, CheckCircle, XCircle, Clock, FileText } from 'lucide-react';

interface QuoteConversionWidgetProps {
    data: QuoteConversionData | null;
    loading: boolean;
    onDrillDown?: (status: string) => void;
}

export const QuoteConversionWidget: React.FC<QuoteConversionWidgetProps> = ({ data, loading, onDrillDown }) => {
    if (loading || !data) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin w-8 h-8 text-gray-400" />
            </div>
        );
    }

    if (data.totalQuotes === 0) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                No quotes for this period
            </div>
        );
    }

    const chipClass = onDrillDown ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all' : '';

    return (
        <div className="h-full flex flex-col gap-4 justify-center">
            <div className="flex items-center justify-center">
                <div
                    className={`relative flex items-center justify-center ${onDrillDown ? 'cursor-pointer' : ''}`}
                    onClick={() => onDrillDown?.('all')}
                    title={onDrillDown ? 'Click to view all quotes' : undefined}
                >
                    <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" stroke="#f3f4f6" strokeWidth="10" fill="none" />
                        <circle
                            cx="50" cy="50" r="40"
                            stroke="#10b981"
                            strokeWidth="10"
                            fill="none"
                            strokeDasharray={`${data.approvalRate * 2.51327} ${251.327 - data.approvalRate * 2.51327}`}
                            strokeLinecap="round"
                            className="transition-all duration-1000"
                        />
                    </svg>
                    <div className="absolute text-center">
                        <div className="text-2xl font-bold text-gray-900">{data.approvalRate}%</div>
                        <div className="text-[10px] text-gray-500 font-medium">Win Rate</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div
                    className={`flex items-center gap-2 bg-green-50 rounded-lg p-2 ${chipClass} hover:ring-green-300`}
                    onClick={() => onDrillDown?.('approved')}
                >
                    <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <div>
                        <div className="text-sm font-bold text-green-700">{data.approved}</div>
                        <div className="text-[10px] text-green-600">Approved</div>
                    </div>
                </div>
                <div
                    className={`flex items-center gap-2 bg-red-50 rounded-lg p-2 ${chipClass} hover:ring-red-300`}
                    onClick={() => onDrillDown?.('declined')}
                >
                    <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <div>
                        <div className="text-sm font-bold text-red-700">{data.declined}</div>
                        <div className="text-[10px] text-red-500">Declined</div>
                    </div>
                </div>
                <div
                    className={`flex items-center gap-2 bg-blue-50 rounded-lg p-2 ${chipClass} hover:ring-blue-300`}
                    onClick={() => onDrillDown?.('pending')}
                >
                    <Clock className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <div>
                        <div className="text-sm font-bold text-blue-700">{data.pending}</div>
                        <div className="text-[10px] text-blue-500">Pending</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                    <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    <div>
                        <div className="text-sm font-bold text-gray-700">
                            {data.avgResponseDays > 0 ? `${data.avgResponseDays}d` : '—'}
                        </div>
                        <div className="text-[10px] text-gray-500">Avg Response</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
