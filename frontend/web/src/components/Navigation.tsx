import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import {
    LayoutDashboard,
    Calendar,
    PlusCircle,
    FileText,
    Users,
    Database,
    LogOut,
    HelpCircle,
    User,
    Menu,
    X,
    ChevronDown,
    Settings,
    Inbox,
    BarChart2,
    Shield,
    Puzzle,
    Zap,
    ShoppingCart,
    Package,
    Wrench,
    Building2
} from 'lucide-react';

export const Navigation: React.FC = () => {
    const { user, logout } = useAuth();
    const { hasFeature } = usePlanFeatures();
    const location = useLocation();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    const role = (user as any)?.role;
    const techType = (user as any)?.techType;

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const isActive = (path: string) => location.pathname === path;

    const getLinks = () => {
        if (user?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com') {
            return [
                { name: 'Platform Dashboard', path: '/site-admin', icon: Shield },
                { name: 'Tenants & Orgs', path: '/platform-organizations', icon: Building2 },
                { name: 'Data Manager', path: '/data-manager', icon: Database },
            ];
        }

        if (role === 'dispatcher' || role === 'admin') {
            const links = [
                { name: 'Dashboard', path: '/', icon: LayoutDashboard },
                { name: 'New Job', path: '/jobs/new', icon: PlusCircle },
                { name: 'Invoices', path: '/invoices', icon: FileText },
                { name: 'Purchasing', path: '/purchase-orders', icon: ShoppingCart },
                { name: 'Materials', path: '/materials', icon: Package },
                { name: 'Tools', path: '/tools', icon: Wrench },
                { name: 'Reports', path: '/reports', icon: BarChart2 },
                { name: 'Customers', path: '/contacts', icon: Users },
                { name: 'Data Manager', path: '/data-manager', icon: Database },
            ];

            // Only show dispatcher console and team management for plans that support it
            if (hasFeature('dispatcher_console')) {
                links.splice(1, 0, { name: 'Calendar', path: '/calendar', icon: Calendar });
            }
            if (hasFeature('team_management')) {
                links.push({ name: 'Techs', path: '/techs', icon: Users });
            }

            return links;
        }

        if (role === 'technician') {
            if (techType === 'solopreneur') {
                return [
                    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
                    { name: 'Job Requests', path: '/job-intake', icon: Inbox },
                    { name: 'My Calendar', path: '/solo-calendar', icon: Calendar },
                    { name: 'New Job', path: '/jobs/new', icon: PlusCircle },
                    { name: 'Materials', path: '/materials', icon: Package },
                    { name: 'Tools', path: '/tools', icon: Wrench },
                    { name: 'Purchasing', path: '/purchase-orders', icon: ShoppingCart },
                    { name: 'Invoices', path: '/invoices', icon: FileText },
                    { name: 'Reports', path: '/reports', icon: BarChart2 },
                    { name: 'Customers', path: '/contacts', icon: Users },
                ];
            }
            // Standard Technician
            const techLinks = [
                { name: 'My Schedule', path: '/', icon: Calendar },
                { name: 'Purchasing', path: '/purchase-orders', icon: ShoppingCart },
                { name: 'History', path: '/history', icon: FileText },
            ];

            // Only show team map if dispatcher console is available
            if (hasFeature('dispatcher_console')) {
                techLinks.splice(1, 0, { name: 'Team Map', path: '/dispatcher', icon: Users });
            }

            return techLinks;
        }

        return [];
    };

    const links = getLinks();

    return (
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    {/* Logo and Desktop Nav */}
                    <div className="flex">
                        <div className="flex-shrink-0 flex items-center">
                            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-blue-600">
                                DispatchBox
                            </span>
                        </div>
                        <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                            {links.map((link) => {
                                const Icon = link.icon;
                                return (
                                    <Link
                                        key={link.path}
                                        to={link.path}
                                        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200
                                            ${isActive(link.path)
                                                ? 'border-blue-500 text-gray-900'
                                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4 mr-2" />
                                        {link.name}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Side: Help & Profile */}
                    <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-4">
                        <button
                            onClick={() => navigate('/help')}
                            className="p-1 rounded-full text-gray-400 hover:text-blue-500 focus:outline-none transition"
                            title="Help Center"
                        >
                            <span className="sr-only">Help</span>
                            <HelpCircle className="h-6 w-6" />
                        </button>

                        {/* Profile Dropdown */}
                        <div className="ml-3 relative">
                            <div>
                                <button
                                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                                    className="max-w-xs bg-white flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                    <span className="sr-only">Open user menu</span>
                                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                        <User className="h-5 w-5" />
                                    </div>
                                    <span className="ml-2 text-gray-700 font-medium hidden md:block">
                                        {user?.email?.split('@')[0]}
                                    </span>
                                    <ChevronDown className="ml-1 h-4 w-4 text-gray-400 hidden md:block" />
                                </button>
                            </div>

                            {isProfileOpen && (
                                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
                                    <div className="px-4 py-2 border-b border-gray-100">
                                        <p className="text-sm text-gray-500">Signed in as</p>
                                        <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
                                        <p className="text-xs text-gray-400 mt-1 capitalize">{role?.replace('_', ' ')}</p>
                                    </div>
                                    <Link
                                        to={role === 'technician' ? '/tech-profile' : '/profile'}
                                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        onClick={() => setIsProfileOpen(false)}
                                    >
                                        <User className="w-4 h-4" />
                                        Your Profile
                                    </Link>
                                    {(role === 'admin' || role === 'dispatcher') && (
                                        <Link
                                            to="/settings"
                                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                            onClick={() => setIsProfileOpen(false)}
                                        >
                                            <Settings className="w-4 h-4" />
                                            Organization Settings
                                        </Link>
                                    )}
                                    {(role === 'admin' || role === 'dispatcher') && (
                                        <Link
                                            to="/addons"
                                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                            onClick={() => setIsProfileOpen(false)}
                                        >
                                            <Zap className="w-4 h-4" />
                                            Add-ons & Services
                                        </Link>
                                    )}
                                    <Link
                                        to="/help"
                                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        onClick={() => setIsProfileOpen(false)}
                                    >
                                        <HelpCircle className="w-4 h-4" />
                                        Help Center
                                    </Link>
                                    {(user?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com') && (
                                        <Link
                                            to="/site-admin"
                                            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                            onClick={() => setIsProfileOpen(false)}
                                        >
                                            <Shield className="w-4 h-4" />
                                            Site Admin
                                        </Link>
                                    )}
                                    <button
                                        onClick={handleLogout}
                                        className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile menu button */}
                    <div className="-mr-2 flex items-center sm:hidden">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                        >
                            <span className="sr-only">Open main menu</span>
                            {isMobileMenuOpen ? (
                                <X className="block h-6 w-6" />
                            ) : (
                                <Menu className="block h-6 w-6" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
                <div className="sm:hidden">
                    <div className="pt-2 pb-3 space-y-1">
                        {links.map((link) => {
                            const Icon = link.icon;
                            return (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    className={`flex items-center pl-3 pr-4 py-2 border-l-4 text-base font-medium
                                        ${isActive(link.path)
                                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                                            : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700'
                                        }`}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    <Icon className="w-5 h-5 mr-3" />
                                    {link.name}
                                </Link>
                            );
                        })}
                    </div>
                    <div className="pt-4 pb-4 border-t border-gray-200">
                        <div className="flex items-center px-4">
                            <div className="flex-shrink-0">
                                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                    <User className="h-6 w-6" />
                                </div>
                            </div>
                            <div className="ml-3">
                                <div className="text-base font-medium text-gray-800">{user?.email?.split('@')[0]}</div>
                                <div className="text-sm font-medium text-gray-500">{user?.email}</div>
                            </div>
                        </div>
                        <div className="mt-3 space-y-1">
                            <Link
                                to={role === 'technician' ? '/tech-profile' : '/profile'}
                                className="flex items-center px-4 py-2 text-base font-medium text-gray-600 hover:bg-gray-100"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <User className="w-5 h-5 mr-3" />
                                Profile
                            </Link>
                            {(role === 'admin' || role === 'dispatcher') && (
                                <Link
                                    to="/settings"
                                    className="flex items-center px-4 py-2 text-base font-medium text-gray-600 hover:bg-gray-100"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    <Settings className="w-5 h-5 mr-3" />
                                    Settings
                                </Link>
                            )}
                            {(role === 'admin' || role === 'dispatcher') && (
                                <Link
                                    to="/addons"
                                    className="flex items-center px-4 py-2 text-base font-medium text-gray-600 hover:bg-gray-100"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    <Zap className="w-5 h-5 mr-3" />
                                    Add-ons & Services
                                </Link>
                            )}
                            <Link
                                to="/help"
                                className="flex items-center px-4 py-2 text-base font-medium text-gray-600 hover:bg-gray-100"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <HelpCircle className="w-5 h-5 mr-3" />
                                Help Center
                            </Link>
                            <button
                                onClick={handleLogout}
                                className="flex w-full items-center px-4 py-2 text-base font-medium text-red-600 hover:text-red-800 hover:bg-gray-100"
                            >
                                <LogOut className="w-5 h-5 mr-3" />
                                Sign out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
};
