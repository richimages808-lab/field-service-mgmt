import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
    Building2,
    Mail,
    Palette,
    CreditCard,
    Save,
    CheckCircle,
    AlertCircle,
    Loader2,
    Crown,
    Users,
    DollarSign,
    Box,
    Tags,
    Shield,
    Info,
    Plus,
    X,
    AtSign
} from 'lucide-react';
import { ManageVendorsModal } from '../components/inventory/ManageVendorsModal';
import { InventoryCategoriesManager } from '../components/settings/InventoryCategoriesManager';
import { WebsiteBuilder } from '../components/settings/WebsiteBuilder';
import { EmailSignatureBuilder } from '../components/settings/EmailSignatureBuilder';

/** Convert a company name into a URL-safe slug: "ACME HVAC Services" → "acme-hvac-services" */
const slugify = (name: string): string =>
    name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')  // strip non-alphanumeric
        .replace(/\s+/g, '-')           // spaces → hyphens
        .replace(/-+/g, '-')            // collapse multiple hyphens
        .replace(/^-|-$/g, '');         // trim leading/trailing hyphens

export interface SectionItem {
    id: string;
    title: string;
    content: string;
    imageUrl?: string;
    rating?: number;
}

export interface ContentSection {
    id: string;
    type: 'hero' | 'about' | 'services' | 'gallery' | 'faq' | 'testimonials' | 'cta' | 'team' | 'hours' | 'serviceAreas' | 'certifications' | 'stats' | 'text' | 'twoColumn' | 'beforeAfter';
    title: string;
    content: string;
    enabled: boolean;
    order: number;
    items?: SectionItem[];
    imageUrl?: string;
    ctaText?: string;
    ctaLink?: string;
}

export interface WebsiteTheme {
    id: string;
    heroStyle: 'fullwidth' | 'split' | 'centered' | 'minimal';
    sectionSpacing: 'compact' | 'normal' | 'spacious';
    headingStyle: 'sans' | 'serif' | 'bold-caps';
    cardStyle: 'flat' | 'elevated' | 'bordered' | 'glass';
    colorMode: 'light' | 'dark' | 'auto';
}

interface OrgSettings {
    name: string;
    emailPrefix: string;
    emailAliases: string[];  // Additional prefix aliases
    autoReplyEnabled: boolean;
    autoReplyTemplate: string;
    forwardingEnabled: boolean;
    forwardTo: string;
    replyAsProxy: boolean;
    fromName: string;
    primaryColor: string;
    logoUrl: string;
    defaultTaxRate: number;
    defaultPlatformFeePercent: number;
    // Branding & Website Options
    secondaryColor: string;
    accentColor: string;
    heroImageUrl: string;
    fontFamily: string;
    welcomeMessage: string;
    buttonStyle: 'rounded' | 'pill' | 'square';
    buttonText: string;
    headerSubtitle: string;
    tagline: string;
    socialFacebook: string;
    socialInstagram: string;
    socialYelp: string;
    socialWebsite: string;
    // Advanced sections
    sections: ContentSection[];
    // Website theme
    websiteTheme: WebsiteTheme | null;
    // Upfront Payment Policy
    upfrontPaymentEnabled: boolean;
    upfrontPaymentRule: string;
    upfrontOverThreshold: number;
    upfrontPaidEstimateAmount: number;
    upfrontDepositPercent: number;
    upfrontDisclaimerText: string;
    emailSignatureEnabled: boolean;
    emailSignature: string;
}

export const OrganizationSettings: React.FC = () => {
    const { user, organization } = useAuth();
    const { plan, getDaysUntilTrialExpires } = usePlanFeatures();
    const [settings, setSettings] = useState<OrgSettings>({
        name: '',
        emailPrefix: '',
        emailAliases: [],
        autoReplyEnabled: false,
        autoReplyTemplate: '',
        forwardingEnabled: false,
        forwardTo: '',
        replyAsProxy: false,
        fromName: '',
        primaryColor: '#6366f1',
        logoUrl: '',
        defaultTaxRate: 4.712,
        defaultPlatformFeePercent: 4.4,
        secondaryColor: '#ffffff',
        accentColor: '#f59e0b',
        heroImageUrl: '',
        fontFamily: 'Inter',
        welcomeMessage: 'Welcome to our customer portal. Sign in to view and manage your services.',
        buttonStyle: 'rounded',
        buttonText: 'Send Magic Link',
        headerSubtitle: 'Service History & Account',
        tagline: '',
        socialFacebook: '',
        socialInstagram: '',
        socialYelp: '',
        socialWebsite: '',
        sections: [],
        websiteTheme: null,
        upfrontPaymentEnabled: false,
        upfrontPaymentRule: 'none',
        upfrontOverThreshold: 500,
        upfrontPaidEstimateAmount: 75,
        upfrontDepositPercent: 50,
        upfrontDisclaimerText: 'This deposit is non-refundable if services are cancelled within 24 hours of the scheduled appointment. Deposit amount will be deducted from your final invoice.',
        emailSignatureEnabled: false,
        emailSignature: ''
    });
    const [activeTab, setActiveTab] = useState<'profile' | 'categories' | 'email' | 'branding' | 'billing' | 'financial' | 'vendors'>('profile');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!organization?.id) return;

        // Fetch the FULL organization document from Firestore
        // (AuthProvider only loads a subset — branding, settings, etc. are missing)
        const loadFullOrg = async () => {
            try {
                const orgRef = doc(db, 'organizations', organization.id);
                const { getDoc } = await import('firebase/firestore');
                const snap = await getDoc(orgRef);
                if (!snap.exists()) return;

                const d = snap.data();
                setSettings({
                    name: d.name || '',
                    emailPrefix: d.inboundEmail?.prefix || slugify(d.name || ''),
                    emailAliases: d.inboundEmail?.aliases || [],
                    autoReplyEnabled: d.inboundEmail?.autoReplyEnabled ?? false,
                    autoReplyTemplate: d.inboundEmail?.autoReplyTemplate || 'Thank you for contacting us! We have received your message and will respond shortly.',
                    forwardingEnabled: d.inboundEmail?.forwardingEnabled ?? false,
                    forwardTo: d.inboundEmail?.forwardTo || '',
                    replyAsProxy: d.inboundEmail?.replyAsProxy ?? false,
                    fromName: d.outboundEmail?.fromName || d.name || '',
                    primaryColor: d.branding?.primaryColor || '#6366f1',
                    logoUrl: d.branding?.logoUrl || '',
                    defaultTaxRate: d.settings?.defaultTaxRate ?? 4.712,
                    defaultPlatformFeePercent: d.settings?.defaultPlatformFeePercent ?? 4.4,
                    secondaryColor: d.branding?.secondaryColor || '#ffffff',
                    accentColor: d.branding?.accentColor || '#f59e0b',
                    heroImageUrl: d.branding?.heroImageUrl || '',
                    fontFamily: d.branding?.fontFamily || 'Inter',
                    welcomeMessage: d.branding?.welcomeMessage || 'Welcome to our customer portal. Sign in to view and manage your services.',
                    buttonStyle: d.branding?.buttonStyle || 'rounded',
                    buttonText: d.branding?.buttonText || 'Send Magic Link',
                    headerSubtitle: d.branding?.headerSubtitle || 'Service History & Account',
                    tagline: d.branding?.tagline || '',
                    socialFacebook: d.branding?.socialLinks?.facebook || '',
                    socialInstagram: d.branding?.socialLinks?.instagram || '',
                    socialYelp: d.branding?.socialLinks?.yelp || '',
                    socialWebsite: d.branding?.socialLinks?.website || '',
                    sections: d.branding?.sections || [],
                    websiteTheme: d.branding?.websiteTheme || null,
                    upfrontPaymentEnabled: d.settings?.upfrontPaymentPolicy?.enabled ?? false,
                    upfrontPaymentRule: d.settings?.upfrontPaymentPolicy?.defaultRule || 'none',
                    upfrontOverThreshold: d.settings?.upfrontPaymentPolicy?.overThreshold ?? 500,
                    upfrontPaidEstimateAmount: d.settings?.upfrontPaymentPolicy?.paidEstimateAmount ?? 75,
                    upfrontDepositPercent: d.settings?.upfrontPaymentPolicy?.depositPercent ?? 50,
                    upfrontDisclaimerText: d.settings?.upfrontPaymentPolicy?.disclaimerText || 'This deposit is non-refundable if services are cancelled within 24 hours of the scheduled appointment. Deposit amount will be deducted from your final invoice.',
                    emailSignatureEnabled: d.outboundEmail?.signatureEnabled ?? false,
                    emailSignature: d.outboundEmail?.signature || ''
                });
            } catch (err) {
                console.error('Error loading full org settings:', err);
            }
        };

        loadFullOrg();
    }, [organization?.id]);

    const handleInputChange = (field: keyof OrgSettings, value: any) => {
        setSettings(prev => {
            const next = { ...prev, [field]: value };

            // When the name changes, auto-derive slug and email prefix
            if (field === 'name' && typeof value === 'string') {
                next.emailPrefix = slugify(value);
                // Also keep fromName in sync if it was matching the old name
                if (prev.fromName === prev.name) {
                    next.fromName = value;
                }
            }

            return next;
        });
        setSaveSuccess(false);
    };

    const handleSave = async () => {
        if (!organization) return;

        setIsSaving(true);
        setError('');

        try {
            const orgRef = doc(db, 'organizations', organization.id);
            const newSlug = slugify(settings.name);
            await updateDoc(orgRef, {
                name: settings.name,
                slug: newSlug,
                'inboundEmail.prefix': settings.emailPrefix || newSlug,
                'inboundEmail.aliases': settings.emailAliases || [],
                'inboundEmail.autoReplyEnabled': settings.autoReplyEnabled,
                'inboundEmail.autoReplyTemplate': settings.autoReplyTemplate,
                'inboundEmail.forwardingEnabled': settings.forwardingEnabled,
                'inboundEmail.forwardTo': settings.forwardTo || null,
                'inboundEmail.replyAsProxy': settings.replyAsProxy,
                'outboundEmail.fromName': settings.fromName,
                'outboundEmail.signatureEnabled': settings.emailSignatureEnabled,
                'outboundEmail.signature': settings.emailSignature,
                'branding.companyName': settings.name,
                'branding.primaryColor': settings.primaryColor,
                'branding.secondaryColor': settings.secondaryColor,
                'branding.accentColor': settings.accentColor,
                'branding.logoUrl': settings.logoUrl,
                'branding.heroImageUrl': settings.heroImageUrl,
                'branding.fontFamily': settings.fontFamily,
                'branding.welcomeMessage': settings.welcomeMessage,
                'branding.buttonStyle': settings.buttonStyle,
                'branding.buttonText': settings.buttonText,
                'branding.headerSubtitle': settings.headerSubtitle,
                'branding.tagline': settings.tagline,
                'branding.socialLinks': {
                    facebook: settings.socialFacebook,
                    instagram: settings.socialInstagram,
                    yelp: settings.socialYelp,
                    website: settings.socialWebsite
                },
                'settings.defaultTaxRate': settings.defaultTaxRate,
                'settings.defaultPlatformFeePercent': settings.defaultPlatformFeePercent,
                'settings.upfrontPaymentPolicy': {
                    enabled: settings.upfrontPaymentEnabled,
                    defaultRule: settings.upfrontPaymentRule,
                    overThreshold: settings.upfrontOverThreshold,
                    paidEstimateAmount: settings.upfrontPaidEstimateAmount,
                    depositPercent: settings.upfrontDepositPercent,
                    disclaimerText: settings.upfrontDisclaimerText
                },
                'branding.sections': settings.sections || [],
                'branding.websiteTheme': settings.websiteTheme || null,
                // Also sync to portalConfig for public portal compatibility
                'portalConfig.slug': newSlug,
                'portalConfig.isActive': true,
                updatedAt: new Date()
            });

            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err: any) {
            console.error('Error saving settings:', err);
            setError(err.message || 'Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const getPlanBadge = () => {
        const colors = {
            trial: 'bg-amber-100 text-amber-800',
            individual: 'bg-blue-100 text-blue-800',
            small_business: 'bg-green-100 text-green-800',
            enterprise: 'bg-yellow-100 text-yellow-800'
        };

        return (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${colors[plan] || colors.individual}`}>
                {plan === 'enterprise' && <Crown className="w-4 h-4 mr-1" />}
                {plan.replace('_', ' ').toUpperCase()}
            </span>
        );
    };

    const tabs = [
        { id: 'profile' as const, label: 'Profile', icon: Building2 },
        { id: 'categories' as const, label: 'Categories', icon: Tags },
        { id: 'vendors' as const, label: 'Vendors & Suppliers', icon: Box },
        { id: 'email' as const, label: 'Email Settings', icon: Mail },
        { id: 'branding' as const, label: 'Branding', icon: Palette },
        { id: 'financial' as const, label: 'Financial', icon: DollarSign },
        { id: 'billing' as const, label: 'Plan & Billing', icon: CreditCard }
    ];

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Organization Settings</h1>
                <p className="text-gray-500 mt-1">Manage your organization profile and preferences</p>
            </div>

            {/* Tab Navigation */}
            <div className="bg-white rounded-lg shadow-sm mb-6">
                <div className="border-b border-gray-200">
                    <nav className="flex space-x-8 px-6" aria-label="Tabs">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <Icon className="w-5 h-5" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div className="p-6">
                    {/* Profile Tab */}
                    {activeTab === 'profile' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Organization Profile</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Organization Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.name}
                                            onChange={(e) => handleInputChange('name', e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="ACME HVAC Services"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Organization ID
                                        </label>
                                        <input
                                            type="text"
                                            value={organization?.id || ''}
                                            disabled
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">This is your unique organization identifier</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Current Plan
                                        </label>
                                        <div className="flex items-center gap-3">
                                            {getPlanBadge()}
                                            {plan === 'trial' && (
                                                <span className="text-sm text-gray-600">
                                                    {getDaysUntilTrialExpires()} days remaining
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Email Settings Tab */}
                    {activeTab === 'email' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Configuration</h2>

                                <div className="space-y-4">
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <div className="flex items-start gap-3">
                                            <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                                            <div>
                                                <h3 className="font-medium text-blue-900">Service Email Address</h3>
                                                <p className="text-sm text-blue-700 mt-1">
                                                    {settings.emailPrefix ? (
                                                        <>Your service email: <span className="font-mono font-semibold">{settings.emailPrefix}@dispatch-box.com</span></>
                                                    ) : (
                                                        'No email prefix configured. Contact support to set up your service email.'
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            From Name (Outbound Emails)
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.fromName}
                                            onChange={(e) => handleInputChange('fromName', e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="ACME HVAC Support"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">This name will appear in emails sent to customers</p>
                                    </div>

                                    {/* Email Aliases Management */}
                                    <div className="border-t pt-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <AtSign className="w-4 h-4 text-indigo-600" />
                                            <div>
                                                <label className="text-sm font-medium text-gray-700">
                                                    Email Aliases
                                                </label>
                                                <p className="text-xs text-gray-500">
                                                    Create department addresses that route to your organization. Just type the prefix — <span className="font-mono font-semibold">.{settings.emailPrefix || 'yourcompany'}@dispatch-box.com</span> is added automatically.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Existing aliases — show as tag chips */}
                                        {settings.emailAliases.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {settings.emailAliases.map((alias, i) => {
                                                    // Derive display label: "support.hitopplumbers" → "support"
                                                    const prefix = settings.emailPrefix || '';
                                                    const label = prefix && alias.endsWith(`.${prefix}`)
                                                        ? alias.replace(`.${prefix}`, '')
                                                        : alias;
                                                    return (
                                                        <span
                                                            key={i}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-sm text-indigo-800 font-medium"
                                                            title={`${alias}@dispatch-box.com`}
                                                        >
                                                            <Mail className="w-3.5 h-3.5 text-indigo-500" />
                                                            <span className="font-semibold">{label}</span>
                                                            <span className="text-indigo-400 font-normal">.{prefix}@dispatch-box.com</span>
                                                            <button
                                                                onClick={() => {
                                                                    handleInputChange('emailAliases',
                                                                        settings.emailAliases.filter((_: string, idx: number) => idx !== i)
                                                                    );
                                                                }}
                                                                className="ml-1 p-0.5 rounded-full hover:bg-indigo-200 transition-colors"
                                                                title="Remove alias"
                                                            >
                                                                <X className="w-3 h-3 text-indigo-600" />
                                                            </button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Add new alias — user types only the label, company suffix is fixed */}
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex-1 max-w-md">
                                                <input
                                                    type="text"
                                                    id="new-alias-input"
                                                    placeholder="e.g., support"
                                                    className="w-full px-4 py-2 pr-56 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm font-mono"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            const input = e.target as HTMLInputElement;
                                                            const label = input.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
                                                            const fullAlias = label ? `${label}.${settings.emailPrefix}` : '';
                                                            if (fullAlias && !settings.emailAliases.includes(fullAlias)) {
                                                                handleInputChange('emailAliases', [...settings.emailAliases, fullAlias]);
                                                                input.value = '';
                                                            }
                                                        }
                                                    }}
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none font-mono">
                                                    .{settings.emailPrefix || 'yourcompany'}@dispatch-box.com
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const input = document.getElementById('new-alias-input') as HTMLInputElement;
                                                    if (!input) return;
                                                    const label = input.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
                                                    const fullAlias = label ? `${label}.${settings.emailPrefix}` : '';
                                                    if (fullAlias && !settings.emailAliases.includes(fullAlias)) {
                                                        handleInputChange('emailAliases', [...settings.emailAliases, fullAlias]);
                                                        input.value = '';
                                                    }
                                                }}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Add
                                            </button>
                                        </div>

                                        {settings.emailAliases.length === 0 && (
                                            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                                <p className="text-xs text-gray-500">
                                                    💡 <strong>Tip:</strong> Type a department name like <span className="font-mono font-semibold">support</span>, <span className="font-mono font-semibold">billing</span>, or <span className="font-mono font-semibold">emergency</span> and it becomes <span className="font-mono">support.{settings.emailPrefix || 'yourcompany'}@dispatch-box.com</span>. Each alias routes to your org and tags the ticket for department filtering.
                                                </p>
                                            </div>
                                        )}
                                    </div>


                                    <div className="border-t pt-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <label className="text-sm font-medium text-gray-700">
                                                    Forward Inbound Emails
                                                </label>
                                                <p className="text-xs text-gray-500">Forward a copy of every non-spam inbound email to your personal inbox</p>
                                            </div>
                                            <button
                                                onClick={() => handleInputChange('forwardingEnabled', !settings.forwardingEnabled)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.forwardingEnabled ? 'bg-blue-600' : 'bg-gray-200'
                                                    }`}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.forwardingEnabled ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                />
                                            </button>
                                        </div>

                                        {settings.forwardingEnabled && (
                                            <div className="space-y-4 ml-1 pl-4 border-l-2 border-blue-100">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Forward To
                                                    </label>
                                                    <input
                                                        type="email"
                                                        value={settings.forwardTo}
                                                        onChange={(e) => handleInputChange('forwardTo', e.target.value)}
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                        placeholder="owner@acmeplumbing.com"
                                                    />
                                                    <p className="text-xs text-gray-400 mt-1">Your real email address where forwarded emails will arrive</p>
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <label className="text-sm font-medium text-gray-700">
                                                            Reply-As Proxy
                                                        </label>
                                                        <p className="text-xs text-gray-500">When you reply to forwarded emails, your reply will be sent from your {settings.emailPrefix || 'service'}@dispatch-box.com address instead of your personal email</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleInputChange('replyAsProxy', !settings.replyAsProxy)}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${settings.replyAsProxy ? 'bg-indigo-600' : 'bg-gray-200'
                                                            }`}
                                                    >
                                                        <span
                                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.replyAsProxy ? 'translate-x-6' : 'translate-x-1'
                                                                }`}
                                                        />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t pt-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <label className="text-sm font-medium text-gray-700">
                                                    Auto-Reply
                                                </label>
                                                <p className="text-xs text-gray-500">Send automatic confirmation when customers email you</p>
                                            </div>
                                            <button
                                                onClick={() => handleInputChange('autoReplyEnabled', !settings.autoReplyEnabled)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.autoReplyEnabled ? 'bg-blue-600' : 'bg-gray-200'
                                                    }`}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.autoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                />
                                            </button>
                                        </div>

                                        {settings.autoReplyEnabled && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Auto-Reply Template
                                                </label>
                                                <textarea
                                                    value={settings.autoReplyTemplate}
                                                    onChange={(e) => handleInputChange('autoReplyTemplate', e.target.value)}
                                                    rows={4}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    placeholder="Thank you for contacting us..."
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t pt-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <label className="text-sm font-medium text-gray-700">
                                                    Email Signature
                                                </label>
                                                <p className="text-xs text-gray-500">Automatically append a signature to outgoing emails</p>
                                            </div>
                                            <button
                                                onClick={() => handleInputChange('emailSignatureEnabled', !settings.emailSignatureEnabled)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailSignatureEnabled ? 'bg-blue-600' : 'bg-gray-200'
                                                    }`}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailSignatureEnabled ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                />
                                            </button>
                                        </div>

                                        {settings.emailSignatureEnabled && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Signature Builder
                                                </label>
                                                <EmailSignatureBuilder
                                                    value={settings.emailSignature || ''}
                                                    onChange={(val) => handleInputChange('emailSignature', val)}
                                                    orgPrimaryColor={settings.primaryColor || '#4F46E5'}
                                                    orgLogoUrl={settings.logoUrl || ''}
                                                    orgName={settings.name || ''}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Branding Tab */}
                    {activeTab === 'branding' && (
                        <WebsiteBuilder settings={settings} onChange={handleInputChange} />
                    )}

                    {/* Financial Settings Tab */}
                    {activeTab === 'financial' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Settings</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Default Tax Rate (%)
                                        </label>
                                        <div className="relative max-w-xs">
                                            <input
                                                type="number"
                                                value={settings.defaultTaxRate}
                                                onChange={(e) => handleInputChange('defaultTaxRate', parseFloat(e.target.value) || 0)}
                                                step="0.001"
                                                min="0"
                                                max="100"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500">%</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">This rate will be applied to new quotes and invoices by default.</p>
                                    </div>
                                    {user?.site_admin && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Default Platform Fee (%)
                                        </label>
                                        <div className="relative max-w-xs">
                                            <input
                                                type="number"
                                                value={settings.defaultPlatformFeePercent || 0}
                                                onChange={(e) => handleInputChange('defaultPlatformFeePercent', parseFloat(e.target.value) || 0)}
                                                step="0.01"
                                                min="0"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500">%</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            This is the percentage of payments you keep (e.g., 4.4%). It should cover Stripe's 2.9% fee plus your desired profit.
                                        </p>
                                    </div>
                                    )}
                                </div>
                            </div>

                            {/* Upfront Payment Policy */}
                            <div className="border-t pt-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <Shield className="w-5 h-5 text-blue-600" />
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900">Upfront Payment Policy</h3>
                                            <p className="text-sm text-gray-500">Require customers to pay a deposit before service begins</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleInputChange('upfrontPaymentEnabled', !settings.upfrontPaymentEnabled)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.upfrontPaymentEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.upfrontPaymentEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                {settings.upfrontPaymentEnabled && (
                                    <div className="ml-1 pl-4 border-l-2 border-blue-100 space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Default Deposit Rule</label>
                                            <select
                                                value={settings.upfrontPaymentRule}
                                                onChange={(e) => handleInputChange('upfrontPaymentRule', e.target.value)}
                                                className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="none">No Default (set per quote)</option>
                                                <option value="always">Always Require Deposit</option>
                                                <option value="new_customers_only">New Customers Only</option>
                                                <option value="over_threshold">Quotes Over $ Threshold</option>
                                                <option value="materials_only">100% of Materials/Parts Cost</option>
                                                <option value="paid_estimate">Paid Estimate (flat fee for on-site evaluation)</option>
                                            </select>
                                            <p className="text-xs text-gray-500 mt-1">This rule auto-applies when creating new quotes. Techs can override per-quote.</p>
                                        </div>

                                        {settings.upfrontPaymentRule === 'over_threshold' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Threshold Amount</label>
                                                <div className="relative max-w-xs">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                                    <input
                                                        type="number"
                                                        value={settings.upfrontOverThreshold}
                                                        onChange={(e) => handleInputChange('upfrontOverThreshold', parseFloat(e.target.value) || 0)}
                                                        min="0"
                                                        step="50"
                                                        className="w-full px-4 py-2 pl-7 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">Deposit required for quotes exceeding this amount</p>
                                            </div>
                                        )}

                                        {settings.upfrontPaymentRule === 'paid_estimate' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Paid Estimate Fee</label>
                                                <div className="relative max-w-xs">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                                    <input
                                                        type="number"
                                                        value={settings.upfrontPaidEstimateAmount}
                                                        onChange={(e) => handleInputChange('upfrontPaidEstimateAmount', parseFloat(e.target.value) || 0)}
                                                        min="0"
                                                        step="5"
                                                        className="w-full px-4 py-2 pl-7 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">Flat fee charged upfront for an on-site evaluation. Deducted from the final invoice if work proceeds.</p>
                                            </div>
                                        )}

                                        {settings.upfrontPaymentRule !== 'paid_estimate' && settings.upfrontPaymentRule !== 'materials_only' && settings.upfrontPaymentRule !== 'none' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Default Deposit Percentage</label>
                                                <div className="relative max-w-xs">
                                                    <input
                                                        type="number"
                                                        value={settings.upfrontDepositPercent}
                                                        onChange={(e) => handleInputChange('upfrontDepositPercent', parseFloat(e.target.value) || 0)}
                                                        min="1"
                                                        max="100"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    />
                                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                        <span className="text-gray-500">%</span>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">Percentage of the quote total to collect upfront</p>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Disclaimer</label>
                                            <textarea
                                                value={settings.upfrontDisclaimerText}
                                                onChange={(e) => handleInputChange('upfrontDisclaimerText', e.target.value)}
                                                rows={3}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                                placeholder="This deposit is non-refundable..."
                                            />
                                            <p className="text-xs text-gray-500 mt-1">Shown to customers on the payment form. Include refund policy and terms.</p>
                                        </div>

                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                                            <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                            <p className="text-sm text-blue-800">
                                                When a deposit is required, customers will receive a secure payment link via text or email after quote approval. Payment is processed through Stripe and automatically deducted from the final invoice.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Billing Tab */}
                    {activeTab === 'billing' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Plan & Billing</h2>

                                <div className="bg-gradient-to-br from-blue-50 to-amber-50 border border-blue-200 rounded-lg p-6 mb-6">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900">Current Plan</h3>
                                            <div className="flex items-center gap-3 mt-2">
                                                {getPlanBadge()}
                                                {organization?.maxTechs && (
                                                    <span className="text-sm text-gray-600 flex items-center gap-1">
                                                        <Users className="w-4 h-4" />
                                                        Up to {organization.maxTechs} technicians
                                                    </span>
                                                )}
                                            </div>
                                            {plan === 'trial' && (
                                                <p className="text-sm text-gray-600 mt-2">
                                                    Trial expires in {getDaysUntilTrialExpires()} days
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-4">
                                    {/* Individual Plan Card */}
                                    <div className={`border-2 rounded-lg p-5 ${plan === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                                        <h3 className="font-bold text-lg">Individual</h3>
                                        <p className="text-sm text-gray-600 mt-1">For solo technicians</p>
                                        <ul className="mt-4 space-y-2 text-sm">
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Ticket management
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Customer database
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Invoicing
                                            </li>
                                        </ul>
                                        {plan !== 'individual' && (
                                            <button className="mt-4 w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                                                Downgrade
                                            </button>
                                        )}
                                    </div>

                                    {/* Small Business Card */}
                                    <div className={`border-2 rounded-lg p-5 ${plan === 'small_business' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-lg">Small Business</h3>
                                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-semibold rounded">POPULAR</span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">For teams of 2-5</p>
                                        <ul className="mt-4 space-y-2 text-sm">
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Everything in Individual
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Team management
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Dispatcher console
                                            </li>
                                        </ul>
                                        {plan === 'individual' && (
                                            <button className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                                                Upgrade
                                            </button>
                                        )}
                                    </div>

                                    {/* Enterprise Card */}
                                    <div className={`border-2 rounded-lg p-5 md:col-span-2 ${plan === 'enterprise' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                                        <div className="flex items-center gap-2">
                                            <Crown className="w-5 h-5 text-yellow-600" />
                                            <h3 className="font-bold text-lg">Enterprise</h3>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">For larger organizations</p>
                                        <div className="grid md:grid-cols-2 gap-4 mt-4">
                                            <ul className="space-y-2 text-sm">
                                                <li className="flex items-start gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                    Everything in Small Business
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                    Unlimited technicians
                                                </li>
                                            </ul>
                                            <ul className="space-y-2 text-sm">
                                                <li className="flex items-start gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                    Advanced analytics
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                    Custom integrations
                                                </li>
                                            </ul>
                                        </div>
                                        {plan !== 'enterprise' && (
                                            <button className="mt-4 px-6 py-2 bg-gradient-to-r from-blue-600 to-amber-600 text-white rounded-lg hover:from-blue-700 hover:to-amber-700 transition">
                                                Contact Sales
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Vendors Tab */}
                    {activeTab === 'vendors' && (
                        <div className="h-[700px]">
                            <ManageVendorsModal isEmbedded />
                        </div>
                    )}

                    {/* Categories Tab */}
                    {activeTab === 'categories' && (
                        <InventoryCategoriesManager />
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Save Button */}
                    {(activeTab !== 'billing' && activeTab !== 'vendors' && activeTab !== 'categories') && (
                        <div className="flex items-center justify-end gap-3 pt-6 border-t">
                            {saveSuccess && (
                                <div className="flex items-center gap-2 text-green-600 text-sm">
                                    <CheckCircle className="w-5 h-5" />
                                    Settings saved successfully
                                </div>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-5 h-5" />
                                        Save Changes
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
