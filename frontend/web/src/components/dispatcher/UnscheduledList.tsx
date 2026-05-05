import React, { useState, useMemo } from 'react';
import { useDrag } from 'react-dnd';
import { Job } from '../../types';
import { MapPin, Clock, AlertCircle, Search, SortAsc, Zap, ChevronDown, ChevronUp, Wrench, Star } from 'lucide-react';
import { formatDistanceToNow, differenceInDays } from 'date-fns';

interface UnscheduledListProps {
    jobs: Job[];
    onQuickAssign?: (job: Job) => void;
}

type SortOption = 'priority' | 'age' | 'duration';
type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const DraggableJobCard = ({ job, onQuickAssign }: { job: Job; onQuickAssign?: (job: Job) => void }) => {
    const [expanded, setExpanded] = useState(false);
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'JOB',
        item: { id: job.id, type: 'UNSCHEDULED' },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }));

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
            className={`bg-white rounded-lg shadow-sm mb-2.5 border-l-4 cursor-move hover:shadow-md transition-all group
                ${isDragging ? 'opacity-40 scale-95' : 'opacity-100'}
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

                {/* AI recommendation summary (expandable) */}
                {aiRec && (
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

export const UnscheduledList: React.FC<UnscheduledListProps> = ({ jobs, onQuickAssign }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<SortOption>('priority');
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
    const [showSortMenu, setShowSortMenu] = useState(false);

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

    return (
        <div className="h-full flex flex-col bg-gray-50 border-r border-gray-200">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-white space-y-3">
                <div className="flex justify-between items-center">
                    <h2 className="font-bold text-gray-700 text-sm">Unscheduled Jobs</h2>
                    <span className="bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-semibold">
                        {filteredAndSorted.length}{filteredAndSorted.length !== jobs.length ? ` / ${jobs.length}` : ''}
                    </span>
                </div>

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
                {filteredAndSorted.length === 0 ? (
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
                        />
                    ))
                )}
            </div>
        </div>
    );
};
