import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useOrgPath } from '../lib/orgRouting';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { useLayoutMode, LAYOUT_PRESETS, LayoutMode } from '../context/LayoutModeContext';
import {
    LayoutDashboard,
    ClipboardList,
    Calendar,
    Users,
    User,
    MapPin,
    FileText,
    ShoppingCart,
    Package,
    Wrench,
    Radio,
    ClipboardCheck,
    Warehouse,
    BarChart2,
    Settings,
    Mail,
    Smartphone,
    MessageSquare,
    Bot,
    PlusCircle,
    Search,
    X,
    LogOut,
    Sparkles,
    Shield,
    DollarSign,
    CreditCard,
    LayoutGrid,
    Rows,
    Maximize2,
    Check,
    ArrowRight,
    ExternalLink
} from 'lucide-react';

interface FullMenuPopoutProps {
    isOpen: boolean;
    onClose: () => void;
}

interface MenuModuleItem {
    id: string;
    title: string;
    description: string;
    path: string;
    icon: React.ElementType;
    badge?: string;
    featureFlag?: string;
    roles?: string[];
    isExternal?: boolean;
}

interface MenuCategory {
    id: string;
    title: string;
    tagline: string;
    accentColor: string;
    items: MenuModuleItem[];
}

export const FullMenuPopout: React.FC<FullMenuPopoutProps> = ({ isOpen, onClose }) => {
    const { user, logout, organization } = useAuth();
    const { orgPath } = useOrgPath();
    const { hasFeature } = usePlanFeatures();
    const { layoutMode, setLayoutMode } = useLayoutMode();
    const location = useLocation();
    const navigate = useNavigate();

    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    const role = (user as any)?.role || 'technician';
    const isSiteAdmin = user?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com';

    // Focus search input when popout opens & lock body scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setTimeout(() => searchInputRef.current?.focus(), 80);
        } else {
            document.body.style.overflow = '';
            setSearchQuery('');
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Close on Escape key press
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const enabledModules = organization?.settings?.enabledModules || {};
    const showComms = enabledModules.comms !== false;
    const showFinancial = enabledModules.financial !== false;
    const showInventory = enabledModules.inventory !== false;

    // Categorized Master Navigation Map
    const categories: MenuCategory[] = [
        {
            id: 'work',
            title: 'Work Operations',
            tagline: 'Job dispatch, quotes, and scheduling',
            accentColor: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-400',
            items: [
                {
                    id: 'dashboard',
                    title: 'Dashboard',
                    description: 'Real-time performance overview & work agenda',
                    path: '/',
                    icon: LayoutDashboard
                },
                {
                    id: 'jobs',
                    title: 'Jobs',
                    description: 'Service dispatch tickets, status workflows & history',
                    path: '/jobs',
                    icon: ClipboardList
                },
                {
                    id: 'quotes',
                    title: 'Quotes & AI Estimation',
                    description: 'Instant AI estimates, priority vendor sourcing & signoffs',
                    path: '/quotes',
                    icon: FileText
                },
                {
                    id: 'calendar',
                    title: 'Calendar & Scheduling',
                    description: 'Day, week, month technician agenda & timeline boards',
                    path: '/calendar',
                    icon: Calendar
                },
                {
                    id: 'dispatcher',
                    title: 'Dispatcher Console',
                    description: 'Live GPS fleet map, travel optimization & tech routing',
                    path: '/dispatcher',
                    icon: MapPin,
                    badge: 'Pro Map'
                },
                {
                    id: 'customers',
                    title: 'Customers & CRM',
                    description: 'Client contacts, addresses, equipment histories & portal',
                    path: '/contacts',
                    icon: Users
                },
                {
                    id: 'technicians',
                    title: 'Technicians',
                    description: 'Field tech rosters, certifications, skills & assignments',
                    path: '/techs',
                    icon: User
                }
            ]
        },
        {
            id: 'communications',
            title: 'Communications Hub',
            tagline: 'Multi-channel customer contact & AI agents',
            accentColor: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-400',
            items: [
                {
                    id: 'comms-hub',
                    title: 'Communications Hub',
                    description: 'Unified customer messaging, voice call logs & activity',
                    path: '/admin/communications',
                    icon: MessageSquare
                },
                {
                    id: 'email',
                    title: 'Email Inbox',
                    description: 'Connected customer email inbox with AI triage',
                    path: '/email',
                    icon: Mail
                },
                {
                    id: 'texting',
                    title: 'Texting & SMS',
                    description: 'Automated job updates, reminders & two-way SMS',
                    path: '/admin/texting',
                    icon: Smartphone
                },
                {
                    id: 'voice-agent',
                    title: 'AI Voice Phone Agent',
                    description: '24/7 inbound call answering & automated job booking',
                    path: '/platform/ai-voice',
                    icon: Bot,
                    badge: 'AI Voice'
                }
            ]
        },
        {
            id: 'financial',
            title: 'Financial & Purchasing',
            tagline: 'Billing, invoices, and material purchasing',
            accentColor: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
            items: [
                {
                    id: 'invoices',
                    title: 'Invoices',
                    description: 'Customer billing, payment links, and PDF generation',
                    path: '/invoices',
                    icon: FileText
                },
                {
                    id: 'purchase-orders',
                    title: 'Purchase Orders',
                    description: 'Wholesale supplier POs, status tracking & receiving',
                    path: '/purchase-orders',
                    icon: ShoppingCart
                },
                {
                    id: 'rates-taxes',
                    title: 'Rates & Sales Tax',
                    description: 'Base labor rates, material markups, and regional tax',
                    path: '/settings?tab=financial',
                    icon: DollarSign
                },
                {
                    id: 'payments',
                    title: 'Payment Gateways & Stripe',
                    description: 'Online card processing, deposit rules & payouts',
                    path: '/settings?tab=integrations',
                    icon: CreditCard
                }
            ]
        },
        {
            id: 'inventory',
            title: 'Inventory & Assets',
            tagline: 'Warehouse bins, tool tracking, and receiving',
            accentColor: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400',
            items: [
                {
                    id: 'materials',
                    title: 'Materials Inventory',
                    description: 'Stock levels, supplier SKUs, min reorder thresholds',
                    path: '/materials',
                    icon: Package
                },
                {
                    id: 'tools',
                    title: 'Tools Inventory',
                    description: 'Equipment tracking, maintenance schedules & checkout',
                    path: '/tools',
                    icon: Wrench
                },
                {
                    id: 'trackers',
                    title: 'Asset Trackers & Tags',
                    description: 'BLE beacons, Samsung SmartTag2, AirTags & GPS units',
                    path: '/inventory/trackers',
                    icon: Radio,
                    badge: 'Live Tags'
                },
                {
                    id: 'receiving',
                    title: 'Receiving & Inspection',
                    description: 'Check in delivered parts, barcode scanning & PO audits',
                    path: '/receiving',
                    icon: ClipboardCheck
                },
                {
                    id: 'warehouse',
                    title: 'Warehousing & Bins',
                    description: 'Aisle/rack/shelf bin locations & cycle counts',
                    path: '/warehouse',
                    icon: Warehouse
                }
            ]
        },
        {
            id: 'settings',
            title: 'Administration & Setup',
            tagline: 'Organization preferences, team, and layout',
            accentColor: 'from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-400',
            items: [
                {
                    id: 'reports',
                    title: 'Reports & Analytics',
                    description: 'Revenue metrics, technician productivity & job stats',
                    path: '/reports',
                    icon: BarChart2
                },
                {
                    id: 'setup-checklist',
                    title: 'Setup Checklist',
                    description: 'Complete 10 core business settings & feature checks',
                    path: '/settings?tab=onboarding',
                    icon: Sparkles,
                    badge: 'Setup'
                },
                {
                    id: 'layout-setup',
                    title: 'Navigation & Layout Style',
                    description: 'Customize workspace navigation mode & workflow layout',
                    path: '/settings?tab=layout',
                    icon: LayoutGrid,
                    badge: 'New'
                },
                {
                    id: 'org-settings',
                    title: 'Organization Settings',
                    description: 'Company profile, branding, scheduling rules & modules',
                    path: '/settings',
                    icon: Settings
                }
            ]
        }
    ];

    // Filter items if user typed in search query
    const filteredCategories = categories.map(cat => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return cat;

        const filteredItems = cat.items.filter(item => 
            item.title.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query) ||
            cat.title.toLowerCase().includes(query)
        );

        return { ...cat, items: filteredItems };
    }).filter(cat => cat.items.length > 0);

    const handleNavigate = (path: string) => {
        navigate(orgPath(path));
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-stretch">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Slide-out Mega Menu Drawer */}
            <div className="relative z-10 w-full max-w-4xl bg-slate-900 text-slate-100 shadow-2xl border-r border-slate-800 flex flex-col h-full animate-in slide-in-from-left duration-300 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-md">
                            D
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-bold text-white tracking-tight">Full Application Menu</h2>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    All Modules
                                </span>
                            </div>
                            <p className="text-xs text-slate-400">
                                {organization?.name || 'DispatchBox Operations Portal'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                handleNavigate('/jobs/new');
                            }}
                            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                        >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>New Job</span>
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                            title="Close menu (Esc)"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="px-6 py-3.5 bg-slate-900 border-b border-slate-800/80 shrink-0">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Type to search 25+ modules, tools, and pages... (e.g. quotes, trackers, invoices, schedule)"
                            className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Scrollable Categorized Navigation Grid */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {filteredCategories.length === 0 ? (
                        <div className="text-center py-16 space-y-3">
                            <Search className="w-8 h-8 text-slate-500 mx-auto" />
                            <h3 className="text-sm font-bold text-slate-300">No matching pages or modules found</h3>
                            <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                Try searching for another keyword like "quotes", "tools", "schedule", or "invoices".
                            </p>
                        </div>
                    ) : (
                        filteredCategories.map((category) => (
                            <div key={category.id} className="space-y-3">
                                <div className="flex items-center justify-between pb-1 border-b border-slate-800/70">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                            {category.title}
                                        </h3>
                                        <p className="text-[11px] text-slate-500">
                                            {category.tagline}
                                        </p>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-mono">
                                        {category.items.length} items
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                    {category.items.map((item) => {
                                        const Icon = item.icon;
                                        const fullPath = orgPath(item.path);
                                        const isActive = 
                                            item.path === '/' 
                                                ? location.pathname === '/' || location.pathname.endsWith('/dashboard')
                                                : location.pathname === item.path || location.pathname === fullPath || location.pathname.startsWith(item.path + '/');

                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => handleNavigate(item.path)}
                                                className={`text-left p-3 rounded-xl border transition-all flex items-start gap-3 group ${
                                                    isActive
                                                        ? 'bg-blue-600/20 border-blue-500/60 ring-1 ring-blue-500/30'
                                                        : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
                                                }`}
                                            >
                                                <div className={`p-2 rounded-lg shrink-0 transition-colors ${
                                                    isActive 
                                                        ? 'bg-blue-600 text-white' 
                                                        : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700 group-hover:text-white'
                                                }`}>
                                                    <Icon className="w-4 h-4" />
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                                        <span className={`text-xs font-bold truncate block ${
                                                            isActive ? 'text-white' : 'text-slate-200 group-hover:text-white'
                                                        }`}>
                                                            {item.title}
                                                        </span>
                                                        {item.badge && (
                                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                                                                {item.badge}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 line-clamp-1 group-hover:text-slate-300 leading-normal">
                                                        {item.description}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Controls: Layout Switcher & User Profile */}
                <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400 font-medium">Layout:</span>
                        <div className="inline-flex p-0.5 bg-slate-900 rounded-lg border border-slate-800">
                            {(['modern-hub', 'streamlined', 'compact-pro'] as LayoutMode[]).map((mode) => {
                                const active = layoutMode === mode;
                                const preset = LAYOUT_PRESETS[mode];
                                return (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setLayoutMode(mode)}
                                        className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                                            active
                                                ? 'bg-blue-600 text-white shadow-xs'
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                        title={preset.description}
                                    >
                                        {preset.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
                        <button
                            type="button"
                            onClick={() => handleNavigate('/settings?tab=layout')}
                            className="text-blue-400 hover:text-blue-300 font-bold inline-flex items-center gap-1 hover:underline"
                        >
                            <span>Layout Setup & Settings</span>
                            <ArrowRight className="w-3 h-3" />
                        </button>

                        <button
                            type="button"
                            onClick={async () => {
                                onClose();
                                await logout();
                                navigate('/login');
                            }}
                            className="text-slate-400 hover:text-rose-400 font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
