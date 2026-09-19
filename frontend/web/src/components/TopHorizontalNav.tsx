import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useOrgPath } from '../lib/orgRouting';
import { useLayoutMode, LAYOUT_PRESETS } from '../context/LayoutModeContext';
import { useNavArchitecture, ARCHITECTURE_INFO, type NavArchitecture } from '../context/NavigationArchitectureContext';
import {
    LayoutDashboard,
    ClipboardList,
    Calendar,
    Users,
    MessageSquare,
    Package,
    BarChart2,
    Settings,
    Plus,
    Search,
    ChevronDown,
    User,
    LogOut,
    Sparkles,
    Shield,
    Check,
    Layers,
    MapPin,
    DollarSign,
    Zap
} from 'lucide-react';

interface NavSection {
    label: string;
    icon: React.ReactNode;
    primaryPath: string;
    matchPaths: string[];
    children?: { label: string; path: string; icon?: React.ReactNode }[];
}

export const TopHorizontalNav: React.FC = () => {
    const { user, logout, organization } = useAuth();
    const { orgSlug, orgPath } = useOrgPath();
    const { layoutMode, setLayoutMode } = useLayoutMode();
    const { navArchitecture, getNavGroups: getArchNavGroups } = useNavArchitecture();
    const location = useLocation();
    const navigate = useNavigate();

    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);
    const presetRef = useRef<HTMLDivElement>(null);

    const role = (user as any)?.role;
    const isSiteAdmin = user?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com';

    // Close menus on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpenDropdown(null);
            }
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
            if (presetRef.current && !presetRef.current.contains(event.target as Node)) {
                setIsPresetMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close on navigation
    useEffect(() => {
        setOpenDropdown(null);
        setIsProfileOpen(false);
        setIsPresetMenuOpen(false);
    }, [location.pathname]);

    const isCurrentPathActive = (matchPaths: string[]) => {
        return matchPaths.some(path => {
            const fullPath = orgPath(path);
            if (path === '/') {
                return location.pathname === '/' || location.pathname === `/${orgSlug}` || location.pathname === `/${orgSlug}/`;
            }
            return location.pathname === path || location.pathname.startsWith(path + '/') ||
                   location.pathname === fullPath || location.pathname.startsWith(fullPath + '/');
        });
    };

    // ── Build sections from architecture context when non-default ──
    const buildArchSections = (): NavSection[] => {
        const archGroups = getArchNavGroups(role || '', (_f: string) => true);
        return archGroups.map(group => {
            const FirstIcon = group.items[0]?.icon || LayoutDashboard;
            return {
                label: group.label,
                icon: <FirstIcon className="w-4 h-4" />,
                primaryPath: group.items[0]?.path || '/',
                matchPaths: group.items.map(i => i.path),
                children: group.items.map(i => {
                    const ItemIcon = i.icon;
                    return {
                        label: i.name,
                        path: i.path,
                        icon: <ItemIcon className="w-4 h-4" />,
                    };
                }),
            };
        });
    };

    const sections: NavSection[] = navArchitecture !== 'default' ? buildArchSections() : [
        {
            label: 'Dashboard',
            icon: <LayoutDashboard className="w-4 h-4" />,
            primaryPath: '/',
            matchPaths: ['/'],
        },
        {
            label: 'Jobs & Quotes',
            icon: <ClipboardList className="w-4 h-4" />,
            primaryPath: '/jobs',
            matchPaths: ['/jobs', '/quotes', '/quotes/new', '/jobs/new', '/kanban', '/job-prep'],
            children: [
                { label: 'All Jobs', path: '/jobs' },
                { label: 'Quotes & Estimates', path: '/quotes' },
                { label: 'Create New Job', path: '/jobs/new' },
                { label: 'Create Quote', path: '/quotes/new' },
            ]
        },
        {
            label: 'Dispatch & Map',
            icon: <MapPin className="w-4 h-4" />,
            primaryPath: '/dispatch',
            matchPaths: ['/dispatch', '/schedule', '/calendar', '/scheduling-rules'],
            children: [
                { label: 'Dispatcher Console & Map', path: '/dispatch' },
                { label: 'Schedule Board', path: '/schedule' },
                { label: 'Calendar View', path: '/calendar' },
                { label: 'Scheduling Rules', path: '/scheduling-rules' },
            ]
        },
        {
            label: 'Customers & Team',
            icon: <Users className="w-4 h-4" />,
            primaryPath: '/customers',
            matchPaths: ['/customers', '/technicians', '/history'],
            children: [
                { label: 'Customer Directory', path: '/customers' },
                { label: 'Technicians & Fleet', path: '/technicians' },
                { label: 'Service History', path: '/history' },
            ]
        },
        {
            label: 'Comms Hub',
            icon: <MessageSquare className="w-4 h-4" />,
            primaryPath: '/texting',
            matchPaths: ['/texting', '/email', '/admin/ai-phone-agent', '/admin/communications'],
            children: [
                { label: 'Texting Hub (SMS)', path: '/texting' },
                { label: 'Email Inbox', path: '/email' },
                { label: 'AI Voice Phone Agent', path: '/admin/ai-phone-agent' },
                { label: 'Communications Portal', path: '/admin/communications' },
            ]
        },
        {
            label: 'Inventory & Parts',
            icon: <Package className="w-4 h-4" />,
            primaryPath: '/materials',
            matchPaths: ['/materials', '/tools', '/warehouse', '/tags', '/purchase-orders'],
            children: [
                { label: 'Materials Inventory', path: '/materials' },
                { label: 'Tools & Equipment', path: '/tools' },
                { label: 'Warehouse & Receiving', path: '/warehouse' },
                { label: 'Tags & Bluetooth Trackers', path: '/tags' },
                { label: 'Purchase Orders', path: '/purchase-orders' },
            ]
        },
        {
            label: 'Invoices & Reports',
            icon: <BarChart2 className="w-4 h-4" />,
            primaryPath: '/invoices',
            matchPaths: ['/invoices', '/reports', '/master-orders'],
            children: [
                { label: 'Invoices & Billing', path: '/invoices' },
                { label: 'Performance Reports', path: '/reports' },
                { label: 'Master Order Review', path: '/master-orders' },
            ]
        },
        {
            label: 'Settings',
            icon: <Settings className="w-4 h-4" />,
            primaryPath: '/settings',
            matchPaths: ['/settings', '/admin/integrations', '/admin/services', '/addons'],
            children: [
                { label: 'Organization Settings', path: '/settings' },
                { label: 'Services Catalog', path: '/admin/services' },
                { label: 'Integrations & Payments', path: '/admin/integrations' },
                { label: 'Add-ons & Modules', path: '/addons' },
            ]
        },
    ];

    const activeSection = sections.find(s => isCurrentPathActive(s.matchPaths));

    return (
        <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-md">
            {/* Top Workspace Navigation Bar */}
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
                {/* Brand Logo & Tag */}
                <div className="flex items-center gap-6">
                    <Link to={orgPath('/')} className="flex items-center gap-2.5 group">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold text-base shadow-sm group-hover:shadow-blue-500/25 transition-all">
                            D
                        </div>
                        <span className="font-bold text-base tracking-tight text-white group-hover:text-blue-200 transition-colors">
                            DispatchBox
                        </span>
                    </Link>

                    {/* Horizontal Main Tabs */}
                    <nav className="hidden lg:flex items-center gap-1" ref={dropdownRef}>
                        {sections.map((sec) => {
                            const active = isCurrentPathActive(sec.matchPaths);
                            const hasChildren = sec.children && sec.children.length > 0;
                            const isDropdownOpen = openDropdown === sec.label;

                            return (
                                <div key={sec.label} className="relative">
                                    <div className="flex items-center">
                                        <Link
                                            to={orgPath(sec.primaryPath)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                                active
                                                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                                                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                                            }`}
                                        >
                                            {sec.icon}
                                            <span>{sec.label}</span>
                                        </Link>

                                        {hasChildren && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setOpenDropdown(isDropdownOpen ? null : sec.label);
                                                }}
                                                className={`p-1 -ml-1.5 rounded-r-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${
                                                    active ? 'text-white' : ''
                                                }`}
                                            >
                                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Dropdown Menu */}
                                    {isDropdownOpen && hasChildren && (
                                        <div className="absolute top-full left-0 mt-1 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                            {sec.children!.map((child) => (
                                                <Link
                                                    key={child.path}
                                                    to={orgPath(child.path)}
                                                    onClick={() => setOpenDropdown(null)}
                                                    className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/90 transition-colors"
                                                >
                                                    {child.label}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </nav>
                </div>

                {/* Right Side Utility Actions */}
                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Quick + New Job CTA */}
                    <button
                        onClick={() => navigate(orgPath('/jobs/new'))}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">New Job</span>
                    </button>


                    {/* Profile Dropdown */}
                    <div className="relative" ref={profileRef}>
                        <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="flex items-center gap-1.5 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                                {user?.email?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:block" />
                        </button>

                        {isProfileOpen && (
                            <div className="absolute top-full right-0 mt-1 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 z-50">
                                <div className="px-3.5 py-2 border-b border-slate-800">
                                    <p className="text-xs font-semibold text-white truncate">{user?.email}</p>
                                    <p className="text-[10px] text-slate-400 capitalize">{role?.replace('_', ' ') || 'User'}</p>
                                </div>
                                <Link
                                    to={orgPath(role === 'technician' ? '/tech-profile' : '/profile')}
                                    className="flex items-center gap-2 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                                >
                                    <User className="w-3.5 h-3.5" /> Profile
                                </Link>
                                <Link
                                    to={orgPath('/settings')}
                                    className="flex items-center gap-2 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                                >
                                    <Settings className="w-3.5 h-3.5" /> Organization Settings
                                </Link>
                                <button
                                    onClick={logout}
                                    className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border-t border-slate-800 mt-1"
                                >
                                    <LogOut className="w-3.5 h-3.5" /> Sign out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sub-Context Pill Strip for Active Section */}
            {activeSection && activeSection.children && activeSection.children.length > 0 && (
                <div className="bg-slate-950/90 border-t border-slate-800/80 px-4 sm:px-6 py-1.5">
                    <div className="max-w-[1600px] mx-auto flex items-center gap-2 overflow-x-auto scrollbar-none">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-2 shrink-0">
                            {activeSection.label}:
                        </span>
                        {activeSection.children.map((sub) => {
                            const subActive = location.pathname === sub.path || location.pathname === orgPath(sub.path);
                            return (
                                <Link
                                    key={sub.path}
                                    to={orgPath(sub.path)}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
                                        subActive
                                            ? 'bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/40'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                                    }`}
                                >
                                    {sub.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </header>
    );
};
