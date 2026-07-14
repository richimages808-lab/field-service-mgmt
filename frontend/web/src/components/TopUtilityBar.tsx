import React, { useState, useRef, useEffect, useCallback } from 'react';
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
    Loader2,
    Key,
    ClipboardList,
    DollarSign,
    Users,
    FileText,
    SearchX,
} from 'lucide-react';
import { globalSearch, SearchResult, SearchResults, SearchResultCategory } from '../lib/globalSearchService';

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

// ─── Category Config ────────────────────────────────────
const CATEGORY_CONFIG: Record<SearchResultCategory, { label: string; icon: React.ReactNode }> = {
    tracking: { label: 'Tracking Codes', icon: <Key className="w-3.5 h-3.5" /> },
    jobs: { label: 'Jobs', icon: <ClipboardList className="w-3.5 h-3.5" /> },
    quotes: { label: 'Quotes', icon: <DollarSign className="w-3.5 h-3.5" /> },
    customers: { label: 'Customers', icon: <Users className="w-3.5 h-3.5" /> },
    invoices: { label: 'Invoices', icon: <FileText className="w-3.5 h-3.5" /> },
};

const CATEGORY_ORDER: SearchResultCategory[] = ['tracking', 'jobs', 'quotes', 'customers', 'invoices'];

// ─── Global Search Component ────────────────────────────
const GlobalSearchBar: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<SearchResults | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    const orgId = (user as any)?.org_id || '';
    const isSiteAdmin = user?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com';
    const isImpersonating = (user as any)?.impersonatingOrgId != null;

    // Don't show search for site admin in platform mode (no org context)
    const searchDisabled = isSiteAdmin && !isImpersonating && !orgId;

    // Flatten results into a single ordered array for keyboard navigation
    const flatResults = useCallback((): SearchResult[] => {
        if (!results) return [];
        const flat: SearchResult[] = [];
        for (const cat of CATEGORY_ORDER) {
            flat.push(...results[cat]);
        }
        return flat;
    }, [results]);

    // ⌘K / Ctrl+K shortcut to open
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(true);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Auto-focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            setSearchTerm('');
            setResults(null);
            setActiveIndex(-1);
        }
    }, [isOpen]);

    // Debounced search
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!searchTerm || searchTerm.trim().length < 2 || !orgId) {
            setResults(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await globalSearch(searchTerm, orgId);
                setResults(res);
                setActiveIndex(-1);
            } catch (err) {
                console.error('[GlobalSearch] Search failed:', err);
                setResults(null);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [searchTerm, orgId]);

    // Handle result selection
    const handleSelect = useCallback((result: SearchResult) => {
        setIsOpen(false);
        navigate(result.navigateTo);
    }, [navigate]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const flat = flatResults();
        if (e.key === 'Escape') {
            setIsOpen(false);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => Math.min(prev + 1, flat.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter' && activeIndex >= 0 && flat[activeIndex]) {
            e.preventDefault();
            handleSelect(flat[activeIndex]);
        }
    }, [flatResults, activeIndex, handleSelect]);

    // Close on overlay click
    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).classList.contains('global-search__overlay')) {
            setIsOpen(false);
        }
    }, []);

    if (searchDisabled) return null;

    // Determine platform (Mac vs Windows) for keyboard shortcut display
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    return (
        <div className="global-search">
            {/* Trigger button */}
            <button
                onClick={() => setIsOpen(true)}
                className="global-search__trigger"
                title="Search quotes, jobs, customers, tracking codes…"
            >
                <Search className="w-4 h-4" />
                <span className="global-search__trigger-text">Search…</span>
                <span className="global-search__trigger-kbd">
                    {isMac ? '⌘K' : 'Ctrl+K'}
                </span>
            </button>

            {/* Search overlay */}
            {isOpen && (
                <div className="global-search__overlay" onClick={handleOverlayClick}>
                    <div className="global-search__panel" onKeyDown={handleKeyDown}>
                        {/* Input row */}
                        <div className="global-search__input-row">
                            <Search />
                            <input
                                ref={inputRef}
                                type="text"
                                className="global-search__input"
                                placeholder="Search by tracking code, customer, quote #, job…"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            {isLoading && <Loader2 className="global-search__loading" />}
                        </div>

                        {/* Results */}
                        <div className="global-search__results">
                            {/* No query yet */}
                            {!searchTerm || searchTerm.trim().length < 2 ? (
                                <div className="global-search__empty">
                                    <Search className="global-search__empty-icon" />
                                    <p className="global-search__empty-title">Search across everything</p>
                                    <p className="global-search__empty-subtitle">
                                        Enter a tracking code (e.g. JXFQ5662), customer name, phone number, 
                                        quote number (Q-2026-...), or any keyword to find matching records.
                                    </p>
                                </div>
                            ) : results && results.totalCount === 0 && !isLoading ? (
                                /* No results */
                                <div className="global-search__empty">
                                    <SearchX className="global-search__empty-icon" />
                                    <p className="global-search__empty-title">No results found</p>
                                    <p className="global-search__empty-subtitle">
                                        No matches for "{searchTerm}" in jobs, quotes, customers, invoices, or tracking codes. 
                                        Try a different search term or check the spelling.
                                    </p>
                                </div>
                            ) : results && results.totalCount > 0 ? (
                                /* Grouped results */
                                (() => {
                                    let globalIdx = 0;
                                    return CATEGORY_ORDER.map(cat => {
                                        const items = results[cat];
                                        if (items.length === 0) return null;
                                        const config = CATEGORY_CONFIG[cat];
                                        return (
                                            <div key={cat} className="global-search__group">
                                                <div className="global-search__group-header">
                                                    {config.icon}
                                                    <span>{config.label}</span>
                                                    <span className="ml-auto text-slate-300">{items.length}</span>
                                                </div>
                                                {items.map((item) => {
                                                    const idx = globalIdx++;
                                                    return (
                                                        <div
                                                            key={`${cat}-${item.id}`}
                                                            className={`global-search__item ${idx === activeIndex ? 'global-search__item--active' : ''}`}
                                                            onClick={() => handleSelect(item)}
                                                            onMouseEnter={() => setActiveIndex(idx)}
                                                        >
                                                            <div className="global-search__item-content">
                                                                <div className="global-search__item-title">{item.title}</div>
                                                                <div className="global-search__item-subtitle">{item.subtitle}</div>
                                                            </div>
                                                            {item.status && (
                                                                <span
                                                                    className="global-search__item-status"
                                                                    style={{
                                                                        color: item.statusColor || '#6b7280',
                                                                        backgroundColor: `${item.statusColor || '#6b7280'}18`,
                                                                    }}
                                                                >
                                                                    {item.status}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    });
                                })()
                            ) : null}
                        </div>

                        {/* Footer with keyboard hints */}
                        <div className="global-search__footer">
                            <div className="global-search__footer-keys">
                                <span className="global-search__footer-key">
                                    <kbd>↑</kbd><kbd>↓</kbd> navigate
                                </span>
                                <span className="global-search__footer-key">
                                    <kbd>↵</kbd> open
                                </span>
                                <span className="global-search__footer-key">
                                    <kbd>esc</kbd> close
                                </span>
                            </div>
                            {results && results.totalCount > 0 && (
                                <span>{results.totalCount} result{results.totalCount !== 1 ? 's' : ''}</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

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
    const getBreadcrumbs = () => {
        const path = location.pathname;
        if (path === '/') return [{ label: 'Dashboard', path: '/' }];
        const segments = path.split('/').filter(Boolean);
        return segments.map((s, i) => ({
            label: s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            path: '/' + segments.slice(0, i + 1).join('/'),
        }));
    };

    const breadcrumbs = getBreadcrumbs();

    return (
        <header className="topbar">
            {/* Left — Breadcrumb */}
            <div className="topbar__left">
                {/* Spacer for mobile hamburger */}
                <div className="lg:hidden w-10" />
                <nav className="topbar__breadcrumb flex items-center gap-1.5">
                    {breadcrumbs.map((crumb, i) => (
                        <span key={crumb.path} className="flex items-center gap-1.5">
                            {i > 0 && <span className="text-slate-300">/</span>}
                            {i < breadcrumbs.length - 1 ? (
                                <Link
                                    to={crumb.path}
                                    className="text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    {crumb.label}
                                </Link>
                            ) : (
                                <span className="text-slate-700 font-medium">{crumb.label}</span>
                            )}
                        </span>
                    ))}
                </nav>
            </div>

            {/* Right — Actions */}
            <div className="topbar__right">
                {/* Global Search */}
                <GlobalSearchBar />

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
