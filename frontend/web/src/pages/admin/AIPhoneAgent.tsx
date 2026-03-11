/**
 * AIPhoneAgent — Admin page for customers to configure and train their AI phone agent.
 * Multi-tab interface: Business Profile, Services, FAQs, Custom Instructions, Call History, Test & Preview.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { toast } from 'react-hot-toast';
import {
    ArrowLeft, Bot, Building2, Wrench, HelpCircle, FileText,
    PhoneCall, Play, Save, Plus, Trash2, GripVertical,
    Loader2, CheckCircle2, Clock, Phone, MessageSquare,
    Sparkles, Settings, Volume2, ChevronRight, AlertCircle,
    Globe, MapPin
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface ServiceItem {
    name: string;
    description: string;
    priceRange: string;
}

interface FaqItem {
    question: string;
    answer: string;
}

interface VoiceOption {
    id: string;
    label: string;
    provider: string;
    voiceId: string;
}

interface CallLogEntry {
    id: string;
    type: string;
    status: string;
    startedAt: string;
    endedAt: string;
    duration: number;
    callerNumber: string;
    transcript: string;
    summary: string;
    cost: number;
    endedReason: string;
}

interface AgentConfig {
    vapiAssistantId?: string;
    businessName: string;
    businessDescription: string;
    greeting: string;
    services: ServiceItem[];
    faqs: FaqItem[];
    businessHours: string;
    serviceArea: string;
    specialInstructions: string;
    voiceId: string;
    status?: string;
}

const TABS = [
    { id: 'profile', label: 'Business Profile', icon: Building2 },
    { id: 'services', label: 'Services & Pricing', icon: Wrench },
    { id: 'faqs', label: 'FAQs', icon: HelpCircle },
    { id: 'instructions', label: 'Custom Instructions', icon: FileText },
    { id: 'calls', label: 'Call History', icon: PhoneCall },
    { id: 'preview', label: 'Test & Preview', icon: Play },
] as const;

type TabId = typeof TABS[number]['id'];

const FAQ_TEMPLATES: FaqItem[] = [
    { question: "What are your business hours?", answer: "" },
    { question: "Do you offer emergency or after-hours service?", answer: "" },
    { question: "What areas do you serve?", answer: "" },
    { question: "Do you offer free estimates?", answer: "" },
    { question: "What forms of payment do you accept?", answer: "" },
    { question: "Are you licensed and insured?", answer: "" },
    { question: "How quickly can you come out?", answer: "" },
    { question: "Do you offer any warranties on your work?", answer: "" },
];

const DEFAULT_CONFIG: AgentConfig = {
    businessName: '',
    businessDescription: '',
    greeting: '',
    services: [],
    faqs: [],
    businessHours: '',
    serviceArea: '',
    specialInstructions: '',
    voiceId: 'elliot',
};

// ============================================================
// COMPONENT
// ============================================================

export const AIPhoneAgent: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabId>('profile');
    const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
    const [originalConfig, setOriginalConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
    const [voices, setVoices] = useState<VoiceOption[]>([]);
    const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [loadingCalls, setLoadingCalls] = useState(false);
    const [hasAgent, setHasAgent] = useState(false);
    const [expandedCall, setExpandedCall] = useState<string | null>(null);

    const orgId = (user as any)?.orgId || (user as any)?.organizationId || user?.uid || '';

    const hasUnsavedChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

    // ============================================================
    // DATA LOADING
    // ============================================================

    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const [configResult, voicesResult] = await Promise.all([
                httpsCallable(functions, 'getVapiAgentConfig')({ orgId }),
                httpsCallable(functions, 'getVapiVoices')({})
            ]);

            const configData = (configResult.data as any)?.config;
            const voicesData = (voicesResult.data as any)?.voices || [];
            setVoices(voicesData);

            if (configData && configData.vapiAssistantId) {
                const loadedConfig: AgentConfig = {
                    vapiAssistantId: configData.vapiAssistantId,
                    businessName: configData.businessName || '',
                    businessDescription: configData.businessDescription || '',
                    greeting: configData.greeting || '',
                    services: configData.services || [],
                    faqs: configData.faqs || [],
                    businessHours: configData.businessHours || '',
                    serviceArea: configData.serviceArea || '',
                    specialInstructions: configData.specialInstructions || '',
                    voiceId: configData.voiceId || 'elliot',
                    status: configData.status
                };
                setConfig(loadedConfig);
                setOriginalConfig(loadedConfig);
                setHasAgent(true);
            }
        } catch (error) {
            console.error('Error loading agent config:', error);
            toast.error('Failed to load AI agent configuration');
        }
        setLoading(false);
    }, [orgId]);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    const loadCallLogs = async () => {
        setLoadingCalls(true);
        try {
            const result = await httpsCallable(functions, 'getVapiCallLogs')({ orgId, limit: 25 });
            setCallLogs((result.data as any)?.calls || []);
        } catch (error) {
            console.error('Error loading call logs:', error);
        }
        setLoadingCalls(false);
    };

    useEffect(() => {
        if (activeTab === 'calls' && hasAgent) {
            loadCallLogs();
        }
    }, [activeTab, hasAgent]);

    // ============================================================
    // ACTIONS
    // ============================================================

    const handleCreateAgent = async () => {
        if (!config.businessName.trim()) {
            toast.error('Please enter your business name first');
            return;
        }
        setCreating(true);
        try {
            const result = await httpsCallable(functions, 'createVapiAssistant')({ orgId, config });
            const data = result.data as any;
            toast.success(data.message || 'AI phone agent created! 🎉');
            setConfig(prev => ({ ...prev, vapiAssistantId: data.assistantId }));
            setHasAgent(true);
            await loadConfig();
        } catch (error: any) {
            console.error('Error creating agent:', error);
            toast.error(error.message || 'Failed to create AI phone agent');
        }
        setCreating(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await httpsCallable(functions, 'updateAgentTraining')({ orgId, config });
            toast.success('AI phone agent updated! ✨');
            setOriginalConfig({ ...config });
        } catch (error: any) {
            console.error('Error saving:', error);
            toast.error(error.message || 'Failed to save changes');
        }
        setSaving(false);
    };

    // Service CRUD
    const addService = () => setConfig(prev => ({
        ...prev,
        services: [...prev.services, { name: '', description: '', priceRange: '' }]
    }));
    const updateService = (index: number, field: keyof ServiceItem, value: string) =>
        setConfig(prev => ({
            ...prev,
            services: prev.services.map((s, i) => i === index ? { ...s, [field]: value } : s)
        }));
    const removeService = (index: number) =>
        setConfig(prev => ({ ...prev, services: prev.services.filter((_, i) => i !== index) }));

    // FAQ CRUD
    const addFaq = (template?: FaqItem) =>
        setConfig(prev => ({
            ...prev,
            faqs: [...prev.faqs, template || { question: '', answer: '' }]
        }));
    const updateFaq = (index: number, field: keyof FaqItem, value: string) =>
        setConfig(prev => ({
            ...prev,
            faqs: prev.faqs.map((f, i) => i === index ? { ...f, [field]: value } : f)
        }));
    const removeFaq = (index: number) =>
        setConfig(prev => ({ ...prev, faqs: prev.faqs.filter((_, i) => i !== index) }));

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // ============================================================
    // RENDER
    // ============================================================

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-violet-50 flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-lg">Loading AI phone agent...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-violet-50">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link to="/settings" className="text-gray-400 hover:text-gray-600 transition-colors">
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div className="flex items-center gap-3">
                                <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-2.5 rounded-xl shadow-lg shadow-violet-200/50">
                                    <Bot className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-purple-600">
                                        AI Phone Agent
                                    </h1>
                                    <p className="text-sm text-gray-500">Train your AI to answer calls about your business</p>
                                </div>
                            </div>
                        </div>
                        {hasAgent && hasUnsavedChanges && (
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg shadow-violet-200/50 hover:shadow-xl transition-all disabled:opacity-50"
                                id="save-agent-btn"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Changes
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {!hasAgent ? (
                    /* Setup / Onboarding */
                    <div className="max-w-2xl mx-auto">
                        <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl mb-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="bg-white/20 p-3 rounded-xl">
                                    <Bot className="w-10 h-10" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold">Set Up Your AI Phone Agent</h2>
                                    <p className="text-violet-200 mt-1">
                                        Train an AI to answer calls, schedule appointments, and more
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                {[
                                    { icon: Phone, text: 'Answers calls 24/7' },
                                    { icon: MessageSquare, text: 'Takes messages & creates tickets' },
                                    { icon: Clock, text: 'Never puts callers on hold' },
                                    { icon: Sparkles, text: 'Learns about your business' },
                                ].map(({ icon: Icon, text }) => (
                                    <div key={text} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2.5 text-sm">
                                        <Icon className="w-4 h-4 text-violet-300 flex-shrink-0" />
                                        {text}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick Setup Form */}
                        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-8">
                            <h3 className="text-lg font-semibold text-gray-900 mb-6">Let's get started — tell us about your business</h3>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name *</label>
                                    <input
                                        type="text"
                                        value={config.businessName}
                                        onChange={e => setConfig(prev => ({ ...prev, businessName: e.target.value }))}
                                        placeholder="e.g. Island HVAC Services"
                                        className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                        id="business-name-input"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Description</label>
                                    <textarea
                                        value={config.businessDescription}
                                        onChange={e => setConfig(prev => ({ ...prev, businessDescription: e.target.value }))}
                                        placeholder="Describe what your company does, who you serve, and what makes you unique..."
                                        rows={3}
                                        className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                        id="business-desc-input"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">AI Voice</label>
                                    <select
                                        value={config.voiceId}
                                        onChange={e => setConfig(prev => ({ ...prev, voiceId: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                        id="voice-select"
                                    >
                                        {voices.map(v => (
                                            <option key={v.id} value={v.id}>{v.label}</option>
                                        ))}
                                        {voices.length === 0 && <option value="elliot">Elliot (Male, Professional)</option>}
                                    </select>
                                </div>

                                <button
                                    onClick={handleCreateAgent}
                                    disabled={creating || !config.businessName.trim()}
                                    className="w-full py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-violet-200/50 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    id="create-agent-btn"
                                >
                                    {creating ? (
                                        <><Loader2 className="w-5 h-5 animate-spin" /> Creating your AI agent...</>
                                    ) : (
                                        <><Sparkles className="w-5 h-5" /> Create AI Phone Agent</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Active Agent — Tabbed Interface */
                    <div className="flex gap-8">
                        {/* Sidebar Tabs */}
                        <div className="w-56 flex-shrink-0">
                            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-2 sticky top-28">
                                {TABS.map(tab => {
                                    const Icon = tab.icon;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id
                                                    ? 'bg-violet-50 text-violet-700 shadow-sm'
                                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                                }`}
                                        >
                                            <Icon className="w-4 h-4 flex-shrink-0" />
                                            {tab.label}
                                        </button>
                                    );
                                })}

                                {/* Status indicator */}
                                <div className="mt-4 px-3 py-2 border-t border-gray-100">
                                    <div className="flex items-center gap-2 text-xs">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-gray-500">Agent Active</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 min-w-0">
                            {/* ============ TAB: BUSINESS PROFILE ============ */}
                            {activeTab === 'profile' && (
                                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
                                    <div className="p-6 border-b border-gray-100">
                                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                            <Building2 className="w-5 h-5 text-violet-500" />
                                            Business Profile
                                        </h2>
                                        <p className="text-sm text-gray-500 mt-1">Basic information your AI agent uses to represent your business</p>
                                    </div>
                                    <div className="p-6 space-y-5">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name</label>
                                            <input
                                                type="text"
                                                value={config.businessName}
                                                onChange={e => setConfig(prev => ({ ...prev, businessName: e.target.value }))}
                                                className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Description</label>
                                            <textarea
                                                value={config.businessDescription}
                                                onChange={e => setConfig(prev => ({ ...prev, businessDescription: e.target.value }))}
                                                rows={3}
                                                placeholder="Describe your business, specialties, and what sets you apart..."
                                                className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                                <span className="flex items-center gap-1.5"><Volume2 className="w-4 h-4" /> Custom Greeting</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={config.greeting}
                                                onChange={e => setConfig(prev => ({ ...prev, greeting: e.target.value }))}
                                                placeholder={`Thank you for calling ${config.businessName || 'our company'}. How can I help you today?`}
                                                className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                            />
                                            <p className="text-xs text-gray-400 mt-1">This is the first thing callers will hear</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                                    <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> Business Hours</span>
                                                </label>
                                                <textarea
                                                    value={config.businessHours}
                                                    onChange={e => setConfig(prev => ({ ...prev, businessHours: e.target.value }))}
                                                    rows={3}
                                                    placeholder="Mon-Fri: 8am - 5pm&#10;Sat: 9am - 1pm&#10;Sun: Closed"
                                                    className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Service Area</span>
                                                </label>
                                                <textarea
                                                    value={config.serviceArea}
                                                    onChange={e => setConfig(prev => ({ ...prev, serviceArea: e.target.value }))}
                                                    rows={3}
                                                    placeholder="We serve all of Oahu, including Honolulu, Kailua, Kaneohe..."
                                                    className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">AI Voice</label>
                                            <select
                                                value={config.voiceId}
                                                onChange={e => setConfig(prev => ({ ...prev, voiceId: e.target.value }))}
                                                className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                            >
                                                {voices.map(v => (
                                                    <option key={v.id} value={v.id}>{v.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ============ TAB: SERVICES ============ */}
                            {activeTab === 'services' && (
                                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
                                    <div className="p-6 border-b border-gray-100">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                                    <Wrench className="w-5 h-5 text-violet-500" />
                                                    Services & Pricing
                                                </h2>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    List the services you offer so your AI agent can explain them to callers
                                                </p>
                                            </div>
                                            <button
                                                onClick={addService}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-50 text-violet-700 rounded-xl text-sm font-medium hover:bg-violet-100 transition-colors"
                                                id="add-service-btn"
                                            >
                                                <Plus className="w-4 h-4" /> Add Service
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        {config.services.length === 0 ? (
                                            <div className="text-center py-12 text-gray-400">
                                                <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                <p className="text-lg font-medium">No services added yet</p>
                                                <p className="text-sm mt-1">Add your services so your AI agent can tell callers about them</p>
                                                <button
                                                    onClick={addService}
                                                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-violet-100 text-violet-700 rounded-xl text-sm font-medium hover:bg-violet-200 transition-colors"
                                                >
                                                    <Plus className="w-4 h-4" /> Add Your First Service
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {config.services.map((service, index) => (
                                                    <div key={index} className="flex gap-3 items-start p-4 bg-gray-50 rounded-xl group">
                                                        <div className="text-gray-300 mt-2 cursor-grab">
                                                            <GripVertical className="w-4 h-4" />
                                                        </div>
                                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                            <input
                                                                type="text"
                                                                value={service.name}
                                                                onChange={e => updateService(index, 'name', e.target.value)}
                                                                placeholder="Service name"
                                                                className="border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={service.description}
                                                                onChange={e => updateService(index, 'description', e.target.value)}
                                                                placeholder="Brief description"
                                                                className="border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={service.priceRange}
                                                                onChange={e => updateService(index, 'priceRange', e.target.value)}
                                                                placeholder="e.g. $75-$150"
                                                                className="border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => removeService(index)}
                                                            className="text-gray-400 hover:text-red-500 transition-colors mt-2 opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ============ TAB: FAQS ============ */}
                            {activeTab === 'faqs' && (
                                <div className="space-y-6">
                                    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
                                        <div className="p-6 border-b border-gray-100">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                                        <HelpCircle className="w-5 h-5 text-violet-500" />
                                                        Frequently Asked Questions
                                                    </h2>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        Teach your AI agent how to answer common questions
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => addFaq()}
                                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-50 text-violet-700 rounded-xl text-sm font-medium hover:bg-violet-100 transition-colors"
                                                    id="add-faq-btn"
                                                >
                                                    <Plus className="w-4 h-4" /> Add FAQ
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-6">
                                            {config.faqs.length === 0 ? (
                                                <div className="text-center py-8 text-gray-400">
                                                    <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                    <p className="text-lg font-medium mb-4">No FAQs yet</p>
                                                    <p className="text-sm mb-4">Start with some common questions or add your own</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {config.faqs.map((faq, index) => (
                                                        <div key={index} className="p-4 bg-gray-50 rounded-xl group">
                                                            <div className="flex items-start gap-3">
                                                                <div className="flex-1 space-y-2">
                                                                    <input
                                                                        type="text"
                                                                        value={faq.question}
                                                                        onChange={e => updateFaq(index, 'question', e.target.value)}
                                                                        placeholder="Question callers might ask..."
                                                                        className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-medium focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                                                    />
                                                                    <textarea
                                                                        value={faq.answer}
                                                                        onChange={e => updateFaq(index, 'answer', e.target.value)}
                                                                        placeholder="How your AI should answer..."
                                                                        rows={2}
                                                                        className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => removeFaq(index)}
                                                                    className="text-gray-400 hover:text-red-500 transition-colors mt-1 opacity-0 group-hover:opacity-100"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Quick-add templates */}
                                    {FAQ_TEMPLATES.filter(t => !config.faqs.some(f => f.question === t.question)).length > 0 && (
                                        <div className="bg-violet-50/50 rounded-2xl border border-violet-200/50 p-6">
                                            <h3 className="text-sm font-semibold text-violet-700 mb-3 flex items-center gap-2">
                                                <Sparkles className="w-4 h-4" /> Quick-Add Templates
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {FAQ_TEMPLATES
                                                    .filter(t => !config.faqs.some(f => f.question === t.question))
                                                    .map((template, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => addFaq(template)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-violet-200 rounded-lg text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                                                        >
                                                            <Plus className="w-3 h-3" /> {template.question}
                                                        </button>
                                                    ))
                                                }
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ============ TAB: CUSTOM INSTRUCTIONS ============ */}
                            {activeTab === 'instructions' && (
                                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
                                    <div className="p-6 border-b border-gray-100">
                                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                            <FileText className="w-5 h-5 text-violet-500" />
                                            Custom Instructions
                                        </h2>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Add any special rules or behavior for your AI agent
                                        </p>
                                    </div>
                                    <div className="p-6">
                                        <textarea
                                            value={config.specialInstructions}
                                            onChange={e => setConfig(prev => ({ ...prev, specialInstructions: e.target.value }))}
                                            rows={12}
                                            placeholder={`Examples:\n• Always ask for the customer's address when scheduling\n• Mention that we offer 10% off for first-time customers\n• If someone asks about emergency service, let them know we charge a $50 after-hours fee\n• Avoid discussing competitor services\n• Always confirm the customer's callback number before ending the call`}
                                            className="w-full border border-gray-300 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 font-mono leading-relaxed"
                                            id="instructions-textarea"
                                        />
                                        <div className="mt-3 flex items-start gap-2 text-xs text-gray-400">
                                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                            <span>These instructions will be added to your AI agent's behavior. Be specific — the more detail you provide, the better the agent performs.</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ============ TAB: CALL HISTORY ============ */}
                            {activeTab === 'calls' && (
                                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
                                    <div className="p-6 border-b border-gray-100">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                                    <PhoneCall className="w-5 h-5 text-violet-500" />
                                                    Call History
                                                </h2>
                                                <p className="text-sm text-gray-500 mt-1">Recent calls handled by your AI agent</p>
                                            </div>
                                            <button
                                                onClick={loadCallLogs}
                                                disabled={loadingCalls}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                                            >
                                                {loadingCalls ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                Refresh
                                            </button>
                                        </div>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {loadingCalls ? (
                                            <div className="p-12 text-center text-gray-400">
                                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
                                                <p>Loading call history...</p>
                                            </div>
                                        ) : callLogs.length === 0 ? (
                                            <div className="p-12 text-center text-gray-400">
                                                <PhoneCall className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                <p className="text-lg font-medium">No calls yet</p>
                                                <p className="text-sm mt-1">Calls will appear here once your AI agent starts receiving them</p>
                                            </div>
                                        ) : (
                                            callLogs.map(call => (
                                                <div key={call.id} className="p-4 hover:bg-gray-50 transition-colors">
                                                    <div
                                                        className="flex items-center justify-between cursor-pointer"
                                                        onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-2 rounded-lg ${call.status === 'ended' ? 'bg-emerald-100' : 'bg-amber-100'
                                                                }`}>
                                                                <Phone className={`w-4 h-4 ${call.status === 'ended' ? 'text-emerald-600' : 'text-amber-600'
                                                                    }`} />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900">{call.callerNumber}</p>
                                                                <p className="text-xs text-gray-500">
                                                                    {new Date(call.startedAt).toLocaleDateString()} at {new Date(call.startedAt).toLocaleTimeString()}
                                                                    {' · '}{formatDuration(call.duration)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {call.summary && (
                                                                <span className="text-xs text-gray-500 max-w-xs truncate hidden md:block">
                                                                    {call.summary}
                                                                </span>
                                                            )}
                                                            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedCall === call.id ? 'rotate-90' : ''
                                                                }`} />
                                                        </div>
                                                    </div>
                                                    {expandedCall === call.id && (
                                                        <div className="mt-4 ml-12 space-y-3">
                                                            {call.summary && (
                                                                <div className="bg-violet-50 rounded-lg p-3">
                                                                    <p className="text-xs font-semibold text-violet-700 mb-1">AI Summary</p>
                                                                    <p className="text-sm text-gray-700">{call.summary}</p>
                                                                </div>
                                                            )}
                                                            {call.transcript && (
                                                                <div className="bg-gray-50 rounded-lg p-3">
                                                                    <p className="text-xs font-semibold text-gray-500 mb-1">Transcript</p>
                                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">{call.transcript}</p>
                                                                </div>
                                                            )}
                                                            <div className="flex gap-4 text-xs text-gray-500">
                                                                <span>Duration: {formatDuration(call.duration)}</span>
                                                                <span>Status: {call.endedReason || call.status}</span>
                                                                {call.cost > 0 && <span>Cost: ${call.cost.toFixed(4)}</span>}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ============ TAB: TEST & PREVIEW ============ */}
                            {activeTab === 'preview' && (
                                <div className="space-y-6">
                                    {/* System Prompt Preview */}
                                    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
                                        <div className="p-6 border-b border-gray-100">
                                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                                <Settings className="w-5 h-5 text-violet-500" />
                                                System Prompt Preview
                                            </h2>
                                            <p className="text-sm text-gray-500 mt-1">
                                                This is what your AI agent knows, compiled from all your settings
                                            </p>
                                        </div>
                                        <div className="p-6">
                                            <div className="bg-slate-900 text-slate-100 rounded-xl p-5 text-sm font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                                                {buildPreviewPrompt(config)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quick Stats */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="bg-violet-100 p-2 rounded-lg">
                                                    <Wrench className="w-4 h-4 text-violet-600" />
                                                </div>
                                                <span className="text-sm font-medium text-gray-500">Services</span>
                                            </div>
                                            <p className="text-3xl font-bold text-gray-900">{config.services.length}</p>
                                        </div>
                                        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="bg-blue-100 p-2 rounded-lg">
                                                    <HelpCircle className="w-4 h-4 text-blue-600" />
                                                </div>
                                                <span className="text-sm font-medium text-gray-500">FAQs</span>
                                            </div>
                                            <p className="text-3xl font-bold text-gray-900">{config.faqs.length}</p>
                                        </div>
                                        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="bg-emerald-100 p-2 rounded-lg">
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                </div>
                                                <span className="text-sm font-medium text-gray-500">Status</span>
                                            </div>
                                            <p className="text-lg font-bold text-emerald-600">
                                                {config.status === 'active' ? 'Active' : 'Ready'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Unsaved changes warning */}
                                    {hasUnsavedChanges && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                                            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-amber-800">You have unsaved changes</p>
                                                <p className="text-xs text-amber-600 mt-0.5">Click "Save Changes" in the header to update your AI agent</p>
                                            </div>
                                            <button
                                                onClick={handleSave}
                                                disabled={saving}
                                                className="px-4 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors"
                                            >
                                                {saving ? 'Saving...' : 'Save Now'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * Build a preview of the system prompt (mirrors backend logic).
 */
function buildPreviewPrompt(config: AgentConfig): string {
    let prompt = `You are the AI phone receptionist for ${config.businessName || '[Business Name]'}.`;
    if (config.businessDescription) {
        prompt += ` ${config.businessDescription}`;
    }
    prompt += `\n\nYour role: Answer inbound calls professionally. You can schedule service appointments, answer questions about services and pricing, check on existing jobs, and take detailed messages.`;

    if (config.services.length > 0) {
        prompt += `\n\n## Services We Offer\n`;
        for (const svc of config.services) {
            prompt += `- ${svc.name || '[Name]'}: ${svc.description || '[Description]'}`;
            if (svc.priceRange) prompt += ` (Price range: ${svc.priceRange})`;
            prompt += `\n`;
        }
    }
    if (config.businessHours) {
        prompt += `\n## Business Hours\n${config.businessHours}\n`;
    }
    if (config.serviceArea) {
        prompt += `\n## Service Area\n${config.serviceArea}\n`;
    }
    if (config.faqs.length > 0) {
        prompt += `\n## Frequently Asked Questions\n`;
        for (const faq of config.faqs) {
            prompt += `Q: ${faq.question || '[Question]'}\nA: ${faq.answer || '[Answer]'}\n\n`;
        }
    }
    if (config.specialInstructions) {
        prompt += `\n## Special Instructions\n${config.specialInstructions}\n`;
    }
    prompt += `\n## Important Rules\n- Always be polite, professional, and helpful.\n- If you cannot answer, offer to take a message.\n- When scheduling, collect: name, phone, address, issue description, preferred date/time.\n- Keep responses concise — this is a phone call.`;
    return prompt;
}
