import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { UserProfile, Job } from '../types';
import { rankTechnicians, TechRecommendation, getAutoAssignment } from '../lib/techMatchingEngine';
import {
    X, Zap, Clock, MapPin, Award, Briefcase, Shield, Wrench,
    ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Search
} from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import toast from 'react-hot-toast';
import * as chrono from 'chrono-node';

interface AssignTechModalProps {
    job: Job | null;
    isOpen: boolean;
    onClose: () => void;
    onAssign: (techId: string, techName: string, scheduledTime?: Date) => void;
    technicians?: UserProfile[];
    allJobs?: Job[];
    targetDate?: Date;
}

export const AssignTechModal: React.FC<AssignTechModalProps> = ({
    job, isOpen, onClose, onAssign, technicians: propTechs, allJobs: propJobs, targetDate
}) => {
    const [techs, setTechs] = useState<UserProfile[]>([]);
    const [allOrgJobs, setAllOrgJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedTechId, setExpandedTechId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSlot, setSelectedSlot] = useState<{ techId: string; time: Date } | null>(null);
    const [localViewDate, setLocalViewDate] = useState<Date>(targetDate || new Date());

    useEffect(() => {
        setLocalViewDate(targetDate || new Date());
    }, [targetDate, isOpen]);

    useEffect(() => {
        if (isOpen && job) {
            if (propTechs && propTechs.length > 0 && propJobs) {
                // Use provided data (from DispatcherConsole)
                setTechs(propTechs);
                setAllOrgJobs(propJobs);
            } else {
                // Fetch from Firestore (standalone usage)
                fetchData();
            }
        }
        // Reset state on open
        setExpandedTechId(null);
        setSearchTerm('');
        setSelectedSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, job]);

    const fetchData = async () => {
        if (!job) return;
        setLoading(true);
        try {
            // Batch fetch: all techs + all active jobs in one go
            const [techSnapshot, jobsSnapshot] = await Promise.all([
                getDocs(query(
                    collection(db, 'users'),
                    where('org_id', '==', job.org_id),
                    where('role', '==', 'technician')
                )),
                getDocs(query(
                    collection(db, 'jobs'),
                    where('org_id', '==', job.org_id),
                    where('status', 'in', ['pending', 'scheduled', 'in_progress'])
                ))
            ]);

            setTechs(
                techSnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as UserProfile))
                    .filter(t => t.archived !== true && t.status !== 'archived')
            );
            setAllOrgJobs(jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Failed to load technicians");
        } finally {
            setLoading(false);
        }
    };

    // Rank technicians using the scoring engine
    const recommendations = useMemo(() => {
        if (!job || techs.length === 0) return [];
        return rankTechnicians(techs, job, allOrgJobs, localViewDate);
    }, [techs, job, allOrgJobs, localViewDate]);

    // Filter by search
    const filteredRecs = useMemo(() => {
        if (!searchTerm.trim()) return recommendations;
        const term = searchTerm.toLowerCase();
        return recommendations.filter(r =>
            r.tech.name.toLowerCase().includes(term) ||
            (r.tech.specialties || []).some(s => s.toLowerCase().includes(term))
        );
    }, [recommendations, searchTerm]);

    const handleAutoAssign = () => {
        if (!job) return;
        const result = getAutoAssignment(techs, job, allOrgJobs, localViewDate);
        if (result) {
            onAssign(result.tech.id, result.tech.name, result.slot.start);
            toast.success(`Auto-assigned to ${result.tech.name} at ${format(result.slot.start, 'h:mm a')}`);
            onClose();
        } else {
            toast.error("No suitable technician found with available slots");
        }
    };

    if (!isOpen || !job) return null;

    // Parse availability into clickable chips
    const parsedAvailability = (job.aiRecommendation?.customerAvailability || []).map(text => {
        const parsed = chrono.parseDate(text, new Date(), { forwardDate: true });
        return { text, date: parsed };
    });

    return (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-start">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-blue-600" />
                            Assign Technician
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                            <span className="font-medium text-gray-700">{job.customer.name}</span>
                            <span className="text-gray-300">•</span>
                            <span className="capitalize">{job.priority} priority</span>
                            <span className="text-gray-300">•</span>
                            <span>{job.estimated_duration || 60}m</span>
                        </p>
                        {parsedAvailability.length > 0 && (
                            <div className="mt-3 flex items-start gap-2 text-sm">
                                <Clock className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                                <div>
                                    <span className="font-medium text-indigo-900 block mb-1">Customer Suggested Times:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {parsedAvailability.map((item, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    if (item.date) {
                                                        setLocalViewDate(item.date);
                                                    } else {
                                                        toast.error("Could not parse a specific date from this text");
                                                    }
                                                }}
                                                className={`text-[11px] px-2 py-1 rounded-md border flex items-center transition-colors ${
                                                    item.date && isSameDay(item.date, localViewDate)
                                                        ? 'bg-indigo-100 border-indigo-200 text-indigo-800 font-semibold shadow-sm'
                                                        : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                                                }`}
                                            >
                                                {item.text}
                                                {item.date && (
                                                    <span className="ml-1 opacity-70">
                                                        ({format(item.date, 'MMM d')})
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        Click a time above to view slots for that day.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Auto-assign + Search bar */}
                <div className="px-5 py-3 border-b border-gray-100 space-y-2.5">
                    <button
                        onClick={handleAutoAssign}
                        disabled={loading || recommendations.length === 0}
                        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
                    >
                        <Zap className="w-4 h-4" />
                        Auto-Assign Best Available Tech
                    </button>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name or skill..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>
                </div>

                {/* Recommendations list */}
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                    {loading ? (
                        <div className="flex items-center justify-center h-32 text-gray-500">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mr-3" />
                            Analyzing technician fit...
                        </div>
                    ) : filteredRecs.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">
                            <Briefcase className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                            <p className="font-medium">No technicians found</p>
                        </div>
                    ) : (
                        filteredRecs.map((rec, idx) => (
                            <TechRecommendationCard
                                key={rec.tech.id}
                                rec={rec}
                                rank={idx + 1}
                                isExpanded={expandedTechId === rec.tech.id}
                                onToggleExpand={() => setExpandedTechId(
                                    expandedTechId === rec.tech.id ? null : rec.tech.id
                                )}
                                onAssign={(time) => {
                                    onAssign(rec.tech.id, rec.tech.name, time);
                                    onClose();
                                }}
                                selectedSlot={selectedSlot?.techId === rec.tech.id ? selectedSlot.time : undefined}
                                onSelectSlot={(time) => setSelectedSlot({ techId: rec.tech.id, time })}
                            />
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                    <button onClick={onClose} className="w-full py-2 text-gray-600 hover:bg-gray-200 font-medium rounded-lg text-sm transition-colors">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// Tech Recommendation Card
// ============================================================================
const TechRecommendationCard = ({
    rec, rank, isExpanded, onToggleExpand, onAssign, selectedSlot, onSelectSlot
}: {
    rec: TechRecommendation;
    rank: number;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onAssign: (time?: Date) => void;
    selectedSlot?: Date;
    onSelectSlot: (time: Date) => void;
}) => {
    const { tech, compositeScore, breakdown, matchedSkills, missingSkills, activeJobsToday, availableSlots, warnings } = rec;

    const scoreColor = compositeScore >= 70 ? 'text-green-600' :
        compositeScore >= 40 ? 'text-amber-600' : 'text-red-600';

    const scoreBg = compositeScore >= 70 ? 'bg-green-500' :
        compositeScore >= 40 ? 'bg-amber-500' : 'bg-red-500';

    const isTopPick = rank <= 2 && compositeScore >= 60;

    return (
        <div className={`border rounded-lg transition-all ${
            isTopPick ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'
        } ${isExpanded ? 'ring-2 ring-blue-400' : 'hover:border-gray-300'}`}>
            {/* Main row */}
            <div className="p-3 flex items-center gap-3">
                {/* Rank */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                    rank === 2 ? 'bg-gray-300 text-gray-700' :
                    rank === 3 ? 'bg-amber-700 text-amber-100' :
                    'bg-gray-100 text-gray-500'
                }`}>
                    {rank}
                </div>

                {/* Tech info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 text-sm truncate">{tech.name}</span>
                        {isTopPick && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                                Top Pick
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                        <span>{activeJobsToday} jobs today</span>
                        {availableSlots.length > 0 && (
                            <>
                                <span className="text-gray-300">•</span>
                                <span className="text-green-600 font-medium">{availableSlots.length} open slot{availableSlots.length > 1 ? 's' : ''}</span>
                            </>
                        )}
                        {warnings.length > 0 && (
                            <>
                                <span className="text-gray-300">•</span>
                                <span className="text-amber-600 flex items-center gap-0.5">
                                    <AlertTriangle className="w-3 h-3" />
                                    {warnings.length}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Score */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                        <div className={`text-lg font-bold ${scoreColor}`}>{compositeScore}</div>
                        <div className="text-[10px] text-gray-400 -mt-0.5">score</div>
                    </div>
                    {/* Mini score bar */}
                    <div className="w-1.5 h-10 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`w-full rounded-full transition-all ${scoreBg}`}
                            style={{ height: `${compositeScore}%`, marginTop: `${100 - compositeScore}%` }} />
                    </div>
                </div>

                {/* Expand/Action */}
                <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                        onClick={() => onAssign(selectedSlot)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors"
                    >
                        Assign
                    </button>
                    <button
                        onClick={onToggleExpand}
                        className="text-gray-400 hover:text-gray-600 flex items-center justify-center"
                    >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Expanded details */}
            {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-gray-100 pt-3">
                    {/* Score breakdown */}
                    <div>
                        <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Score Breakdown</h4>
                        <div className="grid grid-cols-5 gap-1.5">
                            {[
                                { label: 'Skills', value: breakdown.skillMatch, icon: Wrench },
                                { label: 'Load', value: breakdown.workload, icon: Briefcase },
                                { label: 'Avail', value: breakdown.availability, icon: Clock },
                                { label: 'Area', value: breakdown.proximity, icon: MapPin },
                                { label: 'Certs', value: breakdown.certifications, icon: Shield },
                            ].map(({ label, value, icon: Icon }) => (
                                <div key={label} className="text-center">
                                    <Icon className="w-3.5 h-3.5 mx-auto mb-0.5 text-gray-400" />
                                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-0.5">
                                        <div className={`h-full rounded-full ${
                                            value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500'
                                        }`} style={{ width: `${value}%` }} />
                                    </div>
                                    <span className="text-[10px] text-gray-500">{label}</span>
                                    <span className="text-[10px] font-bold text-gray-700 block">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Skill match detail */}
                    {(matchedSkills.length > 0 || missingSkills.length > 0) && (
                        <div>
                            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Skill Match</h4>
                            <div className="flex flex-wrap gap-1">
                                {matchedSkills.map(s => (
                                    <span key={s} className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 bg-green-100 text-green-800 rounded-full font-medium">
                                        <CheckCircle className="w-2.5 h-2.5" />{s}
                                    </span>
                                ))}
                                {missingSkills.map(s => (
                                    <span key={s} className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                                        <X className="w-2.5 h-2.5" />{s}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Available time slots */}
                    {availableSlots.length > 0 && (
                        <div>
                            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Available Slots</h4>
                            <div className="flex flex-wrap gap-1.5">
                                {availableSlots.slice(0, 6).map((slot, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => onAssign(slot.start)}
                                        className="px-2.5 py-1 text-xs rounded-md border transition-colors bg-white text-gray-700 border-gray-200 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 hover:shadow-sm"
                                        title={`Book ${format(slot.start, 'h:mm a')}`}
                                    >
                                        {format(slot.start, 'h:mm a')}
                                        <span className="text-[10px] opacity-70 ml-1">({slot.durationMinutes}m gap)</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Warnings */}
                    {warnings.length > 0 && (
                        <div className="space-y-1">
                            {warnings.map((w, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-md">
                                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                    {w}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Specialties */}
                    {tech.specialties && tech.specialties.length > 0 && (
                        <div>
                            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Specialties</h4>
                            <div className="flex flex-wrap gap-1">
                                {tech.specialties.map(s => (
                                    <span key={s} className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full capitalize">{s}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
