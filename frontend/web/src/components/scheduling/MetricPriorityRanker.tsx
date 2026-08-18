import React, { useState } from 'react';
import {
    GripVertical, Navigation, Clock, AlertTriangle, Package,
    Wrench, Award, Truck, ArrowUp, ArrowDown, RotateCcw,
    Sparkles, Info
} from 'lucide-react';
import { SchedulingMetricId } from '../../types';

export interface MetricDefinition {
    id: SchedulingMetricId;
    title: string;
    shortTitle: string;
    description: string;
    impactDescription: string;
    icon: any;
    colorClass: {
        bg: string;
        text: string;
        border: string;
        badge: string;
    };
}

export const METRIC_DEFINITIONS: Record<SchedulingMetricId, MetricDefinition> = {
    route_proximity: {
        id: 'route_proximity',
        title: 'Shortest Driving Route (Closest Next Site)',
        shortTitle: 'Shortest Route',
        description: 'Sequences appointments to the nearest geographic site to minimize driving time and prevent crisscrossing.',
        impactDescription: 'Highest weight on drive distance and nearest-neighbor routing.',
        icon: Navigation,
        colorClass: {
            bg: 'bg-blue-50/70 hover:bg-blue-50',
            text: 'text-blue-700',
            border: 'border-blue-200',
            badge: 'bg-blue-600 text-white'
        }
    },
    customer_windows: {
        id: 'customer_windows',
        title: 'Customer Time Windows & Preferred Slots',
        shortTitle: 'Customer Windows',
        description: 'Honors customer requested arrival windows, morning/afternoon time slots, and promised appointment dates.',
        impactDescription: 'Penalizes slots that fall outside customer requested windows.',
        icon: Clock,
        colorClass: {
            bg: 'bg-indigo-50/70 hover:bg-indigo-50',
            text: 'text-indigo-700',
            border: 'border-indigo-200',
            badge: 'bg-indigo-600 text-white'
        }
    },
    job_priority: {
        id: 'job_priority',
        title: 'Job Urgency & Priority Rating',
        shortTitle: 'Job Urgency',
        description: 'Pushes critical emergencies and high-priority tickets to the earliest available timeline slots.',
        impactDescription: 'Critical and high priority work is scheduled ahead of routine jobs.',
        icon: AlertTriangle,
        colorClass: {
            bg: 'bg-rose-50/70 hover:bg-rose-50',
            text: 'text-rose-700',
            border: 'border-rose-200',
            badge: 'bg-rose-600 text-white'
        }
    },
    material_readiness: {
        id: 'material_readiness',
        title: 'Material Readiness & Parts Stock',
        shortTitle: 'Parts & Stock',
        description: 'Ensures replacement parts, vendor POs, and materials are in-stock or delivered before dispatching.',
        impactDescription: 'Holds jobs until required parts are on the shelf or arrived.',
        icon: Package,
        colorClass: {
            bg: 'bg-emerald-50/70 hover:bg-emerald-50',
            text: 'text-emerald-700',
            border: 'border-emerald-200',
            badge: 'bg-emerald-600 text-white'
        }
    },
    tool_availability: {
        id: 'tool_availability',
        title: 'Specialty Tools & Truck Inventory',
        shortTitle: 'Specialty Tools',
        description: 'Matches diagnostic equipment and heavy tools to technician vehicle kits and company tool pools.',
        impactDescription: 'Assigns jobs only to techs with necessary equipment.',
        icon: Wrench,
        colorClass: {
            bg: 'bg-cyan-50/70 hover:bg-cyan-50',
            text: 'text-cyan-700',
            border: 'border-cyan-200',
            badge: 'bg-cyan-600 text-white'
        }
    },
    skill_match: {
        id: 'skill_match',
        title: 'Technician Skill & Specialty Fit',
        shortTitle: 'Skill Match',
        description: 'Dispatches jobs to technicians with exact trade certifications, specialties, and experience ratings.',
        impactDescription: 'Routes complex tasks to the most qualified available technician.',
        icon: Award,
        colorClass: {
            bg: 'bg-amber-50/70 hover:bg-amber-50',
            text: 'text-amber-700',
            border: 'border-amber-200',
            badge: 'bg-amber-600 text-white'
        }
    },
    traffic_avoidance: {
        id: 'traffic_avoidance',
        title: 'Live Traffic & Rush-Hour Minimization',
        shortTitle: 'Traffic Avoidance',
        description: 'Avoids scheduling long transits during peak congestion periods (7:00-9:30 AM & 3:45-6:30 PM).',
        impactDescription: 'Clusters travel into low-traffic time windows.',
        icon: Truck,
        colorClass: {
            bg: 'bg-purple-50/70 hover:bg-purple-50',
            text: 'text-purple-700',
            border: 'border-purple-200',
            badge: 'bg-purple-600 text-white'
        }
    }
};

export const DEFAULT_METRIC_PRIORITIES: SchedulingMetricId[] = [
    'route_proximity',
    'customer_windows',
    'job_priority',
    'material_readiness',
    'tool_availability',
    'skill_match',
    'traffic_avoidance'
];

interface MetricPriorityRankerProps {
    priorities: SchedulingMetricId[];
    onChange: (newPriorities: SchedulingMetricId[]) => void;
    compact?: boolean;
    showPresets?: boolean;
}

export const MetricPriorityRanker: React.FC<MetricPriorityRankerProps> = ({
    priorities,
    onChange,
    compact = false,
    showPresets = true
}) => {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // Normalize incoming priorities array to ensure all 7 metrics exist
    const normalizedPriorities = React.useMemo(() => {
        const currentSet = new Set(priorities || []);
        const merged = [...(priorities || [])];
        for (const defaultId of DEFAULT_METRIC_PRIORITIES) {
            if (!currentSet.has(defaultId)) {
                merged.push(defaultId);
            }
        }
        return merged;
    }, [priorities]);

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (dragOverIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragEnd = () => {
        if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
            const reordered = [...normalizedPriorities];
            const [movedItem] = reordered.splice(draggedIndex, 1);
            reordered.splice(dragOverIndex, 0, movedItem);
            onChange(reordered);
        }
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const moveItem = (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= normalizedPriorities.length) return;
        const reordered = [...normalizedPriorities];
        const [movedItem] = reordered.splice(index, 1);
        reordered.splice(targetIndex, 0, movedItem);
        onChange(reordered);
    };

    const applyPreset = (preset: 'route' | 'customer' | 'urgent' | 'skills') => {
        switch (preset) {
            case 'route':
                onChange(DEFAULT_METRIC_PRIORITIES);
                break;
            case 'customer':
                onChange([
                    'customer_windows',
                    'route_proximity',
                    'job_priority',
                    'material_readiness',
                    'tool_availability',
                    'skill_match',
                    'traffic_avoidance'
                ]);
                break;
            case 'urgent':
                onChange([
                    'job_priority',
                    'route_proximity',
                    'customer_windows',
                    'material_readiness',
                    'tool_availability',
                    'skill_match',
                    'traffic_avoidance'
                ]);
                break;
            case 'skills':
                onChange([
                    'skill_match',
                    'tool_availability',
                    'route_proximity',
                    'customer_windows',
                    'job_priority',
                    'material_readiness',
                    'traffic_avoidance'
                ]);
                break;
        }
    };

    const getRankBadgeLabel = (index: number) => {
        if (index === 0) return 'Primary (#1)';
        if (index === 1) return 'Secondary (#2)';
        if (index === 2) return 'Tertiary (#3)';
        return `#${index + 1}`;
    };

    return (
        <div className="space-y-4">
            {/* Header & Quick Presets */}
            {showPresets && (
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-200">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <span>Quick Presets:</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => applyPreset('route')}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            <Navigation className="w-3 h-3 text-blue-600" />
                            Shortest Route (Default)
                        </button>

                        <button
                            type="button"
                            onClick={() => applyPreset('customer')}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            <Clock className="w-3 h-3 text-indigo-600" />
                            Customer First
                        </button>

                        <button
                            type="button"
                            onClick={() => applyPreset('urgent')}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-md border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            Urgent First
                        </button>

                        <button
                            type="button"
                            onClick={() => applyPreset('skills')}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-md border border-amber-200 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            <Award className="w-3 h-3 text-amber-600" />
                            Skills First
                        </button>

                        <button
                            type="button"
                            onClick={() => onChange(DEFAULT_METRIC_PRIORITIES)}
                            className="px-2 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                            title="Reset to default order"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Reset
                        </button>
                    </div>
                </div>
            )}

            {/* Instruction banner */}
            <div className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px]">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                    <span className="font-semibold">Drag & drop or use arrow buttons</span> to rank metrics from highest priority (#1) to lowest. The AI scheduler assigns weight based on this exact hierarchy.
                </div>
            </div>

            {/* Draggable Metric Items */}
            <div className="space-y-2 select-none">
                {normalizedPriorities.map((metricId, index) => {
                    const def = METRIC_DEFINITIONS[metricId];
                    if (!def) return null;
                    const IconComponent = def.icon;
                    const isDragging = draggedIndex === index;
                    const isDragOver = dragOverIndex === index;
                    const isPrimary = index === 0;

                    return (
                        <div
                            key={metricId}
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all duration-150 cursor-grab active:cursor-grabbing ${
                                isDragging ? 'opacity-40 scale-95 border-dashed border-blue-400 bg-blue-50/50' : 'opacity-100'
                            } ${
                                isDragOver && !isDragging ? 'border-blue-500 ring-2 ring-blue-400/30 bg-blue-50/30' : ''
                            } ${
                                isPrimary
                                    ? 'bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-white border-blue-300 shadow-sm'
                                    : 'bg-white border-gray-200 hover:border-gray-300 shadow-2xs'
                            }`}
                        >
                            {/* Left: Drag Handle, Rank Badge & Icon + Title */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="text-gray-400 group-hover:text-gray-600 transition-colors p-1 -ml-1">
                                    <GripVertical className="w-4 h-4" />
                                </div>

                                <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide flex-shrink-0 ${
                                    isPrimary
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : index === 1
                                        ? 'bg-indigo-600 text-white'
                                        : index === 2
                                        ? 'bg-violet-600 text-white'
                                        : 'bg-gray-100 text-gray-700 font-semibold'
                                }`}>
                                    {getRankBadgeLabel(index)}
                                </div>

                                <div className={`p-1.5 rounded-lg flex-shrink-0 ${def.colorClass.bg} ${def.colorClass.text}`}>
                                    <IconComponent className="w-4 h-4" />
                                </div>

                                <div className="min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-2">
                                        <h5 className="text-xs font-bold text-gray-900 truncate">
                                            {def.title}
                                        </h5>
                                        {isPrimary && (
                                            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded uppercase">
                                                Active Driver
                                            </span>
                                        )}
                                    </div>
                                    {!compact && (
                                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                            {def.description}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Right: Up / Down Arrow Controls */}
                            <div className="flex items-center gap-1 flex-shrink-0 pl-2">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        moveItem(index, 'up');
                                    }}
                                    disabled={index === 0}
                                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                                    title="Move Up"
                                >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        moveItem(index, 'down');
                                    }}
                                    disabled={index === normalizedPriorities.length - 1}
                                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                                    title="Move Down"
                                >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
