import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
    Bell,
    Search,
    HelpCircle,
    User,
    ChevronDown,
    Settings,
    Zap,
    LogOut,
    Shield,
    Menu,
    X,
} from 'lucide-react';

// ─── Mobile Sidebar Drawer ─────────────────────────────
// Used only on small screens as a slide-out overlay
export const MobileSidebarTrigger: React.FC<{
    isOpen: boolean;
    onToggle: () => void;
}> = ({ isOpen, onToggle }) => (
    <button
        onClick={onToggle}
        className="lg:hidden fixed top-3 left-3 z-[60] p-2 rounded-lg bg-white shadow-md border border-slate-200 hover:bg-slate-50 transition-colors"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
    >
        {isOpen ? <X className="w-5 h-5 text-slate-700" /> : <Menu className="w-5 h-5 text-slate-700" />}
    </button>
);

// ─── Top Utility Bar ────────────────────────────────────
// Slim bar across the top of the content area with search, notifications, profile
export const TopUtilityBar: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    const role = (user as any)?.role;
    const isSiteAdmin = user?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com';

    // Close profile dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setIsProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Close on route change
    useEffect(() => {
        setIsProfileOpen(false);
    }, [location.pathname]);

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    // Build breadcrumb from pathname
    const getBreadcrumb = () => {
        const path = location.pathname;
        if (path === '/') return 'Dashboard';
        const segments = path.split('/').filter(Boolean);
        return segments.map(s =>
            s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        ).join(' / ');
    };

    return (
        <header className="topbar">
            {/* Left — Breadcrumb */}
            <div className="topbar__left">
                {/* Spacer for mobile hamburger */}
                <div className="lg:hidden w-10" />
                <span className="topbar__breadcrumb">
                    {getBreadcrumb()}
                </span>
            </div>

            {/* Right — Actions */}
            <div className="topbar__right">
                {/* Notification bell (placeholder for future) */}
                <button
                    className="topbar__icon-btn"
                    title="Notifications"
                >
                    <Bell className="w-5 h-5" />
                    {/* Badge dot — uncomment when notifications are live */}
                    {/* <span className="topbar__badge" /> */}
                </button>

                {/* Help */}
                <button
                    onClick={() => navigate('/help')}
                    className="topbar__icon-btn"
                    title="Help Center"
                >
                    <HelpCircle className="w-5 h-5" />
                </button>

                {/* Profile dropdown */}
                <div className="relative" ref={profileRef}>
                    <button
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="topbar__profile-btn"
                    >
                        <div className="topbar__avatar">
                            <User className="w-4 h-4" />
                        </div>
                        <span className="hidden md:block text-sm font-medium text-slate-700 max-w-[120px] truncate">
                            {user?.email?.split('@')[0]}
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform hidden md:block ${isProfileOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isProfileOpen && (
                        <div className="topbar__dropdown">
                            <div className="px-4 py-3 border-b border-slate-100">
                                <p className="text-xs text-slate-400 uppercase tracking-wider">Signed in as</p>
                                <p className="text-sm font-medium text-slate-800 truncate mt-0.5">{user?.email}</p>
                                <p className="text-xs text-slate-500 mt-0.5 capitalize">{role?.replace('_', ' ')}</p>
                            </div>

                            <div className="py-1">
                                <Link
                                    to={role === 'technician' ? '/tech-profile' : '/profile'}
                                    className="topbar__dropdown-item"
                                    onClick={() => setIsProfileOpen(false)}
                                >
                                    <User className="w-4 h-4" />
                                    Your Profile
                                </Link>

                                {(role === 'admin' || role === 'dispatcher') && (
                                    <>
                                        <Link
                                            to="/settings"
                                            className="topbar__dropdown-item"
                                            onClick={() => setIsProfileOpen(false)}
                                        >
                                            <Settings className="w-4 h-4" />
                                            Organization Settings
                                        </Link>
                                        <Link
                                            to="/addons"
                                            className="topbar__dropdown-item"
                                            onClick={() => setIsProfileOpen(false)}
                                        >
                                            <Zap className="w-4 h-4" />
                                            Add-ons & Services
                                        </Link>
                                    </>
                                )}

                                {isSiteAdmin && (
                                    <Link
                                        to="/site-admin"
                                        className="topbar__dropdown-item"
                                        onClick={() => setIsProfileOpen(false)}
                                    >
                                        <Shield className="w-4 h-4" />
                                        Platform Admin
                                    </Link>
                                )}
                            </div>

                            <div className="border-t border-slate-100 py-1">
                                <button
                                    onClick={handleLogout}
                                    className="topbar__dropdown-item topbar__dropdown-item--danger"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};
