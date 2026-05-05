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
    Tags
} from 'lucide-react';
import { ManageVendorsModal } from '../components/inventory/ManageVendorsModal';
import { InventoryCategoriesManager } from '../components/settings/InventoryCategoriesManager';
import { WebsiteBuilder } from '../components/settings/WebsiteBuilder';

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
}

export const OrganizationSettings: React.FC = () => {
    const { user, organization } = useAuth();
    const { plan, getDaysUntilTrialExpires } = usePlanFeatures();
    const [settings, setSettings] = useState<OrgSettings>({
        name: '',
        emailPrefix: '',
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
        websiteTheme: null
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
                    websiteTheme: d.branding?.websiteTheme || null
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
                'inboundEmail.autoReplyEnabled': settings.autoReplyEnabled,
                'inboundEmail.autoReplyTemplate': settings.autoReplyTemplate,
                'inboundEmail.forwardingEnabled': settings.forwardingEnabled,
                'inboundEmail.forwardTo': settings.forwardTo || null,
                'inboundEmail.replyAsProxy': settings.replyAsProxy,
                'outboundEmail.fromName': settings.fromName,
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
                                </div>
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
