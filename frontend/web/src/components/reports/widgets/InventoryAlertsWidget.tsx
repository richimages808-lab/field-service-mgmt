import React from 'react';
import { InventoryAlertData } from '../../../services/ReportingService';
import { Loader2, AlertTriangle, Package, CheckCircle } from 'lucide-react';

interface InventoryAlertsWidgetProps {
    data: InventoryAlertData[];
    loading: boolean;
    onDrillDown?: (itemId: string, itemName: string) => void;
}

export const InventoryAlertsWidget: React.FC<InventoryAlertsWidgetProps> = ({ data, loading, onDrillDown }) => {
    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin w-8 h-8 text-gray-400" />
            </div>
        );
    }

    if (!data.length) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-6">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="text-sm font-medium text-gray-700">All Stock Levels OK</div>
                <div className="text-xs text-gray-400">No items below minimum threshold</div>
            </div>
        );
    }

    const getSeverityColor = (pct: number) => {
        if (pct === 0) return 'bg-red-500';
        if (pct <= 25) return 'bg-red-400';
        if (pct <= 50) return 'bg-orange-400';
        if (pct <= 75) return 'bg-amber-400';
        return 'bg-yellow-400';
    };

    const getSeverityBadge = (pct: number) => {
        if (pct === 0) return { label: 'OUT', class: 'bg-red-100 text-red-700' };
        if (pct <= 50) return { label: 'LOW', class: 'bg-orange-100 text-orange-700' };
        return { label: 'WARN', class: 'bg-amber-100 text-amber-700' };
    };

    return (
        <div className="h-full flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-gray-500 font-medium">{data.length} item{data.length !== 1 ? 's' : ''} below threshold</span>
            </div>

            <div className="flex-1 overflow-auto">
                <div className="space-y-2">
                    {data.map(item => {
                        const badge = getSeverityBadge(item.percentOfMin);
                        return (
                            <div
                                key={item.itemId}
                                className={`flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 transition-colors bg-gray-50/50 ${onDrillDown ? 'hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer' : 'hover:border-gray-200'}`}
                                onClick={() => onDrillDown?.(item.itemId, item.name)}
                            >
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                                    <Package className="w-4 h-4 text-gray-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-gray-900 truncate">{item.name}</span>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badge.class}`}>
                                            {badge.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${getSeverityColor(item.percentOfMin)}`}
                                                style={{ width: `${Math.min(item.percentOfMin, 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] text-gray-500 flex-shrink-0">
                                            {item.currentQty}/{item.minQty}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
