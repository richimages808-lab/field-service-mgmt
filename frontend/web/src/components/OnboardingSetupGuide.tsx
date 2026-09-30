import React, { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import {
    CheckCircle2, AlertCircle, ArrowRight, DollarSign, Clock, MapPin, 
    Percent, ShieldAlert, Sparkles, Building2, Smartphone, CreditCard,
    X, Save, Check, LayoutGrid
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface SetupRequirement {
    id: string;
    title: string;
    category: 'financial' | 'operations' | 'profile' | 'integrations';
    icon: React.ReactNode;
    isConfigured: (org: any, user: any) => boolean;
    currentValueDescription: (org: any, user: any) => string;
    whenIncluded: string;
    whenNotIncluded: string;
    settingsTab: string;
    highlightParam: string;
    quickInputType?: 'number' | 'text';
    quickInputUnit?: string;
    quickInputKey?: string;
    quickInputSubkey?: string;
}

export const SETUP_REQUIREMENTS: SetupRequirement[] = [
    {
        id: 'driveTimeCharge',
        title: 'Default Drive Time & Travel Fee',
        category: 'financial',
        icon: <DollarSign className="w-5 h-5 text-orange-500" />,
        isConfigured: (org) => {
            const cost = org?.rateCard?.driveTimeCharge ?? org?.settings?.driveTimeCharge ?? 0;
            const time = org?.rateCard?.defaultDriveTimeMinutes ?? org?.settings?.defaultDriveTimeMinutes ?? 0;
            return cost > 0 || time > 0;
        },
        currentValueDescription: (org) => {
            const cost = org?.rateCard?.driveTimeCharge ?? org?.settings?.driveTimeCharge ?? 0;
            const time = org?.rateCard?.defaultDriveTimeMinutes ?? org?.settings?.defaultDriveTimeMinutes ?? 0;
            const parts = [];
            if (cost > 0) parts.push(`$${cost.toFixed(2)} travel fee`);
            if (time > 0) parts.push(`${time}m drive time`);
            return parts.length > 0 ? parts.join(' • ') : 'Not set (Optional)';
        },
        whenIncluded: 'Automatically pre-fills your standard transit buffer duration on the schedule and travel/service call charges on quotes and AI estimates.',
        whenNotIncluded: 'Travel duration and fee default to none ($0.00). You risk scheduling overlapping appointments or absorbing fuel and transit expenses on service calls.',
        settingsTab: 'financial',
        highlightParam: 'driveTimeCharge',
        quickInputType: 'number',
        quickInputUnit: '$',
        quickInputKey: 'rateCard',
        quickInputSubkey: 'driveTimeCharge'
    },
    {
        id: 'baseHourlyRate',
        title: 'Base Hourly Labor Rate',
        category: 'financial',
        icon: <DollarSign className="w-5 h-5 text-emerald-500" />,
        isConfigured: (org) => {
            const val = org?.rateCard?.baseHourlyRate ?? org?.settings?.baseHourlyRate;
            return val != null && val > 0;
        },
        currentValueDescription: (org) => {
            const val = org?.rateCard?.baseHourlyRate ?? org?.settings?.baseHourlyRate ?? 100;
            return `$${val.toFixed(2)} / hr`;
        },
        whenIncluded: 'AI quote generation and job pricing compute labor costs precisely according to your actual business billing rate.',
        whenNotIncluded: 'Falls back to generic $100.00/hr, which may under-bill specialized contractor trades or over-charge residential clients.',
        settingsTab: 'financial',
        highlightParam: 'baseHourlyRate',
        quickInputType: 'number',
        quickInputUnit: '$/hr',
        quickInputKey: 'rateCard',
        quickInputSubkey: 'baseHourlyRate'
    },
    {
        id: 'materialMarkup',
        title: 'Default Material & Parts Markup',
        category: 'financial',
        icon: <Percent className="w-5 h-5 text-blue-500" />,
        isConfigured: (org) => {
            const val = org?.rateCard?.materialMarkup ?? org?.settings?.materialMarkup;
            return val != null && val > 0;
        },
        currentValueDescription: (org) => {
            const val = org?.rateCard?.materialMarkup ?? org?.settings?.materialMarkup ?? 30;
            return `${val}% markup`;
        },
        whenIncluded: 'Wholesale material and supplier catalog costs are automatically marked up to generate profitable customer prices on quotes and invoices.',
        whenNotIncluded: 'Defaults to 30% or 0%, risking diminished margins on purchased hardware and parts.',
        settingsTab: 'financial',
        highlightParam: 'materialMarkup',
        quickInputType: 'number',
        quickInputUnit: '%',
        quickInputKey: 'rateCard',
        quickInputSubkey: 'materialMarkup'
    },
    {
        id: 'operatingHours',
        title: 'Company Working Hours & Timezone',
        category: 'operations',
        icon: <Clock className="w-5 h-5 text-purple-500" />,
        isConfigured: (org) => {
            return org?.settings?.operatingHoursStart != null && org?.settings?.timezone != null;
        },
        currentValueDescription: (org) => {
            const start = org?.settings?.operatingHoursStart ?? 8;
            const end = org?.settings?.operatingHoursEnd ?? 17;
            const tz = org?.settings?.timezone || 'Default';
            const fmt = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
            return `${fmt(start)} – ${fmt(end)} (${tz.split('/')[1]?.replace('_', ' ') || tz})`;
        },
        whenIncluded: 'Solopreneur Calendar, Dispatcher Console, and customer booking portals constrain appointments to your actual work shift in your local time zone.',
        whenNotIncluded: 'Defaults to 8:00 AM – 5:00 PM Eastern, risking appointments scheduled outside of business hours or mismatched time zone displays.',
        settingsTab: 'financial',
        highlightParam: 'operatingHours'
    },
    {
        id: 'shopAddress',
        title: 'Shop / Dispatch Starting Address',
        category: 'operations',
        icon: <MapPin className="w-5 h-5 text-red-500" />,
        isConfigured: (org, user) => {
            const orgLoc = org?.settings?.serviceLocations?.[0]?.address || org?.settings?.address;
            const userLoc = user?.startLocation?.address;
            return Boolean(orgLoc || userLoc);
        },
        currentValueDescription: (org, user) => {
            const orgLoc = org?.settings?.serviceLocations?.[0]?.address || org?.settings?.address;
            const userLoc = user?.startLocation?.address;
            return orgLoc || userLoc || 'Not configured';
        },
        whenIncluded: 'AI schedule optimizer sequences appointments with real Google Maps drive times starting from your shop, warehouse, or home base.',
        whenNotIncluded: 'AI route calculation defaults to generic coordinates, producing inaccurate drive durations and route previews.',
        settingsTab: 'profile',
        highlightParam: 'address'
    },
    {
        id: 'defaultTaxRate',
        title: 'Sales Tax Rate',
        category: 'financial',
        icon: <Percent className="w-5 h-5 text-amber-500" />,
        isConfigured: (org) => {
            const val = org?.settings?.defaultTaxRate;
            return val != null && val > 0;
        },
        currentValueDescription: (org) => {
            const val = org?.settings?.defaultTaxRate ?? 4.712;
            return `${val}%`;
        },
        whenIncluded: 'Applies accurate sales tax to taxable materials and labor on all customer invoices and quotes automatically.',
        whenNotIncluded: 'Uses system fallback rate (4.712%) or zero, risking state/municipal tax non-compliance.',
        settingsTab: 'financial',
        highlightParam: 'defaultTaxRate',
        quickInputType: 'number',
        quickInputUnit: '%',
        quickInputKey: 'settings',
        quickInputSubkey: 'defaultTaxRate'
    },
    {
        id: 'upfrontPayment',
        title: 'Upfront Deposit Policy',
        category: 'financial',
        icon: <ShieldAlert className="w-5 h-5 text-indigo-500" />,
        isConfigured: (org) => {
            return org?.settings?.upfrontPaymentEnabled === true;
        },
        currentValueDescription: (org) => {
            if (!org?.settings?.upfrontPaymentEnabled) return 'Disabled (No deposit required)';
            const rule = org?.settings?.upfrontPaymentRule || 'always';
            return `Active (${rule.replace('_', ' ')})`;
        },
        whenIncluded: 'Quotes automatically display an "Approve & Pay Deposit" Stripe checkout button so customers fund required deposits before work is scheduled.',
        whenNotIncluded: 'Customers can approve quotes without immediate payment; deposits must be invoiced and collected manually.',
        settingsTab: 'financial',
        highlightParam: 'upfrontPayment'
    },
    {
        id: 'companyInfo',
        title: 'Company Brand, Phone & Support Email',
        category: 'profile',
        icon: <Building2 className="w-5 h-5 text-cyan-500" />,
        isConfigured: (org) => {
            return Boolean(org?.name && (org?.settings?.phone || org?.outboundEmail?.fromEmail));
        },
        currentValueDescription: (org) => {
            return org?.name || 'Company Name Not Set';
        },
        whenIncluded: 'Your customer portal, PDF invoice header, email notifications, and quote approval banners display verified business branding.',
        whenNotIncluded: 'Customer communications show generic placeholder titles or login emails.',
        settingsTab: 'profile',
        highlightParam: 'companyInfo'
    },
    {
        id: 'notifications',
        title: 'Customer SMS & Status Notifications',
        category: 'integrations',
        icon: <Smartphone className="w-5 h-5 text-emerald-500" />,
        isConfigured: (org) => {
            return org?.settings?.jobNotifEnabled !== false;
        },
        currentValueDescription: (org) => {
            return org?.settings?.jobNotifEnabled !== false ? 'Enabled (Automated)' : 'Disabled';
        },
        whenIncluded: 'Sends automated SMS dispatch confirmations, technician en-route updates, and appointment reminders to customers.',
        whenNotIncluded: 'Customers receive no automated SMS updates and must be called or texted manually from personal phones.',
        settingsTab: 'email',
        highlightParam: 'sms'
    },
    {
        id: 'stripePayment',
        title: 'Stripe Online Payment Processing',
        category: 'integrations',
        icon: <CreditCard className="w-5 h-5 text-violet-500" />,
        isConfigured: (org) => {
            return Boolean(org?.settings?.stripeConnected || org?.settings?.stripePublishableKey);
        },
        currentValueDescription: (org) => {
            return org?.settings?.stripeConnected ? 'Connected (Accepting Cards & Apple Pay)' : 'Demo / Sandbox Mode';
        },
        whenIncluded: 'Customers can pay invoices and quote deposits instantly online with credit/debit cards or mobile wallets with instant ledger sync.',
        whenNotIncluded: 'Online credit card checkout is in test mode; physical payments must be collected in the field or by check.',
        settingsTab: 'billing',
        highlightParam: 'stripe'
    },
    {
        id: 'navigationLayout',
        title: 'Workspace Layout & Navigation Style',
        category: 'operations',
        icon: <LayoutGrid className="w-5 h-5 text-indigo-500" />,
        isConfigured: (org) => {
            return Boolean(org?.settings?.layoutMode || org?.layoutSettings?.layoutMode);
        },
        currentValueDescription: (org) => {
            const mode = org?.settings?.layoutMode || org?.layoutSettings?.layoutMode || 'modern-hub';
            const arch = org?.settings?.navArchitecture || org?.layoutSettings?.navArchitecture || 'default';
            const modeNames: Record<string, string> = {
                'modern-hub': 'Modern Hub (Sidebar)',
                'streamlined': 'Streamlined (Top Nav)',
                'compact-pro': 'Compact Pro (Rail)'
            };
            return `${modeNames[mode] || 'Modern Hub'} • ${arch === 'default' ? 'Standard Menu' : arch}`;
        },
        whenIncluded: 'Empowers your team to work in your preferred UI density (Modern Hub, Streamlined Top Bar, or Compact Pro Rail) and customized menu flow.',
        whenNotIncluded: 'Defaults to standard Modern Hub left sidebar with general functional grouping.',
        settingsTab: 'layout',
        highlightParam: 'layout'
    }
];

interface OnboardingSetupGuideProps {
    onClose?: () => void;
    embedded?: boolean;
}

export const OnboardingSetupGuide: React.FC<OnboardingSetupGuideProps> = ({ onClose, embedded = false }) => {
    const { organization, user } = useAuth();
    const navigate = useNavigate();
    const { orgSlug } = useParams<{ orgSlug?: string }>();
    const [selectedCategory, setSelectedCategory] = useState<'all' | 'financial' | 'operations' | 'profile' | 'integrations'>('all');
    const [inlineValues, setInlineValues] = useState<Record<string, any>>({});
    const [savingId, setSavingId] = useState<string | null>(null);

    const orgPath = (path: string) => {
        if (!orgSlug) return path;
        return `/${orgSlug}${path.startsWith('/') ? path : `/${path}`}`;
    };

    // Calculate metrics
    const totalCount = SETUP_REQUIREMENTS.length;
    const configuredCount = SETUP_REQUIREMENTS.filter(r => r.isConfigured(organization, user)).length;
    const percentComplete = Math.round((configuredCount / totalCount) * 100);

    const filteredRequirements = SETUP_REQUIREMENTS.filter(r => 
        selectedCategory === 'all' ? true : r.category === selectedCategory
    );

    const handleQuickSave = async (req: SetupRequirement) => {
        if (!organization?.id) return;
        const val = inlineValues[req.id];
        if (val == null || val === '') return;

        setSavingId(req.id);
        try {
            const orgRef = doc(db, 'organizations', organization.id);
            const numVal = req.quickInputType === 'number' ? parseFloat(val) : val;

            if (req.quickInputKey && req.quickInputSubkey) {
                const fieldPath = `${req.quickInputKey}.${req.quickInputSubkey}`;
                await updateDoc(orgRef, { [fieldPath]: numVal });
            }
            toast.success(`Saved ${req.title}!`);
            setInlineValues(prev => ({ ...prev, [req.id]: undefined }));
        } catch (err) {
            console.error('Failed to quick-save setting:', err);
            toast.error('Failed to save setting');
        } finally {
            setSavingId(null);
        }
    };

    const handleNavigateToSetting = (req: SetupRequirement) => {
        const url = orgPath(`/settings?tab=${req.settingsTab}&highlight=${req.highlightParam}`);
        if (onClose) onClose();
        navigate(url);
    };

    const content = (
        <div className="space-y-6">
            {/* Header / Hero Banner */}
            <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs font-semibold text-blue-100 mb-2">
                                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                                Onboarding Setup Guide & Feature Readiness
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight">System Configuration & Data Requirements</h2>
                            <p className="text-blue-100 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
                                Review the required settings across all modules. Configure your rate card, operating hours, and policies so AI estimates, routing, and quotes operate with complete automation.
                            </p>
                        </div>
                        {onClose && !embedded && (
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition self-start"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* Progress Bar Card */}
                    <div className="mt-6 p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="w-full md:w-2/3">
                            <div className="flex justify-between text-xs font-medium mb-1.5">
                                <span>Configuration Progress</span>
                                <span className="font-bold">{configuredCount} of {totalCount} Completed ({percentComplete}%)</span>
                            </div>
                            <div className="w-full h-3 bg-white/20 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-emerald-400 to-green-300 transition-all duration-500 rounded-full"
                                    style={{ width: `${percentComplete}%` }}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-3 self-end md:self-auto">
                            <div className="text-right">
                                <p className="text-[11px] text-blue-200">Pending Actions</p>
                                <p className="text-lg font-bold text-yellow-300">{totalCount - configuredCount} items</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {[
                    { id: 'all', label: 'All Requirements' },
                    { id: 'financial', label: 'Financial & Rates' },
                    { id: 'operations', label: 'Operations & Routing' },
                    { id: 'profile', label: 'Company Profile' },
                    { id: 'integrations', label: 'Payments & Comms' }
                ].map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id as any)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                            selectedCategory === cat.id
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Requirements Cards List */}
            <div className="space-y-4">
                {filteredRequirements.map(req => {
                    const isDone = req.isConfigured(organization, user);
                    const currDesc = req.currentValueDescription(organization, user);

                    return (
                        <div 
                            key={req.id}
                            className={`p-5 rounded-xl border transition shadow-sm bg-white ${
                                isDone ? 'border-gray-200 hover:border-emerald-300' : 'border-amber-200 bg-amber-50/20 hover:border-amber-300'
                            }`}
                        >
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                <div className="flex items-start gap-3.5">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                        isDone ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-300'
                                    }`}>
                                        {req.icon}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-bold text-gray-900 text-base">{req.title}</h3>
                                            <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${
                                                isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800 animate-pulse'
                                            }`}>
                                                {isDone ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertCircle className="w-3 h-3 text-amber-600" />}
                                                {isDone ? 'Configured' : 'Needs Configuration'}
                                            </span>
                                            <span className="text-xs text-gray-500 font-medium">Current: <strong>{currDesc}</strong></span>
                                        </div>

                                        {/* What Happens When Included / Not Included Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
                                            <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100 text-xs">
                                                <p className="font-semibold text-emerald-900 flex items-center gap-1 mb-1">
                                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                    What happens when included:
                                                </p>
                                                <p className="text-emerald-800 leading-relaxed">{req.whenIncluded}</p>
                                            </div>
                                            <div className="p-2.5 rounded-lg bg-rose-50/50 border border-rose-100 text-xs">
                                                <p className="font-semibold text-rose-900 flex items-center gap-1 mb-1">
                                                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                                    What happens when NOT included:
                                                </p>
                                                <p className="text-rose-800 leading-relaxed">{req.whenNotIncluded}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions Column */}
                                <div className="flex flex-col sm:flex-row md:flex-col items-end gap-2 flex-shrink-0 justify-between self-stretch md:self-auto">
                                    <button
                                        onClick={() => handleNavigateToSetting(req)}
                                        className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
                                    >
                                        <span>Configure in Settings</span>
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Quick Inline Edit If Available */}
                                    {req.quickInputType && (
                                        <div className="flex items-center gap-1 mt-1 w-full sm:w-auto">
                                            <div className="relative flex-1">
                                                <input
                                                    type={req.quickInputType}
                                                    placeholder="Quick set..."
                                                    value={inlineValues[req.id] ?? ''}
                                                    onChange={(e) => setInlineValues({ ...inlineValues, [req.id]: e.target.value })}
                                                    className="w-full sm:w-28 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                                />
                                                {req.quickInputUnit && (
                                                    <span className="absolute right-2 top-1.5 text-[10px] text-gray-400 font-medium">
                                                        {req.quickInputUnit}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleQuickSave(req)}
                                                disabled={inlineValues[req.id] == null || inlineValues[req.id] === '' || savingId === req.id}
                                                className="px-2.5 py-1.5 bg-gray-900 hover:bg-black text-white text-xs font-medium rounded-lg disabled:opacity-40 transition flex items-center gap-1"
                                                title="Save quickly"
                                            >
                                                <Save className="w-3 h-3" />
                                                <span className="hidden sm:inline">Save</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    if (embedded) {
        return content;
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 relative">
                {content}
            </div>
        </div>
    );
};
