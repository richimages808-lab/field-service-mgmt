/**
 * AIPhoneAgent — Admin page for customers to configure and train their AI phone agent.
 * Multi-tab interface: Business Profile, Services, FAQs, Custom Instructions, Call History, Test & Preview.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../../firebase';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import {
    ArrowLeft, Bot, Building2, Wrench, HelpCircle, FileText,
    PhoneCall, Play, Save, Plus, Trash2, GripVertical,
    Loader2, CheckCircle2, Clock, Phone, MessageSquare,
    Sparkles, Settings, Volume2, ChevronRight, AlertCircle,
    Globe, MapPin, Lightbulb, ArrowUpCircle, X
} from 'lucide-react';
import { AgentConfig, VoiceOption, FaqItem, ServiceItem, CallLogEntry } from './ai-phone-agent/types';
import { ProfileTab } from './ai-phone-agent/tabs/ProfileTab';
import { ServicesTab } from './ai-phone-agent/tabs/ServicesTab';
import { FaqsTab } from './ai-phone-agent/tabs/FaqsTab';
import { InstructionsTab } from './ai-phone-agent/tabs/InstructionsTab';
import { CallLogsTab } from './ai-phone-agent/tabs/CallLogsTab';
import { PreviewTab } from './ai-phone-agent/tabs/PreviewTab';
import { WorkflowsTab } from './ai-phone-agent/tabs/WorkflowsTab';

// ============================================================
// TYPES
// ============================================================
// Used types from ai-phone-agent/types.ts

const TABS = [
    { id: 'profile', label: 'Business Profile', icon: Building2 },
    { id: 'services', label: 'Services & Pricing', icon: Wrench },
    { id: 'faqs', label: 'FAQs', icon: HelpCircle },
    { id: 'instructions', label: 'Custom Instructions', icon: FileText },
    { id: 'workflows', label: 'Call Workflows', icon: Settings },
    { id: 'calls', label: 'Call History', icon: PhoneCall },
    { id: 'preview', label: 'Test & Preview', icon: Play },
] as const;

type TabId = typeof TABS[number]['id'];



const DEFAULT_CONFIG: AgentConfig = {
    status: 'inactive',
    businessName: '',
    businessDescription: '',
    greeting: '',
    services: [],
    faqs: [],
    businessHours: '',
    serviceArea: '',
    specialInstructions: '',
    voiceId: 'elliot',
    workflows: [],
    forwardingPhoneNumber: '',
    autoFollowUp: 'none',
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
    const [aiVoiceProfiles, setAiVoiceProfiles] = useState<any[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string>('');
    const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [loadingCalls, setLoadingCalls] = useState(false);
    const [hasAgent, setHasAgent] = useState(false);
    const [expandedCall, setExpandedCall] = useState<string | null>(null);
    const [customerQuestions, setCustomerQuestions] = useState<{ id: string; question: string; callerPhone: string; createdAt: any; status: string }[]>([]);
    const [loadingQuestions, setLoadingQuestions] = useState(false);

    const orgId = (user as any)?.org_id || (user as any)?.orgId || (user as any)?.organizationId || user?.uid || '';

    const hasUnsavedChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

    // ============================================================
    // DATA LOADING
    // ============================================================

    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const [configResult, voicesResult, profilesSnap, orgDocSnap] = await Promise.all([
                httpsCallable(functions, 'getVapiAgentConfig')({ orgId }),
                httpsCallable(functions, 'getVapiVoices')({}),
                getDocs(collection(db, 'ai_voice_profiles')),
                getDocs(query(collection(db, 'organizations'), where('__name__', '==', orgId)))
            ]);

            const configData = (configResult.data as any)?.config;
            const voicesData = (voicesResult.data as any)?.voices || [];
            setVoices(voicesData);

            setAiVoiceProfiles(profilesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            
            if (!orgDocSnap.empty) {
                setSelectedProfileId(orgDocSnap.docs[0].data().aiVoiceProfileId || '');
            }

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
                    status: configData.status,
                    workflows: configData.workflows || [],
                    forwardingPhoneNumber: configData.forwardingPhoneNumber || '',
                    autoFollowUp: configData.autoFollowUp || 'none'
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
        if (activeTab === 'faqs' && orgId) {
            loadCustomerQuestions();
        }
    }, [activeTab, hasAgent]);

    const loadCustomerQuestions = async () => {
        if (!orgId) return;
        setLoadingQuestions(true);
        try {
            const q = query(
                collection(db, 'customer_questions'),
                where('orgId', '==', orgId),
                where('status', '==', 'pending'),
                orderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);
            setCustomerQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
        } catch (error) {
            console.error('Error loading customer questions:', error);
        }
        setLoadingQuestions(false);
    };

    const promoteQuestion = (question: string) => {
        // Add the question to the FAQ list and mark it as promoted
        setConfig(prev => ({
            ...prev,
            faqs: [...prev.faqs, { question, answer: '' }]
        }));
        toast.success('Question added to FAQ — now add your answer!');
    };

    const dismissQuestion = async (questionId: string) => {
        try {
            await updateDoc(doc(db, 'customer_questions', questionId), { status: 'dismissed' });
            setCustomerQuestions(prev => prev.filter(q => q.id !== questionId));
            toast.success('Question dismissed');
        } catch (error) {
            console.error('Error dismissing question:', error);
        }
    };

    const promoteAndDismiss = async (questionId: string, question: string) => {
        promoteQuestion(question);
        try {
            await updateDoc(doc(db, 'customer_questions', questionId), { status: 'promoted' });
            setCustomerQuestions(prev => prev.filter(q => q.id !== questionId));
        } catch (error) {
            console.error('Error updating question status:', error);
        }
    };

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
            await updateDoc(doc(db, 'organizations', orgId), { aiVoiceProfileId: selectedProfileId || null });
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
                                <div className="bg-gradient-to-br from-violet-500 to-amber-600 p-2.5 rounded-xl shadow-lg shadow-violet-200/50">
                                    <Bot className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-amber-600">
                                        AI Phone Agent
                                    </h1>
                                    <p className="text-sm text-gray-500">Train your AI to answer calls about your business</p>
                                </div>
                            </div>
                        </div>
                        {hasAgent && (hasUnsavedChanges || selectedProfileId !== (config as any)?._tempProfileId) && (
                            <button
                                onClick={() => {
                                    (config as any)._tempProfileId = selectedProfileId;
                                    handleSave();
                                }}
                                disabled={saving}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-amber-600 text-white rounded-xl font-semibold shadow-lg shadow-violet-200/50 hover:shadow-xl transition-all disabled:opacity-50"
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
                        <div className="bg-gradient-to-br from-violet-600 via-amber-600 to-blue-700 rounded-2xl p-8 text-white shadow-xl mb-8">
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
                                    className="w-full py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-amber-600 shadow-lg shadow-violet-200/50 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
                                <ProfileTab 
                                    config={config} 
                                    setConfig={setConfig} 
                                    voices={voices} 
                                    aiVoiceProfiles={aiVoiceProfiles}
                                    selectedProfileId={selectedProfileId}
                                    setSelectedProfileId={setSelectedProfileId}
                                />
                            )}

                            {/* ============ TAB: SERVICES ============ */}
                            {activeTab === 'services' && (
                                <ServicesTab 
                                    config={config} 
                                    updateService={updateService} 
                                    addService={addService} 
                                    removeService={removeService} 
                                />
                            )}

                            {/* ============ TAB: FAQS ============ */}
                            {activeTab === 'faqs' && (
                                <FaqsTab 
                                    config={config} 
                                    setConfig={setConfig} 
                                    customerQuestions={customerQuestions}
                                    loadingQuestions={loadingQuestions}
                                    loadCustomerQuestions={loadCustomerQuestions}
                                    promoteAndDismiss={promoteAndDismiss}
                                    dismissQuestion={dismissQuestion}
                                />
                            )}

                            {/* ============ TAB: CUSTOM INSTRUCTIONS ============ */}
                            {activeTab === 'instructions' && (
                                <InstructionsTab 
                                    config={config} 
                                    setConfig={setConfig} 
                                />
                            )}

                            {/* ============ TAB: CALL WORKFLOWS ============ */}
                            {activeTab === 'workflows' && (
                                <WorkflowsTab 
                                    config={config} 
                                    setConfig={setConfig} 
                                />
                            )}

                            {/* ============ TAB: CALL HISTORY ============ */}
                            {activeTab === 'calls' && (
                                <CallLogsTab 
                                    callLogs={callLogs as CallLogEntry[]} 
                                    loadingCalls={loadingCalls} 
                                    loadCallLogs={loadCallLogs} 
                                    expandedCall={expandedCall} 
                                    setExpandedCall={setExpandedCall} 
                                    formatDuration={formatDuration} 
                                />
                            )}

                            {/* ============ TAB: TEST & PREVIEW ============ */}
                            {activeTab === 'preview' && (
                                <PreviewTab 
                                    config={config} 
                                    buildPreviewPrompt={buildPreviewPrompt} 
                                    hasUnsavedChanges={hasUnsavedChanges} 
                                    handleSave={handleSave} 
                                    saving={saving} 
                                />
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
    
    if (config.workflows && config.workflows.length > 0) {
        prompt += `\n## Conditional Call Workflows\n`;
        for (const wf of config.workflows) {
            prompt += `\n### If the caller's intent is "${wf.intent}":\n${wf.instructions}\n`;
        }
    }

    prompt += `\n## Important Rules\n- Always be polite, professional, and helpful.\n- If you cannot answer, offer to take a message.\n- Keep responses concise — this is a phone call.`;
    return prompt;
}
