import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { useOrgPath } from '../lib/orgRouting';
import { useLayoutMode } from '../context/LayoutModeContext';
import { useNavArchitecture } from '../context/NavigationArchitectureContext';
import {
    LayoutDashboard,
    Calendar,
    PlusCircle,
    FileText,
    Users,
    Database,
    LogOut,
    User,
    ChevronDown,
    ChevronRight,
    Settings,
    Inbox,
    BarChart2,
    Shield,
    ShoppingCart,
    Package,
    Wrench,
    Building2,
    PanelLeftClose,
    PanelLeft,
    ClipboardList,
    MapPin,
    MessageSquare,
    HeadphonesIcon,
    Bot,
    Mail,
    ClipboardCheck,
    Warehouse,
    CalendarCheck,
    Radio,
    Smartphone,
    type LucideIcon,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────
interface NavItem {
    name: string;
    path: string;
    icon: LucideIcon;
}

interface NavGroup {
    label: string;
    items: NavItem[];
    defaultOpen?: boolean;
}

// ─── Sidebar Component ─────────────────────────────────
export const Sidebar: React.FC = () => {
    const { user, logout, organization } = useAuth();
    const { hasFeature } = usePlanFeatures();
    const { orgSlug, orgPath } = useOrgPath();
    const location = useLocation();
    const navigate = useNavigate();
    const { layoutMode } = useLayoutMode();
    const { navArchitecture, getNavGroups: getArchNavGroups } = useNavArchitecture();

    // Persist collapsed state
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });

    // In Compact Pro Rail mode, sidebar operates in slim rail format
    const effectiveCollapsed = layoutMode === 'compact-pro' ? true : isCollapsed;

    // Track which groups are expanded (by label)
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const role = (user as any)?.role;
    const techType = (user as any)?.techType;
    const isSiteAdmin = user?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com';
    const isImpersonating = (user as any)?.impersonatingOrgId != null;

    // Persist collapse state
    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', String(isCollapsed));
    }, [isCollapsed]);

    // Auto-expand the group containing the active route
    useEffect(() => {
        const groups = getNavGroups();
        const activeGroup = groups.find(g =>
            g.items.some(item => isActive(item.path))
        );
        if (activeGroup) {
            setExpandedGroups(prev => new Set(prev).add(activeGroup.label));
        }
    }, [location.pathname, orgSlug]);

    const isActive = (path: string) => {
        const fullPath = orgPath(path);
        if (path === '/') {
            return location.pathname === '/' || location.pathname === `/${orgSlug}` || location.pathname === `/${orgSlug}/`;
        }
        return location.pathname === path || location.pathname.startsWith(path + '/') ||
               location.pathname === fullPath || location.pathname.startsWith(fullPath + '/');
    };

    const toggleGroup = (label: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    // ─── Build nav groups by role ───────────────────────
    const getNavGroups = (): NavGroup[] => {
        const enabledModules = organization?.settings?.enabledModules || {};

        const showComms = enabledModules.comms !== false;
        const showEmail = showComms && enabledModules.email !== false;
        const showSms = showComms && enabledModules.sms !== false;
        const showVoiceAgent = showComms && enabledModules.voiceAgent !== false;

        const showFinancial = enabledModules.financial !== false;
        const showInvoices = showFinancial && enabledModules.invoices !== false;
        const showQuotes = showFinancial && enabledModules.quotes !== false;

        const showInventory = enabledModules.inventory !== false;
        const showMaterials = showInventory && enabledModules.materials !== false;
        const showTools = showInventory && enabledModules.tools !== false;

        const showPurchaseOrders = enabledModules.purchaseOrders !== false;

        const showKanban = enabledModules.kanban !== false;
        const showCalendar = enabledModules.calendar !== false;
        const showDispatch = enabledModules.dispatch !== false;

        // Site Admin (non-impersonating)
        if (!isImpersonating && isSiteAdmin) {
            return [
                {
                    label: 'Platform',
                    defaultOpen: true,
                    items: [
                        { name: 'Dashboard', path: '/site-admin', icon: Shield },
                        { name: 'AI Voice', path: '/platform/ai-voice', icon: HeadphonesIcon },
                        { name: 'Tenants & Orgs', path: '/platform-organizations', icon: Building2 },
                        { name: 'Data Manager', path: '/data-manager', icon: Database },
                    ],
                },
            ];
        }

        // Admin / Dispatcher
        if (role === 'dispatcher' || role === 'admin') {
            const workItems: NavItem[] = [
                { name: 'Dashboard', path: '/', icon: LayoutDashboard },
                { name: 'Jobs', path: '/jobs', icon: ClipboardList },
            ];

            if (showFinancial && showQuotes) {
                workItems.push({ name: 'Quotes', path: '/quotes', icon: ClipboardList });
            }

            if (showCalendar) {
                workItems.push({ name: 'Calendar', path: '/calendar', icon: Calendar });
            }
            if (hasFeature('dispatcher_console') && showDispatch) {
                workItems.push({ name: 'Dispatch', path: '/dispatcher', icon: MapPin });
            }

            // Customers & Technicians folded into Work (most-used together)
            workItems.push({ name: 'Customers', path: '/contacts', icon: Users });
            if (hasFeature('team_management')) {
                workItems.push({ name: 'Technicians', path: '/techs', icon: User });
            }

            const commsItems: NavItem[] = [];
            if (showComms) {
                if (showEmail) commsItems.push({ name: 'Email', path: '/email', icon: Mail });
                if (showSms) commsItems.push({ name: 'Texting', path: '/admin/texting', icon: Smartphone });
                if (showSms) commsItems.push({ name: 'Communications', path: '/admin/communications', icon: MessageSquare });

            }

            const financialItems: NavItem[] = [];
            if (showFinancial) {
                if (showInvoices) financialItems.push({ name: 'Invoices', path: '/invoices', icon: FileText });
            }
            if (showPurchaseOrders) {
                financialItems.push({ name: 'Purchase Orders', path: '/purchase-orders', icon: ShoppingCart });
            }

            const inventoryItems: NavItem[] = [];
            if (showInventory) {
                if (showMaterials) inventoryItems.push({ name: 'Materials', path: '/materials', icon: Package });
                if (showTools) inventoryItems.push({ name: 'Tools', path: '/tools', icon: Wrench });
                inventoryItems.push({ name: 'Tag & Trackers', path: '/inventory/trackers', icon: Radio });
                inventoryItems.push({ name: 'Receiving', path: '/receiving', icon: ClipboardCheck });
                inventoryItems.push({ name: 'Warehousing', path: '/warehouse', icon: Warehouse });
            }

            const groups: NavGroup[] = [];
            if (workItems.length > 0) groups.push({ label: 'Work', items: workItems, defaultOpen: false });
            if (commsItems.length > 0) groups.push({ label: 'Comms', items: commsItems, defaultOpen: false });
            if (financialItems.length > 0) groups.push({ label: 'Financial', items: financialItems, defaultOpen: false });
            if (inventoryItems.length > 0) groups.push({ label: 'Inventory', items: inventoryItems, defaultOpen: false });

            return groups;
        }

        // Solo Technician
        if (role === 'technician' && techType === 'solopreneur') {
            const workItems: NavItem[] = [
                { name: 'Dashboard', path: '/', icon: LayoutDashboard },
            ];
            if (showFinancial && showQuotes) {
                workItems.push({ name: 'Quotes', path: '/quotes', icon: ClipboardList });
            }
            if (showCalendar) {
                workItems.push({ name: 'Calendar', path: '/calendar', icon: Calendar });
            }
            if (showComms && (showEmail || showSms)) {
                workItems.push({ name: 'Job Requests', path: '/job-intake', icon: Inbox });
            }

            // Customers folded into Work
            workItems.push({ name: 'Customers', path: '/contacts', icon: Users });

            const commsItems: NavItem[] = [];
            if (showComms) {
                if (showEmail) commsItems.push({ name: 'Email', path: '/email', icon: Mail });
                if (showSms) commsItems.push({ name: 'Texting', path: '/admin/texting', icon: Smartphone });
                if (showSms) commsItems.push({ name: 'Communications', path: '/admin/communications', icon: MessageSquare });

            }

            const financialItems: NavItem[] = [];
            if (showFinancial) {
                if (showInvoices) financialItems.push({ name: 'Invoices', path: '/invoices', icon: FileText });
            }
            if (showPurchaseOrders) {
                financialItems.push({ name: 'Purchase Orders', path: '/purchase-orders', icon: ShoppingCart });
            }

            const inventoryItems: NavItem[] = [];
            if (showInventory) {
                if (showMaterials) inventoryItems.push({ name: 'Materials', path: '/materials', icon: Package });
                if (showTools) inventoryItems.push({ name: 'Tools', path: '/tools', icon: Wrench });
                inventoryItems.push({ name: 'Tag & Trackers', path: '/inventory/trackers', icon: Radio });
            }

            const groups: NavGroup[] = [];
            if (workItems.length > 0) groups.push({ label: 'Work', items: workItems, defaultOpen: false });
            if (commsItems.length > 0) groups.push({ label: 'Comms', items: commsItems, defaultOpen: false });
            if (financialItems.length > 0) groups.push({ label: 'Financial', items: financialItems, defaultOpen: false });
            if (inventoryItems.length > 0) groups.push({ label: 'Inventory', items: inventoryItems, defaultOpen: false });

            return groups;
        }

        // Corporate Technician
        if (role === 'technician') {
            const workItems: NavItem[] = [
                { name: 'Job History', path: '/history', icon: FileText },
            ];
            if (showCalendar) {
                workItems.unshift({ name: 'My Schedule', path: '/', icon: Calendar });
            }
            if (hasFeature('dispatcher_console') && showDispatch) {
                workItems.push({ name: 'Team Map', path: '/dispatcher', icon: MapPin });
            }

            const purchaseItems: NavItem[] = [];
            if (showPurchaseOrders) {
                purchaseItems.push({ name: 'Purchase Orders', path: '/purchase-orders', icon: ShoppingCart });
            }

            const groups: NavGroup[] = [];
            if (workItems.length > 0) {
                groups.push({ label: 'Work', items: workItems, defaultOpen: false });
            }
            if (purchaseItems.length > 0) {
                groups.push({ label: 'Purchasing', items: purchaseItems, defaultOpen: false });
            }

            return groups;
        }

        return [];
    };

    // ─── Initialize expanded groups on mount ────────────
    useEffect(() => {
        const groups = getNavGroups();
        const defaults = new Set<string>();
        groups.forEach(g => { if (g.defaultOpen) defaults.add(g.label); });
        // Also expand the group containing the current route
        const activeGroup = groups.find(g => g.items.some(item => isActive(item.path)));
        if (activeGroup) defaults.add(activeGroup.label);
        setExpandedGroups(defaults);
    }, [role, techType, navArchitecture]);

    // ─── Use architecture groups when a sandbox option is active ───
    const groups = navArchitecture !== 'default'
        ? getArchNavGroups(role || '', hasFeature).map(g => ({
            label: g.label,
            items: g.items.map(item => ({ name: item.name, path: item.path, icon: item.icon })),
            defaultOpen: g.defaultOpen,
        }))
        : getNavGroups();

    // ─── Bottom nav items (always visible) ──────────────
    const getBottomItems = (): NavItem[] => {
        const items: NavItem[] = [
            { name: 'Reports', path: '/reports', icon: BarChart2 },
        ];

        if (role === 'admin' || role === 'dispatcher') {
            items.push({ name: 'Settings', path: '/settings', icon: Settings });
        }

        if (isSiteAdmin && !isImpersonating) {
            // Already in platform nav
        } else if (isSiteAdmin && isImpersonating) {
            items.push({ name: 'Platform Admin', path: '/site-admin', icon: Shield });
        }

        return items;
    };

    // When an architecture option is active, bottom items are already included in the groups
    const bottomItems = navArchitecture !== 'default' ? [] : getBottomItems();

    return (
        <aside
            className={`sidebar ${effectiveCollapsed ? 'sidebar--collapsed' : ''}`}
            onMouseEnter={() => {/* future: auto-expand on hover */}}
        >
            {/* Logo */}
            <div className="sidebar__logo">
                <Link to={orgPath('/')} className="flex items-center gap-2 no-underline">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">D</span>
                    </div>
                    {!effectiveCollapsed && (
                        <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-blue-200 whitespace-nowrap">
                            DispatchBox
                        </span>
                    )}
                </Link>
            </div>

            {/* New Job CTA — Hidden on /jobs page to maintain a single primary action on screen */}
            {(role !== 'technician' || techType === 'solopreneur') && !location.pathname.endsWith('/jobs') && location.pathname !== '/jobs' && (
                <div className="px-3 mb-2">
                    <button
                        onClick={() => navigate(orgPath('/jobs/new'))}
                        className={`sidebar__cta ${effectiveCollapsed ? 'sidebar__cta--collapsed' : ''}`}
                        title="Create New Job"
                    >
                        <PlusCircle className="w-4 h-4 flex-shrink-0" />
                        {!effectiveCollapsed && <span>New Job</span>}
                    </button>
                </div>
            )}

            {/* Scrollable nav groups */}
            <nav className="sidebar__nav">
                {groups.map((group) => (
                    <div key={group.label} className="sidebar__group">
                        {/* Group header — clickable to toggle, hidden when collapsed */}
                        {!effectiveCollapsed ? (
                            <button
                                onClick={() => toggleGroup(group.label)}
                                className="sidebar__group-header"
                            >
                                <span>{group.label}</span>
                                {expandedGroups.has(group.label) ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                )}
                            </button>
                        ) : (
                            <div className="sidebar__group-divider" />
                        )}

                        {/* Group items */}
                        {(effectiveCollapsed || expandedGroups.has(group.label)) && (
                            <ul className="sidebar__items">
                                {group.items.map((item) => {
                                    const Icon = item.icon;
                                    const active = isActive(item.path);
                                    return (
                                        <li key={item.path}>
                                            <Link
                                                to={orgPath(item.path)}
                                                className={`sidebar__link ${active ? 'sidebar__link--active' : ''}`}
                                                title={effectiveCollapsed ? item.name : undefined}
                                            >
                                                <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                                                {!effectiveCollapsed && (
                                                    <span className="sidebar__link-text">{item.name}</span>
                                                )}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                ))}
            </nav>

            {/* Bottom section */}
            <div className="sidebar__bottom">
                {/* Bottom nav items (Reports, Settings) */}
                <ul className="sidebar__items">
                    {bottomItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        return (
                            <li key={item.path}>
                                <Link
                                    to={orgPath(item.path)}
                                    className={`sidebar__link ${active ? 'sidebar__link--active' : ''}`}
                                    title={effectiveCollapsed ? item.name : undefined}
                                >
                                    <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                                    {!effectiveCollapsed && (
                                        <span className="sidebar__link-text">{item.name}</span>
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                    {/* Help link removed — accessible from TopUtilityBar help icon */}
                </ul>

                {/* Collapse toggle */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="sidebar__collapse-btn"
                    title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {effectiveCollapsed ? (
                        <PanelLeft className="w-[18px] h-[18px]" />
                    ) : (
                        <>
                            <PanelLeftClose className="w-[18px] h-[18px]" />
                            <span className="sidebar__link-text">Collapse</span>
                        </>
                    )}
                </button>

                {/* User profile */}
                <div className="sidebar__user">
                    <Link
                        to={role === 'technician' ? '/tech-profile' : '/profile'}
                        className="sidebar__user-link"
                        title={effectiveCollapsed ? (user?.email || 'Profile') : undefined}
                    >
                        <div className="sidebar__avatar">
                            <User className="w-4 h-4" />
                        </div>
                        {!effectiveCollapsed && (
                            <div className="sidebar__user-info">
                                <span className="sidebar__user-name">
                                    {user?.email?.split('@')[0]}
                                </span>
                                <span className="sidebar__user-role">
                                    {role?.replace('_', ' ')}
                                </span>
                            </div>
                        )}
                    </Link>
                    {!effectiveCollapsed && (
                        <button
                            onClick={handleLogout}
                            className="sidebar__logout-btn"
                            title="Sign out"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </aside>
    );
};

