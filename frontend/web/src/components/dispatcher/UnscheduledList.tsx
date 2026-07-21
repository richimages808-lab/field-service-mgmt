import React, { useState, useMemo } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Job } from '../../types';
import { MapPin, Clock, AlertCircle, Search, SortAsc, Zap, ChevronDown, ChevronUp, Wrench, Star, Calendar, ChevronLeft, ChevronRight, X, Eye, ExternalLink, Undo2 } from 'lucide-react';
import { formatDistanceToNow, differenceInDays, format } from 'date-fns';

interface UnscheduledListProps {
    jobs: Job[];
    onQuickAssign?: (job: Job) => void;
    onJobSelect?: (job: Job | null) => void;
    selectedJobId?: string | null;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    onDragStart?: (job: Job) => void;
    onDragEnd?: () => void;
    onUnscheduleJob?: (jobId: string) => void;
    onViewJob?: (jobId: string) => void;
}

type SortOption = 'priority' | 'age' | 'duration';
type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const DraggableJobCard = ({ job, onQuickAssign, onJobSelect, isSelected, onDragStart, onDragEnd, onViewJob }: {
    job: Job;
    onQuickAssign?: (job: Job) => void;
    onJobSelect?: (job: Job | null) => void;
    isSelected?: boolean;
    onDragStart?: (job: Job) => void;
    onDragEnd?: () => void;
    onViewJob?: (jobId: string) => void;
}) => {
    const [expanded, setExpanded] = useState(false);
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'JOB',
        item: () => {
            onDragStart?.(job);
            return { id: job.id, type: 'UNSCHEDULED' };
        },
        end: () => {
            onDragEnd?.();
        },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }));

    // Format availability windows for display
    const availabilitySummary = useMemo(() => {
        if (!job.request?.availabilityWindows || job.request.availabilityWindows.length === 0) {
            return null;
        }
        const dayAbbrev: Record<string, string> = {
            'monday': 'Mon', 'tuesday': 'Tue', 'wednesday': 'Wed',
            'thursday': 'Thu', 'friday': 'Fri', 'saturday': 'Sat', 'sunday': 'Sun'
        };
        return job.request.availabilityWindows.map(w => {
            let day = '';
            try {
                if (w.day.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const parsedDate = new Date(w.day + 'T00:00:00');
                    day = format(parsedDate, 'E M/d');
                } else {
                    day = dayAbbrev[w.day.toLowerCase()] || w.day.slice(0, 3);
                }
            } catch {
                day = w.day.slice(0, 3);
            }
            const startH = parseInt(w.startTime.split(':')[0]);
            const endH = parseInt(w.endTime.split(':')[0]);
            const fmtHour = (h: number) => h > 12 ? `${h - 12}p` : h === 12 ? '12p' : `${h}a`;
            return `${day} ${fmtHour(startH)}–${fmtHour(endH)}`;
        });
    }, [job.request?.availabilityWindows]);

    const handleCardClick = (e: React.MouseEvent) => {
        // Don't fire if clicking on buttons inside the card
        if ((e.target as HTMLElement).closest('button')) return;
        if ((e.target as HTMLElement).closest('a')) return;
        // If already selected, navigate to full job detail
        if (isSelected) {
            onViewJob?.(job.id);
            return;
        }
        onJobSelect?.(job);
    };

    // Calculate age for color coding
    const getAgeInfo = () => {
        if (!job.createdAt) return { days: 0, color: 'text-green-600', bg: 'bg-green-50', label: 'New' };
        const date = job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt);
        if (!(date instanceof Date) || isNaN(date.getTime())) return { days: 0, color: 'text-green-600', bg: 'bg-green-50', label: 'New' };
        const days = differenceInDays(new Date(), date);
        if (days > 3) return { days, color: 'text-red-600', bg: 'bg-red-50', label: `${days}d old` };
        if (days >= 1) return { days, color: 'text-amber-600', bg: 'bg-amber-50', label: `${days}d old` };
        return { days, color: 'text-green-600', bg: 'bg-green-50', label: 'Today' };
    };

    const ageInfo = getAgeInfo();
    const aiRec = job.intakeReview?.aiRecommendation;

    return (
        <div
            ref={drag}
            onClick={handleCardClick}
            className={`bg-white rounded-lg shadow-sm mb-2.5 border-l-4 cursor-move hover:shadow-md transition-all group
                ${isDragging ? 'opacity-40 scale-95' : 'opacity-100'}
                ${isSelected ? 'ring-2 ring-green-500 shadow-green-100 shadow-lg' : ''}
                ${job.priority === 'critical' ? 'border-red-500' :
                    job.priority === 'high' ? 'border-orange-500' :
                        job.priority === 'medium' ? 'border-blue-500' : 'border-gray-300'}`}
        >
            <div className="p-3">
                {/* Top row: Customer name + priority + age */}
                <div className="flex justify-between items-start mb-1.5">
                    <h4 className="font-bold text-gray-800 text-sm truncate flex-1 mr-2">{job.customer.name}</h4>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ageInfo.bg} ${ageInfo.color}`}>
                            {ageInfo.label}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize font-semibold
                            ${job.priority === 'critical' ? 'bg-red-100 text-red-800 animate-pulse' :
                                job.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                    job.priority === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {job.priority}
                        </span>
                    </div>
                </div>

                {/* Description */}
                <p className="text-xs text-gray-600 mb-2 line-clamp-2">{job.request?.description || 'No description'}</p>

                {/* Meta row: Location + Duration + Source */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center truncate flex-1 mr-2">
                        <MapPin className="w-3 h-3 mr-1 flex-shrink-0 text-gray-400" />
                        <span className="truncate">{job.customer.address?.split(',')[0] || 'No address'}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="flex items-center">
                            <Clock className="w-3 h-3 mr-0.5" />
                            {job.estimated_duration || 60}m
                        </span>
                        {job.request?.source && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded capitalize">
                                {job.request.source}
                            </span>
                        )}
                    </div>
                </div>

                {/* ── SELECTED: Expanded Detail Panel ── */}
                {isSelected && (
                    <div className="mt-2.5 pt-2.5 border-t-2 border-green-300 space-y-2.5 bg-green-50 -mx-3 -mb-3 px-3 pb-3 rounded-b-lg">
                        {/* Full Address */}
                        <div className="flex items-start gap-2">
                            <MapPin className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Location</div>
                                <div className="text-xs text-gray-800 font-medium">{job.customer.address || 'No address on file'}</div>
                            </div>
                        </div>

                        {/* Required Skills */}
                        {(() => {
                            const skills = [
                                ...(aiRec?.skillsRequired || []),
                                ...(job.aiRecommendation?.skillsRequired || []),
                            ].filter((s, i, arr) => Boolean(s) && arr.indexOf(s) === i);
                            const jobType = job.request?.type || job.type;
                            return (skills.length > 0 || jobType) ? (
                                <div className="flex items-start gap-2">
                                    <Wrench className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Skills Required</div>
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                            {jobType && (
                                                <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-blue-200 capitalize">
                                                    {jobType}
                                                </span>
                                            )}
                                            {skills.map((skill, i) => (
                                                <span key={i} className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] font-medium border border-blue-200">
                                                    {skill}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : null;
                        })()}

                        {/* Customer Requested Times */}
                        {availabilitySummary && availabilitySummary.length > 0 ? (
                            <div className="flex items-start gap-2">
                                <Calendar className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                                <div>
                                    <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Customer Requested Times</div>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                        {availabilitySummary.map((slot, i) => (
                                            <span key={i} className="bg-green-200 text-green-900 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-green-300 shadow-sm">
                                                {slot}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-2">
                                <Calendar className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Customer Requested Times</div>
                                    <div className="text-[10px] text-gray-500 italic">No specific times requested — any open slot works</div>
                                </div>
                            </div>
                        )}

                        {/* Complexity if available */}
                        {aiRec?.complexity && (
                            <div className="flex items-center gap-1.5 text-[10px]">
                                <Star className="w-3 h-3 text-amber-500" />
                                <span className="text-gray-600">Complexity:</span>
                                <span className={`font-bold capitalize ${
                                    aiRec.complexity === 'complex' ? 'text-red-600' :
                                    aiRec.complexity === 'medium' ? 'text-amber-600' : 'text-green-600'
                                }`}>{aiRec.complexity}</span>
                            </div>
                        )}
                        {/* View Full Job button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); onViewJob?.(job.id); }}
                            className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded px-2 py-1.5 w-full justify-center transition-colors"
                        >
                            <ExternalLink className="w-3 h-3" />
                            View Full Job Details
                        </button>
                    </div>
                )}

                {/* ── NOT SELECTED: Compact AI Insights + Availability ── */}
                {!isSelected && aiRec && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                        <button
                            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                            className="flex items-center justify-between w-full text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                            <span className="flex items-center gap-1">
                                <Star className="w-3 h-3" />
                                AI Insights
                            </span>
                            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        {expanded && (
                            <div className="mt-2 space-y-1.5 text-xs text-gray-600">
                                <div className="flex justify-between">
                                    <span>Complexity:</span>
                                    <span className={`font-semibold capitalize ${aiRec.complexity === 'complex' ? 'text-red-600' : aiRec.complexity === 'medium' ? 'text-amber-600' : 'text-green-600'}`}>
                                        {aiRec.complexity}
                                    </span>
                                </div>
                                {aiRec.skillsRequired?.length > 0 && (
                                    <div>
                                        <span className="text-gray-500">Skills: </span>
                                        <span className="font-medium">{aiRec.skillsRequired.join(', ')}</span>
                                    </div>
                                )}
                                {aiRec.requiredTools?.some(t => !t.owned) && (
                                    <div className="flex items-center gap-1 text-orange-600">
                                        <Wrench className="w-3 h-3" />
                                        {aiRec.requiredTools.filter(t => !t.owned).length} tools needed
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Compact availability tags when NOT selected */}
                {!isSelected && availabilitySummary && availabilitySummary.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-green-700 mb-1">
                            <Calendar className="w-3 h-3" />
                            Customer Requested Times:
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {availabilitySummary.map((slot, i) => (
                                <span key={i} className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded text-[10px] font-medium border border-green-200">
                                    {slot}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Quick-assign footer */}
            {onQuickAssign && (
                <button
                    onClick={(e) => { e.stopPropagation(); onQuickAssign(job); }}
                    className="w-full px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border-t border-blue-100 rounded-b-lg transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100"
                >
                    <Zap className="w-3 h-3" />
                    Quick Assign Best Tech
                </button>
            )}
        </div>
    );
};

export const UnscheduledList: React.FC<UnscheduledListProps> = ({ jobs, onQuickAssign, onJobSelect, selectedJobId, isCollapsed, onToggleCollapse, onDragStart, onDragEnd, onUnscheduleJob, onViewJob }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<SortOption>('priority');
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
    const [showSortMenu, setShowSortMenu] = useState(false);

    const selectedJob = selectedJobId ? jobs.find(j => j.id === selectedJobId) : null;

    // Drop target for unscheduling jobs
    const [{ isOver, canDrop }, dropRef] = useDrop(() => ({
        accept: 'JOB',
        drop: (item: { id: string; type: string }) => {
            if (item.type === 'SCHEDULED') {
                onUnscheduleJob?.(item.id);
            }
        },
        canDrop: (item: { id: string; type: string }) => item.type === 'SCHEDULED',
        collect: (monitor) => ({
            isOver: !!monitor.isOver(),
            canDrop: !!monitor.canDrop(),
        }),
    }), [onUnscheduleJob]);

    const filteredAndSorted = useMemo(() => {
        let result = [...jobs];

        // Apply search filter
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter(j =>
                j.customer.name.toLowerCase().includes(term) ||
                (j.request?.description || '').toLowerCase().includes(term) ||
                (j.customer.address || '').toLowerCase().includes(term) ||
                (j.request?.type || '').toLowerCase().includes(term)
            );
        }

        // Apply priority filter
        if (priorityFilter !== 'all') {
            result = result.filter(j => j.priority === priorityFilter);
        }

        // Apply sort
        result.sort((a, b) => {
            switch (sortBy) {
                case 'priority':
                    return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
                case 'age': {
                    const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                    const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                    return aDate.getTime() - bDate.getTime(); // Oldest first
                }
                case 'duration':
                    return (b.estimated_duration || 60) - (a.estimated_duration || 60); // Longest first
                default:
                    return 0;
            }
        });

        return result;
    }, [jobs, searchTerm, sortBy, priorityFilter]);

    const priorityCounts = useMemo(() => ({
        all: jobs.length,
        critical: jobs.filter(j => j.priority === 'critical').length,
        high: jobs.filter(j => j.priority === 'high').length,
        medium: jobs.filter(j => j.priority === 'medium').length,
        low: jobs.filter(j => j.priority === 'low').length,
    }), [jobs]);

    // Collapsed strip view
    if (isCollapsed) {
        const criticalCount = jobs.filter(j => j.priority === 'critical').length;
        return (
            <div className="h-full flex flex-col items-center bg-gray-50 border-r border-gray-200 w-12 flex-shrink-0">
                <button
                    onClick={onToggleCollapse}
                    className="p-2 mt-3 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Show Unscheduled Jobs"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
                <div className="mt-3 flex flex-col items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-gray-400" />
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        jobs.length > 0 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                        {jobs.length}
                    </span>
                    {criticalCount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white animate-pulse">
                            {criticalCount}!
                        </span>
                    )}
                </div>
                <div className="mt-3 [writing-mode:vertical-lr] text-[10px] font-semibold text-gray-400 tracking-wider uppercase">
                    Jobs
                </div>
            </div>
        );
    }

    return (
        <div ref={dropRef} className={`h-full flex flex-col border-r border-gray-200 transition-all ${
            isOver && canDrop ? 'bg-amber-50 ring-2 ring-amber-400 ring-inset' :
            canDrop ? 'bg-amber-50/30' : 'bg-gray-50'
        }`}>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-white space-y-3">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        {onToggleCollapse && (
                            <button
                                onClick={onToggleCollapse}
                                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                title="Collapse panel"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <h2 className="font-bold text-gray-700 text-sm">Unscheduled Jobs</h2>
                    </div>
                    <span className="bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-semibold">
                        {filteredAndSorted.length}{filteredAndSorted.length !== jobs.length ? ` / ${jobs.length}` : ''}
                    </span>
                </div>

                {/* Selected Job Availability Banner */}
                {selectedJob && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <Eye className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Viewing Availability</div>
                            <div className="text-xs text-green-800 font-medium truncate">{selectedJob.customer.name}</div>
                        </div>
                        <button
                            onClick={() => onJobSelect?.(null)}
                            className="p-1 text-green-500 hover:text-green-700 hover:bg-green-100 rounded transition-colors flex-shrink-0"
                            title="Clear selection"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search customer, address..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                    />
                </div>

                {/* Priority filter pills */}
                <div className="flex gap-1 flex-wrap">
                    {(['all', 'critical', 'high', 'medium', 'low'] as PriorityFilter[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPriorityFilter(p)}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors capitalize ${
                                priorityFilter === p
                                    ? p === 'critical' ? 'bg-red-600 text-white'
                                        : p === 'high' ? 'bg-orange-500 text-white'
                                            : p === 'medium' ? 'bg-blue-500 text-white'
                                                : p === 'low' ? 'bg-gray-500 text-white'
                                                    : 'bg-gray-800 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {p} {priorityCounts[p] > 0 && <span className="ml-0.5">({priorityCounts[p]})</span>}
                        </button>
                    ))}
                </div>

                {/* Sort control */}
                <div className="relative">
                    <button
                        onClick={() => setShowSortMenu(!showSortMenu)}
                        className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 font-medium"
                    >
                        <SortAsc className="w-3 h-3" />
                        Sort: {sortBy === 'priority' ? 'Priority' : sortBy === 'age' ? 'Oldest First' : 'Longest First'}
                        <ChevronDown className="w-3 h-3" />
                    </button>
                    {showSortMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                            <div className="absolute left-0 top-6 z-20 bg-white border border-gray-200 rounded-md shadow-lg py-1 w-40">
                                {[
                                    { value: 'priority' as SortOption, label: 'Priority' },
                                    { value: 'age' as SortOption, label: 'Oldest First' },
                                    { value: 'duration' as SortOption, label: 'Longest First' }
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => { setSortBy(opt.value); setShowSortMenu(false); }}
                                        className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                                            sortBy === opt.value ? 'text-blue-600 font-semibold bg-blue-50' : 'text-gray-700'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Job list */}
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                {/* Drop-to-unschedule indicator */}
                {canDrop && (
                    <div className={`mb-3 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 border-dashed transition-all ${
                        isOver ? 'border-amber-500 bg-amber-100 text-amber-800' : 'border-amber-300 bg-amber-50 text-amber-600'
                    }`}>
                        <Undo2 className="w-4 h-4" />
                        <span className="text-xs font-semibold">
                            {isOver ? 'Release to unschedule job' : 'Drop here to unschedule'}
                        </span>
                    </div>
                )}
                {filteredAndSorted.length === 0 && !canDrop ? (
                    <div className="text-center text-gray-400 mt-10 text-sm space-y-2">
                        {searchTerm || priorityFilter !== 'all' ? (
                            <>
                                <Search className="w-8 h-8 mx-auto text-gray-300" />
                                <p>No jobs match your filters.</p>
                                <button
                                    onClick={() => { setSearchTerm(''); setPriorityFilter('all'); }}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                    Clear filters
                                </button>
                            </>
                        ) : (
                            <>
                                <AlertCircle className="w-8 h-8 mx-auto text-gray-300" />
                                <p>No pending jobs.</p>
                            </>
                        )}
                    </div>
                ) : (
                    filteredAndSorted.map(job => (
                        <DraggableJobCard
                            key={job.id}
                            job={job}
                            onQuickAssign={onQuickAssign}
                            onJobSelect={onJobSelect}
                            isSelected={selectedJobId === job.id}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onViewJob={onViewJob}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
