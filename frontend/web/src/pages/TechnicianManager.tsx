import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, ToolItem } from '../types';
import { TECH_VIEW_OPTIONS, TechDashboardViewId } from '../components/tech-views/shared';
import { AddTechnicianModal } from '../components/dispatcher/AddTechnicianModal';
import { EditTechnicianModal } from '../components/dispatcher/EditTechnicianModal';
import { TechJobHistoryModal } from '../components/dispatcher/TechJobHistoryModal';
import {
    Plus,
    Search,
    Mail,
    Phone,
    MapPin,
    User,
    Wrench,
    Edit2,
    AlertCircle,
    Clock,
    CheckCircle,
    LayoutGrid,
    X,
    Archive,
    RotateCcw,
    History,
    Users,
    Package
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// Helper to get verification status badge
const getStatusBadge = (tech: UserProfile) => {
    if (tech.archived === true || tech.status === 'archived') {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                <Archive className="w-3 h-3 mr-1" />
                Archived
            </span>
        );
    }
    if (tech.emailVerified === true || tech.status === 'active') {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                <CheckCircle className="w-3 h-3 mr-1" />
                Active
            </span>
        );
    } else if (tech.status === 'pending_verification') {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                <Clock className="w-3 h-3 mr-1" />
                Pending Verification
            </span>
        );
    } else {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                <AlertCircle className="w-3 h-3 mr-1" />
                New
            </span>
        );
    }
};

type TabFilter = 'active' | 'archived' | 'all';

export const TechnicianManager: React.FC = () => {
    const navigate = useNavigate();
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [toolsList, setToolsList] = useState<ToolItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedTech, setSelectedTech] = useState<UserProfile | null>(null);
    const [historyTech, setHistoryTech] = useState<UserProfile | null>(null);
    const [archiveTargetTech, setArchiveTargetTech] = useState<UserProfile | null>(null);
    const [archiveLoading, setArchiveLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<TabFilter>('active');
    const [isBulkViewModalOpen, setIsBulkViewModalOpen] = useState(false);
    const [bulkViewSelection, setBulkViewSelection] = useState<TechDashboardViewId>('mission_briefing');
    const [bulkViewLoading, setBulkViewLoading] = useState(false);

    useEffect(() => {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('role', '==', 'technician'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const techs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
            setTechnicians(techs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching technicians:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Subscribe to tools collection to track assigned tools
    useEffect(() => {
        const toolsRef = collection(db, 'tools');
        const unsub = onSnapshot(toolsRef, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ToolItem));
            setToolsList(list);
        }, (err) => {
            console.warn('Could not fetch tools in TechnicianManager:', err);
        });
        return () => unsub();
    }, []);

    const counts = useMemo(() => {
        const archived = technicians.filter(t => t.archived === true || t.status === 'archived').length;
        const active = technicians.length - archived;
        return { active, archived, total: technicians.length };
    }, [technicians]);

    const filteredTechs = useMemo(() => {
        const searchLower = searchTerm.toLowerCase();

        return technicians.filter(tech => {
            const isArchived = tech.archived === true || tech.status === 'archived';

            if (activeTab === 'active' && isArchived) return false;
            if (activeTab === 'archived' && !isArchived) return false;

            if (!searchTerm.trim()) return true;

            const name = (tech.name || '').toLowerCase();
            const email = (tech.email || '').toLowerCase();
            const phone = (tech.phone || '').toLowerCase();
            const specialties = (tech.specialties || []).map(s => s.toLowerCase()).join(' ');

            return name.includes(searchLower) ||
                email.includes(searchLower) ||
                phone.includes(searchLower) ||
                specialties.includes(searchLower);
        });
    }, [technicians, activeTab, searchTerm]);

    const handleEditTech = (tech: UserProfile) => {
        setSelectedTech(tech);
        setIsEditModalOpen(true);
    };

    const handleViewHistory = (tech: UserProfile, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setHistoryTech(tech);
    };

    const handleConfirmArchive = async () => {
        if (!archiveTargetTech) return;
        setArchiveLoading(true);
        try {
            await updateDoc(doc(db, 'users', archiveTargetTech.id), {
                status: 'archived',
                archived: true,
                archivedAt: new Date(),
                updatedAt: new Date()
            });
            toast.success(`${archiveTargetTech.name || 'Technician'} archived`);
            setArchiveTargetTech(null);
        } catch (err: any) {
            console.error('Error archiving technician:', err);
            toast.error(err.message || 'Failed to archive technician');
        } finally {
            setArchiveLoading(false);
        }
    };

    const handleRestoreTech = async (tech: UserProfile, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            await updateDoc(doc(db, 'users', tech.id), {
                status: 'active',
                archived: false,
                archivedAt: null,
                updatedAt: new Date()
            });
            toast.success(`${tech.name || 'Technician'} restored to active`);
        } catch (err: any) {
            console.error('Error restoring technician:', err);
            toast.error('Failed to restore technician');
        }
    };

    const handleBulkSetView = async () => {
        setBulkViewLoading(true);
        try {
            const batch = writeBatch(db);
            const activeTechs = technicians.filter(t => !t.archived && t.status !== 'archived');
            activeTechs.forEach(tech => {
                const techRef = doc(db, 'users', tech.id);
                batch.update(techRef, { 'preferences.dashboardView': bulkViewSelection });
            });
            await batch.commit();
            toast.success(`Dashboard view applied to all ${activeTechs.length} active technicians`);
            setIsBulkViewModalOpen(false);
        } catch (err) {
            console.error('Bulk update failed:', err);
            toast.error('Bulk update failed');
        } finally {
            setBulkViewLoading(false);
        }
    };

    if (loading) return <div className="p-8 flex justify-center text-slate-500 font-medium">Loading Technicians...</div>;

    return (
        <div className="px-4 sm:px-5 lg:px-6 py-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Technician Management</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your field service team roster, roles, and historical records | dispatch-box.com</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsBulkViewModalOpen(true)}
                        className="inline-flex items-center px-3.5 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                        <LayoutGrid className="w-4 h-4 mr-2 text-indigo-600" />
                        Set View for All
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                        <Plus className="w-5 h-5 mr-1.5" />
                        Add Technician
                    </button>
                </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                {/* Tabs */}
                <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                            activeTab === 'active'
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Users className="w-3.5 h-3.5" />
                        Active Techs
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            activeTab === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                            {counts.active}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('archived')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                            activeTab === 'archived'
                                ? 'bg-white text-amber-700 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Archive className="w-3.5 h-3.5" />
                        Archived
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            activeTab === 'archived' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                            {counts.archived}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('all')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                            activeTab === 'all'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        All
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            activeTab === 'all' ? 'bg-slate-200 text-slate-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                            {counts.total}
                        </span>
                    </button>
                </div>

                {/* Search */}
                <div className="relative w-full md:w-80">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-9 pr-3 py-1.5 text-sm border-gray-300 rounded-lg border bg-slate-50 focus:bg-white"
                        placeholder="Search by name, email, skill..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Tech Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTechs.map((tech) => {
                    const isArchived = tech.archived === true || tech.status === 'archived';
                    const techCompanyTools = toolsList.filter(t => 
                        t.assignedTechId === tech.id || 
                        (t as any).tech_id === tech.id ||
                        t.assignedTechName === tech.name ||
                        (t.unitAssignments && t.unitAssignments.some(u => u.techId === tech.id || u.techName === tech.name))
                    );
                    const totalTools = techCompanyTools.length + (tech.toolInventory?.length || 0);

                    return (
                        <div
                            key={tech.id}
                            onClick={() => handleEditTech(tech)}
                            className={`bg-white overflow-hidden shadow-sm rounded-xl border transition-all flex flex-col justify-between group cursor-pointer ${
                                isArchived
                                    ? 'border-amber-200 bg-amber-50/20 hover:border-amber-300'
                                    : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                            }`}
                        >
                            <div className="p-5 flex-1">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3.5">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 font-bold shadow-sm ${
                                            isArchived
                                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                : 'bg-blue-100 text-blue-600 border border-blue-200'
                                        }`}>
                                            {isArchived ? <Archive className="w-5 h-5" /> : <User className="w-6 h-6" />}
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-gray-900 leading-tight flex items-center gap-1.5">
                                                {tech.name || 'Unnamed Tech'}
                                            </h3>
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                                                    tech.techType === 'solopreneur'
                                                        ? 'bg-purple-100 text-purple-800'
                                                        : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {tech.techType === 'solopreneur' ? 'Contractor' : 'Employee'}
                                                </span>
                                                {getStatusBadge(tech)}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditTech(tech);
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Edit Technician"
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="mt-4 space-y-1.5 text-xs text-gray-600">
                                    <div className="flex items-center">
                                        <Mail className="flex-shrink-0 mr-2 h-3.5 w-3.5 text-gray-400" />
                                        <span className="truncate">{tech.email}</span>
                                    </div>
                                    <div className="flex items-center">
                                        <Phone className="flex-shrink-0 mr-2 h-3.5 w-3.5 text-gray-400" />
                                        <span>{tech.phone || 'No phone number'}</span>
                                    </div>
                                    <div className="flex items-center">
                                        <MapPin className="flex-shrink-0 mr-2 h-3.5 w-3.5 text-gray-400" />
                                        <span className="truncate">{tech.homeLocation?.address || tech.address || 'No address registered'}</span>
                                    </div>

                                    {totalTools > 0 && (
                                        <div className="flex items-center text-[11px] text-indigo-700 bg-indigo-50/70 px-2 py-1 rounded-md border border-indigo-100/80 mt-2">
                                            <Wrench className="flex-shrink-0 mr-1.5 h-3 w-3 text-indigo-600" />
                                            <span className="font-medium">
                                                {totalTools} tools & equipment {techCompanyTools.length > 0 ? `(${techCompanyTools.length} company kit)` : ''}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Skills */}
                                {tech.specialties && tech.specialties.length > 0 && (
                                    <div className="mt-3.5 pt-3 border-t border-gray-100">
                                        <div className="flex items-start">
                                            <Wrench className="flex-shrink-0 h-3.5 w-3.5 text-gray-400 mt-0.5 mr-1.5" />
                                            <div className="flex flex-wrap gap-1">
                                                {tech.specialties.slice(0, 3).map((skill) => (
                                                    <span
                                                        key={skill}
                                                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700"
                                                    >
                                                        {skill}
                                                    </span>
                                                ))}
                                                {tech.specialties.length > 3 && (
                                                    <span className="text-[10px] text-gray-400 px-1 py-0.5">
                                                        +{tech.specialties.length - 3} more
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Card Footer Actions */}
                            <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 rounded-b-xl flex items-center justify-between gap-2">
                                <button
                                    onClick={(e) => handleViewHistory(tech, e)}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors"
                                >
                                    <History className="w-3.5 h-3.5" />
                                    Job History
                                </button>

                                <div className="flex items-center gap-1.5">
                                    {isArchived ? (
                                        <button
                                            onClick={(e) => handleRestoreTech(tech, e)}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1.5 rounded-lg transition-colors"
                                            title="Restore to active technicians"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            Restore
                                        </button>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setArchiveTargetTech(tech);
                                            }}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-amber-700 hover:bg-amber-50 px-2 py-1.5 rounded-lg transition-colors"
                                            title="Archive technician"
                                        >
                                            <Archive className="w-3 h-3" />
                                            Archive
                                        </button>
                                    )}

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditTech(tech);
                                        }}
                                        className="text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredTechs.length === 0 && (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 p-8">
                    <User className="mx-auto h-12 w-12 text-gray-300" />
                    <h3 className="mt-2 text-base font-semibold text-gray-900">
                        {activeTab === 'archived' ? 'No archived technicians' : 'No technicians found'}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
                        {searchTerm
                            ? `No technicians matched "${searchTerm}".`
                            : activeTab === 'archived'
                            ? 'When you archive a technician, they will appear here and remain searchable for job history.'
                            : 'Get started by onboarding or adding your first technician.'}
                    </p>
                    {activeTab !== 'archived' && (
                        <div className="mt-6">
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                <Plus className="w-5 h-5 mr-2" />
                                Add Technician
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
            <AddTechnicianModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />

            <EditTechnicianModal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setSelectedTech(null);
                }}
                technician={selectedTech}
            />

            {/* Dedicated Tech Job History Modal */}
            <TechJobHistoryModal
                isOpen={!!historyTech}
                onClose={() => setHistoryTech(null)}
                technician={historyTech}
            />

            {/* Archive Confirmation Modal */}
            {archiveTargetTech && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-200 animate-in fade-in zoom-in-95">
                        <div className="flex items-center gap-3 text-amber-600">
                            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                                <Archive className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Archive Technician?</h3>
                                <p className="text-xs text-slate-500">{archiveTargetTech.name || archiveTargetTech.email}</p>
                            </div>
                        </div>

                        <div className="text-xs text-slate-600 space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="font-semibold text-slate-700">What happens when archived:</p>
                            <ul className="list-disc list-inside space-y-1 text-slate-500">
                                <li>The technician is removed from active dispatch boards and calendars</li>
                                <li>They will not appear in new job assignment dropdowns</li>
                                <li><strong>All historical records, completed jobs, and quotes retain their name</strong></li>
                                <li>You can view their past job history anytime in the "Archived" tab</li>
                            </ul>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setArchiveTargetTech(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmArchive}
                                disabled={archiveLoading}
                                className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-colors"
                            >
                                <Archive className="w-4 h-4" />
                                {archiveLoading ? 'Archiving...' : 'Yes, Archive Technician'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Set View Modal */}
            {isBulkViewModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <LayoutGrid className="w-5 h-5 text-indigo-500" />
                                Set Dashboard View for All Techs
                            </h2>
                            <button onClick={() => setIsBulkViewModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-2">
                            <p className="text-sm text-gray-600 mb-4">
                                This will set the dashboard view for all <strong>{counts.active}</strong> active technician{counts.active !== 1 ? 's' : ''}.
                            </p>
                            {TECH_VIEW_OPTIONS.map(option => (
                                <label
                                    key={option.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                        bulkViewSelection === option.id
                                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="bulkView"
                                        value={option.id}
                                        checked={bulkViewSelection === option.id}
                                        onChange={() => setBulkViewSelection(option.id)}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                    />
                                    <span className="text-lg">{option.emoji}</span>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">{option.label}</p>
                                        <p className="text-xs text-gray-500">{option.description}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                            <button
                                onClick={() => setIsBulkViewModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBulkSetView}
                                disabled={bulkViewLoading}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                {bulkViewLoading ? 'Applying...' : `Apply to All ${counts.active} Techs`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
