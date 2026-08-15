import React, { useState, useEffect, KeyboardEvent, useMemo } from 'react';
import { doc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, storage, functions } from '../../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { UserProfile, TechPermissions, ToolItem, ToolUnitAssignment } from '../../types';
import { TECH_VIEW_OPTIONS, TechDashboardViewId } from '../tech-views/shared';
import {
    X,
    Save,
    Upload,
    FileText,
    Loader2,
    Trash2,
    LayoutGrid,
    Archive,
    RotateCcw,
    History,
    AlertTriangle,
    Wrench,
    Plus,
    Tag,
    Truck,
    Package,
    CheckCircle2,
    User,
    Shield,
    ExternalLink
} from 'lucide-react';
import { TechJobHistoryModal } from './TechJobHistoryModal';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

interface EditTechnicianModalProps {
    isOpen: boolean;
    onClose: () => void;
    technician: UserProfile | null;
}

type ModalTab = 'details' | 'skills' | 'tools' | 'lifecycle';

export const EditTechnicianModal: React.FC<EditTechnicianModalProps> = ({ isOpen, onClose, technician }) => {
    const [activeTab, setActiveTab] = useState<ModalTab>('details');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [homeAddress, setHomeAddress] = useState('');
    const [skills, setSkills] = useState<string[]>([]);
    const [skillInput, setSkillInput] = useState('');
    
    // Tools management
    const [companyTools, setCompanyTools] = useState<ToolItem[]>([]);
    const [selectedCompanyToolId, setSelectedCompanyToolId] = useState('');
    const [toolInventory, setToolInventory] = useState<ToolItem[]>([]);
    const [newPersonalTool, setNewPersonalTool] = useState<{
        name: string;
        category: string;
        condition: ToolItem['condition'];
        serialNumber?: string;
        location?: string;
    }>({
        name: '',
        category: 'hand_tool',
        condition: 'good',
        serialNumber: '',
        location: ''
    });

    const [techType, setTechType] = useState<'corporate' | 'solopreneur'>('corporate');
    const [permissions, setPermissions] = useState<TechPermissions>({
        canAddCustomers: true,
        canAddLocations: true,
        canAddVendors: true,
        canPurchaseMaterials: true,
        canPurchaseTools: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [resumeUrl, setResumeUrl] = useState('');
    const [resumeName, setResumeName] = useState('');
    const [isUploadingResume, setIsUploadingResume] = useState(false);
    const [resumeUploadProgress, setResumeUploadProgress] = useState(0);
    const [dashboardView, setDashboardView] = useState<TechDashboardViewId>('mission_briefing');
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [archiveLoading, setArchiveLoading] = useState(false);
    const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

    const isArchived = technician?.archived === true || technician?.status === 'archived';

    // Populate form when technician changes
    useEffect(() => {
        if (technician) {
            setName(technician.name || '');
            setEmail(technician.email || '');
            setPhone(technician.phone || '');
            setHomeAddress(technician.homeLocation?.address || technician.address || '');
            setSkills(technician.specialties || []);
            setToolInventory(technician.toolInventory || []);
            setResumeUrl(technician.resumeUrl || '');
            setResumeName(technician.resumeName || '');
            setTechType(technician.techType || 'corporate');
            setPermissions(technician.permissions || {
                canAddCustomers: true,
                canAddLocations: true,
                canAddVendors: true,
                canPurchaseMaterials: true,
                canPurchaseTools: true
            });
            setDashboardView(technician.preferences?.dashboardView || 'mission_briefing');
            setActiveTab('details');
        }
    }, [technician]);

    // Subscribe to all company tools in the organization to display assigned tools and available company tools
    useEffect(() => {
        if (!isOpen || !technician?.org_id) return;

        const q = query(collection(db, 'tools'), where('org_id', '==', technician.org_id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ToolItem));
            setCompanyTools(list);
        }, (err) => {
            console.warn('Error fetching organization tools:', err);
        });

        return () => unsubscribe();
    }, [isOpen, technician?.org_id]);

    // Assigned company tools to this specific technician
    const assignedCompanyTools = useMemo(() => {
        if (!technician) return [];
        return companyTools.filter(t => 
            t.assignedTechId === technician.id ||
            (t as any).tech_id === technician.id ||
            t.assignedTechName === technician.name ||
            (t.unitAssignments && t.unitAssignments.some(u => u.techId === technician.id || u.techName === technician.name))
        );
    }, [companyTools, technician]);

    // Unassigned or other available company tools in the org
    const availableCompanyTools = useMemo(() => {
        if (!technician) return [];
        return companyTools.filter(t => 
            t.assignedTechId !== technician.id &&
            (t as any).tech_id !== technician.id
        );
    }, [companyTools, technician]);

    if (!isOpen || !technician) return null;

    const handleSkillKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === ',' || e.key === 'Enter') && skillInput.trim()) {
            e.preventDefault();
            const newSkill = skillInput.trim().replace(/,/g, '');
            if (newSkill && !skills.includes(newSkill)) {
                setSkills([...skills, newSkill]);
            }
            setSkillInput('');
        } else if (e.key === 'Backspace' && !skillInput && skills.length > 0) {
            setSkills(skills.slice(0, -1));
        }
    };

    const removeSkill = (skillToRemove: string) => {
        setSkills(skills.filter(s => s !== skillToRemove));
    };

    // Assign an existing company tool to this tech
    const handleAssignCompanyTool = async () => {
        if (!selectedCompanyToolId || !technician) return;
        try {
            const toolDocRef = doc(db, 'tools', selectedCompanyToolId);
            await updateDoc(toolDocRef, {
                assignedTechId: technician.id,
                assignedTechName: technician.name || technician.email,
                tech_id: technician.id,
                location: `${technician.name || 'Technician'}'s Truck`,
                status: 'in_use',
                updatedAt: new Date()
            });
            toast.success('Company tool assigned to technician truck kit');
            setSelectedCompanyToolId('');
        } catch (err: any) {
            console.error('Error assigning tool:', err);
            toast.error('Failed to assign tool');
        }
    };

    // Unassign a company tool from this tech
    const handleUnassignCompanyTool = async (toolId: string) => {
        try {
            const toolDocRef = doc(db, 'tools', toolId);
            await updateDoc(toolDocRef, {
                assignedTechId: null,
                assignedTechName: null,
                tech_id: null,
                location: 'Warehouse / Main Storage',
                status: 'available',
                updatedAt: new Date()
            });
            toast.success('Tool returned to warehouse');
        } catch (err: any) {
            console.error('Error unassigning tool:', err);
            toast.error('Failed to unassign tool');
        }
    };

    // Add personal tool to toolInventory
    const handleAddPersonalTool = () => {
        if (!newPersonalTool.name.trim()) {
            toast.error('Please enter a tool name');
            return;
        }
        const created: ToolItem = {
            id: 'tool_' + Date.now(),
            name: newPersonalTool.name.trim(),
            category: newPersonalTool.category,
            condition: newPersonalTool.condition,
            serialNumber: newPersonalTool.serialNumber || '',
            location: newPersonalTool.location || `${name || 'Tech'}'s Kit`,
            status: 'in_use'
        };
        setToolInventory([...toolInventory, created]);
        setNewPersonalTool({
            name: '',
            category: 'hand_tool',
            condition: 'good',
            serialNumber: '',
            location: ''
        });
        toast.success('Tool added to technician kit');
    };

    const handleRemovePersonalTool = (toolId: string) => {
        setToolInventory(toolInventory.filter(t => t.id !== toolId));
    };

    const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!technician.id) {
            setError('Technician ID not found. Cannot upload resume.');
            return;
        }

        setIsUploadingResume(true);
        setResumeUploadProgress(0);
        setError('');

        try {
            const storageRef = ref(storage, `resumes/${technician.id}/${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setResumeUploadProgress(Math.round(progress));
                },
                (err) => {
                    console.error("Upload failed", err);
                    setError('Failed to upload resume.');
                    setIsUploadingResume(false);
                },
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    setResumeUrl(downloadURL);
                    setResumeName(file.name);
                    
                    try {
                        const parseResumeSkills = httpsCallable(functions, 'parseResumeSkills');
                        const result = await parseResumeSkills({ 
                            storagePath: `resumes/${technician.id}/${file.name}`,
                            mimeType: file.type
                        });

                        const data = result.data as { success: boolean, skills: string[] };
                        if (data.success && data.skills && Array.isArray(data.skills)) {
                            setSkills(prev => {
                                const newSkills = [...prev];
                                data.skills.forEach(skill => {
                                    if (!newSkills.includes(skill)) newSkills.push(skill);
                                });
                                return newSkills;
                            });
                            setSuccess('Resume uploaded and skills extracted successfully!');
                            setTimeout(() => setSuccess(''), 3000);
                        }
                    } catch (parseErr: any) {
                        console.error("Parse failed", parseErr);
                        setError(`Resume uploaded but failed to extract skills automatically: ${parseErr.message}`);
                    }
                    setIsUploadingResume(false);
                }
            );
        } catch (err: any) {
            console.error("Upload error", err);
            setError('Error uploading resume: ' + err.message);
            setIsUploadingResume(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            await updateDoc(doc(db, 'users', technician.id), {
                name,
                phone,
                techType,
                specialties: skills,
                resumeUrl,
                resumeName,
                toolInventory,
                tools: toolInventory.map(t => t.name), // legacy mirror
                homeLocation: {
                    address: homeAddress
                },
                address: homeAddress,
                permissions: techType === 'corporate' ? permissions : {
                    canAddCustomers: true,
                    canAddLocations: true,
                    canAddVendors: true,
                    canPurchaseMaterials: true,
                    canPurchaseTools: true
                },
                'preferences.dashboardView': dashboardView,
                updatedAt: new Date()
            });

            setSuccess('Profile updated successfully!');
            toast.success('Technician profile updated');
            setTimeout(() => {
                onClose();
                setSuccess('');
            }, 1200);
        } catch (err: any) {
            console.error("Error updating technician:", err);
            setError(err.message || 'Failed to update profile.');
        } finally {
            setLoading(false);
        }
    };

    const handleArchive = async () => {
        if (!technician?.id) return;
        setArchiveLoading(true);
        setError('');
        try {
            await updateDoc(doc(db, 'users', technician.id), {
                status: 'archived',
                archived: true,
                archivedAt: new Date(),
                updatedAt: new Date()
            });
            toast.success('Technician archived successfully');
            setShowArchiveConfirm(false);
            onClose();
        } catch (err: any) {
            console.error("Error archiving technician:", err);
            setError(err.message || 'Failed to archive technician.');
        } finally {
            setArchiveLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!technician?.id) return;
        setArchiveLoading(true);
        setError('');
        try {
            await updateDoc(doc(db, 'users', technician.id), {
                status: 'active',
                archived: false,
                archivedAt: null,
                updatedAt: new Date()
            });
            toast.success('Technician restored to active');
            onClose();
        } catch (err: any) {
            console.error("Error restoring technician:", err);
            setError(err.message || 'Failed to restore technician.');
        } finally {
            setArchiveLoading(false);
        }
    };

    return (
        <>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
                
                {/* Header with Quick Actions */}
                <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center z-10">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                            isArchived ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-600'
                        }`}>
                            {isArchived ? <Archive className="w-5 h-5" /> : <User className="w-5 h-5" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-gray-900">{name || 'Edit Technician'}</h2>
                                {isArchived ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                        <Archive className="w-3 h-3" /> Archived
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        <CheckCircle2 className="w-3 h-3" /> Active
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-500">{email || 'No email set'}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsHistoryModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                            title="View all jobs done by this technician"
                        >
                            <History className="w-3.5 h-3.5" />
                            Job History
                        </button>

                        {isArchived ? (
                            <button
                                type="button"
                                onClick={handleRestore}
                                disabled={archiveLoading}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors"
                                title="Restore technician to active status"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Restore Tech
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowArchiveConfirm(true)}
                                disabled={archiveLoading}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors"
                                title="Archive technician"
                            >
                                <Archive className="w-3.5 h-3.5" />
                                Archive
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 px-6 pt-3 bg-slate-50 border-b border-gray-200 text-xs font-semibold">
                    <button
                        type="button"
                        onClick={() => setActiveTab('details')}
                        className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === 'details'
                                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <User className="w-3.5 h-3.5" />
                        General Details
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('skills')}
                        className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === 'skills'
                                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Tag className="w-3.5 h-3.5" />
                        Skills & Resume ({skills.length})
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('tools')}
                        className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === 'tools'
                                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Wrench className="w-3.5 h-3.5" />
                        Tools & Truck Kit ({assignedCompanyTools.length + toolInventory.length})
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('lifecycle')}
                        className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === 'lifecycle'
                                ? 'border-amber-600 text-amber-700 bg-white rounded-t-lg'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Archive className="w-3.5 h-3.5" />
                        Status & Lifecycle
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                    {isArchived && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                            <Archive className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div className="text-xs space-y-0.5">
                                <strong className="font-semibold block text-amber-800 text-sm">Archived Technician</strong>
                                <p>This technician is hidden from active dispatch boards, calendars, and new job assignments. All historical jobs, quotes, and reports retain this technician's records intact.</p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
                            {success}
                        </div>
                    )}

                    {/* TAB 1: General Details */}
                    {activeTab === 'details' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Full Name *</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        disabled
                                        className="w-full border border-gray-200 rounded-lg p-2.5 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Phone (SMS & Alerts)</label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="808-555-0123"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Technician Type</label>
                                    <select
                                        value={techType}
                                        onChange={(e) => setTechType(e.target.value as 'corporate' | 'solopreneur')}
                                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="corporate">Corporate Employee</option>
                                        <option value="solopreneur">Solopreneur / Contractor</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Home Location / Base</label>
                                    <input
                                        type="text"
                                        value={homeAddress}
                                        onChange={(e) => setHomeAddress(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="123 Main St, Honolulu, HI"
                                    />
                                </div>
                            </div>

                            {/* Dashboard View */}
                            <div className="pt-3 border-t border-gray-200">
                                <label className="block text-xs font-semibold text-gray-700 uppercase mb-2 flex items-center gap-1.5">
                                    <LayoutGrid className="w-4 h-4 text-indigo-500" />
                                    Default Dashboard View Layout
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {TECH_VIEW_OPTIONS.map(option => (
                                        <label
                                            key={option.id}
                                            className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                                dashboardView === option.id
                                                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="dashboardView"
                                                value={option.id}
                                                checked={dashboardView === option.id}
                                                onChange={() => setDashboardView(option.id)}
                                                className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                            />
                                            <div>
                                                <p className="text-xs font-bold text-gray-900">{option.emoji} {option.label}</p>
                                                <p className="text-[11px] text-gray-500">{option.description}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: Skills & Resume */}
                    {activeTab === 'skills' && (
                        <div className="space-y-5">
                            {/* Skills */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">Specialties & Skill Tags</label>
                                <div className="border border-gray-300 rounded-xl p-3 focus-within:ring-2 focus-within:ring-blue-500">
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {skills.map((skill) => (
                                            <span
                                                key={skill}
                                                className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                                            >
                                                {skill}
                                                <button
                                                    type="button"
                                                    onClick={() => removeSkill(skill)}
                                                    className="ml-1.5 inline-flex items-center justify-center text-blue-400 hover:text-blue-600"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <input
                                        type="text"
                                        value={skillInput}
                                        onChange={(e) => setSkillInput(e.target.value)}
                                        onKeyDown={handleSkillKeyDown}
                                        className="w-full border-0 p-1 focus:ring-0 text-sm placeholder-gray-400"
                                        placeholder="Type a skill (e.g. HVAC, Heat Pump, Wiring) and press Enter..."
                                    />
                                </div>
                            </div>

                            {/* Resume / AI Extraction */}
                            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Resume / CV (AI Skill Extraction)</label>
                                {resumeUrl ? (
                                    <div className="flex items-center justify-between mb-3 bg-white p-3 border border-gray-200 rounded-lg">
                                        <div className="flex items-center text-sm truncate max-w-[70%]">
                                            <FileText className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0" />
                                            <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline truncate text-xs font-medium">
                                                {resumeName || 'View Uploaded Resume'}
                                            </a>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => { setResumeUrl(''); setResumeName(''); }}
                                            className="text-red-500 hover:text-red-600 text-xs flex items-center bg-red-50 px-2 py-1 rounded hover:bg-red-100"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                                        </button>
                                    </div>
                                ) : null}

                                <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-white hover:bg-gray-50 transition-colors ${isUploadingResume ? 'opacity-70 pointer-events-none' : ''}`}>
                                    <div className="flex flex-col items-center justify-center pt-3 pb-3">
                                        {isUploadingResume ? (
                                            <>
                                                <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-1" />
                                                <p className="text-xs font-medium text-gray-700">Extracting skills... {resumeUploadProgress}%</p>
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-6 h-6 text-gray-400 mb-1" />
                                                <p className="text-xs text-gray-600"><span className="font-semibold text-blue-600">Click to upload resume</span></p>
                                                <p className="text-[10px] text-gray-400">PDF, DOCX, or TXT</p>
                                            </>
                                        )}
                                    </div>
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept=".pdf,.doc,.docx,.txt,application/pdf,text/plain"
                                        onChange={handleResumeUpload}
                                        disabled={isUploadingResume}
                                    />
                                </label>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: Tools & Truck Kit (Robust tools management) */}
                    {activeTab === 'tools' && (
                        <div className="space-y-6">
                            
                            {/* Section 1: Assigned Company Tools from Inventory */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Truck className="w-4 h-4 text-indigo-600" />
                                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                            Assigned Company Equipment & Truck Kit ({assignedCompanyTools.length})
                                        </h4>
                                    </div>
                                    <span className="text-[11px] text-slate-500">Synced with Company Tools Inventory</span>
                                </div>

                                {/* Assign tool dropdown */}
                                <div className="flex items-center gap-2 pt-1">
                                    <select
                                        value={selectedCompanyToolId}
                                        onChange={(e) => setSelectedCompanyToolId(e.target.value)}
                                        className="flex-1 border border-slate-300 rounded-lg p-2 text-xs bg-white focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="">-- Assign a tool from company warehouse --</option>
                                        {availableCompanyTools.map(t => (
                                            <option key={t.id} value={t.id}>
                                                {t.name} {t.model ? `(${t.model})` : ''} - {t.category} ({t.location || 'Warehouse'})
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleAssignCompanyTool}
                                        disabled={!selectedCompanyToolId}
                                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1 shadow-sm"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Assign to Tech
                                    </button>
                                </div>

                                {/* List of assigned company tools */}
                                <div className="space-y-2 pt-2">
                                    {assignedCompanyTools.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic py-2 text-center">
                                            No company tools or truck kit items are currently assigned to this technician.
                                        </p>
                                    ) : (
                                        assignedCompanyTools.map(tool => (
                                            <div key={tool.id} className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-3 shadow-xs">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs font-bold text-slate-900">{tool.name}</span>
                                                        {tool.model && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                                                                {tool.model}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 capitalize">
                                                            {tool.category?.replace('_', ' ')}
                                                        </span>
                                                        {tool.trackerType && tool.trackerType !== 'none' && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">
                                                                📡 Tracked ({tool.trackerType})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                                                        {tool.serialNumber && <span>SN: {tool.serialNumber}</span>}
                                                        <span>Location: {tool.location || 'Truck Kit'}</span>
                                                        <span className="capitalize">Condition: {tool.condition || 'good'}</span>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => handleUnassignCompanyTool(tool.id)}
                                                    className="text-xs text-slate-500 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 border border-slate-200 transition-colors"
                                                    title="Return to warehouse storage"
                                                >
                                                    Return Tool
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Section 2: Technician-Owned Tools Inventory */}
                            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Package className="w-4 h-4 text-emerald-600" />
                                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                            Technician Personal Tools ({toolInventory.length})
                                        </h4>
                                    </div>
                                    <span className="text-[11px] text-slate-500">Self-provided tools</span>
                                </div>

                                {/* Add Personal Tool */}
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                                    <input
                                        type="text"
                                        value={newPersonalTool.name}
                                        onChange={(e) => setNewPersonalTool({ ...newPersonalTool, name: e.target.value })}
                                        placeholder="Tool name (e.g. Fluke 87V)"
                                        className="sm:col-span-2 border border-gray-300 rounded-lg p-2 text-xs"
                                    />
                                    <select
                                        value={newPersonalTool.category}
                                        onChange={(e) => setNewPersonalTool({ ...newPersonalTool, category: e.target.value })}
                                        className="border border-gray-300 rounded-lg p-2 text-xs"
                                    >
                                        <option value="hand_tool">Hand Tool</option>
                                        <option value="power_tool">Power Tool</option>
                                        <option value="diagnostic">Diagnostic</option>
                                        <option value="safety">Safety</option>
                                        <option value="specialized">Specialized</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleAddPersonalTool}
                                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 shadow-sm"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Add Tool
                                    </button>
                                </div>

                                {/* List of personal tools */}
                                <div className="space-y-1.5 pt-1 max-h-48 overflow-y-auto">
                                    {toolInventory.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic py-2 text-center">
                                            No personal tools logged yet.
                                        </p>
                                    ) : (
                                        toolInventory.map(t => (
                                            <div key={t.id} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
                                                <div>
                                                    <span className="font-semibold text-slate-900">{t.name}</span>
                                                    <span className="ml-2 text-slate-500 capitalize">({t.category?.replace('_', ' ')})</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemovePersonalTool(t.id)}
                                                    className="text-red-500 hover:text-red-700 p-1"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: Status & Lifecycle (Archive/Restore) */}
                    {activeTab === 'lifecycle' && (
                        <div className="space-y-4">
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900">Technician Roster Status</h4>
                                        <p className="text-xs text-slate-500 mt-0.5">Control availability on dispatch boards and scheduling calendars</p>
                                    </div>
                                    {isArchived ? (
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                            <Archive className="w-3.5 h-3.5" /> Archived
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Active Roster
                                        </span>
                                    )}
                                </div>

                                <div className="text-xs text-slate-600 space-y-2 bg-white p-4 rounded-xl border border-slate-200">
                                    <p className="font-semibold text-slate-800">What happens when a technician is archived:</p>
                                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                                        <li>They will not appear on active Dispatch swimlanes or Calendar boards</li>
                                        <li>They are excluded from new job assignment dropdowns and AI scoring</li>
                                        <li><strong>All historical jobs, quotes, and reports retain their name and records</strong></li>
                                        <li>You can view their past job history anytime in the "Archived" tab</li>
                                    </ul>
                                </div>

                                <div className="pt-2 flex items-center justify-between">
                                    {isArchived ? (
                                        <button
                                            type="button"
                                            onClick={handleRestore}
                                            disabled={archiveLoading}
                                            className="px-4 py-2.5 text-sm font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-xl transition-colors flex items-center gap-2 shadow-xs"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            {archiveLoading ? 'Restoring...' : 'Restore Technician to Active'}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setShowArchiveConfirm(true)}
                                            disabled={archiveLoading}
                                            className="px-4 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors flex items-center gap-2 shadow-sm"
                                        >
                                            <Archive className="w-4 h-4" />
                                            Archive This Technician
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setIsHistoryModalOpen(true)}
                                        className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                                    >
                                        <History className="w-4 h-4 text-blue-600" />
                                        Review Full Job History
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer Buttons */}
                    <div className="flex items-center justify-between pt-5 border-t border-gray-200">
                        {isArchived ? (
                            <button
                                type="button"
                                onClick={handleRestore}
                                disabled={archiveLoading}
                                className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            >
                                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                {archiveLoading ? 'Restoring...' : 'Restore / Unarchive'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowArchiveConfirm(true)}
                                disabled={archiveLoading}
                                className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                            >
                                <Archive className="w-3.5 h-3.5 mr-1.5" />
                                Archive Technician
                            </button>
                        )}

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex items-center px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
                            >
                                {loading ? 'Saving...' : (
                                    <>
                                        <Save className="w-4 h-4 mr-1.5" />
                                        Save Changes
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>

        {/* Archive Confirmation Modal */}
        {showArchiveConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-200 animate-in fade-in zoom-in-95">
                    <div className="flex items-center gap-3 text-amber-600">
                        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                            <Archive className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Archive Technician?</h3>
                            <p className="text-xs text-slate-500">{technician.name || technician.email}</p>
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
                            onClick={() => setShowArchiveConfirm(false)}
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            Keep Active
                        </button>
                        <button
                            type="button"
                            onClick={handleArchive}
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

        {/* Tech Job History Modal */}
        <TechJobHistoryModal
            isOpen={isHistoryModalOpen}
            onClose={() => setIsHistoryModalOpen(false)}
            technician={technician}
        />
        </>
    );
};
