import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, Timestamp, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { Job, JobCategory, JOB_CATEGORIES } from '../types';
import { format } from 'date-fns';
import {
    X, Save, Sparkles, Loader2, User, Phone, Mail, MapPin,
    FileText, Clock, AlertTriangle, Wrench, Settings, Package,
    Search, Users, Shield, HelpCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import { InlineAIQuotePanel } from './InlineAIQuotePanel';
import { generateAIDefaultQuote } from '../lib/aiQuoteGenerator';
import toast from 'react-hot-toast';

interface QuickCreateJobModalProps {
    date: Date;
    hour: number;
    techId: string | null;
    techName: string | null;
    onClose: () => void;
    onJobCreated?: (job: Job) => void;
}

export const QuickCreateJobModal: React.FC<QuickCreateJobModalProps> = ({
    date,
    hour,
    techId,
    techName,
    onClose,
    onJobCreated
}) => {
    const { user } = useAuth();
    const orgId = (user as any)?.org_id || 'demo-org';

    // Form states
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [description, setDescription] = useState('');
    const [jobCategory, setJobCategory] = useState<JobCategory>('repair');
    const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
    const [estimatedDuration, setEstimatedDuration] = useState(60);
    const [siteName, setSiteName] = useState('');
    const [communicationPreference, setCommunicationPreference] = useState<'phone' | 'text' | 'email'>('email');

    // Flow states
    const [saving, setSaving] = useState(false);
    const [createdJob, setCreatedJob] = useState<Job | null>(null);
    const [generatingQuote, setGeneratingQuote] = useState(false);
    const [showAIQuote, setShowAIQuote] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const scheduledTime = new Date(date);
    scheduledTime.setHours(hour, 0, 0, 0);

    const handleSave = async () => {
        if (!customerName.trim()) {
            toast.error('Customer name is required');
            return;
        }
        if (!customerAddress.trim()) {
            toast.error('Address is required');
            return;
        }
        if (!description.trim()) {
            toast.error('Job description is required');
            return;
        }

        setSaving(true);
        try {
            const jobData: any = {
                org_id: orgId,
                status: techId ? 'scheduled' : 'pending',
                priority,
                estimated_duration: estimatedDuration,
                category: jobCategory,
                customer: {
                    name: customerName,
                    address: customerAddress,
                    phone: customerPhone,
                    email: customerEmail
                },
                request: {
                    description,
                    photos: [],
                    availability: [],
                    communicationPreference,
                    source: 'manual'
                },
                createdAt: serverTimestamp(),
                createdBy: user?.uid || 'unknown'
            };

            // Only include optional fields if they have values (Firestore rejects undefined)
            if (siteName.trim()) {
                jobData.site_name = siteName;
            }

            if (techId) {
                jobData.assigned_tech_id = techId;
                jobData.assigned_tech_name = techName || 'Unassigned';
                jobData.scheduled_at = Timestamp.fromDate(scheduledTime);
            }

            const docRef = await addDoc(collection(db, 'jobs'), jobData);
            const newJob = {
                id: docRef.id,
                ...jobData,
                scheduled_at: jobData.scheduled_at || null,
            } as Job;

            setCreatedJob(newJob);
            toast.success(`Job created for ${customerName}`);
            onJobCreated?.(newJob);
        } catch (error) {
            console.error('Failed to create job:', error);
            toast.error('Failed to create job');
        } finally {
            setSaving(false);
        }
    };

    const handleGenerateAIQuote = async () => {
        if (!createdJob) return;
        setGeneratingQuote(true);
        try {
            // Get tech rate card if available
            let rateCard = null;
            const effectiveTechId = techId || user?.uid;
            if (effectiveTechId) {
                try {
                    const techSnap = await getDoc(doc(db, 'users', effectiveTechId));
                    if (techSnap.exists()) {
                        rateCard = techSnap.data().rateCard || null;
                    }
                } catch { /* ignore */ }
            }

            const quoteId = await generateAIDefaultQuote(
                createdJob,
                user?.uid || '',
                user?.displayName || user?.email || 'Staff',
                rateCard,
                ''
            );

            // Update createdJob with the quote id reference
            setCreatedJob(prev => prev ? { ...prev, active_quote_id: quoteId, latestQuoteId: quoteId } as any : null);
            setShowAIQuote(true);
            toast.success('AI Quote & Materials generated!');
        } catch (error) {
            console.error('Failed to generate AI quote:', error);
            toast.error('Failed to generate AI quote');
        } finally {
            setGeneratingQuote(false);
        }
    };

    const getCategoryIcon = (cat: string) => {
        switch (cat) {
            case 'repair': return <Wrench className="w-4 h-4" />;
            case 'maintenance': return <Settings className="w-4 h-4" />;
            case 'installation': return <Package className="w-4 h-4" />;
            case 'inspection': return <Search className="w-4 h-4" />;
            case 'consultation': return <Users className="w-4 h-4" />;
            case 'emergency': return <AlertTriangle className="w-4 h-4" />;
            case 'warranty': return <Shield className="w-4 h-4" />;
            default: return <HelpCircle className="w-4 h-4" />;
        }
    };

    // ─── Success state: Job created, show AI quote option ───
    if (createdJob && !showAIQuote) {
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Success Header */}
                    <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-6 text-white">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                                <Save className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">Job Created!</h2>
                                <p className="text-emerald-100 text-sm">
                                    {createdJob.customer.name} — {format(scheduledTime, 'EEEE, MMM d @ h:mm a')}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        {/* Summary */}
                        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Customer</span>
                                <span className="font-medium">{createdJob.customer.name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Address</span>
                                <span className="font-medium truncate ml-4">{createdJob.customer.address}</span>
                            </div>
                            {techName && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Technician</span>
                                    <span className="font-medium">{techName}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-gray-500">Scheduled</span>
                                <span className="font-medium">{format(scheduledTime, 'MMM d, yyyy @ h:mm a')}</span>
                            </div>
                        </div>

                        {/* AI Quote CTA */}
                        <button
                            onClick={handleGenerateAIQuote}
                            disabled={generatingQuote}
                            className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {generatingQuote ? (
                                <>
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    Generating AI Quote...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-6 h-6" />
                                    Generate AI Quote & Materials
                                </>
                            )}
                        </button>
                        <p className="text-xs text-gray-500 text-center">
                            AI will analyze the job, recommend tools & materials, and generate a complete quote
                        </p>

                        {/* Close */}
                        <button
                            onClick={onClose}
                            className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                            Skip — Close
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ─── AI Quote Panel state: Show InlineAIQuotePanel ───
    if (createdJob && showAIQuote) {
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-violet-600 to-purple-700 p-4 text-white flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <Sparkles className="w-5 h-5" />
                            <div>
                                <h2 className="font-bold">AI Quote & Materials</h2>
                                <p className="text-violet-200 text-xs">{createdJob.customer.name} — {format(scheduledTime, 'MMM d @ h:mm a')}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* AI Quote Panel */}
                    <div className="flex-1 overflow-y-auto">
                        <InlineAIQuotePanel
                            job={createdJob}
                            onQuoteSent={() => {
                                toast.success('Quote sent to customer!');
                                onClose();
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // ─── Job Creation Form ───
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-violet-600 to-indigo-700 p-5 text-white flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold">Quick Create Job</h2>
                                <p className="text-violet-200 text-sm">
                                    {format(scheduledTime, 'EEEE, MMMM d @ h:mm a')}
                                    {techName && ` • ${techName}`}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Customer Info */}
                    <section>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <User className="w-3.5 h-3.5" />
                            Customer Information
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={customerName}
                                    onChange={e => setCustomerName(e.target.value)}
                                    placeholder="John Smith"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                    <input
                                        type="tel"
                                        value={customerPhone}
                                        onChange={e => setCustomerPhone(e.target.value)}
                                        placeholder="555-123-4567"
                                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                    <input
                                        type="email"
                                        value={customerEmail}
                                        onChange={e => setCustomerEmail(e.target.value)}
                                        placeholder="john@example.com"
                                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Preference</label>
                                <select
                                    value={communicationPreference}
                                    onChange={e => setCommunicationPreference(e.target.value as any)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm bg-white"
                                >
                                    <option value="email">📧 Email</option>
                                    <option value="text">💬 Text</option>
                                    <option value="phone">📞 Phone</option>
                                </select>
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Address <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={customerAddress}
                                        onChange={e => setCustomerAddress(e.target.value)}
                                        placeholder="123 Main St, City, ST 12345"
                                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Job Details */}
                    <section>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Wrench className="w-3.5 h-3.5" />
                            Job Details
                        </h3>

                        {/* Job Category */}
                        <div className="mb-3">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Job Type</label>
                            <div className="grid grid-cols-4 gap-2">
                                {JOB_CATEGORIES.map(cat => {
                                    const isSelected = jobCategory === cat.value;
                                    return (
                                        <button
                                            key={cat.value}
                                            type="button"
                                            onClick={() => setJobCategory(cat.value)}
                                            className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all text-xs ${isSelected
                                                ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-sm'
                                                : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                                }`}
                                        >
                                            {getCategoryIcon(cat.value)}
                                            <span className="font-medium">{cat.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="mb-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Description <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Describe the job... (e.g., AC unit not cooling, bathroom faucet leaking)"
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm resize-none"
                            />
                        </div>

                        {/* Priority & Duration */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                                <select
                                    value={priority}
                                    onChange={e => setPriority(e.target.value as any)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm bg-white"
                                >
                                    <option value="low">🟢 Low — Can wait</option>
                                    <option value="medium">🟡 Medium — Standard</option>
                                    <option value="high">🟠 High — Urgent</option>
                                    <option value="critical">🔴 Critical — Emergency</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" /> Duration
                                </label>
                                <select
                                    value={estimatedDuration}
                                    onChange={e => setEstimatedDuration(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm bg-white"
                                >
                                    <option value="30">30 mins</option>
                                    <option value="60">1 hour</option>
                                    <option value="90">1.5 hours</option>
                                    <option value="120">2 hours</option>
                                    <option value="180">3 hours</option>
                                    <option value="240">4 hours</option>
                                    <option value="480">Full day</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Advanced (collapsible) */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 font-medium"
                        >
                            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            Advanced Options
                        </button>
                        {showAdvanced && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
                                    <input
                                        type="text"
                                        value={siteName}
                                        onChange={e => setSiteName(e.target.value)}
                                        placeholder="e.g., Main Office, Unit 201"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 p-4 flex items-center justify-between bg-gray-50 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !customerName.trim() || !customerAddress.trim() || !description.trim()}
                        className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Create Job
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
