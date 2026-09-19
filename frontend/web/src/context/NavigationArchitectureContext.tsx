import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
    LayoutDashboard, ClipboardList, Calendar, Users, MapPin, Mail, Smartphone,
    MessageSquare, Bot, FileText, ShoppingCart, Package, Wrench, Radio, ClipboardCheck,
    Warehouse, BarChart2, Settings, Inbox, User, CalendarCheck, Zap, Layers, DollarSign,
    type LucideIcon, Briefcase, Globe, PlusCircle
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

export type NavArchitecture = 'default' | 'pipeline' | 'domain-hubs' | 'flat-shortcuts';

export interface ArchitectureInfo {
    id: NavArchitecture;
    name: string;
    tagline: string;
    description: string;
    badge: string;
    icon: string;
    navGroupCount: number;
    totalNavItems: number;
    philosophy: string;
    pathExample: string;
}

export interface ArchNavItem {
    name: string;
    path: string;
    icon: LucideIcon;
    isTab?: boolean;
    tabParam?: string;
}

export interface ArchNavGroup {
    label: string;
    items: ArchNavItem[];
    defaultOpen?: boolean;
}

export interface PathMapping {
    canonical: string;
    label: string;
    pipeline: string;
    domainHubs: string;
    flatShortcuts: string;
}

// ─── Architecture Definitions ───────────────────────────────

export const ARCHITECTURE_INFO: Record<NavArchitecture, ArchitectureInfo> = {
    'default': {
        id: 'default',
        name: 'Current Layout',
        tagline: 'Existing Navigation',
        description: 'The current sidebar grouping with Work, Comms, Financial, and Inventory sections. Mixed path patterns.',
        badge: 'Active / Production',
        icon: 'LayoutGrid',
        navGroupCount: 4,
        totalNavItems: 25,
        philosophy: 'Organic growth — features added as built, grouped loosely by domain.',
        pathExample: '/materials, /admin/texting, /dispatcher',
    },
    'pipeline': {
        id: 'pipeline',
        name: 'Process Pipeline',
        tagline: 'Organized by Workflow Stage',
        description: 'Restructures the entire site around how work flows: Intake → Execute → Complete → Manage. Every path reflects its stage in the business process.',
        badge: 'Workflow / Linear',
        icon: 'Layers',
        navGroupCount: 4,
        totalNavItems: 22,
        philosophy: 'Follow the work — navigate by where you are in the service lifecycle.',
        pathExample: '/intake/new-job, /dispatch/console, /billing/invoices',
    },
    'domain-hubs': {
        id: 'domain-hubs',
        name: 'Domain Hubs',
        tagline: 'Business Domain Grouping',
        description: 'Groups everything by functional business domain. Each hub is a self-contained module with consistent two-level nesting.',
        badge: 'Modular / SaaS',
        icon: 'Briefcase',
        navGroupCount: 6,
        totalNavItems: 26,
        philosophy: 'Think in domains — each business function has its own namespace and hub.',
        pathExample: '/work/jobs, /comms/email, /supply/materials',
    },
    'flat-shortcuts': {
        id: 'flat-shortcuts',
        name: 'Flat + Smart Shortcuts',
        tagline: 'Minimal Nav, Max Context',
        description: 'Reduces sidebar to just 7 top-level items. Sub-views are embedded tabs within each page using query params. Inspired by Linear & Notion.',
        badge: 'Minimal / Fast',
        icon: 'Zap',
        navGroupCount: 1,
        totalNavItems: 7,
        philosophy: 'Less navigation, more doing — everything accessible in 1-2 clicks.',
        pathExample: '/jobs, /schedule?tab=dispatch, /inbox?tab=texting',
    },
};

// ─── Path Mappings ──────────────────────────────────────────

export const PATH_MAPPINGS: PathMapping[] = [
    { canonical: '/',               label: 'Dashboard',         pipeline: '/',                      domainHubs: '/',                    flatShortcuts: '/' },
    { canonical: '/jobs',           label: 'Jobs List',         pipeline: '/dispatch/jobs',          domainHubs: '/work/jobs',           flatShortcuts: '/jobs' },
    { canonical: '/jobs/new',       label: 'Create Job',        pipeline: '/intake/new-job',         domainHubs: '/work/jobs/new',       flatShortcuts: '/jobs/new' },
    { canonical: '/quotes',         label: 'Quotes',            pipeline: '/intake/quotes',          domainHubs: '/work/quotes',         flatShortcuts: '/jobs?tab=quotes' },
    { canonical: '/quotes/new',     label: 'Create Quote',      pipeline: '/intake/quotes/new',      domainHubs: '/work/quotes/new',     flatShortcuts: '/jobs?tab=quotes&action=new' },
    { canonical: '/calendar',       label: 'Calendar',          pipeline: '/intake/calendar',        domainHubs: '/scheduling/calendar',  flatShortcuts: '/schedule' },
    { canonical: '/dispatcher',     label: 'Dispatch Console',  pipeline: '/dispatch/console',       domainHubs: '/scheduling/dispatch',  flatShortcuts: '/schedule?tab=dispatch' },
    { canonical: '/schedule',       label: 'Schedule Board',    pipeline: '/dispatch/schedule',      domainHubs: '/scheduling/board',     flatShortcuts: '/schedule?tab=board' },
    { canonical: '/admin/scheduling-rules', label: 'Scheduling Rules', pipeline: '/settings?tab=scheduling', domainHubs: '/settings?tab=scheduling', flatShortcuts: '/settings?tab=scheduling' },
    { canonical: '/contacts',       label: 'Customers',         pipeline: '/manage/customers',       domainHubs: '/admin/customers',      flatShortcuts: '/settings?tab=customers' },
    { canonical: '/techs',          label: 'Technicians',       pipeline: '/dispatch/techs',         domainHubs: '/scheduling/techs',     flatShortcuts: '/settings?tab=techs' },
    { canonical: '/email',          label: 'Email Inbox',       pipeline: '/manage/comms/email',     domainHubs: '/comms/email',          flatShortcuts: '/inbox' },
    { canonical: '/admin/texting',  label: 'Texting Hub',       pipeline: '/manage/comms/texting',   domainHubs: '/comms/texting',        flatShortcuts: '/inbox?tab=texting' },
    { canonical: '/admin/ai-phone-agent', label: 'AI Voice Agent', pipeline: '/settings?tab=voice', domainHubs: '/settings?tab=voice',    flatShortcuts: '/settings?tab=voice' },
    { canonical: '/admin/communications', label: 'Communications Portal', pipeline: '/manage/comms/portal', domainHubs: '/comms/portal', flatShortcuts: '/inbox?tab=portal' },
    { canonical: '/materials',      label: 'Materials',         pipeline: '/manage/inventory/materials', domainHubs: '/supply/materials', flatShortcuts: '/inventory' },
    { canonical: '/tools',          label: 'Tools',             pipeline: '/manage/inventory/tools', domainHubs: '/supply/tools',         flatShortcuts: '/inventory?tab=tools' },
    { canonical: '/inventory/trackers', label: 'Tag & Trackers', pipeline: '/manage/inventory/trackers', domainHubs: '/supply/trackers', flatShortcuts: '/inventory?tab=trackers' },
    { canonical: '/purchase-orders', label: 'Purchase Orders',  pipeline: '/billing/purchase-orders', domainHubs: '/supply/orders',      flatShortcuts: '/inventory?tab=orders' },
    { canonical: '/receiving',      label: 'Receiving',         pipeline: '/billing/receiving',      domainHubs: '/supply/receiving',     flatShortcuts: '/inventory?tab=receiving' },
    { canonical: '/warehouse',      label: 'Warehousing',       pipeline: '/manage/inventory/warehouse', domainHubs: '/supply/warehouse', flatShortcuts: '/inventory?tab=warehouse' },
    { canonical: '/invoices',       label: 'Invoices',          pipeline: '/billing/invoices',       domainHubs: '/finance/invoices',     flatShortcuts: '/money' },
    { canonical: '/reports',        label: 'Reports',           pipeline: '/billing/reports',        domainHubs: '/finance/reports',      flatShortcuts: '/money?tab=reports' },
    { canonical: '/settings',       label: 'Settings',          pipeline: '/manage/settings',        domainHubs: '/admin/settings',       flatShortcuts: '/settings' },
    { canonical: '/admin/integrations', label: 'Integrations',  pipeline: '/settings?tab=integrations', domainHubs: '/settings?tab=integrations', flatShortcuts: '/settings?tab=integrations' },
    { canonical: '/admin/services', label: 'Services Catalog',  pipeline: '/settings?tab=services',  domainHubs: '/settings?tab=services', flatShortcuts: '/settings?tab=services' },
    { canonical: '/addons',         label: 'Add-ons',           pipeline: '/manage/addons',          domainHubs: '/admin/addons',         flatShortcuts: '/settings?tab=addons' },
];

// ─── Nav Group Builders ─────────────────────────────────────

function getPipelineGroups(_role: string, _hasFeature: (f: string) => boolean): ArchNavGroup[] {
    return [
        {
            label: 'Intake & Plan',
            defaultOpen: true,
            items: [
                { name: 'Dashboard', path: '/', icon: LayoutDashboard },
                { name: 'Create Job', path: '/jobs/new', icon: PlusCircle },
                { name: 'Quotes', path: '/quotes', icon: ClipboardList },
                { name: 'Calendar', path: '/calendar', icon: Calendar },
                { name: 'Job Requests', path: '/job-intake', icon: Inbox },
            ],
        },
        {
            label: 'Execute & Dispatch',
            items: [
                { name: 'Jobs List', path: '/jobs', icon: ClipboardList },
                { name: 'Dispatch Console', path: '/dispatcher', icon: MapPin },
                { name: 'Schedule Board', path: '/schedule', icon: Calendar },
                { name: 'Technicians', path: '/techs', icon: User },
            ],
        },
        {
            label: 'Complete & Bill',
            items: [
                { name: 'Invoices', path: '/invoices', icon: FileText },
                { name: 'Purchase Orders', path: '/purchase-orders', icon: ShoppingCart },
                { name: 'Receiving', path: '/receiving', icon: ClipboardCheck },
                { name: 'Reports', path: '/reports', icon: BarChart2 },
            ],
        },
        {
            label: 'Manage & Configure',
            items: [
                { name: 'Customers', path: '/contacts', icon: Users },
                { name: 'Materials', path: '/materials', icon: Package },
                { name: 'Tools', path: '/tools', icon: Wrench },
                { name: 'Warehousing', path: '/warehouse', icon: Warehouse },
                { name: 'Settings', path: '/settings', icon: Settings },
            ],
        },
    ];
}

function getDomainHubGroups(_role: string, _hasFeature: (f: string) => boolean): ArchNavGroup[] {
    return [
        {
            label: 'Work Hub',
            defaultOpen: true,
            items: [
                { name: 'Dashboard', path: '/', icon: LayoutDashboard },
                { name: 'Jobs', path: '/jobs', icon: ClipboardList },
                { name: 'Create Job', path: '/jobs/new', icon: PlusCircle },
                { name: 'Quotes', path: '/quotes', icon: ClipboardList },
            ],
        },
        {
            label: 'Scheduling Hub',
            items: [
                { name: 'Calendar', path: '/calendar', icon: Calendar },
                { name: 'Dispatch Console', path: '/dispatcher', icon: MapPin },
                { name: 'Schedule Board', path: '/schedule', icon: Calendar },
                { name: 'Technicians', path: '/techs', icon: User },
            ],
        },
        {
            label: 'Communications Hub',
            items: [
                { name: 'Email Inbox', path: '/email', icon: Mail },
                { name: 'Texting Hub', path: '/admin/texting', icon: Smartphone },
                { name: 'Comms Portal', path: '/admin/communications', icon: MessageSquare },
            ],
        },
        {
            label: 'Supply Chain Hub',
            items: [
                { name: 'Materials', path: '/materials', icon: Package },
                { name: 'Tools & Equipment', path: '/tools', icon: Wrench },
                { name: 'Tag & Trackers', path: '/inventory/trackers', icon: Radio },
                { name: 'Purchase Orders', path: '/purchase-orders', icon: ShoppingCart },
                { name: 'Receiving', path: '/receiving', icon: ClipboardCheck },
                { name: 'Warehouse', path: '/warehouse', icon: Warehouse },
            ],
        },
        {
            label: 'Finance Hub',
            items: [
                { name: 'Invoices', path: '/invoices', icon: FileText },
                { name: 'Reports', path: '/reports', icon: BarChart2 },
            ],
        },
        {
            label: 'Admin Hub',
            items: [
                { name: 'Settings', path: '/settings', icon: Settings },
                { name: 'Customers', path: '/contacts', icon: Users },
            ],
        },
    ];
}

function getFlatShortcutsGroups(_role: string, _hasFeature: (f: string) => boolean): ArchNavGroup[] {
    return [
        {
            label: 'Navigation',
            defaultOpen: true,
            items: [
                { name: 'Home', path: '/', icon: LayoutDashboard },
                { name: 'Jobs', path: '/jobs', icon: ClipboardList },
                { name: 'Schedule', path: '/calendar', icon: Calendar },
                { name: 'Inbox', path: '/email', icon: Inbox },
                { name: 'Inventory', path: '/materials', icon: Package },
                { name: 'Money', path: '/invoices', icon: DollarSign },
                { name: 'Settings', path: '/settings', icon: Settings },
            ],
        },
    ];
}

// ─── Context ────────────────────────────────────────────────

interface NavigationArchitectureContextType {
    navArchitecture: NavArchitecture;
    setNavArchitecture: (arch: NavArchitecture) => void;
    architectureInfo: ArchitectureInfo;
    allArchitectures: ArchitectureInfo[];
    getNavGroups: (role: string, hasFeature: (f: string) => boolean) => ArchNavGroup[];
    getNavPath: (canonical: string) => string;
    pathMappings: PathMapping[];
}

const NavigationArchitectureContext = createContext<NavigationArchitectureContextType | undefined>(undefined);

const STORAGE_KEY = 'dispatchbox_nav_architecture';

export const NavigationArchitectureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [navArchitecture, setNavArchitectureState] = useState<NavArchitecture>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'pipeline' || saved === 'domain-hubs' || saved === 'flat-shortcuts' || saved === 'default') {
            return saved;
        }
        return 'default';
    });

    const setNavArchitecture = (arch: NavArchitecture) => {
        setNavArchitectureState(arch);
        try {
            localStorage.setItem(STORAGE_KEY, arch);
        } catch (e) {
            console.error('Failed to save nav architecture preference', e);
        }
    };

    useEffect(() => {
        document.documentElement.setAttribute('data-nav-architecture', navArchitecture);
    }, [navArchitecture]);

    const getNavGroups = useCallback((role: string, hasFeature: (f: string) => boolean): ArchNavGroup[] => {
        switch (navArchitecture) {
            case 'pipeline':
                return getPipelineGroups(role, hasFeature);
            case 'domain-hubs':
                return getDomainHubGroups(role, hasFeature);
            case 'flat-shortcuts':
                return getFlatShortcutsGroups(role, hasFeature);
            default:
                return [];
        }
    }, [navArchitecture]);

    const getNavPath = useCallback((canonical: string): string => {
        if (navArchitecture === 'default') return canonical;
        const mapping = PATH_MAPPINGS.find(m => m.canonical === canonical);
        if (!mapping) return canonical;
        switch (navArchitecture) {
            case 'pipeline': return mapping.pipeline;
            case 'domain-hubs': return mapping.domainHubs;
            case 'flat-shortcuts': return mapping.flatShortcuts;
            default: return canonical;
        }
    }, [navArchitecture]);

    const value: NavigationArchitectureContextType = {
        navArchitecture,
        setNavArchitecture,
        architectureInfo: ARCHITECTURE_INFO[navArchitecture],
        allArchitectures: Object.values(ARCHITECTURE_INFO),
        getNavGroups,
        getNavPath,
        pathMappings: PATH_MAPPINGS,
    };

    return (
        <NavigationArchitectureContext.Provider value={value}>
            {children}
        </NavigationArchitectureContext.Provider>
    );
};

export const useNavArchitecture = (): NavigationArchitectureContextType => {
    const context = useContext(NavigationArchitectureContext);
    if (!context) {
        throw new Error('useNavArchitecture must be used within a NavigationArchitectureProvider');
    }
    return context;
};
