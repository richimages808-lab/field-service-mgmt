import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { db } from '../../firebase';
import {
    collection, query, getDocs, doc, setDoc, updateDoc, addDoc, serverTimestamp,
    where, orderBy, limit, Timestamp
} from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import {
    ArrowLeft, Bot, Search, PhoneCall, Settings, Plus,
    Loader2, Save, Users, Building2, Calendar, Edit3,
    ChevronDown, ChevronUp, Sparkles, Briefcase, FileText, X
} from 'lucide-react';

// --- TYPES ---
interface AIVoiceProfile {
    id: string;
    name: string;
    description: string;
    greeting: {
        template: string;
        variables: string[];
    };
    collection: {
        requiredFields: string[];
        maxRetries: number;
        requireConfirmation?: boolean;
        enableFallbackCommunication?: boolean;
    };
    confirmation: {
        template: string;
    };
    behavior: {
        tone: string;
        transferNumber: string;
        transferCondition: string;
    };
    createdAt?: any;
    updatedAt?: any;
}

interface VoiceSession {
    id: string;
    orgId: string;
    orgName?: string;
    callerPhone: string;
    transcript: any;
    summary?: string;
    status: string;
    collected?: Record<string, any>;
    createdAt: any;
}

interface OrgResult {
    id: string;
    name: string;
    aiVoiceProfileId?: string;
    email?: string;
}

const TABS = [
    { id: 'profiles', label: 'Profiles', icon: Bot },
    { id: 'customer-search', label: 'Customer Search', icon: Search },
    { id: 'call-history', label: 'Call History', icon: PhoneCall },
    { id: 'system-config', label: 'System Config', icon: Settings }
] as const;

export const AIVoiceAdmin: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('profiles');

    // Data states
    const [profiles, setProfiles] = useState<AIVoiceProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [profileEditData, setProfileEditData] = useState<AIVoiceProfile | null>(null);

    const [orgSearchTerm, setOrgSearchTerm] = useState('');
    const [orgResults, setOrgResults] = useState<OrgResult[]>([]);
    
    const [historySearchTerm, setHistorySearchTerm] = useState('');
    const [historyResults, setHistoryResults] = useState<VoiceSession[]>([]);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const navigate = useNavigate();
    const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
    const [convertingId, setConvertingId] = useState<string | null>(null);

    const createJobFromSession = async (session: VoiceSession) => {
        const jobData = {
            organizationId: session.orgId || '',
            customer: {
                name: session.orgName || 'Unknown Caller',
                phone: session.callerPhone || '',
                email: '',
                address: session.collected?.address || ''
            },
            request: {
                description: session.summary || session.transcript?.substring(0, 500) || 'Phone inquiry',
                source: 'phone',
                photos: [],
                availability: []
            },
            status: 'pending',
            priority: 'medium',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            source: 'phone',
            metadata: {
                voiceSessionId: session.id
            }
        };
        const jobRef = await addDoc(collection(db, 'jobs'), jobData);
        return jobRef.id;
    };

    const handleCreateJobFromSession = async (session: VoiceSession) => {
        setConvertingId(session.id);
        try {
            const jobId = await createJobFromSession(session);
            toast.success('Job created successfully');
            navigate(`/jobs/${jobId}`);
        } catch (e) {
            console.error(e);
            toast.error('Error creating job');
        } finally {
            setConvertingId(null);
        }
    };

    const handleCreateQuoteFromSession = async (session: VoiceSession) => {
        setConvertingId(session.id);
        try {
            const jobId = await createJobFromSession(session);
            toast.success('Job created. Redirecting to quote builder...');
            navigate(`/quotes/new/${jobId}`);
        } catch (e) {
            console.error(e);
            toast.error('Error creating quote');
        } finally {
            setConvertingId(null);
        }
    };

    // Initial check
    const isAuthorized = user?.site_admin || user?.email?.toLowerCase() === 'rich@richheaton.com';

    useEffect(() => {
        if (isAuthorized) {
            loadProfiles();
        }
    }, [isAuthorized]);

    useEffect(() => {
        if (activeTab === 'call-history' && historyResults.length === 0) {
            searchHistory();
        }
    }, [activeTab]);

    const loadProfiles = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, 'ai_voice_profiles'));
            const loaded: AIVoiceProfile[] = [];
            snap.forEach(d => loaded.push({ id: d.id, ...d.data() } as AIVoiceProfile));
            setProfiles(loaded);
            if (loaded.length > 0 && !selectedProfileId) {
                setSelectedProfileId(loaded[0].id);
                setProfileEditData(loaded[0]);
            }
        } catch (error) {
            console.error('Error loading profiles:', error);
            toast.error('Failed to load profiles');
        }
        setLoading(false);
    };

    const handleProfileSelect = (id: string) => {
        setSelectedProfileId(id);
        const p = profiles.find(x => x.id === id);
        if (p) setProfileEditData(JSON.parse(JSON.stringify(p))); // deep copy
    };

    const handleSaveProfile = async () => {
        if (!profileEditData) return;
        setSaving(true);
        try {
            const ref = doc(db, 'ai_voice_profiles', profileEditData.id);
            const dataToSave = {
                ...profileEditData,
                updatedAt: Timestamp.now()
            };
            if (!profileEditData.createdAt) {
                dataToSave.createdAt = Timestamp.now();
            }
            await setDoc(ref, dataToSave, { merge: true });
            toast.success('Profile saved successfully');
            loadProfiles();
        } catch (error) {
            console.error('Error saving profile:', error);
            toast.error('Failed to save profile');
        }
        setSaving(false);
    };

    const handleNewProfile = () => {
        const newId = 'new-profile-' + Date.now();
        const newProfile: AIVoiceProfile = {
            id: newId,
            name: 'New Profile',
            description: '',
            greeting: { template: '', variables: [] },
            collection: { requiredFields: [], maxRetries: 3 },
            confirmation: { template: '' },
            behavior: { tone: 'professional', transferNumber: '', transferCondition: '' }
        };
        setProfiles(prev => [...prev, newProfile]);
        setSelectedProfileId(newId);
        setProfileEditData(newProfile);
    };

    const searchOrgs = async () => {
        if (!orgSearchTerm.trim()) {
            setOrgResults([]);
            return;
        }
        setLoading(true);
        try {
            // Very simple client-side filtered search or prefix search
            // For admin, we can query organizations and filter.
            const q = query(collection(db, 'organizations'), limit(50));
            const snap = await getDocs(q);
            const results: OrgResult[] = [];
            snap.forEach(d => {
                const data = d.data();
                if (data.name?.toLowerCase().includes(orgSearchTerm.toLowerCase())) {
                    results.push({
                        id: d.id,
                        name: data.name,
                        aiVoiceProfileId: data.aiVoiceProfileId,
                        email: data.email
                    });
                }
            });
            setOrgResults(results);
        } catch (error) {
            console.error('Error searching orgs:', error);
            toast.error('Search failed');
        }
        setLoading(false);
    };

    const searchHistory = async () => {
        setLoading(true);
        try {
            // Realtime search over voice_sessions by callerPhone (exact) or orgId (exact)
            // Simplified for prototype: query by orgId OR fetch all and filter phone
            let q = query(
                collection(db, 'voice_sessions'),
                orderBy('createdAt', 'desc'),
                limit(100)
            );
            
            const snap = await getDocs(q);
            const results: VoiceSession[] = [];
            snap.forEach(d => {
                const data = d.data() as VoiceSession;
                if (
                    !historySearchTerm.trim() ||
                    data.callerPhone?.includes(historySearchTerm) ||
                    data.orgId === historySearchTerm ||
                    data.orgName?.toLowerCase().includes(historySearchTerm.toLowerCase())
                ) {
                    results.push({ id: d.id, ...data });
                }
            });
            setHistoryResults(results);
        } catch (error) {
            console.error('Error searching history:', error);
            toast.error('History search failed');
        }
        setLoading(false);
    };

    const updateOrgProfile = async (orgId: string, profileId: string) => {
        try {
            await updateDoc(doc(db, 'organizations', orgId), {
                aiVoiceProfileId: profileId
            });
            toast.success('Organization profile updated');
            setOrgResults(prev => prev.map(o => o.id === orgId ? { ...o, aiVoiceProfileId: profileId } : o));
        } catch (error) {
            console.error('Error updating org profile:', error);
            toast.error('Failed to update organization');
        }
    };

    if (!isAuthorized) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-indigo-50">
            {/* Sticky Header */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link to="/site-admin" className="text-gray-400 hover:text-gray-600 transition-colors">
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div className="flex items-center gap-3">
                                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200/50">
                                    <Bot className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                                        AI Voice Management
                                    </h1>
                                    <p className="text-sm text-gray-500">Platform-wide voice configuration and monitoring</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col md:flex-row gap-8">
                    {/* Sidebar Tabs */}
                    <div className="w-full md:w-64 flex-shrink-0">
                        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-2 sticky top-28">
                            {TABS.map(tab => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                            activeTab === tab.id
                                                ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 flex-shrink-0" />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 min-w-0">
                        
                        {/* ============ PROFILES TAB ============ */}
                        {activeTab === 'profiles' && (
                            <div className="flex flex-col xl:flex-row gap-6">
                                {/* Profiles List */}
                                <div className="w-full xl:w-1/3 bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col max-h-[800px]">
                                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                        <h3 className="font-semibold text-gray-900">Voice Profiles</h3>
                                        <button onClick={handleNewProfile} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                        {loading ? (
                                            <div className="p-4 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
                                        ) : profiles.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => handleProfileSelect(p.id)}
                                                className={`w-full text-left p-3 rounded-xl transition-all ${
                                                    selectedProfileId === p.id 
                                                    ? 'bg-indigo-50 border-indigo-100' 
                                                    : 'hover:bg-gray-50 border-transparent'
                                                } border`}
                                            >
                                                <div className="font-medium text-sm text-gray-900">{p.name || p.id}</div>
                                                <div className="text-xs text-gray-500 truncate mt-0.5">{p.description || 'No description'}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Profile Editor */}
                                {profileEditData && (
                                    <div className="w-full xl:w-2/3 bg-white rounded-2xl border border-gray-200/80 shadow-sm flex flex-col max-h-[800px]">
                                        <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
                                            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                                <Edit3 className="w-4 h-4 text-indigo-500" />
                                                Edit Profile: {profileEditData.name}
                                            </h3>
                                            <button
                                                onClick={handleSaveProfile}
                                                disabled={saving}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                            >
                                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                Save
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                            {/* Basic Info */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-semibold text-gray-900 border-b pb-2">Basic Info</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Profile ID</label>
                                                        <input type="text" value={profileEditData.id} disabled className="w-full text-sm border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-gray-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                                                        <input 
                                                            type="text" 
                                                            value={profileEditData.name} 
                                                            onChange={e => setProfileEditData(prev => prev ? {...prev, name: e.target.value} : null)}
                                                            className="w-full text-sm border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                                        />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                                        <textarea 
                                                            value={profileEditData.description} 
                                                            onChange={e => setProfileEditData(prev => prev ? {...prev, description: e.target.value} : null)}
                                                            className="w-full text-sm border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                                            rows={2}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Greeting */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-semibold text-gray-900 border-b pb-2">1. Greeting Phase</h4>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Template</label>
                                                    <textarea 
                                                        value={profileEditData.greeting?.template || ''} 
                                                        onChange={e => setProfileEditData(prev => prev ? {
                                                            ...prev, greeting: { ...prev.greeting, template: e.target.value }
                                                        } : null)}
                                                        className="w-full text-sm border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono" 
                                                        rows={3}
                                                    />
                                                    <p className="text-[11px] text-gray-500 mt-1">Example: "Hello, thank you for calling {'{{orgName}}'}. I am the AI assistant."</p>
                                                </div>
                                            </div>

                                            {/* Collection */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-semibold text-gray-900 border-b pb-2">2. Data Collection Phase</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Required Fields</label>
                                                        <div className="space-y-2">
                                                            {(profileEditData.collection?.requiredFields || []).map((field, idx) => (
                                                                <div key={idx} className="flex items-center gap-2">
                                                                    <input 
                                                                        type="text" 
                                                                        value={field} 
                                                                        onChange={e => {
                                                                            const newFields = [...(profileEditData.collection?.requiredFields || [])];
                                                                            newFields[idx] = e.target.value;
                                                                            setProfileEditData(prev => prev ? {
                                                                                ...prev, collection: { ...prev.collection, requiredFields: newFields }
                                                                            } : null);
                                                                        }}
                                                                        className="flex-1 text-sm border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                                                        placeholder="e.g. FirstName"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const newFields = [...(profileEditData.collection?.requiredFields || [])];
                                                                            newFields.splice(idx, 1);
                                                                            setProfileEditData(prev => prev ? {
                                                                                ...prev, collection: { ...prev.collection, requiredFields: newFields }
                                                                            } : null);
                                                                        }}
                                                                        className="p-2 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 hover:bg-red-50 rounded-lg"
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const newFields = [...(profileEditData.collection?.requiredFields || []), ''];
                                                                    setProfileEditData(prev => prev ? {
                                                                        ...prev, collection: { ...prev.collection, requiredFields: newFields }
                                                                    } : null);
                                                                }}
                                                                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                                Add Field
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Max Retries</label>
                                                        <input 
                                                            type="number" 
                                                            value={profileEditData.collection?.maxRetries || 3} 
                                                            onChange={e => setProfileEditData(prev => prev ? {
                                                                ...prev, collection: { ...prev.collection, maxRetries: parseInt(e.target.value) || 3 }
                                                            } : null)}
                                                            className="w-full text-sm border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                                        />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={profileEditData.collection?.requireConfirmation !== false} 
                                                                onChange={e => setProfileEditData(prev => prev ? {
                                                                    ...prev, collection: { ...prev.collection, requireConfirmation: e.target.checked }
                                                                } : null)}
                                                                className="rounded text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm font-medium text-gray-700">Require Step-by-Step Confirmation</span>
                                                        </label>
                                                        <p className="text-xs text-gray-500 ml-6 mt-1">Agent will confirm each piece of information before moving to the next question.</p>
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={profileEditData.collection?.enableFallbackCommunication !== false} 
                                                                onChange={e => setProfileEditData(prev => prev ? {
                                                                    ...prev, collection: { ...prev.collection, enableFallbackCommunication: e.target.checked }
                                                                } : null)}
                                                                className="rounded text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm font-medium text-gray-700">Offer Alternate Communication After Retries</span>
                                                        </label>
                                                        <p className="text-xs text-gray-500 ml-6 mt-1">If the agent fails to understand the caller, it will offer to send a text or email instead.</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Confirmation */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-semibold text-gray-900 border-b pb-2">3. Confirmation Phase</h4>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Template</label>
                                                    <textarea 
                                                        value={profileEditData.confirmation?.template || ''} 
                                                        onChange={e => setProfileEditData(prev => prev ? {
                                                            ...prev, confirmation: { ...prev.confirmation, template: e.target.value }
                                                        } : null)}
                                                        className="w-full text-sm border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono" 
                                                        rows={2}
                                                    />
                                                </div>
                                            </div>

                                            {/* Behavior */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-semibold text-gray-900 border-b pb-2">4. Behavior & Hand-off</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Tone</label>
                                                        <input 
                                                            type="text" 
                                                            value={profileEditData.behavior?.tone || ''} 
                                                            onChange={e => setProfileEditData(prev => prev ? {
                                                                ...prev, behavior: { ...prev.behavior, tone: e.target.value }
                                                            } : null)}
                                                            placeholder="Professional, empathetic, casual..."
                                                            className="w-full text-sm border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Transfer Condition</label>
                                                        <input 
                                                            type="text" 
                                                            value={profileEditData.behavior?.transferCondition || ''} 
                                                            onChange={e => setProfileEditData(prev => prev ? {
                                                                ...prev, behavior: { ...prev.behavior, transferCondition: e.target.value }
                                                            } : null)}
                                                            placeholder="e.g. Only on emergencies"
                                                            className="w-full text-sm border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ============ CUSTOMER SEARCH TAB ============ */}
                        {activeTab === 'customer-search' && (
                            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
                                <div className="max-w-2xl">
                                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                        <Building2 className="w-5 h-5 text-indigo-500" />
                                        Find Organization
                                    </h2>
                                    <div className="flex gap-3 mb-6">
                                        <input
                                            type="text"
                                            value={orgSearchTerm}
                                            onChange={e => setOrgSearchTerm(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && searchOrgs()}
                                            placeholder="Search by organization name..."
                                            className="flex-1 border border-gray-300 rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <button
                                            onClick={searchOrgs}
                                            disabled={loading}
                                            className="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                            Search
                                        </button>
                                    </div>

                                    {orgResults.length > 0 && (
                                        <div className="space-y-3">
                                            {orgResults.map(org => (
                                                <div key={org.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div>
                                                        <div className="font-semibold text-gray-900">{org.name}</div>
                                                        <div className="text-sm text-gray-500">{org.id}</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <select
                                                            value={org.aiVoiceProfileId || ''}
                                                            onChange={e => updateOrgProfile(org.id, e.target.value)}
                                                            className="border-gray-300 rounded-lg text-sm py-2 pl-3 pr-8 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                        >
                                                            <option value="">-- No Profile (Disabled) --</option>
                                                            {profiles.map(p => (
                                                                <option key={p.id} value={p.id}>{p.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ============ CALL HISTORY TAB ============ */}
                        {activeTab === 'call-history' && (
                            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm flex flex-col h-[800px]">
                                <div className="p-6 border-b border-gray-100">
                                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                        <PhoneCall className="w-5 h-5 text-indigo-500" />
                                        Voice Session Search
                                    </h2>
                                    <div className="flex gap-3 max-w-2xl">
                                        <input
                                            type="text"
                                            value={historySearchTerm}
                                            onChange={e => setHistorySearchTerm(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && searchHistory()}
                                            placeholder="Search by phone number, org name, or org ID..."
                                            className="flex-1 border border-gray-300 rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <button
                                            onClick={searchHistory}
                                            disabled={loading}
                                            className="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                            Search
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6">
                                    {historyResults.length > 0 ? (
                                        <div className="space-y-4">
                                            {historyResults.map(session => {
                                                const isExpanded = expandedSessionId === session.id;
                                                const isConverting = convertingId === session.id;

                                                return (
                                                    <div key={session.id} className="p-0 rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-all overflow-hidden">
                                                        <div 
                                                            className="p-4 cursor-pointer hover:bg-gray-50 flex items-start justify-between"
                                                            onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                                        >
                                                            <div>
                                                                <div className="font-semibold text-gray-900 text-lg flex items-center gap-2">
                                                                    {session.callerPhone}
                                                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                                                </div>
                                                                <div className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                                                    <Building2 className="w-3.5 h-3.5" /> {session.orgName || session.orgId}
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-2">
                                                                <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                                    session.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                    session.status === 'transferred' ? 'bg-blue-100 text-blue-700' :
                                                                    'bg-gray-100 text-gray-700'
                                                                }`}>
                                                                    {session.status.toUpperCase()}
                                                                </div>
                                                                <div className="text-xs text-gray-400 flex items-center gap-1">
                                                                    <Calendar className="w-3.5 h-3.5" />
                                                                    {session.createdAt?.toDate ? session.createdAt.toDate().toLocaleString() : 'Unknown date'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        {isExpanded && (
                                                            <div className="px-4 pb-4 border-t border-gray-100 pt-4 bg-gray-50/50">
                                                                {session.summary && (
                                                                    <div className="bg-indigo-50/50 p-3 rounded-lg mb-4 border border-indigo-100/50">
                                                                        <div className="text-xs font-semibold text-indigo-800 mb-1 flex items-center gap-1">
                                                                            <Sparkles className="w-3.5 h-3.5" /> AI Summary
                                                                        </div>
                                                                        <p className="text-sm text-gray-700 leading-relaxed">{session.summary}</p>
                                                                    </div>
                                                                )}

                                                                {session.collected && Object.keys(session.collected).length > 0 && (
                                                                    <div className="mb-4">
                                                                        <div className="text-xs font-semibold text-gray-700 mb-2">Collected Information</div>
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            {Object.entries(session.collected).map(([key, value]) => (
                                                                                <div key={key} className="bg-white p-2 rounded border border-gray-200 text-sm">
                                                                                    <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                                                                                    <span className="font-medium text-gray-900">{String(value)}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                <div className="mb-4">
                                                                    <div className="text-xs font-semibold text-gray-700 mb-2">Full Transcript</div>
                                                                    {session.transcript && Array.isArray(session.transcript) && session.transcript.length > 0 ? (
                                                                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                                                            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                                                                {session.transcript.map((c: any, u: number) => {
                                                                                    const role = typeof c === 'string' ? 'unknown' : c.role;
                                                                                    const content = typeof c === 'string' ? c : (c.content || c.text);
                                                                                    return (
                                                                                    <div key={u} className={`flex ${role === "assistant" ? "justify-start" : "justify-end"}`}>
                                                                                        <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${role === "assistant" ? "bg-purple-100 text-purple-900 rounded-tl-sm" : "bg-blue-600 text-white rounded-tr-sm"}`}>
                                                                                            <span className="text-[10px] font-bold opacity-50 uppercase tracking-wider block mb-0.5">
                                                                                                {role === "assistant" ? "AI Agent" : role === "user" ? "Caller" : "Unknown"}
                                                                                            </span>
                                                                                            {content}
                                                                                        </div>
                                                                                    </div>
                                                                                )})}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="bg-white p-3 rounded-lg max-h-60 overflow-y-auto font-mono text-xs text-gray-600 whitespace-pre-wrap border border-gray-200">
                                                                            {typeof session.transcript === 'string' ? session.transcript : 'No transcript available.'}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-3 pt-2">
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleCreateJobFromSession(session); }}
                                                                        disabled={isConverting}
                                                                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
                                                                    >
                                                                        <Briefcase className="w-4 h-4" /> Create Job
                                                                    </button>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleCreateQuoteFromSession(session); }}
                                                                        disabled={isConverting}
                                                                        className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm"
                                                                    >
                                                                        <FileText className="w-4 h-4" /> Create Quote
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 text-gray-400">
                                            <PhoneCall className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p>No call history found for this query.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ============ SYSTEM CONFIG TAB ============ */}
                        {activeTab === 'system-config' && (
                            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
                                <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-indigo-500" />
                                    Global Voice Settings
                                </h2>
                                <div className="max-w-xl space-y-6">
                                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                        <h3 className="font-semibold text-amber-800 mb-2">Twilio Gather Timeout</h3>
                                        <p className="text-sm text-amber-700 mb-4">
                                            Default timeout before throwing a no-speech error. We recently increased this to 15s to allow callers to finish listening to long prompts.
                                        </p>
                                        <div className="flex items-center gap-3">
                                            <input type="number" defaultValue={15} disabled className="w-24 border-amber-300 rounded-lg bg-white/50 px-3 py-2 text-sm text-gray-500" />
                                            <span className="text-sm text-amber-700">seconds</span>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl opacity-75">
                                        <h3 className="font-semibold text-gray-800 mb-2">Default Voice Engine</h3>
                                        <select disabled className="w-full max-w-xs border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500 bg-gray-100">
                                            <option>Google (Standard)</option>
                                            <option>Amazon Polly</option>
                                            <option>OpenAI (Coming Soon)</option>
                                        </select>
                                    </div>
                                    <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-4">
                                        <Settings className="w-3.5 h-3.5" />
                                        Advanced configurations are managed in Firebase Remote Config.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
