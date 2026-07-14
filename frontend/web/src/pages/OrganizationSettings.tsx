import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { doc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';
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
    AtSign,
    Puzzle,
    Calendar,
    MapPin,
    Kanban,
    MessageSquare,
    Bot,
    Wrench,
    ClipboardList,
    Package,
    Sparkles,
    Clock,
    Settings
} from 'lucide-react';
import { ManageVendorsModal } from '../components/inventory/ManageVendorsModal';
import { InventoryCategoriesManager } from '../components/settings/InventoryCategoriesManager';
import { WebsiteBuilder } from '../components/settings/WebsiteBuilder';
import { EmailSignatureBuilder } from '../components/settings/EmailSignatureBuilder';
import { FollowUpEngineSettings } from '../components';
import {
    ALL_JURISDICTIONS,
    TERM_CATEGORIES,
    generateSystemDefaultTerms,
    resolveQuoteTerms,
    type OrgTermsConfig,
    type TermSectionOverride,
    type TermCategory,
    type TermItem,
    getCountryForJurisdiction
} from '../lib/quoteTerms';

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
    upfrontPaymentRules: string[];
    upfrontOverThreshold: number;
    upfrontPaidEstimateAmount: number;
    upfrontDepositPercent: number;
    upfrontDisclaimerText: string;
    emailSignatureEnabled: boolean;
    emailSignature: string;
    moduleComms: boolean;
    moduleEmail: boolean;
    moduleSms: boolean;
    moduleVoiceAgent: boolean;
    moduleFinancial: boolean;
    moduleInvoices: boolean;
    moduleQuotes: boolean;
    moduleInventory: boolean;
    moduleMaterials: boolean;
    moduleTools: boolean;
    modulePurchaseOrders: boolean;
    moduleKanban: boolean;
    moduleCalendar: boolean;
    moduleDispatch: boolean;
    baseHourlyRate: number;
    materialMarkup: number;
    driveTimeCharge: number;
    serviceLocations: { id: string; state: string; taxName: string; taxRate: number; }[];
    termsConfig: OrgTermsConfig;
    operatingHoursStart: number; // 0-23, e.g. 8 = 8 AM in company timezone
    operatingHoursEnd: number;   // 0-23, e.g. 17 = 5 PM in company timezone
    timezone: string;            // IANA timezone, e.g. 'America/New_York'
    defaultSourcingStrategy: string; // 'optimal' | 'lowest_cost' | 'fastest_shipping' | 'highest_quality' | 'preferred_vendor' | 'item_default'
    defaultVendorId: string; // Fallback vendor for items without individual vendor assignments
    dispatchMode: 'assign_only' | 'assign_and_schedule'; // Controls whether techs can self-schedule or need dispatcher to set times
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
        upfrontPaymentRules: [],
        upfrontOverThreshold: 500,
        upfrontPaidEstimateAmount: 75,
        upfrontDepositPercent: 50,
        upfrontDisclaimerText: 'This deposit is non-refundable if services are cancelled within 24 hours of the scheduled appointment. Deposit amount will be deducted from your final invoice.',
        emailSignatureEnabled: false,
        emailSignature: '',
        moduleComms: true,
        moduleEmail: true,
        moduleSms: true,
        moduleVoiceAgent: true,
        moduleFinancial: true,
        moduleInvoices: true,
        moduleQuotes: true,
        moduleInventory: true,
        moduleMaterials: true,
        moduleTools: true,
        modulePurchaseOrders: true,
        moduleKanban: true,
        moduleCalendar: true,
        moduleDispatch: true,
        baseHourlyRate: 100,
        materialMarkup: 30,
        driveTimeCharge: 0,
        serviceLocations: [],
        termsConfig: {},
        operatingHoursStart: 8,
        operatingHoursEnd: 17,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
        defaultSourcingStrategy: 'optimal',
        defaultVendorId: '',
        dispatchMode: 'assign_and_schedule'
    });
    const [activeTab, setActiveTab] = useState<'profile' | 'categories' | 'email' | 'branding' | 'billing' | 'financial' | 'vendors' | 'modules' | 'legal' | 'followup'>('profile');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState('');

    const [newLocState, setNewLocState] = useState('');
    const [newLocTaxName, setNewLocTaxName] = useState('');
    const [newLocTaxRate, setNewLocTaxRate] = useState<number>(0);
    const [editingLocId, setEditingLocId] = useState<string | null>(null);
    const [editingLocState, setEditingLocState] = useState('');
    const [editingLocTaxName, setEditingLocTaxName] = useState('');
    const [editingLocTaxRate, setEditingLocTaxRate] = useState<number>(0);

    const [loadingAI, setLoadingAI] = useState(false);
    const [orgVendors, setOrgVendors] = useState<Array<{ id: string; name: string; active?: boolean }>>([]);

    // Load org vendors for default vendor dropdown
    useEffect(() => {
        if (!organization?.id) return;
        const q = query(collection(db, 'vendors'), where('organizationId', '==', organization.id));
        const unsub = onSnapshot(q, (snap) => {
            setOrgVendors(snap.docs.map(d => ({ id: d.id, name: d.data().name || 'Unnamed', active: d.data().active })));
        });
        return () => unsub();
    }, [organization?.id]);

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
                    upfrontPaymentRules: d.settings?.upfrontPaymentPolicy?.defaultRules || (d.settings?.upfrontPaymentPolicy?.defaultRule && d.settings.upfrontPaymentPolicy.defaultRule !== 'none' ? [d.settings.upfrontPaymentPolicy.defaultRule] : []),
                    upfrontOverThreshold: d.settings?.upfrontPaymentPolicy?.overThreshold ?? 500,
                    upfrontPaidEstimateAmount: d.settings?.upfrontPaymentPolicy?.paidEstimateAmount ?? 75,
                    upfrontDepositPercent: d.settings?.upfrontPaymentPolicy?.depositPercent ?? 50,
                    upfrontDisclaimerText: d.settings?.upfrontPaymentPolicy?.disclaimerText || 'This deposit is non-refundable if services are cancelled within 24 hours of the scheduled appointment. Deposit amount will be deducted from your final invoice.',
                    emailSignatureEnabled: d.outboundEmail?.signatureEnabled ?? false,
                    emailSignature: d.outboundEmail?.signature || '',
                    moduleComms: d.settings?.enabledModules?.comms ?? true,
                    moduleEmail: d.settings?.enabledModules?.email ?? true,
                    moduleSms: d.settings?.enabledModules?.sms ?? true,
                    moduleVoiceAgent: d.settings?.enabledModules?.voiceAgent ?? true,
                    moduleFinancial: d.settings?.enabledModules?.financial ?? true,
                    moduleInvoices: d.settings?.enabledModules?.invoices ?? true,
                    moduleQuotes: d.settings?.enabledModules?.quotes ?? true,
                    moduleInventory: d.settings?.enabledModules?.inventory ?? true,
                    moduleMaterials: d.settings?.enabledModules?.materials ?? true,
                    moduleTools: d.settings?.enabledModules?.tools ?? true,
                    modulePurchaseOrders: d.settings?.enabledModules?.purchaseOrders ?? true,
                    moduleKanban: d.settings?.enabledModules?.kanban ?? true,
                    moduleCalendar: d.settings?.enabledModules?.calendar ?? true,
                    moduleDispatch: d.settings?.enabledModules?.dispatch ?? true,
                    baseHourlyRate: d.rateCard?.baseHourlyRate ?? 100,
                    materialMarkup: d.rateCard?.materialMarkup ?? 30,
                    driveTimeCharge: d.rateCard?.driveTimeCharge ?? 0,
                    serviceLocations: d.settings?.serviceLocations || [],
                    termsConfig: d.settings?.termsConfig || {},
                    operatingHoursStart: d.settings?.operatingHoursStart ?? 8,
                    operatingHoursEnd: d.settings?.operatingHoursEnd ?? 17,
                    timezone: d.settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
                    defaultSourcingStrategy: d.settings?.defaultSourcingStrategy || 'optimal',
                    defaultVendorId: d.settings?.defaultVendorId || '',
                    dispatchMode: d.settings?.dispatchMode || 'assign_and_schedule'
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

    const handleModuleToggle = (moduleKey: keyof OrgSettings, value: boolean) => {
        setSettings(prev => {
            const next = { ...prev, [moduleKey]: value };

            // Parent category toggled OFF -> turn OFF all sub-features
            if (moduleKey === 'moduleComms' && !value) {
                next.moduleEmail = false;
                next.moduleSms = false;
                next.moduleVoiceAgent = false;
            }
            if (moduleKey === 'moduleFinancial' && !value) {
                next.moduleInvoices = false;
                next.moduleQuotes = false;
            }
            if (moduleKey === 'moduleInventory' && !value) {
                next.moduleMaterials = false;
                next.moduleTools = false;
            }

            // Parent category toggled ON -> turn ON all sub-features
            if (moduleKey === 'moduleComms' && value) {
                next.moduleEmail = true;
                next.moduleSms = true;
                next.moduleVoiceAgent = true;
            }
            if (moduleKey === 'moduleFinancial' && value) {
                next.moduleInvoices = true;
                next.moduleQuotes = true;
            }
            if (moduleKey === 'moduleInventory' && value) {
                next.moduleMaterials = true;
                next.moduleTools = true;
            }

            // Sub-feature toggles:
            // Comms
            if (['moduleEmail', 'moduleSms', 'moduleVoiceAgent'].includes(moduleKey)) {
                next.moduleComms = next.moduleEmail || next.moduleSms || next.moduleVoiceAgent;
            }
            // Financial
            if (['moduleInvoices', 'moduleQuotes'].includes(moduleKey)) {
                next.moduleFinancial = next.moduleInvoices || next.moduleQuotes;
            }
            // Inventory
            if (['moduleMaterials', 'moduleTools'].includes(moduleKey)) {
                next.moduleInventory = next.moduleMaterials || next.moduleTools;
            }

            return next;
        });
        setSaveSuccess(false);
    };

    const handleAddServiceLocation = async () => {
        const areaName = newLocState.trim();
        if (!areaName) return;

        setLoadingAI(true);
        const toastId = toast.loading(`AI is researching typical tax rates for "${areaName}"...`);

        try {
            const { httpsCallable } = await import('firebase/functions');
            const { functions } = await import('../firebase');
            const lookupLocationTaxRateFn = httpsCallable(functions, 'lookupLocationTaxRate');

            const res = await lookupLocationTaxRateFn({
                address: areaName,
                orgId: organization?.id || 'demo-org',
                tradeCategory: settings.name || 'general home services'
            });

            const data = res.data as any;
            const taxName = data?.taxName || 'Sales Tax';
            const taxRate = data?.taxRate ?? 0;

            const newLoc = {
                id: crypto.randomUUID(),
                state: areaName,
                taxName,
                taxRate
            };

            setSettings(prev => ({
                ...prev,
                serviceLocations: [...(prev.serviceLocations || []), newLoc]
            }));

            setNewLocState('');
            setSaveSuccess(false);
            toast.success(`Successfully added ${areaName}: Sourced standard ${taxName} (${taxRate}%) via AI.`, { id: toastId });
        } catch (err: any) {
            console.error('AI tax lookup failed on add:', err);

            // Fallback to default/standard values so they can still add it and edit manually
            const fallbackLoc = {
                id: crypto.randomUUID(),
                state: areaName,
                taxName: 'Sales Tax',
                taxRate: 0
            };

            setSettings(prev => ({
                ...prev,
                serviceLocations: [...(prev.serviceLocations || []), fallbackLoc]
            }));

            setNewLocState('');
            setSaveSuccess(false);
            toast.error(`Added ${areaName} with fallback rate. Click Edit to manually configure.`, { id: toastId });
        } finally {
            setLoadingAI(false);
        }
    };

    const handleStartEditLocation = (loc: any) => {
        setEditingLocId(loc.id);
        setEditingLocState(loc.state);
        setEditingLocTaxName(loc.taxName);
        setEditingLocTaxRate(loc.taxRate);
    };

    const handleSaveEditLocation = () => {
        if (!editingLocId || !editingLocState.trim() || !editingLocTaxName.trim()) return;
        setSettings(prev => ({
            ...prev,
            serviceLocations: (prev.serviceLocations || []).map(loc => 
                loc.id === editingLocId 
                    ? { ...loc, state: editingLocState.trim(), taxName: editingLocTaxName.trim(), taxRate: editingLocTaxRate }
                    : loc
            )
        }));
        setEditingLocId(null);
        setEditingLocState('');
        setEditingLocTaxName('');
        setEditingLocTaxRate(0);
        setSaveSuccess(false);
    };

    const handleDeleteLocation = (id: string) => {
        setSettings(prev => ({
            ...prev,
            serviceLocations: (prev.serviceLocations || []).filter(loc => loc.id !== id)
        }));
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
                    defaultRule: settings.upfrontPaymentRules.length > 0 ? settings.upfrontPaymentRules[0] : 'none',
                    defaultRules: settings.upfrontPaymentRules,
                    overThreshold: settings.upfrontOverThreshold,
                    paidEstimateAmount: settings.upfrontPaidEstimateAmount,
                    depositPercent: settings.upfrontDepositPercent,
                    disclaimerText: settings.upfrontDisclaimerText
                },
                'settings.enabledModules': {
                    comms: settings.moduleComms,
                    email: settings.moduleEmail,
                    sms: settings.moduleSms,
                    voiceAgent: settings.moduleVoiceAgent,
                    financial: settings.moduleFinancial,
                    invoices: settings.moduleInvoices,
                    quotes: settings.moduleQuotes,
                    inventory: settings.moduleInventory,
                    materials: settings.moduleMaterials,
                    tools: settings.moduleTools,
                    purchaseOrders: settings.modulePurchaseOrders,
                    kanban: settings.moduleKanban,
                    calendar: settings.moduleCalendar,
                    dispatch: settings.moduleDispatch
                },
                'settings.serviceLocations': settings.serviceLocations || [],
                'settings.termsConfig': settings.termsConfig || {},
                'settings.operatingHoursStart': settings.operatingHoursStart,
                'settings.operatingHoursEnd': settings.operatingHoursEnd,
                'settings.timezone': settings.timezone,
                'settings.defaultSourcingStrategy': settings.defaultSourcingStrategy || 'optimal',
                'settings.defaultVendorId': settings.defaultVendorId || '',
                'settings.dispatchMode': settings.dispatchMode || 'assign_and_schedule',
                'rateCard.baseHourlyRate': settings.baseHourlyRate,
                'rateCard.materialMarkup': settings.materialMarkup,
                'rateCard.driveTimeCharge': settings.driveTimeCharge,
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

    type SettingsTabId = 'profile' | 'categories' | 'email' | 'branding' | 'billing' | 'financial' | 'vendors' | 'modules' | 'legal' | 'followup';
    interface SettingsTab { id: SettingsTabId; label: string; icon: typeof Building2; }

    const tabGroups: { label: string; tabs: SettingsTab[] }[] = [
        {
            label: 'Company',
            tabs: [
                { id: 'profile', label: 'Profile', icon: Building2 },
                { id: 'branding', label: 'Branding & Website', icon: Palette },
            ]
        },
        {
            label: 'Operations',
            tabs: [
                { id: 'modules', label: 'Active Modules', icon: Puzzle },
                { id: 'categories', label: 'Categories', icon: Tags },
            ]
        },
        {
            label: 'Financial',
            tabs: [
                { id: 'billing', label: 'Plan & Billing', icon: CreditCard },
                { id: 'financial', label: 'Rates & Taxes', icon: DollarSign },
                { id: 'vendors', label: 'Vendors & Suppliers', icon: Box },
            ]
        },
        {
            label: 'Communications',
            tabs: [
                { id: 'email', label: 'Email Settings', icon: Mail },
                { id: 'followup', label: 'Follow-up Engine', icon: Clock },
                { id: 'legal', label: 'Legal & Terms', icon: ClipboardList },
            ]
        }
    ];

    // Flat tabs array for compatibility
    const tabs = tabGroups.flatMap(g => g.tabs);

    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Organization Settings</h1>
                <p className="text-gray-500 mt-1">Manage your organization profile and preferences</p>
            </div>

            {/* Settings layout: vertical sidebar + content */}
            <div className="flex gap-6">
                {/* Left sidebar nav */}
                <nav className="hidden md:block w-56 flex-shrink-0" aria-label="Settings sections">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-100 py-2 sticky top-20">
                        {tabGroups.map((group, gi) => (
                            <div key={group.label}>
                                {gi > 0 && <div className="border-t border-gray-100 my-1.5" />}
                                <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{group.label}</div>
                                {group.tabs.map((tab) => {
                                    const Icon = tab.icon;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors rounded-none ${activeTab === tab.id
                                                ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent'
                                                }`}
                                        >
                                            <Icon className="w-4 h-4 flex-shrink-0" />
                                            {tab.label}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </nav>

                {/* Mobile: horizontal tab scroller (fallback for small screens) */}
                <div className="md:hidden w-full mb-4">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-x-auto">
                        <div className="flex px-2 py-1 gap-1">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${activeTab === tab.id
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right content area */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
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
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Base Hourly Rate ($/hr)
                                            </label>
                                            <div className="relative max-w-xs">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                                <input
                                                    type="number"
                                                    value={settings.baseHourlyRate}
                                                    onChange={(e) => handleInputChange('baseHourlyRate', parseFloat(e.target.value) || 0)}
                                                    min="0"
                                                    className="w-full px-4 py-2 pl-7 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">Default hourly labor rate used by AI to generate quote estimates.</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Default Material Markup (%)
                                            </label>
                                            <div className="relative max-w-xs">
                                                <input
                                                    type="number"
                                                    value={settings.materialMarkup}
                                                    onChange={(e) => handleInputChange('materialMarkup', parseFloat(e.target.value) || 0)}
                                                    min="0"
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                    <span className="text-gray-500">%</span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">Default markup added to materials inventory prices on quotes.</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Drive Time / Service Call Fee ($)
                                            </label>
                                            <div className="relative max-w-xs">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                                <input
                                                    type="number"
                                                    value={settings.driveTimeCharge}
                                                    onChange={(e) => handleInputChange('driveTimeCharge', parseFloat(e.target.value) || 0)}
                                                    min="0"
                                                    step="5"
                                                    className="w-full px-4 py-2 pl-7 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">Flat fee added for travel to job site. Set to 0 to disable. Shown as an optional line item on AI estimates.</p>
                                        </div>
                                    </div>

                                    {/* Operating Hours & Timezone */}
                                    <div className="border-t pt-5 mt-5">
                                        <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-blue-600" />
                                            Operating Hours & Time Zone
                                        </h3>
                                        <p className="text-xs text-gray-500 mb-3">Set your company's time zone and working hours. The Schedule Appointment picker will only show time slots during these hours, adjusted for your time zone.</p>
                                        
                                        {/* Timezone */}
                                        <div className="mb-4 max-w-md">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Time Zone</label>
                                            <select
                                                value={settings.timezone}
                                                onChange={(e) => handleInputChange('timezone', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <optgroup label="US Time Zones">
                                                    <option value="America/New_York">Eastern Time (ET) — New York</option>
                                                    <option value="America/Chicago">Central Time (CT) — Chicago</option>
                                                    <option value="America/Denver">Mountain Time (MT) — Denver</option>
                                                    <option value="America/Phoenix">Mountain Time (no DST) — Phoenix</option>
                                                    <option value="America/Los_Angeles">Pacific Time (PT) — Los Angeles</option>
                                                    <option value="America/Anchorage">Alaska Time (AKT) — Anchorage</option>
                                                    <option value="Pacific/Honolulu">Hawaii Time (HST) — Honolulu</option>
                                                </optgroup>
                                                <optgroup label="Other">
                                                    <option value="America/Toronto">Eastern — Toronto</option>
                                                    <option value="America/Vancouver">Pacific — Vancouver</option>
                                                    <option value="Europe/London">GMT — London</option>
                                                    <option value="Europe/Berlin">CET — Berlin</option>
                                                    <option value="Asia/Tokyo">JST — Tokyo</option>
                                                    <option value="Australia/Sydney">AEST — Sydney</option>
                                                </optgroup>
                                            </select>
                                            <p className="text-[10px] text-gray-400 mt-1">
                                                Your browser detected: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                                            </p>
                                        </div>

                                        {/* Start/End Hours */}
                                        <div className="grid grid-cols-2 gap-4 max-w-md">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                                <select
                                                    value={settings.operatingHoursStart}
                                                    onChange={(e) => handleInputChange('operatingHoursStart', parseInt(e.target.value))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    {Array.from({ length: 18 }, (_, i) => i + 5).map(h => (
                                                        <option key={h} value={h}>
                                                            {h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                                <select
                                                    value={settings.operatingHoursEnd}
                                                    onChange={(e) => handleInputChange('operatingHoursEnd', parseInt(e.target.value))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    {Array.from({ length: 18 }, (_, i) => i + 5).map(h => (
                                                        <option key={h} value={h} disabled={h <= settings.operatingHoursStart}>
                                                            {h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-2">
                                            Schedule available {settings.operatingHoursStart < 12 ? `${settings.operatingHoursStart}:00 AM` : settings.operatingHoursStart === 12 ? '12:00 PM' : `${settings.operatingHoursStart - 12}:00 PM`}
                                            {' – '}
                                            {settings.operatingHoursEnd < 12 ? `${settings.operatingHoursEnd}:00 AM` : settings.operatingHoursEnd === 12 ? '12:00 PM' : `${settings.operatingHoursEnd - 12}:00 PM`}
                                            {' '}({settings.timezone.replace(/_/g, ' ').split('/').pop()})
                                        </p>
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

                            {/* Procurement Defaults Card */}
                            <div className="border-t pt-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <Package className="w-5 h-5 text-indigo-600" />
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Procurement Defaults</h3>
                                        <p className="text-sm text-gray-500">Set your default ordering strategy. When you create a master order from the dashboard, items will be automatically routed to vendors using this rule.</p>
                                    </div>
                                </div>

                                <div className="space-y-2 max-w-lg">
                                    {[
                                        { id: 'optimal', label: 'Optimal (Balanced)', tip: 'Best overall pick — balances cost, delivery speed, and your preferred vendor settings. Uses AI evaluation from each item\'s vendor assignments.' },
                                        { id: 'lowest_cost', label: 'Lowest Cost', tip: 'Always routes to the cheapest vendor per item. Best for commodity materials where brand doesn\'t matter.' },
                                        { id: 'fastest_shipping', label: 'Fastest Shipping', tip: 'Routes to the vendor with the shortest delivery time. Best for urgent jobs where downtime costs more than the parts.' },
                                        { id: 'highest_quality', label: 'Highest Quality / Durability', tip: 'Prioritizes vendors marked as "longest lasting" or "preferred" for quality. Reduces warranty callbacks.' },
                                        { id: 'preferred_vendor', label: 'Preferred Vendor Only', tip: 'Always uses the vendor you\'ve marked as preferred on each material. Falls back to optimal if no preferred vendor is set.' },
                                        { id: 'item_default', label: 'Item Default Vendor', tip: 'Uses each item\'s individually configured preferred vendor. Items without a preferred vendor will use the default fallback vendor below.' },
                                    ].map((strategy) => {
                                        const isChecked = settings.defaultSourcingStrategy === strategy.id;
                                        return (
                                            <div key={strategy.id} className={`rounded-lg transition ${isChecked ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                                                <label className="flex items-start gap-3 cursor-pointer p-2.5">
                                                    <input
                                                        type="radio"
                                                        name="sourcingStrategy"
                                                        checked={isChecked}
                                                        onChange={() => handleInputChange('defaultSourcingStrategy', strategy.id)}
                                                        className="w-4 h-4 text-indigo-600 mt-0.5"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-sm font-medium text-gray-800">{strategy.label}</span>
                                                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{strategy.tip}</p>
                                                    </div>
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Default Fallback Vendor */}
                                <div className="mt-4 max-w-lg bg-gray-50 rounded-lg border border-gray-200 p-4">
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">Default Fallback Vendor</label>
                                    <p className="text-xs text-gray-500 mb-2">When an item has no individual vendor assigned, orders will route to this vendor. If not set, unassigned items will need manual vendor selection.</p>
                                    <select
                                        value={settings.defaultVendorId}
                                        onChange={(e) => handleInputChange('defaultVendorId', e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    >
                                        <option value="">— No default vendor —</option>
                                        {orgVendors.filter(v => v.active !== false).map(v => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <p className="text-xs text-gray-500 mt-2">You can always override the strategy per-order when reviewing. This just sets the starting default.</p>
                            </div>

                            {/* Location-Based Tax Rates Card */}
                            <div className="border-t pt-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <MapPin className="w-5 h-5 text-indigo-600" />
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Location-Based Tax Rates</h3>
                                        <p className="text-sm text-gray-500">Configure custom tax rates by state or region. Correct rates will auto-resolve on quotes based on the job's address.</p>
                                    </div>
                                </div>

                                <div className="space-y-4 max-w-4xl">
                                    {/* Configured Service Areas List */}
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="px-4 py-3 bg-slate-100/50 border-b border-slate-200 flex items-center justify-between">
                                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Active Service Regions ({settings.serviceLocations?.length || 0})</span>
                                        </div>

                                        {(!settings.serviceLocations || settings.serviceLocations.length === 0) ? (
                                            <div className="p-6 text-center text-slate-500 text-sm">
                                                No location-specific tax rates configured yet. AI will auto-resolve typical tax rates for new areas using live tax lookups.
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-slate-200">
                                                {settings.serviceLocations.map((loc) => {
                                                    const isEditing = editingLocId === loc.id;
                                                    return (
                                                        <div key={loc.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                                                            {isEditing ? (
                                                                <div className="flex flex-1 flex-wrap items-center gap-3">
                                                                    <div className="flex-1 min-w-[120px]">
                                                                        <label className="block text-[10px] text-slate-500 mb-0.5">State/Area (e.g. HI, CA)</label>
                                                                        <input
                                                                            type="text"
                                                                            value={editingLocState}
                                                                            onChange={(e) => setEditingLocState(e.target.value)}
                                                                            className="w-full text-sm px-3 py-1.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                                            placeholder="e.g. HI"
                                                                        />
                                                                    </div>
                                                                    <div className="flex-1 min-w-[140px]">
                                                                        <label className="block text-[10px] text-slate-500 mb-0.5">Tax Name (e.g. GET, Sales Tax)</label>
                                                                        <input
                                                                            type="text"
                                                                            value={editingLocTaxName}
                                                                            onChange={(e) => setEditingLocTaxName(e.target.value)}
                                                                            className="w-full text-sm px-3 py-1.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                                            placeholder="e.g. GET"
                                                                        />
                                                                    </div>
                                                                    <div className="w-[100px]">
                                                                        <label className="block text-[10px] text-slate-500 mb-0.5">Tax Rate (%)</label>
                                                                        <input
                                                                            type="number"
                                                                            value={editingLocTaxRate}
                                                                            onChange={(e) => setEditingLocTaxRate(parseFloat(e.target.value) || 0)}
                                                                            step="0.001"
                                                                            min="0"
                                                                            className="w-full text-sm px-3 py-1.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-right"
                                                                            placeholder="0.00"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-1 items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                                                        {loc.state.substring(0, 2).toUpperCase()}
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-sm font-semibold text-slate-800">{loc.state}</div>
                                                                        <div className="text-xs text-slate-500">{loc.taxName}</div>
                                                                    </div>
                                                                    <div className="ml-auto md:ml-8 font-bold text-slate-800 text-sm">
                                                                        {loc.taxRate}%
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="flex items-center gap-2 self-end md:self-auto border-t md:border-t-0 pt-2 md:pt-0">
                                                                {isEditing ? (
                                                                    <>
                                                                        <button
                                                                            onClick={handleSaveEditLocation}
                                                                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition"
                                                                        >
                                                                            <CheckCircle className="w-3.5 h-3.5" /> Save
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setEditingLocId(null)}
                                                                            className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300 transition"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleStartEditLocation(loc)}
                                                                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                                                            title="Edit Location"
                                                                        >
                                                                            <Tags className="w-4 h-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteLocation(loc.id)}
                                                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                                                                            title="Delete Location"
                                                                        >
                                                                            <X className="w-4 h-4" />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Add New Area Form */}
                                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                                        <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5 font-sans">
                                            <Plus className="w-4 h-4 text-indigo-500" /> Add Custom Service Region
                                        </h4>
                                        <div className="flex flex-col sm:flex-row gap-3 items-end max-w-xl">
                                            <div className="flex-1 w-full">
                                                <label className="block text-xs font-medium text-slate-600 mb-1 font-sans">State / Area / Region Name</label>
                                                <input
                                                    type="text"
                                                    value={newLocState}
                                                    onChange={(e) => setNewLocState(e.target.value)}
                                                    disabled={loadingAI}
                                                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-sans"
                                                    placeholder="e.g. Hawaii, California, HI, CA, United Kingdom, Canada, BC"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && newLocState.trim() && !loadingAI) {
                                                            e.preventDefault();
                                                            handleAddServiceLocation();
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAddServiceLocation}
                                                disabled={loadingAI || !newLocState.trim()}
                                                className="w-full sm:w-auto px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-lg text-sm hover:from-indigo-700 hover:to-purple-700 transition shadow-sm disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-2 h-[38px] flex-shrink-0 font-sans"
                                            >
                                                {loadingAI ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Analyzing...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus className="w-4 h-4" />
                                                        Add Location
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-slate-400 mt-2 font-sans">
                                            💡 Enter a state, area, or country. AI will automatically research local tax laws for your trade and pre-fill the correct rates. You can edit them anytime in the list below.
                                        </p>
                                    </div>
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
                                        {/* Getting-started guidance */}
                                        {(settings.upfrontPaymentRules || []).length === 0 && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                                                <Sparkles className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                                <p className="text-sm text-amber-800">
                                                    <strong>New to deposits?</strong> Start with <em>"New Customers Only"</em> at 50%. This protects you from no-shows while keeping the experience smooth for returning clients. The AI voice agent will automatically mention the deposit and send a secure payment link after scheduling.
                                                </p>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Default Deposit Rules</label>
                                            <div className="space-y-2 max-w-lg">
                                                {[
                                                    { id: 'always', label: 'Always Require Deposit', tip: 'Best for businesses under $50K/yr revenue. Eliminates payment risk but may reduce conversion for price-sensitive customers.' },
                                                    { id: 'new_customers_only', label: 'New Customers Only', tip: 'Most popular choice. Protects against no-shows from unproven customers while keeping the experience frictionless for repeat clients.' },
                                                    { id: 'over_threshold', label: 'Quotes Over $ Threshold', tip: 'Industry standard: require 50% deposit for jobs over $500. Covers material costs and commitment without nickel-and-diming small jobs.' },
                                                    { id: 'materials_only', label: '100% of Materials/Parts Cost', tip: 'Most accepted deposit type — customers understand paying for materials upfront. Ensures you\'re never out-of-pocket on parts.' },
                                                    { id: 'paid_estimate', label: 'Paid Estimate (flat fee for on-site evaluation)', tip: 'Charge $50–$150 for on-site evaluations. Filters out tire-kickers and compensates your tech\'s time. Deducted from the final invoice if work proceeds.' },
                                                ].map((rule) => {
                                                    const isChecked = (settings.upfrontPaymentRules || []).includes(rule.id);
                                                    return (
                                                        <div key={rule.id} className={`rounded-lg transition ${isChecked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
                                                            <label className="flex items-start gap-3 cursor-pointer p-2.5">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => {
                                                                        const currentRules = settings.upfrontPaymentRules || [];
                                                                        const newRules = isChecked
                                                                            ? currentRules.filter((r) => r !== rule.id)
                                                                            : [...currentRules, rule.id];
                                                                        handleInputChange('upfrontPaymentRules', newRules);
                                                                    }}
                                                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
                                                                />
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="text-sm font-medium text-gray-800">{rule.label}</span>
                                                                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{rule.tip}</p>
                                                                </div>
                                                            </label>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2">
                                                Select all rules that apply. If multiple rules match a quote, the rule yielding the <strong>highest deposit amount</strong> will automatically be applied.
                                            </p>
                                        </div>

                                        {(settings.upfrontPaymentRules || []).includes('over_threshold') && (
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

                                        {(settings.upfrontPaymentRules || []).includes('paid_estimate') && (
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

                                        {(settings.upfrontPaymentRules || []).some(r => ['always', 'new_customers_only', 'over_threshold'].includes(r)) && (
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
                                            <div className="text-sm text-blue-800">
                                                <p className="mb-1">When a deposit is required, the <strong>AI voice agent</strong> will automatically tell the customer about the deposit after scheduling and let them know to expect a payment link.</p>
                                                <p>A secure <strong>Stripe payment link</strong> is sent via text and email. Payment is processed securely — card details never touch your servers — and automatically deducted from the final invoice.</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Legal & Terms Tab */}
                    {activeTab === 'legal' && (
                        <LegalTermsTab settings={settings} setSettings={setSettings} setSaveSuccess={setSaveSuccess} />
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

                    {/* Active Modules Tab */}
                    {activeTab === 'modules' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-2">Manage Active Modules</h2>
                                <p className="text-sm text-gray-500 mb-6">Select which operational modules and specific features you would like to enable in the application. Background systems continue to sync data regardless of visibility, ensuring everything stays completely up-to-date.</p>

                                <div className="space-y-6 max-w-3xl">
                                    {/* MODULE 1: Comms Hub */}
                                    <div className={`p-5 border-2 rounded-xl transition-all duration-300 ${settings.moduleComms ? 'border-blue-500 bg-blue-50/5' : 'border-gray-200 bg-white'}`}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all duration-300 ${settings.moduleComms ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                    <Mail size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                                                        💬 Communications Hub
                                                        <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Email, SMS & AI Phone</span>
                                                    </h3>
                                                    <p className="text-xs text-gray-650 mt-1">Unified inbox workspace, outbound carbon-copy (CC) targets, real-time texting log, and AI receptionist voice summaries.</p>
                                                </div>
                                            </div>
                                            <div className="relative pt-1 flex items-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={settings.moduleComms} 
                                                    onChange={(e) => handleModuleToggle('moduleComms', e.target.checked)} 
                                                    className="sr-only" 
                                                    id="settings-toggle-comms"
                                                />
                                                <label htmlFor="settings-toggle-comms" className="cursor-pointer block">
                                                    <div className={`w-12 h-6 rounded-full transition-colors ${settings.moduleComms ? 'bg-blue-600' : 'bg-gray-300'}`}>
                                                        <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform absolute top-0.5 left-0.5 ${settings.moduleComms ? 'translate-x-6' : ''}`} />
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        {settings.moduleComms && (
                                            <div className="mt-4 pl-16 space-y-3 border-t pt-3 border-blue-100/50">
                                                {/* Sub-feature: Email */}
                                                <div className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <Mail className="w-4 h-4 text-blue-500" />
                                                        <div>
                                                            <span className="font-semibold text-gray-800">Email Client</span>
                                                            <p className="text-[11px] text-gray-500">Unified double-pane email client</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleModuleToggle('moduleEmail', !settings.moduleEmail)}
                                                        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${settings.moduleEmail ? 'bg-blue-600' : 'bg-gray-200'}`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.moduleEmail ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>
                                                {/* Sub-feature: SMS */}
                                                <div className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <MessageSquare className="w-4 h-4 text-blue-500" />
                                                        <div>
                                                            <span className="font-semibold text-gray-800">Texting & SMS Log</span>
                                                            <p className="text-[11px] text-gray-500">Real-time SMS notifications and conversation history</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleModuleToggle('moduleSms', !settings.moduleSms)}
                                                        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${settings.moduleSms ? 'bg-blue-600' : 'bg-gray-200'}`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.moduleSms ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>
                                                {/* Sub-feature: AI Phone Agent */}
                                                <div className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <Bot className="w-4 h-4 text-blue-500" />
                                                        <div>
                                                            <span className="font-semibold text-gray-800">AI Voice Receptionist</span>
                                                            <p className="text-[11px] text-gray-500">AI phone agent reception summaries and transcripts</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleModuleToggle('moduleVoiceAgent', !settings.moduleVoiceAgent)}
                                                        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${settings.moduleVoiceAgent ? 'bg-blue-600' : 'bg-gray-200'}`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.moduleVoiceAgent ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* MODULE 2: Financial */}
                                    <div className={`p-5 border-2 rounded-xl transition-all duration-300 ${settings.moduleFinancial ? 'border-indigo-500 bg-indigo-50/5' : 'border-gray-200 bg-white'}`}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all duration-300 ${settings.moduleFinancial ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                    <DollarSign size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                                                        💳 Invoicing & Estimates
                                                        <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Billing & Quotes</span>
                                                    </h3>
                                                    <p className="text-xs text-gray-650 mt-1">Draft job estimates with tax and discount overlays, request secure client approvals, and issue card-collectable invoices.</p>
                                                </div>
                                            </div>
                                            <div className="relative pt-1 flex items-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={settings.moduleFinancial} 
                                                    onChange={(e) => handleModuleToggle('moduleFinancial', e.target.checked)} 
                                                    className="sr-only" 
                                                    id="settings-toggle-financial"
                                                />
                                                <label htmlFor="settings-toggle-financial" className="cursor-pointer block">
                                                    <div className={`w-12 h-6 rounded-full transition-colors ${settings.moduleFinancial ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                                                        <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform absolute top-0.5 left-0.5 ${settings.moduleFinancial ? 'translate-x-6' : ''}`} />
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        {settings.moduleFinancial && (
                                            <div className="mt-4 pl-16 space-y-3 border-t pt-3 border-indigo-100/50">
                                                {/* Sub-feature: Quotes */}
                                                <div className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <ClipboardList className="w-4 h-4 text-indigo-505 text-indigo-500" />
                                                        <div>
                                                            <span className="font-semibold text-gray-800">Proposals & Estimates</span>
                                                            <p className="text-[11px] text-gray-500">Draft proposals and request client digital signoffs</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleModuleToggle('moduleQuotes', !settings.moduleQuotes)}
                                                        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${settings.moduleQuotes ? 'bg-indigo-600' : 'bg-gray-200'}`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.moduleQuotes ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>
                                                {/* Sub-feature: Invoices */}
                                                <div className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <CreditCard className="w-4 h-4 text-indigo-500" />
                                                        <div>
                                                            <span className="font-semibold text-gray-800">Digital Invoicing</span>
                                                            <p className="text-[11px] text-gray-500">Generate checkout links and process credit cards</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleModuleToggle('moduleInvoices', !settings.moduleInvoices)}
                                                        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${settings.moduleInvoices ? 'bg-indigo-600' : 'bg-gray-200'}`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.moduleInvoices ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* MODULE 3: Inventory */}
                                    <div className={`p-5 border-2 rounded-xl transition-all duration-300 ${settings.moduleInventory ? 'border-teal-500 bg-teal-50/5' : 'border-gray-200 bg-white'}`}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all duration-300 ${settings.moduleInventory ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                    <Box size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                                                        📦 Inventory Tracking
                                                        <span className="text-[10px] font-semibold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">Materials & Tools</span>
                                                    </h3>
                                                    <p className="text-xs text-gray-655 mt-1">Log parts, track stock levels with reorder thresholds, and audit specialized technician tool check-out lists.</p>
                                                </div>
                                            </div>
                                            <div className="relative pt-1 flex items-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={settings.moduleInventory} 
                                                    onChange={(e) => handleModuleToggle('moduleInventory', e.target.checked)} 
                                                    className="sr-only" 
                                                    id="settings-toggle-inventory"
                                                />
                                                <label htmlFor="settings-toggle-inventory" className="cursor-pointer block">
                                                    <div className={`w-12 h-6 rounded-full transition-colors ${settings.moduleInventory ? 'bg-teal-600' : 'bg-gray-300'}`}>
                                                        <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform absolute top-0.5 left-0.5 ${settings.moduleInventory ? 'translate-x-6' : ''}`} />
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        {settings.moduleInventory && (
                                            <div className="mt-4 pl-16 space-y-3 border-t pt-3 border-teal-100/50">
                                                {/* Sub-feature: Materials */}
                                                <div className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <Package className="w-4 h-4 text-teal-500" />
                                                        <div>
                                                            <span className="font-semibold text-gray-800">Materials & Parts Catalog</span>
                                                            <p className="text-[11px] text-gray-500">Real-time stock counts and low-level reorder alerts</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleModuleToggle('moduleMaterials', !settings.moduleMaterials)}
                                                        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${settings.moduleMaterials ? 'bg-teal-600' : 'bg-gray-200'}`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.moduleMaterials ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>
                                                {/* Sub-feature: Tools */}
                                                <div className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <Wrench className="w-4 h-4 text-teal-500" />
                                                        <div>
                                                            <span className="font-semibold text-gray-800">Tool Fleet Audit</span>
                                                            <p className="text-[11px] text-gray-500">Track company tool locations, assignments, and replacement conditions</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleModuleToggle('moduleTools', !settings.moduleTools)}
                                                        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${settings.moduleTools ? 'bg-teal-600' : 'bg-gray-200'}`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.moduleTools ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* MODULE 4: Purchase Orders */}
                                    <div className={`p-5 border-2 rounded-xl transition-all duration-300 ${settings.modulePurchaseOrders ? 'border-amber-500 bg-amber-50/5' : 'border-gray-200 bg-white'}`}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all duration-300 ${settings.modulePurchaseOrders ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                    <Crown size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                                                        🛒 Purchase Orders & Procurement
                                                        <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Sourcing Cockpit</span>
                                                    </h3>
                                                    <p className="text-xs text-gray-650 mt-1">Auto-source parts split POs based on job deficits, copy credentials, and track supplier placement audit logs.</p>
                                                </div>
                                            </div>
                                            <div className="relative pt-1 flex items-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={settings.modulePurchaseOrders} 
                                                    onChange={(e) => handleModuleToggle('modulePurchaseOrders', e.target.checked)} 
                                                    className="sr-only" 
                                                    id="settings-toggle-po"
                                                />
                                                <label htmlFor="settings-toggle-po" className="cursor-pointer block">
                                                    <div className={`w-12 h-6 rounded-full transition-colors ${settings.modulePurchaseOrders ? 'bg-amber-600' : 'bg-gray-300'}`}>
                                                        <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform absolute top-0.5 left-0.5 ${settings.modulePurchaseOrders ? 'translate-x-6' : ''}`} />
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* MODULE 5: Work Operations */}
                                    <div className="p-5 border-2 rounded-xl transition-all duration-300 border-indigo-500 bg-indigo-50/5">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm bg-indigo-650 bg-indigo-600 text-white">
                                                    <Kanban size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                                                        🛠️ Operations & Dispatch
                                                        <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Work Tools</span>
                                                    </h3>
                                                    <p className="text-xs text-gray-650 mt-1">Configure layout options for scheduling jobs, mapping coordinates, and organizing job status pipelines.</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 pl-16 space-y-3 border-t pt-3 border-indigo-100/50">
                                            {/* Sub-feature: Kanban */}
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Kanban className="w-4 h-4 text-indigo-500" />
                                                    <div>
                                                        <span className="font-semibold text-gray-800">Kanban Board</span>
                                                        <p className="text-[11px] text-gray-500">Visual drag-and-drop jobs backlog dashboard</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleModuleToggle('moduleKanban', !settings.moduleKanban)}
                                                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${settings.moduleKanban ? 'bg-indigo-600' : 'bg-gray-200'}`}
                                                >
                                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.moduleKanban ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                </button>
                                            </div>
                                            {/* Sub-feature: Calendar */}
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-indigo-500" />
                                                    <div>
                                                        <span className="font-semibold text-gray-800">Interactive Calendar</span>
                                                        <p className="text-[11px] text-gray-500">Full multi-view scheduler to dispatch team members</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleModuleToggle('moduleCalendar', !settings.moduleCalendar)}
                                                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${settings.moduleCalendar ? 'bg-indigo-600' : 'bg-gray-200'}`}
                                                >
                                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.moduleCalendar ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                </button>
                                            </div>
                                            {/* Sub-feature: Dispatch Map */}
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-indigo-500" />
                                                    <div>
                                                        <span className="font-semibold text-gray-800">Dispatcher Map & GPS</span>
                                                        <p className="text-[11px] text-gray-500">Real-time street map showing job pins and route lines</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleModuleToggle('moduleDispatch', !settings.moduleDispatch)}
                                                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${settings.moduleDispatch ? 'bg-indigo-600' : 'bg-gray-200'}`}
                                                >
                                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.moduleDispatch ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                </button>
                                            </div>

                                            {/* Dispatch Mode Setting */}
                                            <div className="mt-4 pt-4 border-t border-indigo-100/50">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Settings className="w-4 h-4 text-indigo-500" />
                                                    <span className="font-semibold text-gray-800 text-sm">Dispatch Mode</span>
                                                </div>
                                                <p className="text-[11px] text-gray-500 mb-3 ml-6">Control how jobs are assigned and who manages the schedule.</p>
                                                <div className="ml-6 space-y-2">
                                                    <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                                        settings.dispatchMode === 'assign_and_schedule' 
                                                            ? 'border-indigo-500 bg-indigo-50' 
                                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                                    }`}>
                                                        <input
                                                            type="radio"
                                                            name="dispatchMode"
                                                            value="assign_and_schedule"
                                                            checked={settings.dispatchMode === 'assign_and_schedule'}
                                                            onChange={() => handleInputChange('dispatchMode', 'assign_and_schedule')}
                                                            className="mt-0.5 accent-indigo-600"
                                                        />
                                                        <div>
                                                            <span className="font-semibold text-gray-800 text-sm">Assign & Schedule</span>
                                                            <p className="text-[11px] text-gray-500 mt-0.5">Dispatcher assigns techs AND sets the scheduled time. Technicians see their schedule as read-only and can only <strong>request</strong> reschedules — the dispatcher must approve.</p>
                                                        </div>
                                                    </label>
                                                    <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                                        settings.dispatchMode === 'assign_only' 
                                                            ? 'border-indigo-500 bg-indigo-50' 
                                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                                    }`}>
                                                        <input
                                                            type="radio"
                                                            name="dispatchMode"
                                                            value="assign_only"
                                                            checked={settings.dispatchMode === 'assign_only'}
                                                            onChange={() => handleInputChange('dispatchMode', 'assign_only')}
                                                            className="mt-0.5 accent-indigo-600"
                                                        />
                                                        <div>
                                                            <span className="font-semibold text-gray-800 text-sm">Assign Only</span>
                                                            <p className="text-[11px] text-gray-500 mt-0.5">Dispatcher assigns a tech but does <strong>not</strong> set a time. The technician receives the job and schedules it themselves from their dashboard.</p>
                                                        </div>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
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

                    {/* Follow-up Engine Tab */}
                    {activeTab === 'followup' && (
                        <FollowUpEngineSettings />
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Save Button */}
                    {(activeTab !== 'billing' && activeTab !== 'vendors' && activeTab !== 'categories' && activeTab !== 'followup') && (
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
            </div>{/* end bg-white shadow */}
            </div>{/* end flex-1 content area */}
            </div>{/* end flex gap-6 layout */}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
//  LEGAL & TERMS TAB — Rule-Set Management UI
// ═══════════════════════════════════════════════════════════════════════════

interface LegalTermsTabProps {
    settings: OrgSettings;
    setSettings: React.Dispatch<React.SetStateAction<OrgSettings>>;
    setSaveSuccess: (v: boolean) => void;
}

const LegalTermsTab: React.FC<LegalTermsTabProps> = ({ settings, setSettings, setSaveSuccess }) => {
    const [selectedJurisdiction, setSelectedJurisdiction] = useState('');
    const [expandedSection, setExpandedSection] = useState<TermCategory | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [customLocationInput, setCustomLocationInput] = useState('');
    const [generatingTerms, setGeneratingTerms] = useState(false);

    const tc = settings.termsConfig || {};

    const updateTermsConfig = (update: Partial<OrgTermsConfig>) => {
        setSettings(prev => ({
            ...prev,
            termsConfig: { ...prev.termsConfig, ...update }
        }));
        setSaveSuccess(false);
    };

    const handleGenerateCustomTerms = async () => {
        if (!customLocationInput.trim()) return;
        setGeneratingTerms(true);
        try {
            const { httpsCallable } = await import('firebase/functions');
            const { functions } = await import('../firebase');
            const generateLegalTermsWithAI = httpsCallable(functions, 'generateLegalTermsWithAI');
            const res = await generateLegalTermsWithAI({ location: customLocationInput });
            const data = res.data as any;

            if (data && data.success) {
                const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
                let code = `CUSTOM_${sanitize(data.countryCode)}`;
                if (data.regionName) {
                    code += `_${sanitize(data.regionName)}`;
                }

                // Ensure uniqueness
                const originalCode = code;
                let suffix = 1;
                const existingCodes = (tc.customJurisdictions || []).map((j: any) => j.code);
                while (existingCodes.includes(code)) {
                    code = `${originalCode}_${suffix}`;
                    suffix++;
                }

                const name = data.regionName ? `${data.regionName}, ${data.countryName}` : data.countryName;
                const newJurisdiction = {
                    code,
                    name,
                    country: data.countryCode,
                    countryName: data.countryName
                };

                const clausesByCategory: Record<string, string[]> = {
                    payment: [],
                    scope: [],
                    warranty: [],
                    liability: [],
                    general: [],
                    jurisdiction: []
                };

                data.clauses.forEach((c: any) => {
                    const cat = c.category;
                    if (clausesByCategory[cat]) {
                        clausesByCategory[cat].push(c.text);
                    }
                });

                const newOverride: Record<string, any> = {};
                Object.keys(clausesByCategory).forEach(cat => {
                    newOverride[cat] = {
                        enabled: true,
                        customTerms: [],
                        appendTerms: clausesByCategory[cat],
                        removeTermIds: []
                    };
                });

                const updatedCustomJurisdictions = [...(tc.customJurisdictions || []), newJurisdiction];
                const updatedOverrides = {
                    ...(tc.jurisdictionOverrides || {}),
                    [code]: newOverride
                };

                updateTermsConfig({
                    customJurisdictions: updatedCustomJurisdictions,
                    jurisdictionOverrides: updatedOverrides
                });

                setCustomLocationInput('');
                setSelectedJurisdiction(code);
                setExpandedSection(null);
                setShowPreview(false);
                toast.success(`Generated T&C for ${name} successfully! Click save to persist.`);
            } else {
                toast.error('AI did not return a valid response. Please try again.');
            }
        } catch (err: any) {
            console.error('Failed to generate terms with AI:', err);
            toast.error(`Error: ${err.message || 'Failed to call Gemini.'}`);
        } finally {
            setGeneratingTerms(false);
        }
    };

    const getOverride = (jurisdiction: string, category: TermCategory): TermSectionOverride | undefined => {
        return tc.jurisdictionOverrides?.[jurisdiction]?.[category as keyof typeof tc.jurisdictionOverrides[string]];
    };

    const setOverride = (jurisdiction: string, category: TermCategory, override: TermSectionOverride | undefined) => {
        const existing = tc.jurisdictionOverrides || {};
        const jurisdictionOverrides = { ...existing };
        if (!jurisdictionOverrides[jurisdiction]) {
            jurisdictionOverrides[jurisdiction] = {};
        }
        if (override) {
            (jurisdictionOverrides[jurisdiction] as any)[category] = override;
        } else {
            delete (jurisdictionOverrides[jurisdiction] as any)[category];
            if (Object.keys(jurisdictionOverrides[jurisdiction]!).length === 0) {
                delete jurisdictionOverrides[jurisdiction];
            }
        }
        updateTermsConfig({ jurisdictionOverrides });
    };

    const getDefaultTermsForJurisdiction = (code: string): TermItem[] => {
        if (!code) return [];
        return generateSystemDefaultTerms({
            jurisdictionState: code,
            country: getCountryForJurisdiction(code),
            requiresDeposit: false,
            total: 1000,
            validDays: tc.defaultValidDays || 30,
            warrantyDays: tc.defaultWarrantyDays || 90,
            cancellationHours: tc.defaultCancellationHours || 24,
            disputeResolutionDays: tc.defaultDisputeResolutionDays || 30,
            companyName: tc.companyLegalName,
        });
    };

    const getPreviewTerms = (code: string): TermItem[] => {
        if (!code) return [];
        return resolveQuoteTerms({
            jurisdictionState: code,
            country: getCountryForJurisdiction(code),
            requiresDeposit: false,
            total: 1000,
            validDays: tc.defaultValidDays || 30,
            warrantyDays: tc.defaultWarrantyDays || 90,
            cancellationHours: tc.defaultCancellationHours || 24,
            disputeResolutionDays: tc.defaultDisputeResolutionDays || 30,
            companyName: tc.companyLegalName,
            orgTermsConfig: tc,
        });
    };

    const hasAnyOverrides = (jurisdiction: string): boolean => {
        const overrides = tc.jurisdictionOverrides?.[jurisdiction];
        return !!overrides && Object.keys(overrides).length > 0;
    };

    const countOverrides = (): number => {
        return Object.keys(tc.jurisdictionOverrides || {}).length;
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-indigo-600" />
                    Legal & Terms Configuration
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Configure Terms & Conditions rule sets for each jurisdiction. System defaults provide comprehensive legal coverage — customize section-by-section as needed.
                </p>
            </div>

            {/* ── SECTION A: Global Defaults ── */}
            <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-slate-200 rounded-xl p-6">
                <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                    Global Defaults
                </h3>
                <p className="text-xs text-slate-500 mb-5">These values are used in every quote's terms unless overridden at the jurisdiction level.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Legal Name</label>
                        <input
                            type="text"
                            value={tc.companyLegalName || ''}
                            onChange={(e) => updateTermsConfig({ companyLegalName: e.target.value })}
                            placeholder="e.g., ACME HVAC Services LLC"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-400 mt-1">Used in liability clauses. Defaults to "Service Provider" if blank.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Arbitration Venue</label>
                        <input
                            type="text"
                            value={tc.arbitrationVenue || ''}
                            onChange={(e) => updateTermsConfig({ arbitrationVenue: e.target.value })}
                            placeholder="e.g., Honolulu, Hawaii"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-400 mt-1">Override dispute resolution venue. Defaults to the job's jurisdiction.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Warranty Period (days)</label>
                        <input
                            type="number"
                            value={tc.defaultWarrantyDays || 90}
                            onChange={(e) => updateTermsConfig({ defaultWarrantyDays: parseInt(e.target.value) || 90 })}
                            min={0}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quote Validity (days)</label>
                        <input
                            type="number"
                            value={tc.defaultValidDays || 30}
                            onChange={(e) => updateTermsConfig({ defaultValidDays: parseInt(e.target.value) || 30 })}
                            min={1}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cancellation Notice (hours)</label>
                        <input
                            type="number"
                            value={tc.defaultCancellationHours || 24}
                            onChange={(e) => updateTermsConfig({ defaultCancellationHours: parseInt(e.target.value) || 24 })}
                            min={0}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Dispute Resolution Period (days)</label>
                        <input
                            type="number"
                            value={tc.defaultDisputeResolutionDays || 30}
                            onChange={(e) => updateTermsConfig({ defaultDisputeResolutionDays: parseInt(e.target.value) || 30 })}
                            min={0}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* ── SECTION B: Jurisdiction Rule Sets ── */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-indigo-600" />
                                Jurisdiction Rule Sets
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                                Select a jurisdiction to customize its T&C sections. {countOverrides() > 0 && <span className="text-indigo-600 font-semibold">{countOverrides()} customized</span>}
                            </p>
                        </div>
                    </div>

                    {/* Jurisdiction Selector & AI generator */}
                    <div className="mt-4 space-y-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <select
                                value={selectedJurisdiction}
                                onChange={(e) => { setSelectedJurisdiction(e.target.value); setExpandedSection(null); setShowPreview(false); }}
                                className="flex-1 max-w-md px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                            >
                                <option value="">— Select Jurisdiction —</option>
                                <optgroup label="United States">
                                    {ALL_JURISDICTIONS.filter(j => j.country === 'US' && !['PR','GU','VI'].includes(j.code)).map(j => (
                                        <option key={j.code} value={j.code}>
                                            {j.name} ({j.code}) {hasAnyOverrides(j.code) ? '⚙️' : ''}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="US Territories">
                                    {ALL_JURISDICTIONS.filter(j => ['PR','GU','VI'].includes(j.code)).map(j => (
                                        <option key={j.code} value={j.code}>
                                            {j.name} ({j.code}) {hasAnyOverrides(j.code) ? '⚙️' : ''}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="International">
                                    {ALL_JURISDICTIONS.filter(j => j.country !== 'US').map(j => (
                                        <option key={j.code} value={j.code}>
                                            {j.name} {hasAnyOverrides(j.code) ? '⚙️' : ''}
                                        </option>
                                    ))}
                                </optgroup>
                                {tc.customJurisdictions && tc.customJurisdictions.length > 0 && (
                                    <optgroup label="Custom / AI Generated">
                                        {tc.customJurisdictions.map((j: any) => (
                                            <option key={j.code} value={j.code}>
                                                {j.name} ({j.code}) {hasAnyOverrides(j.code) ? '⚙️' : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>

                            {selectedJurisdiction && (
                                <button
                                    onClick={() => setShowPreview(!showPreview)}
                                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${showPreview ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                                >
                                    {showPreview ? '✕ Close Preview' : '👁 Preview Terms'}
                                </button>
                            )}
                        </div>

                        {/* AI Generator Control */}
                        <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg max-w-2xl">
                            <label className="block text-xs font-bold text-indigo-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                Generate T&C for custom country or region with AI
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="e.g. Ontario, Canada or United Kingdom"
                                    value={customLocationInput}
                                    onChange={(e) => setCustomLocationInput(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                                />
                                <button
                                    onClick={handleGenerateCustomTerms}
                                    disabled={generatingTerms || !customLocationInput.trim()}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                                >
                                    {generatingTerms ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            Generate
                                        </>
                                    )}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                                Gemini AI will write custom local clauses for Payment, Scope, Warranty, Liability, General, and local Jurisdiction-Specific notices.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Section Accordion — shown when a jurisdiction is selected */}
                {selectedJurisdiction && !showPreview && (
                    <div className="divide-y divide-slate-200">
                        {TERM_CATEGORIES.map(cat => {
                            const isExpanded = expandedSection === cat.key;
                            const override = getOverride(selectedJurisdiction, cat.key);
                            const defaultTerms = getDefaultTermsForJurisdiction(selectedJurisdiction).filter(t => t.category === cat.key);
                            const isCustomized = !!override;
                            const isDisabled = override?.enabled === false;

                            return (
                                <div key={cat.key} className={`${isDisabled ? 'bg-red-50/30' : isCustomized ? 'bg-amber-50/30' : ''}`}>
                                    {/* Accordion Header */}
                                    <button
                                        onClick={() => setExpandedSection(isExpanded ? null : cat.key)}
                                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`text-sm font-semibold ${isDisabled ? 'text-red-400 line-through' : 'text-slate-800'}`}>{cat.label}</span>
                                            <span className="text-xs text-slate-400">{defaultTerms.length} terms</span>
                                            {isCustomized && !isDisabled && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full uppercase">Customized</span>}
                                            {isDisabled && <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full uppercase">Disabled</span>}
                                        </div>
                                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>

                                    {/* Expanded Panel */}
                                    {isExpanded && (
                                        <div className="px-6 pb-6 space-y-4">
                                            {/* Enable/Disable Toggle */}
                                            <div className="flex items-center justify-between p-3 bg-slate-100 rounded-lg">
                                                <span className="text-sm font-medium text-slate-700">Include this section in quotes</span>
                                                <button
                                                    onClick={() => {
                                                        if (isDisabled) {
                                                            // Re-enable: remove the override or set enabled=true
                                                            setOverride(selectedJurisdiction, cat.key, undefined);
                                                        } else {
                                                            setOverride(selectedJurisdiction, cat.key, { enabled: false });
                                                        }
                                                    }}
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${!isDisabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                                >
                                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${!isDisabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                </button>
                                            </div>

                                            {!isDisabled && (
                                                <>
                                                    {/* Mode Selection */}
                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={() => setOverride(selectedJurisdiction, cat.key, undefined)}
                                                            className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-all ${!isCustomized ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                                                        >
                                                            <div className="font-bold">📋 Use System Defaults</div>
                                                            <div className="text-xs mt-1 opacity-70">Legally-researched baseline terms</div>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (!isCustomized) {
                                                                    setOverride(selectedJurisdiction, cat.key, { enabled: true, appendTerms: [] });
                                                                }
                                                            }}
                                                            className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-all ${isCustomized && !isDisabled ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                                                        >
                                                            <div className="font-bold">✏️ Customize</div>
                                                            <div className="text-xs mt-1 opacity-70">Modify, append, or replace terms</div>
                                                        </button>
                                                    </div>

                                                    {/* Default Terms Display */}
                                                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                                                {isCustomized ? 'Default Terms (modifiable)' : 'System Default Terms'}
                                                            </span>
                                                        </div>
                                                        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                                                            {defaultTerms.map((term, i) => {
                                                                const isRemoved = override?.removeTermIds?.includes(term.id);
                                                                return (
                                                                    <div key={term.id} className={`flex items-start gap-3 px-4 py-3 text-sm ${isRemoved ? 'bg-red-50/50 opacity-50' : ''}`}>
                                                                        {isCustomized && (
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={!isRemoved}
                                                                                onChange={() => {
                                                                                    const current = override || { enabled: true };
                                                                                    const removeIds = [...(current.removeTermIds || [])];
                                                                                    if (isRemoved) {
                                                                                        const idx = removeIds.indexOf(term.id);
                                                                                        if (idx >= 0) removeIds.splice(idx, 1);
                                                                                    } else {
                                                                                        removeIds.push(term.id);
                                                                                    }
                                                                                    setOverride(selectedJurisdiction, cat.key, { ...current, removeTermIds: removeIds });
                                                                                }}
                                                                                className="mt-1 h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                                                                            />
                                                                        )}
                                                                        <div>
                                                                            <span className="text-slate-500 font-mono text-xs mr-1">{i + 1}.</span>
                                                                            <span className={`text-slate-700 ${isRemoved ? 'line-through' : ''}`}>{term.text}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Append Custom Terms */}
                                                    {isCustomized && (
                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Additional Custom Terms</span>
                                                                <button
                                                                    onClick={() => {
                                                                        const current = override || { enabled: true };
                                                                        const appendTerms = [...(current.appendTerms || []), ''];
                                                                        setOverride(selectedJurisdiction, cat.key, { ...current, appendTerms });
                                                                    }}
                                                                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition"
                                                                >
                                                                    <Plus className="w-3 h-3" /> Add Clause
                                                                </button>
                                                            </div>

                                                            {(override?.appendTerms || []).map((term, i) => (
                                                                <div key={i} className="flex gap-2">
                                                                    <textarea
                                                                        value={term}
                                                                        onChange={(e) => {
                                                                            const current = override || { enabled: true };
                                                                            const appendTerms = [...(current.appendTerms || [])];
                                                                            appendTerms[i] = e.target.value;
                                                                            setOverride(selectedJurisdiction, cat.key, { ...current, appendTerms });
                                                                        }}
                                                                        placeholder="Enter your custom term clause..."
                                                                        className="flex-1 px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[60px] resize-y"
                                                                    />
                                                                    <button
                                                                        onClick={() => {
                                                                            const current = override || { enabled: true };
                                                                            const appendTerms = [...(current.appendTerms || [])];
                                                                            appendTerms.splice(i, 1);
                                                                            setOverride(selectedJurisdiction, cat.key, { ...current, appendTerms });
                                                                        }}
                                                                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition self-start"
                                                                        title="Remove clause"
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Reset Button */}
                                                    {isCustomized && (
                                                        <div className="flex justify-end pt-2">
                                                            <button
                                                                onClick={() => setOverride(selectedJurisdiction, cat.key, undefined)}
                                                                className="text-xs text-slate-500 hover:text-red-600 transition font-medium flex items-center gap-1"
                                                            >
                                                                <AlertCircle className="w-3 h-3" /> Reset to System Defaults
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Live Preview */}
                {selectedJurisdiction && showPreview && (
                    <div className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Info className="w-4 h-4 text-indigo-600" />
                            <span className="text-sm font-bold text-slate-800">
                                Preview: Terms for {ALL_JURISDICTIONS.find(j => j.code === selectedJurisdiction)?.name || selectedJurisdiction}
                            </span>
                            {hasAnyOverrides(selectedJurisdiction) && (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">CUSTOMIZED</span>
                            )}
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg max-h-[500px] overflow-y-auto">
                            {(() => {
                                const terms = getPreviewTerms(selectedJurisdiction);
                                const categories: { key: TermCategory; label: string }[] = TERM_CATEGORIES;
                                let idx = 0;
                                return categories.map(cat => {
                                    const items = terms.filter(t => t.category === cat.key);
                                    if (items.length === 0) return null;
                                    return (
                                        <div key={cat.key} className="px-5 py-3 border-b border-slate-100 last:border-b-0">
                                            <p className="font-bold text-slate-700 text-xs uppercase tracking-wide mb-2">{cat.label}</p>
                                            {items.map(item => {
                                                idx++;
                                                const isCustom = item.id.startsWith('appended-') || item.id.startsWith('custom-');
                                                return (
                                                    <p key={item.id} className={`text-sm text-slate-600 mb-1.5 ${isCustom ? 'bg-amber-50 border-l-2 border-amber-400 pl-2 py-0.5' : ''}`}>
                                                        <span className="text-slate-400 font-mono text-xs">{idx}.</span> {item.text}
                                                    </p>
                                                );
                                            })}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {!selectedJurisdiction && (
                    <div className="p-12 text-center text-slate-400">
                        <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">Select a jurisdiction above to customize its terms</p>
                        <p className="text-xs mt-1">System defaults provide comprehensive legal coverage for all locations</p>
                    </div>
                )}
            </div>

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">How Rule Sets Work</p>
                    <ul className="list-disc list-inside text-xs space-y-0.5 text-blue-700">
                        <li><strong>No overrides</strong> — system defaults apply (zero configuration needed)</li>
                        <li><strong>Uncheck a term</strong> — removes that specific clause from quotes in this jurisdiction</li>
                        <li><strong>Add custom clauses</strong> — your clauses appear after the system defaults</li>
                        <li><strong>Disable a section</strong> — hides the entire section (e.g., hide warranty)</li>
                        <li><strong>Reset</strong> — clears all overrides and reverts to system defaults</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
