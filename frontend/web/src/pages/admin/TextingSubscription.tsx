/**
 * TextingSubscription — Admin page for managing business phone service subscriptions.
 * Allows organizations to provision dedicated phone numbers with SMS + AI Call Answering.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { toast } from 'react-hot-toast';
import {
    ArrowLeft, MessageSquare, Phone, Search, CheckCircle2,
    Zap, Star, Crown, Send, TrendingUp, AlertTriangle,
    XCircle, Loader2, Shield, Smartphone, BarChart3, PhoneCall, Bot, RefreshCw
} from 'lucide-react';
import { A2PRegistrationForm } from '../../components/admin/A2PRegistrationForm';

interface Plan {
    id: string;
    name: string;
    monthlyPrice: number;
    includedMessages: number;
    perMessageOverageRate: number;
    description: string;
}

interface AvailableNumber {
    phoneNumber: string;
    friendlyName: string;
    locality: string;
    region: string;
    capabilities: { sms: boolean; voice: boolean; mms: boolean };
}

interface Subscription {
    phoneNumber: string;
    plan: string;
    planName: string;
    monthlyPrice: number;
    includedMessages: number;
    perMessageOverageRate: number;
    status: string;
    provisionedAt: any;
    a2pCampaignStatus?: string;
    a2pCampaignSid?: string;
}

interface Usage {
    messagesSent: number;
    messagesReceived: number;
    totalMessages: number;
    estimatedCost: number;
    overage: number;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
    starter: <Zap className="w-6 h-6" />,
    pro: <Star className="w-6 h-6" />,
    enterprise: <Crown className="w-6 h-6" />
};

const PLAN_COLORS: Record<string, { bg: string; border: string; gradient: string; text: string; badge: string }> = {
    starter: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        gradient: 'from-blue-500 to-cyan-500',
        text: 'text-blue-700',
        badge: 'bg-blue-100 text-blue-700'
    },
    pro: {
        bg: 'bg-violet-50',
        border: 'border-violet-200',
        gradient: 'from-violet-500 to-amber-600',
        text: 'text-violet-700',
        badge: 'bg-violet-100 text-violet-700'
    },
    enterprise: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        gradient: 'from-amber-500 to-orange-500',
        text: 'text-amber-700',
        badge: 'bg-amber-100 text-amber-700'
    }
};

export const TextingSubscription: React.FC = () => {
    const { user, organization } = useAuth();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [usage, setUsage] = useState<Usage | null>(null);
    const [loading, setLoading] = useState(true);

    // Number search
    const [areaCode, setAreaCode] = useState('');
    const [searchState, setSearchState] = useState('');
    const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

    // Provisioning
    const [provisioning, setProvisioning] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    // Step tracker
    const [step, setStep] = useState<'plans' | 'numbers' | 'confirm'>('plans');
    const [refreshingA2p, setRefreshingA2p] = useState(false);

    const orgId = organization?.id || (user as any)?.org_id || '';

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load plans
            const getPlans = httpsCallable(functions, 'getTextingPlans');
            const plansResult = await getPlans({});
            setPlans((plansResult.data as any).plans || []);

            // Load existing subscription
            const getSub = httpsCallable(functions, 'getTextingSubscription');
            const subResult = await getSub({ orgId });
            const data = subResult.data as any;
            setSubscription(data.subscription || null);
            setUsage(data.usage || null);
        } catch (error) {
            console.error('Error loading texting data:', error);
        }
        setLoading(false);
    };

    const handleRefreshA2P = async () => {
        if (!orgId) return;
        setRefreshingA2p(true);
        try {
            const checkA2p = httpsCallable(functions, 'checkA2pCampaignStatus');
            const result = await checkA2p({ orgId });
            toast.success((result.data as any).message || 'A2P status refreshed');
            await loadData();
        } catch (error: any) {
            console.error('Error refreshing A2P:', error);
            toast.error(error.message || 'Failed to refresh A2P status');
        }
        setRefreshingA2p(false);
    };

    const handleSearchNumbers = async () => {
        if (!areaCode && !searchState) {
            toast.error('Please enter an area code or state');
            return;
        }
        setSearching(true);
        try {
            const search = httpsCallable(functions, 'searchAvailableNumbers');
            const result = await search({ areaCode: areaCode || undefined, state: searchState || undefined });
            setAvailableNumbers((result.data as any).numbers || []);
            if ((result.data as any).numbers?.length === 0) {
                toast('No numbers found for that area code. Try a different one.', { icon: '🔍' });
            }
        } catch (error) {
            console.error('Error searching numbers:', error);
            toast.error('Failed to search for phone numbers');
        }
        setSearching(false);
    };

    const handleProvision = async () => {
        if (!selectedNumber || !selectedPlan) return;

        setProvisioning(true);
        try {
            const provision = httpsCallable(functions, 'provisionPhoneNumber');
            await provision({ phoneNumber: selectedNumber, planId: selectedPlan, orgId });
            toast.success('Phone number provisioned successfully! 🎉');
            await loadData();
            setStep('plans');
        } catch (error: any) {
            console.error('Error provisioning number:', error);
            toast.error(error.message || 'Failed to provision phone number');
        }
        setProvisioning(false);
    };

    const handleCancel = async () => {
        if (!confirm('Are you sure you want to cancel your texting subscription? Your phone number will be released.')) {
            return;
        }
        setCancelling(true);
        try {
            const release = httpsCallable(functions, 'releasePhoneNumber');
            await release({ orgId });
            toast.success('Subscription cancelled');
            setSubscription(null);
            setUsage(null);
        } catch (error: any) {
            console.error('Error cancelling:', error);
            toast.error(error.message || 'Failed to cancel subscription');
        }
        setCancelling(false);
    };

    const formatPhone = (phone: string) => {
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('1')) {
            return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
        }
        return phone;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50 flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-lg">Loading texting services...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center gap-4">
                        <Link to="/settings" className="text-gray-400 hover:text-gray-600 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 rounded-xl shadow-lg shadow-emerald-200/50">
                                <Smartphone className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-600">
                                    Business Phone
                                </h1>
                                <p className="text-sm text-gray-500">Dedicated number with SMS + AI-powered call answering</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                {/* Active Subscription Dashboard */}
                {subscription && subscription.status === 'active' ? (
                    <>
                        {/* Subscription Card */}
                        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
                            <div className={`h-2 bg-gradient-to-r ${PLAN_COLORS[subscription.plan]?.gradient || 'from-emerald-500 to-teal-500'}`} />
                            <div className="p-6">
                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-xl bg-gradient-to-br ${PLAN_COLORS[subscription.plan]?.gradient || 'from-emerald-500 to-teal-500'} shadow-lg`}>
                                            <Phone className="w-8 h-8 text-white" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-2xl font-bold text-gray-900">
                                                    {formatPhone(subscription.phoneNumber)}
                                                </h2>
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                                    <CheckCircle2 className="w-3 h-3" /> Active
                                                </span>
                                            </div>
                                            <p className="text-gray-500 mt-1">
                                                {subscription.planName} Plan — ${subscription.monthlyPrice}/mo
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleCancel}
                                        disabled={cancelling}
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                        Cancel Subscription
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* A2P Status Banner / Form */}
                        {subscription.a2pCampaignStatus !== 'APPROVED' && (
                            <div className="mt-6">
                                {subscription.a2pCampaignStatus === 'not_registered' || !subscription.a2pCampaignStatus || subscription.a2pCampaignStatus === 'registration_failed' ? (
                                    <A2PRegistrationForm orgId={orgId} onSuccess={loadData} />
                                ) : (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <h3 className="text-lg font-bold text-amber-900">A2P 10DLC Registration Pending</h3>
                                                <p className="text-amber-800 text-sm mt-1">
                                                    Your campaign is currently under review by mobile carriers. This process typically takes 1-7 business days. 
                                                    During this time, SMS delivery may be blocked or filtered by carriers until approved. Voice calls are not affected.
                                                </p>
                                                <p className="text-amber-700 text-xs mt-2 font-medium">
                                                    Current Status: {subscription.a2pCampaignStatus}
                                                </p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={handleRefreshA2P}
                                            disabled={refreshingA2p}
                                            className="whitespace-nowrap flex items-center gap-2 bg-white text-amber-700 border border-amber-300 hover:bg-amber-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                        >
                                            {refreshingA2p ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                            Refresh Status
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Usage Stats */}
                        {usage && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-500">Messages Sent</span>
                                        <Send className="w-4 h-4 text-blue-500" />
                                    </div>
                                    <p className="text-3xl font-bold text-gray-900">{usage.messagesSent}</p>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-500">Messages Received</span>
                                        <MessageSquare className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <p className="text-3xl font-bold text-gray-900">{usage.messagesReceived}</p>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-500">Total This Month</span>
                                        <BarChart3 className="w-4 h-4 text-violet-500" />
                                    </div>
                                    <p className="text-3xl font-bold text-gray-900">{usage.totalMessages}</p>
                                    <div className="mt-2">
                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                            <span>{usage.totalMessages} / {subscription.includedMessages}</span>
                                            <span>{Math.min(100, Math.round((usage.totalMessages / subscription.includedMessages) * 100))}%</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${usage.totalMessages > subscription.includedMessages
                                                    ? 'bg-red-500'
                                                    : usage.totalMessages > subscription.includedMessages * 0.8
                                                        ? 'bg-amber-500'
                                                        : 'bg-emerald-500'
                                                    }`}
                                                style={{ width: `${Math.min(100, (usage.totalMessages / subscription.includedMessages) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-500">Current Bill</span>
                                        <TrendingUp className="w-4 h-4 text-amber-500" />
                                    </div>
                                    <p className="text-3xl font-bold text-gray-900">
                                        ${(subscription.monthlyPrice + (usage.overage > 0 ? usage.overage * subscription.perMessageOverageRate : 0)).toFixed(2)}
                                    </p>
                                    {usage.overage > 0 && (
                                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            {usage.overage} overage messages (${(usage.overage * subscription.perMessageOverageRate).toFixed(2)})
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* How It Works */}
                        <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl border border-gray-200/80 p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-blue-500" />
                                How Your Business Number Works
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">1</div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">Outbound SMS</p>
                                        <p className="text-xs text-gray-500 mt-0.5">All customer texts from DispatchBox use your dedicated number.</p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">2</div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">Inbound SMS</p>
                                        <p className="text-xs text-gray-500 mt-0.5">Customer replies auto-create tickets and route to your team.</p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-600">3</div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">AI Call Answering</p>
                                        <p className="text-xs text-gray-500 mt-0.5">When customers call, our AI assistant handles it — schedule jobs, check status, or take messages.</p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-600">4</div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">Professional Brand</p>
                                        <p className="text-xs text-gray-500 mt-0.5">Customers see your business number, building trust and credibility.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    /* No Active Subscription — Sign Up Flow */
                    <>
                        {/* Hero / Value Prop */}
                        <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 rounded-2xl p-8 text-white shadow-xl">
                            <div className="max-w-2xl">
                                <h2 className="text-3xl font-bold mb-3">Get a Dedicated Business Phone Number</h2>
                                <p className="text-lg text-emerald-100 leading-relaxed">
                                    Give your field service company a professional phone presence.
                                    SMS, AI-powered call answering, auto ticket creation, and more — all from one number.
                                </p>
                                <div className="flex flex-wrap gap-4 mt-6">
                                    <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2 text-sm">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                                        Your own local number
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2 text-sm">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                                        AI call answering
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2 text-sm">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                                        SMS auto-replies
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2 text-sm">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                                        Auto ticket creation
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Step Indicator */}
                        <div className="flex items-center justify-center gap-3">
                            {['plans', 'numbers', 'confirm'].map((s, i) => (
                                <React.Fragment key={s}>
                                    <div
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${step === s
                                            ? 'bg-emerald-100 text-emerald-700 shadow-sm'
                                            : (s === 'numbers' && selectedPlan) || (s === 'confirm' && selectedNumber)
                                                ? 'bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200'
                                                : 'bg-gray-50 text-gray-400'
                                            }`}
                                        onClick={() => {
                                            if (s === 'plans') setStep('plans');
                                            if (s === 'numbers' && selectedPlan) setStep('numbers');
                                            if (s === 'confirm' && selectedNumber) setStep('confirm');
                                        }}
                                    >
                                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${step === s ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'
                                            }`}>
                                            {i + 1}
                                        </span>
                                        {s === 'plans' ? 'Choose Plan' : s === 'numbers' ? 'Pick Number' : 'Confirm'}
                                    </div>
                                    {i < 2 && <div className="w-8 h-px bg-gray-300" />}
                                </React.Fragment>
                            ))}
                        </div>

                        {/* Step 1: Choose Plan */}
                        {step === 'plans' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {plans.map(plan => {
                                    const colors = PLAN_COLORS[plan.id] || PLAN_COLORS.starter;
                                    const isSelected = selectedPlan === plan.id;
                                    return (
                                        <div
                                            key={plan.id}
                                            onClick={() => { setSelectedPlan(plan.id); setStep('numbers'); }}
                                            className={`relative bg-white rounded-2xl border-2 shadow-sm cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${isSelected
                                                ? `${colors.border} ring-2 ring-offset-2 ring-${plan.id === 'pro' ? 'violet' : plan.id === 'enterprise' ? 'amber' : 'blue'}-400`
                                                : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                        >
                                            {plan.id === 'pro' && (
                                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                                    <span className="bg-gradient-to-r from-violet-500 to-amber-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                                                        MOST POPULAR
                                                    </span>
                                                </div>
                                            )}
                                            <div className={`h-1.5 rounded-t-2xl bg-gradient-to-r ${colors.gradient}`} />
                                            <div className="p-6">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className={`p-2 rounded-lg ${colors.bg}`}>
                                                        {PLAN_ICONS[plan.id]}
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                                                        <p className="text-sm text-gray-500">{plan.description}</p>
                                                    </div>
                                                </div>

                                                <div className="mb-6">
                                                    <span className="text-4xl font-extrabold text-gray-900">${plan.monthlyPrice}</span>
                                                    <span className="text-gray-500">/month</span>
                                                </div>

                                                <ul className="space-y-3 mb-6">
                                                    <li className="flex items-center gap-2 text-sm text-gray-700">
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                        Dedicated local phone number
                                                    </li>
                                                    <li className="flex items-center gap-2 text-sm text-gray-700">
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                        AI-powered call answering
                                                    </li>
                                                    <li className="flex items-center gap-2 text-sm text-gray-700">
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                        {plan.includedMessages.toLocaleString()} SMS messages included
                                                    </li>
                                                    <li className="flex items-center gap-2 text-sm text-gray-700">
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                        ${plan.perMessageOverageRate}/msg overage rate
                                                    </li>
                                                    <li className="flex items-center gap-2 text-sm text-gray-700">
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                        Auto ticket creation from calls & texts
                                                    </li>
                                                    {plan.id === 'enterprise' && (
                                                        <li className="flex items-center gap-2 text-sm text-gray-700">
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                            Priority support
                                                        </li>
                                                    )}
                                                </ul>

                                                <button className={`w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r ${colors.gradient} shadow-lg hover:shadow-xl transition-all duration-200`}>
                                                    Select {plan.name}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Step 2: Pick Number */}
                        {step === 'numbers' && (
                            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-gray-100">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Choose Your Business Number</h3>
                                    <p className="text-sm text-gray-500">Search by area code to find a local number that matches your service area.</p>

                                    <div className="flex flex-col sm:flex-row gap-3 mt-4">
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Area Code</label>
                                            <input
                                                type="text"
                                                value={areaCode}
                                                onChange={e => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                                placeholder="e.g. 808"
                                                className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                                id="area-code-input"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">State (optional)</label>
                                            <input
                                                type="text"
                                                value={searchState}
                                                onChange={e => setSearchState(e.target.value.toUpperCase().slice(0, 2))}
                                                placeholder="e.g. HI"
                                                className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                                id="state-input"
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <button
                                                onClick={handleSearchNumbers}
                                                disabled={searching}
                                                className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-emerald-200/50 hover:shadow-xl transition-all disabled:opacity-50"
                                                id="search-numbers-btn"
                                            >
                                                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                Search
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Results */}
                                <div className="p-6">
                                    {availableNumbers.length > 0 ? (
                                        <div className="space-y-3">
                                            <p className="text-sm text-gray-500 mb-4">{availableNumbers.length} numbers available</p>
                                            {availableNumbers.map(num => (
                                                <div
                                                    key={num.phoneNumber}
                                                    onClick={() => { setSelectedNumber(num.phoneNumber); setStep('confirm'); }}
                                                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${selectedNumber === num.phoneNumber
                                                        ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200'
                                                        : 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="bg-emerald-100 p-2 rounded-lg">
                                                            <Phone className="w-5 h-5 text-emerald-600" />
                                                        </div>
                                                        <div>
                                                            <p className="text-lg font-bold text-gray-900 tracking-wide">
                                                                {formatPhone(num.phoneNumber)}
                                                            </p>
                                                            <p className="text-sm text-gray-500">
                                                                {num.locality}{num.region ? `, ${num.region}` : ''}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {num.capabilities.sms && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">SMS</span>}
                                                        {num.capabilities.voice && <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">Voice</span>}
                                                        {num.capabilities.mms && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">MMS</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 text-gray-400">
                                            <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                            <p>Enter your area code above and search to find available numbers</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Step 3: Confirm */}
                        {step === 'confirm' && selectedPlan && selectedNumber && (
                            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-8 max-w-lg mx-auto">
                                <div className="text-center mb-8">
                                    <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900">Confirm Your Selection</h3>
                                    <p className="text-gray-500 mt-1">Review your business phone service details</p>
                                </div>

                                <div className="space-y-4 mb-8">
                                    <div className="flex justify-between items-center py-3 border-b border-gray-100">
                                        <span className="text-gray-600">Phone Number</span>
                                        <span className="font-bold text-gray-900 text-lg">{formatPhone(selectedNumber)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 border-b border-gray-100">
                                        <span className="text-gray-600">Plan</span>
                                        <span className="font-semibold text-gray-900">
                                            {plans.find(p => p.id === selectedPlan)?.name}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 border-b border-gray-100">
                                        <span className="text-gray-600">Included Messages</span>
                                        <span className="font-semibold text-gray-900">
                                            {plans.find(p => p.id === selectedPlan)?.includedMessages.toLocaleString()}/mo
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 border-b border-gray-100">
                                        <span className="text-gray-600">Overage Rate</span>
                                        <span className="font-semibold text-gray-900">
                                            ${plans.find(p => p.id === selectedPlan)?.perMessageOverageRate}/msg
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-3">
                                        <span className="text-lg font-semibold text-gray-900">Monthly Total</span>
                                        <span className="text-2xl font-extrabold text-emerald-600">
                                            ${plans.find(p => p.id === selectedPlan)?.monthlyPrice}/mo
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setStep('numbers')}
                                        className="flex-1 py-3 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleProvision}
                                        disabled={provisioning}
                                        className="flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-200/50 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        id="confirm-provision-btn"
                                    >
                                        {provisioning ? (
                                            <><Loader2 className="w-5 h-5 animate-spin" /> Provisioning...</>
                                        ) : (
                                            <><Zap className="w-5 h-5" /> Activate Now</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
