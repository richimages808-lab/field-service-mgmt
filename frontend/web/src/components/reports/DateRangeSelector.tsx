import React from 'react';
import { Calendar } from 'lucide-react';

export interface DateRangePreset {
    label: string;
    key: string;
    getRange: () => { start: Date; end: Date };
}

const PRESETS: DateRangePreset[] = [
    {
        label: '7 Days',
        key: '7d',
        getRange: () => {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 7);
            return { start, end };
        }
    },
    {
        label: '30 Days',
        key: '30d',
        getRange: () => {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 30);
            return { start, end };
        }
    },
    {
        label: '90 Days',
        key: '90d',
        getRange: () => {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 90);
            return { start, end };
        }
    },
    {
        label: 'This Year',
        key: 'ytd',
        getRange: () => {
            const end = new Date();
            const start = new Date(end.getFullYear(), 0, 1);
            return { start, end };
        }
    },
    {
        label: 'Last Year',
        key: 'lastyear',
        getRange: () => {
            const now = new Date();
            const start = new Date(now.getFullYear() - 1, 0, 1);
            const end = new Date(now.getFullYear() - 1, 11, 31);
            return { start, end };
        }
    },
    {
        label: 'All Time',
        key: 'all',
        getRange: () => {
            const end = new Date();
            const start = new Date(2020, 0, 1);
            return { start, end };
        }
    }
];

interface DateRangeSelectorProps {
    selectedKey: string;
    onSelect: (key: string, range: { start: Date; end: Date }) => void;
}

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ selectedKey, onSelect }) => {
    return (
        <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
                {PRESETS.map(preset => (
                    <button
                        key={preset.key}
                        onClick={() => onSelect(preset.key, preset.getRange())}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${selectedKey === preset.key
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export { PRESETS };
