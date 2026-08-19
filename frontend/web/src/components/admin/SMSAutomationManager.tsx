import React, { useState, useEffect, useRef } from 'react';
import { db, functions } from '../../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'react-hot-toast';
import {
    MessageSquare, Smartphone, Clock, Sparkles, Check, RotateCcw,
    Send, Shield, Tag, AlertCircle, Info, Calendar, FileText,
    HelpCircle, ChevronRight, CheckCircle2, Sliders, ToggleLeft, ToggleRight, Loader2,
    ChevronDown, AlertTriangle, Plus, CheckCircle, X, Trash2, Edit3, Code, Eye,
    Database, History, HardDrive
} from 'lucide-react';
import {
    DEFAULT_SMS_TEMPLATES,
    SMSTemplateConfig,
    SMSTemplateVariable,
    SMSAutomationSettings,
    renderSmsPreview,
    calculateSmsSegments
} from '../../lib/smsTemplates';

interface SMSAutomationManagerProps {
    orgId: string;
    orgName?: string;
    twilioPhoneNumber?: string;
}

// Variable Explanations and Guidance
const VARIABLE_EXPLANATIONS: Record<string, { description: string; requiredFor?: string[] }> = {
    '{companyName}': {
        description: 'Your business legal name or trade branding (e.g., "Hitop Plumbers").'
    },
    '{customerName}': {
        description: 'The first name of the customer on the job or service ticket.'
    },
    '{jobTitle}': {
        description: 'The short name/summary of the booked service (e.g., "Water Heater Service").'
    },
    '{jobId}': {
        description: 'The unique reference or invoice number for the service request.'
    },
    '{scheduledTime}': {
        description: 'The formatted appointment time slot (e.g., "Tomorrow at 9:00 AM HST").'
    },
    '{techName}': {
        description: 'The name of the assigned technician handling the job.'
    },
    '{trackingLink}': {
        description: 'The live secure link where the customer can view job status, technician ETA, or history.'
    },
    '{quoteNumber}': {
        description: 'The quote identifier code (e.g., "Q-7081").'
    },
    '{quoteTotal}': {
        description: 'The calculated total dollar amount for the estimate or quote.'
    },
    '{quoteUrl}': {
        description: 'The interactive customer portal link to review, sign, or approve the quote online.',
        requiredFor: ['quote_delivery']
    },
    '{eta}': {
        description: 'The live estimated transit arrival time (e.g., "15-20 mins").'
    },
    '{questionText}': {
        description: 'The custom question or on-site instruction written by the technician/dispatcher.',
        requiredFor: ['tech_question']
    },
    '{ticketId}': {
        description: 'The auto-generated service intake ticket reference ID.'
    }
};

/**
 * Pop-out Modal for viewing variable description and choosing replacement variables
 */
interface VariableModalProps {
    currentTag: string;
    availableVariables: SMSTemplateVariable[];
    onSelectVariable: (newTag: string) => void;
    onRemove: () => void;
    onClose: () => void;
}

const VariableModal: React.FC<VariableModalProps> = ({
    currentTag,
    availableVariables,
    onSelectVariable,
    onRemove,
    onClose
}) => {
    const currentVar = availableVariables.find(v => v.tag === currentTag);
    const currentExplanation = VARIABLE_EXPLANATIONS[currentTag]?.description || currentVar?.example || 'Dynamic text variable';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div 
                className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center flex-shrink-0">
                            <Tag className="w-5 h-5 text-indigo-300" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-base text-white">Dynamic Variable</h3>
                                <code className="bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 font-mono text-xs px-2 py-0.5 rounded-md font-bold">
                                    {currentTag}
                                </code>
                            </div>
                            <p className="text-xs text-indigo-200/80 mt-0.5">
                                {currentVar?.label || 'Template Token'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Current Variable Description Box */}
                <div className="p-5 border-b border-gray-100 bg-indigo-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900">
                            What this variable does:
                        </span>
                        {currentVar?.example && (
                            <span className="text-[11px] text-gray-500 font-mono">
                                Sample: <strong className="text-indigo-950">"{currentVar.example}"</strong>
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">
                        {currentExplanation}
                    </p>
                </div>

                {/* Switch Variable Section */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                            Choose Variable to Swap / Replace:
                        </h4>
                        <span className="text-[11px] text-gray-400">
                            {availableVariables.length} options available
                        </span>
                    </div>

                    <div className="space-y-2">
                        {availableVariables.map(v => {
                            const isCurrent = v.tag === currentTag;
                            const desc = VARIABLE_EXPLANATIONS[v.tag]?.description || `Inserts the ${v.label} for this notification.`;

                            return (
                                <div
                                    key={v.tag}
                                    onClick={() => {
                                        if (!isCurrent) {
                                            onSelectVariable(v.tag);
                                        }
                                    }}
                                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 group ${
                                        isCurrent
                                            ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200'
                                            : 'bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-xs'
                                    }`}
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-xs text-gray-900 group-hover:text-indigo-600 transition">
                                                {v.label}
                                            </span>
                                            <code className="bg-indigo-100 text-indigo-800 font-mono text-[11px] px-1.5 py-0.5 rounded font-semibold">
                                                {v.tag}
                                            </code>
                                            {isCurrent && (
                                                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5">
                                                    <Check className="w-3 h-3 text-emerald-600" /> Currently Selected
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-gray-600 leading-relaxed">
                                            {desc}
                                        </p>
                                        <p className="text-[10px] text-gray-400 font-mono">
                                            Example: <span className="text-gray-700 italic">"{v.example}"</span>
                                        </p>
                                    </div>

                                    <div className="flex-shrink-0 mt-0.5">
                                        {isCurrent ? (
                                            <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-indigo-600 text-white">
                                                Active
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-white border border-indigo-200 px-2.5 py-1 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition">
                                                Select
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Modal Actions Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onRemove}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove Variable
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl transition shadow-2xs"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export const SMSAutomationManager: React.FC<SMSAutomationManagerProps> = ({
    orgId,
    orgName = 'Hitop Plumbers',
    twilioPhoneNumber
}) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeCategory, setActiveCategory] = useState<'all' | 'appointments' | 'quotes' | 'technician' | 'intake'>('all');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('appointment_confirmation');
    
    // State of templates
    const [templates, setTemplates] = useState<Record<string, SMSTemplateConfig>>(DEFAULT_SMS_TEMPLATES);
    const [automationEnabled, setAutomationEnabled] = useState(true);
    const [retentionDays, setRetentionDays] = useState<number>(365);

    // Variable Dropdown state
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Raw mode toggle
    const [rawMode, setRawMode] = useState(false);

    // Pop-out Modal state for variable click/edit
    const [modalVariable, setModalVariable] = useState<{ tag: string; index: number } | null>(null);

    // Editor refs
    const editorRef = useRef<HTMLDivElement>(null);
    const rawTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const loadOrgTemplates = async () => {
            if (!orgId) return;
            setLoading(true);
            try {
                const orgDoc = await getDoc(doc(db, 'organizations', orgId));
                if (orgDoc.exists()) {
                    const data = orgDoc.data();
                    const savedAutomation = data.smsAutomation as SMSAutomationSettings | undefined;
                    
                    if (savedAutomation) {
                        if (savedAutomation.templates) {
                            const merged: Record<string, SMSTemplateConfig> = { ...DEFAULT_SMS_TEMPLATES };
                            for (const [key, tpl] of Object.entries(savedAutomation.templates)) {
                                if (merged[key]) {
                                    merged[key] = { ...merged[key], ...tpl };
                                } else {
                                    merged[key] = tpl;
                                }
                            }
                            setTemplates(merged);
                        }
                        if (savedAutomation.enabled !== undefined) {
                            setAutomationEnabled(savedAutomation.enabled);
                        }
                        if (savedAutomation.retentionDays !== undefined) {
                            setRetentionDays(savedAutomation.retentionDays);
                        }
                    }
                }
            } catch (err) {
                console.error('Error loading SMS templates:', err);
            } finally {
                setLoading(false);
            }
        };

        loadOrgTemplates();
    }, [orgId]);

    const activeTemplate = templates[selectedTemplateId] || DEFAULT_SMS_TEMPLATES.appointment_confirmation;

    const handleTemplateChange = (field: keyof SMSTemplateConfig, value: any) => {
        setTemplates(prev => ({
            ...prev,
            [selectedTemplateId]: {
                ...prev[selectedTemplateId],
                [field]: value
            }
        }));
    };

    /**
     * Parse template string into segments of plain text and variable tokens
     */
    interface TemplateSegment {
        id: string;
        type: 'text' | 'variable';
        value: string;
        tag?: string;
        varIndex?: number;
    }

    const segments: TemplateSegment[] = React.useMemo(() => {
        const templateText = activeTemplate.template || '';
        const regex = /\{[a-zA-Z0-9_-]+\}/g;
        const result: TemplateSegment[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        let varCount = 0;

        while ((match = regex.exec(templateText)) !== null) {
            const matchIndex = match.index;
            if (matchIndex > lastIndex) {
                result.push({
                    id: `text-${lastIndex}`,
                    type: 'text',
                    value: templateText.substring(lastIndex, matchIndex)
                });
            }
            result.push({
                id: `var-${matchIndex}-${match[0]}`,
                type: 'variable',
                value: match[0],
                tag: match[0],
                varIndex: varCount++
            });
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < templateText.length) {
            result.push({
                id: `text-${lastIndex}`,
                type: 'text',
                value: templateText.substring(lastIndex)
            });
        }

        return result;
    }, [activeTemplate.template]);

    /**
     * Update a specific text segment in the template
     */
    const handleTextSegmentChange = (index: number, newText: string) => {
        const newSegments = [...segments];
        newSegments[index] = { ...newSegments[index], value: newText };
        const rebuilt = newSegments.map(s => s.value).join('');
        handleTemplateChange('template', rebuilt);
    };

    /**
     * Delete a specific variable segment
     */
    const handleDeleteVariableSegment = (segmentIndex: number) => {
        const seg = segments[segmentIndex];
        const newSegments = segments.filter((_, i) => i !== segmentIndex);
        const rebuilt = newSegments.map(s => s.value).join('');
        handleTemplateChange('template', rebuilt);
        if (seg?.tag) {
            toast.success(`Removed ${seg.tag}`);
        }
        if (modalVariable) {
            setModalVariable(null);
        }
    };

    /**
     * Swap/Replace a specific variable segment
     */
    const handleSwapVariable = (targetVarIndex: number, newTag: string) => {
        let currentVarCount = 0;
        const newSegments = segments.map(seg => {
            if (seg.type === 'variable') {
                if (currentVarCount === targetVarIndex) {
                    currentVarCount++;
                    return {
                        ...seg,
                        value: newTag,
                        tag: newTag
                    };
                }
                currentVarCount++;
            }
            return seg;
        });

        const rebuilt = newSegments.map(s => s.value).join('');
        handleTemplateChange('template', rebuilt);
        toast.success(`Swapped variable to ${newTag}`);
        setModalVariable(null);
    };

    /**
     * Safely insert a dynamic variable token at the end or in raw mode
     */
    const handleInsertVariable = (variable: SMSTemplateVariable) => {
        const tag = variable.tag;
        const currentText = activeTemplate.template || '';
        const spaceBefore = currentText.length > 0 && !currentText.endsWith(' ') && !currentText.endsWith('\n') ? ' ' : '';
        const newText = currentText + spaceBefore + tag;
        handleTemplateChange('template', newText);

        setDropdownOpen(false);
        toast.success(`Inserted ${variable.label} (${tag})`);
    };

    const handleResetTemplate = () => {
        const defaultTpl = DEFAULT_SMS_TEMPLATES[selectedTemplateId];
        if (defaultTpl) {
            setTemplates(prev => ({
                ...prev,
                [selectedTemplateId]: { ...defaultTpl }
            }));
            toast.success(`Reset "${defaultTpl.name}" to default settings`);
        }
    };

    const handleSaveAll = async () => {
        if (!orgId) return;
        setSaving(true);
        try {
            const payload: SMSAutomationSettings = {
                enabled: automationEnabled,
                templates,
                retentionDays
            };
            await updateDoc(doc(db, 'organizations', orgId), {
                smsAutomation: payload,
                updatedAt: new Date()
            });
            toast.success('SMS automation rules, templates & retention policy saved!');
        } catch (err: any) {
            console.error('Error saving SMS settings:', err);
            toast.error(err.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    // Syntax analysis for malformed or broken tags
    const checkTemplateIntegrity = (text: string, availableVars: SMSTemplateVariable[]) => {
        const warnings: string[] = [];
        const validTags = new Set(availableVars.map(v => v.tag));

        // Check for broken braces (e.g. {customer without closing })
        const matches = text.match(/\{[^}]*$/g) || [];
        if (matches.length > 0) {
            warnings.push(`Unclosed variable bracket detected: "${matches[0]}"`);
        }

        // Check for unrecognized tags
        const allTagsInText = text.match(/\{[a-zA-Z0-9_-]+\}/g) || [];
        for (const tag of allTagsInText) {
            if (!validTags.has(tag)) {
                warnings.push(`Unrecognized variable: "${tag}". Please select from the dropdown.`);
            }
        }

        // Check for required variables
        if (selectedTemplateId === 'quote_delivery' && !text.includes('{quoteUrl}')) {
            warnings.push(`Missing Required Tag: "{quoteUrl}". Customers won't receive the link to view and approve the quote.`);
        }

        return warnings;
    };

    const segmentStats = calculateSmsSegments(activeTemplate.template);
    const livePreview = renderSmsPreview(activeTemplate.template, { '{companyName}': orgName });
    const templateWarnings = checkTemplateIntegrity(activeTemplate.template, activeTemplate.availableVariables);

    const filteredTemplates = Object.values(templates).filter(t => {
        if (activeCategory === 'all') return true;
        return t.category === activeCategory;
    });

    if (loading) {
        return (
            <div className="bg-white rounded-2xl p-12 flex flex-col items-center justify-center border border-gray-200">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
                <p className="text-gray-500 font-medium">Loading SMS Automation Settings...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Pop-out Modal for Choosing / Swapping Variables */}
            {modalVariable && (
                <VariableModal
                    currentTag={modalVariable.tag}
                    availableVariables={activeTemplate.availableVariables}
                    onSelectVariable={(newTag) => handleSwapVariable(modalVariable.index, newTag)}
                    onRemove={() => {
                        let targetSegmentIdx = -1;
                        let varCount = 0;
                        segments.forEach((s, idx) => {
                            if (s.type === 'variable') {
                                if (varCount === modalVariable.index) {
                                    targetSegmentIdx = idx;
                                }
                                varCount++;
                            }
                        });
                        if (targetSegmentIdx !== -1) {
                            handleDeleteVariableSegment(targetSegmentIdx);
                        }
                    }}
                    onClose={() => setModalVariable(null)}
                />
            )}

            {/* Top Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center flex-shrink-0">
                            <MessageSquare className="w-6 h-6 text-indigo-300" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-white">Automated Text Messaging & Templates</h2>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    <Shield className="w-3.5 h-3.5" /> 10DLC A2P Carrier Approved
                                </span>
                            </div>
                            <p className="text-sm text-indigo-200/80 mt-1 max-w-2xl">
                                Customize the automated texts sent to your customers for appointment confirmations, technician en-route tracking, quote deliveries, and question follow-ups.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setAutomationEnabled(!automationEnabled)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition border ${
                                automationEnabled
                                    ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/30'
                                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                            }`}
                        >
                            {automationEnabled ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-gray-500" />}
                            <span>{automationEnabled ? 'Automations Active' : 'Automations Paused'}</span>
                        </button>

                        <button
                            onClick={handleSaveAll}
                            disabled={saving}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Save All Changes
                        </button>
                    </div>
                </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {[
                    { id: 'all', label: 'All Templates' },
                    { id: 'appointments', label: '📅 Appointments & Reminders' },
                    { id: 'quotes', label: '💼 Quotes & Approvals' },
                    { id: 'technician', label: '💬 Technician & ETA' },
                    { id: 'intake', label: '📥 Customer Intake' }
                ].map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id as any)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                            activeCategory === cat.id
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Main Content: Left Column (Template List) & Right Column (Editor & Simulator) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Template Selector */}
                <div className="lg:col-span-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">
                        Select Notification Trigger ({filteredTemplates.length})
                    </h3>
                    
                    <div className="space-y-2">
                        {filteredTemplates.map(tpl => {
                            const isSelected = tpl.id === selectedTemplateId;
                            return (
                                <div
                                    key={tpl.id}
                                    onClick={() => setSelectedTemplateId(tpl.id)}
                                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                                        isSelected
                                            ? 'bg-indigo-50/70 border-indigo-300 shadow-sm ring-1 ring-indigo-200'
                                            : 'bg-white border-gray-200/80 hover:border-gray-300 hover:bg-gray-50/50'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className={`text-sm font-bold ${isSelected ? 'text-indigo-900' : 'text-gray-900'}`}>
                                            {tpl.name}
                                        </h4>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            tpl.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            {tpl.enabled ? 'ENABLED' : 'DISABLED'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                                        {tpl.description}
                                    </p>
                                    <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-gray-100 text-[11px] text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {tpl.timing === 'delayed' ? `Delayed (${tpl.delayMinutes || 15}m buffer)` :
                                             tpl.timing === '24h_before' ? '24 Hours Before' :
                                             tpl.timing === '2h_before' ? '2 Hours Before' : 'Instant Trigger'}
                                        </span>
                                        <ChevronRight className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-600' : 'text-gray-300'}`} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Template Editor & Live Phone Simulator */}
                <div className="lg:col-span-8 grid grid-cols-1 xl:grid-cols-12 gap-6">
                    {/* Editor Panel */}
                    <div className="xl:col-span-7 bg-white rounded-2xl border border-gray-200 p-6 space-y-5 shadow-sm">
                        {/* Header & Toggle */}
                        <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-100">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{activeTemplate.name}</h3>
                                <p className="text-xs text-gray-500 mt-0.5">{activeTemplate.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeTemplate.enabled}
                                        onChange={e => handleTemplateChange('enabled', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>
                        </div>

                        {/* Timing & Buffer Settings */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/80 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase text-gray-700">
                                <Clock className="w-4 h-4 text-indigo-600" />
                                <span>When should this text be sent?</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Trigger Timing</label>
                                    <select
                                        value={activeTemplate.timing}
                                        onChange={e => handleTemplateChange('timing', e.target.value)}
                                        className="w-full text-xs font-medium bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="instant">Instant (Immediately upon event)</option>
                                        <option value="delayed">Delayed Buffer (Allows schedule edits)</option>
                                        <option value="24h_before">24 Hours Before Appointment</option>
                                        <option value="2h_before">2 Hours Before Arrival</option>
                                        <option value="manual">Manual Dispatch Only</option>
                                    </select>
                                </div>

                                {activeTemplate.timing === 'delayed' && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Delay Buffer (Minutes)</label>
                                        <select
                                            value={activeTemplate.delayMinutes || 15}
                                            onChange={e => handleTemplateChange('delayMinutes', parseInt(e.target.value))}
                                            className="w-full text-xs font-medium bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value={5}>5 Minutes</option>
                                            <option value={15}>15 Minutes (Recommended)</option>
                                            <option value={30}>30 Minutes</option>
                                            <option value={60}>60 Minutes (1 Hour)</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Template Text Editor with Dropdown Insertion Tool */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                                        Message Text Template
                                    </label>
                                    <span className="text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-medium">
                                        Click variables to swap or delete
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setRawMode(!rawMode)}
                                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition"
                                        title={rawMode ? "Switch to Visual Token Editor" : "Switch to Raw Text Editor"}
                                    >
                                        {rawMode ? <Eye className="w-3.5 h-3.5 text-indigo-600" /> : <Code className="w-3.5 h-3.5" />}
                                        <span>{rawMode ? 'Token Mode' : 'Raw Text'}</span>
                                    </button>
                                    <button
                                        onClick={handleResetTemplate}
                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        Reset
                                    </button>
                                </div>
                            </div>

                            {/* Safe Variable Insertion Dropdown */}
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => setDropdownOpen(!dropdownOpen)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-200 rounded-xl text-xs font-semibold text-indigo-900 shadow-sm transition"
                                >
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-indigo-600" />
                                        <span>Select & Insert Dynamic Variable (Safe Insertion)</span>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-indigo-600 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Dropdown Menu with Explanations */}
                                {dropdownOpen && (
                                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl border border-gray-200 shadow-2xl z-30 divide-y divide-gray-100 max-h-72 overflow-y-auto">
                                        <div className="p-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                            Available Variables for {activeTemplate.name}
                                        </div>
                                        {activeTemplate.availableVariables.map(v => {
                                            const explanation = VARIABLE_EXPLANATIONS[v.tag]?.description || `Inserts the ${v.label} for this notification.`;
                                            const isIncluded = activeTemplate.template.includes(v.tag);

                                            return (
                                                <button
                                                    key={v.tag}
                                                    type="button"
                                                    onClick={() => handleInsertVariable(v)}
                                                    className="w-full text-left p-3 hover:bg-indigo-50/60 transition flex items-start justify-between gap-3 group"
                                                >
                                                    <div className="space-y-0.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-xs text-gray-900 group-hover:text-indigo-600">
                                                                {v.label}
                                                            </span>
                                                            <code className="bg-indigo-100 text-indigo-800 font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold">
                                                                {v.tag}
                                                            </code>
                                                            {isIncluded && (
                                                                <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                                                                    <Check className="w-3 h-3" /> Already In Text
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-gray-500 leading-relaxed">
                                                            {explanation}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 font-mono">
                                                            Example preview: <span className="text-gray-600 italic">"{v.example}"</span>
                                                        </p>
                                                    </div>
                                                    <div className="flex-shrink-0 mt-1">
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 bg-white border border-indigo-200 px-2 py-1 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition">
                                                            <Plus className="w-3 h-3" /> Insert
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Main Editor: Interactive Token Flow vs Raw Textarea */}
                            {rawMode ? (
                                <textarea
                                    ref={rawTextareaRef}
                                    rows={5}
                                    value={activeTemplate.template}
                                    onChange={e => handleTemplateChange('template', e.target.value)}
                                    className="w-full text-sm font-sans border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 leading-relaxed shadow-inner"
                                    placeholder="Enter template text..."
                                />
                            ) : (
                                <div className="w-full min-h-[140px] max-h-[260px] overflow-y-auto border border-gray-300 rounded-xl p-3 bg-white focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 shadow-inner flex flex-wrap items-center gap-y-2 gap-x-1 text-sm leading-relaxed text-gray-900">
                                    {segments.length === 0 && (
                                        <span className="text-gray-400 text-xs italic">
                                            Template is empty. Insert a dynamic variable above or type below...
                                        </span>
                                    )}
                                    {segments.map((seg, idx) => {
                                        if (seg.type === 'variable') {
                                            return (
                                                <div
                                                    key={seg.id}
                                                    onClick={() => setModalVariable({ tag: seg.tag || seg.value, index: seg.varIndex ?? 0 })}
                                                    className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-900 font-mono text-xs font-semibold px-2.5 py-1 rounded-lg cursor-pointer select-none transition-all shadow-2xs hover:shadow-xs group"
                                                    title="Click to view details or swap variable"
                                                >
                                                    <Tag className="w-3.5 h-3.5 text-indigo-600 pointer-events-none" />
                                                    <span className="pointer-events-none">{seg.value}</span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteVariableSegment(idx);
                                                        }}
                                                        className="w-4 h-4 rounded-full hover:bg-indigo-200 text-indigo-500 hover:text-rose-600 flex items-center justify-center ml-0.5 text-xs font-bold transition-all"
                                                        title={`Remove ${seg.value}`}
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            );
                                        }

                                        // Text segment
                                        return (
                                            <input
                                                key={seg.id}
                                                type="text"
                                                value={seg.value}
                                                onChange={e => handleTextSegmentChange(idx, e.target.value)}
                                                style={{ width: `${Math.max(12, seg.value.length * 8.5 + 8)}px` }}
                                                className="bg-transparent border-b border-transparent hover:border-gray-200 focus:border-indigo-500 focus:bg-indigo-50/30 outline-hidden px-1 py-0.5 text-sm font-normal text-gray-900 transition-all rounded-xs"
                                                placeholder="..."
                                            />
                                        );
                                    })}
                                </div>
                            )}

                            {/* Integrity & Warning Alerts */}
                            {templateWarnings.length > 0 && (
                                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                                    {templateWarnings.map((warn, idx) => (
                                        <div key={idx} className="flex items-start gap-2 text-xs text-amber-900 font-medium">
                                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                            <span>{warn}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Character & Segment Counter */}
                            <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                                <span className={`font-mono font-medium ${segmentStats.charCount > 320 ? 'text-amber-600' : 'text-gray-600'}`}>
                                    {segmentStats.charCount} characters • {segmentStats.segmentCount} SMS {segmentStats.segmentCount === 1 ? 'segment' : 'segments'}
                                </span>
                                <span className="text-[11px] text-gray-400">
                                    Standard 160 chars / segment
                                </span>
                            </div>
                        </div>

                        {/* Variables Health / Status Bar */}
                        <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                Template Variable Checklist:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {activeTemplate.availableVariables.map(v => {
                                    const isPresent = activeTemplate.template.includes(v.tag);
                                    return (
                                        <button
                                            key={v.tag}
                                            type="button"
                                            onClick={() => !isPresent && handleInsertVariable(v)}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition border ${
                                                isPresent
                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 cursor-default'
                                                    : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-300'
                                            }`}
                                        >
                                            {isPresent ? (
                                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                            ) : (
                                                <Plus className="w-3 h-3 text-gray-400" />
                                            )}
                                            <span className="font-medium">{v.tag}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Compliance Notice */}
                        <div className="bg-blue-50/80 p-3.5 rounded-xl border border-blue-200/80 flex items-start gap-2.5 text-xs text-blue-900">
                            <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold text-blue-950 mb-0.5">Carrier Compliance Protected</p>
                                <p className="text-blue-800 leading-relaxed text-[11px]">
                                    Transactional alerts must include standard opt-out wording (<code className="bg-blue-100 px-1 rounded text-blue-900">Reply STOP to opt out</code>). Carrier filtering is automatically bypassed under your verified campaign.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right: Live Phone Simulator Preview */}
                    <div className="xl:col-span-5 flex flex-col items-center">
                        <div className="w-full max-w-[280px] bg-slate-900 rounded-[36px] p-3 shadow-2xl border-4 border-slate-800 relative">
                            {/* Camera Notch */}
                            <div className="w-24 h-4 bg-slate-800 rounded-full mx-auto mb-3" />

                            {/* Phone Screen */}
                            <div className="bg-slate-100 rounded-[24px] p-3 h-[460px] flex flex-col justify-between overflow-hidden shadow-inner text-gray-900">
                                {/* Chat Header */}
                                <div className="text-center pb-2 border-b border-gray-200">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-bold text-xs mx-auto mb-1">
                                        {orgName.substring(0, 2).toUpperCase()}
                                    </div>
                                    <p className="font-bold text-xs text-gray-900">{orgName}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">
                                        {twilioPhoneNumber || '(808) 435-2635'}
                                    </p>
                                </div>

                                {/* Chat Body */}
                                <div className="flex-1 py-3 overflow-y-auto space-y-2">
                                    <div className="text-center text-[9px] text-gray-400 font-medium my-1">
                                        Today at 9:00 AM
                                    </div>
                                    
                                    <div className="bg-white rounded-2xl rounded-tl-sm p-3 shadow-sm border border-gray-200 text-xs text-gray-800 leading-relaxed max-w-[90%] whitespace-pre-wrap break-words">
                                        {livePreview}
                                    </div>

                                    {activeTemplate.id === 'quote_delivery' && (
                                        <div className="bg-emerald-600 text-white text-[11px] px-3 py-1.5 rounded-2xl rounded-tr-sm ml-auto max-w-[70%] font-medium text-right shadow-sm">
                                            APPROVE
                                        </div>
                                    )}
                                </div>

                                {/* Chat Input Bar Mock */}
                                <div className="pt-2 border-t border-gray-200 flex items-center gap-1.5">
                                    <div className="flex-1 bg-white rounded-full px-3 py-1 text-[11px] text-gray-400 border border-gray-200">
                                        Text Message
                                    </div>
                                    <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs">
                                        ↑
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Phone Label */}
                        <p className="text-xs text-gray-400 font-medium mt-3 text-center">
                            Live Customer Message Simulation
                        </p>
                    </div>
                </div>
            </div>

            {/* Text Conversation History & Data Retention Policy */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                            <History className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">
                                Text History Retention & Compliance Policy
                            </h3>
                            <p className="text-xs text-gray-500">
                                Configure how long outbound notifications and two-way customer text exchanges are kept in your history.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-700">Keep History For:</span>
                        <select
                            value={retentionDays}
                            onChange={(e) => setRetentionDays(Number(e.target.value))}
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-xs font-semibold rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-2xs"
                        >
                            <option value={30}>30 Days (1 Month)</option>
                            <option value={60}>60 Days (2 Months)</option>
                            <option value={90}>90 Days (3 Months)</option>
                            <option value={180}>180 Days (6 Months)</option>
                            <option value={365}>365 Days (1 Year - Standard)</option>
                            <option value={730}>730 Days (2 Years)</option>
                            <option value={0}>Keep Indefinitely (Forever)</option>
                        </select>
                    </div>
                </div>

                {/* Technical Storage & Cost Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                            <Database className="w-4 h-4 text-indigo-600" />
                            <span>Storage Infrastructure</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Text exchanges are indexed in encrypted Google Cloud Firestore NoSQL storage, providing instant live real-time sync with zero latency.
                        </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                            <HardDrive className="w-4 h-4 text-emerald-600" />
                            <span>Storage Cost Profile</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Cloud storage is <strong>$0.18 / GB / month</strong>. 1 GB stores approximately <strong>2,000,000 text messages</strong> (less than $0.001 / month per 10k messages).
                        </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                            <Clock className="w-4 h-4 text-blue-600" />
                            <span>Automated Cleanup Engine</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            {retentionDays === 0
                                ? 'Retention is set to indefinite. All customer conversation threads remain saved until manually deleted.'
                                : `A scheduled cloud background job automatically purges messages older than ${retentionDays} days every day at 3:00 AM UTC.`}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
