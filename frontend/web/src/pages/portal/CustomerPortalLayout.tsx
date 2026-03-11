/**
 * CustomerPortalLayout - Wrapper layout for customer portal pages
 * Adapts to organization branding and size (solo tech vs enterprise)
 */

import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { auth, db } from '../../firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Organization, Customer } from '../../types';
import toast from 'react-hot-toast';

interface PortalContext {
    organization: Organization | null;
    customer: Customer | null;
    loading: boolean;
}

export const CustomerPortalLayout: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [organization, setOrganization] = useState<Organization | null>(null);
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Load organization and customer data
    useEffect(() => {
        const loadData = async () => {
            if (!user) {
                setLoading(false);
                return;
            }

            try {
                // Get user's org and customer from custom claims or user doc
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (!userDoc.exists()) {
                    console.warn('No user document found');
                    setLoading(false);
                    return;
                }

                const userData = userDoc.data();
                const orgId = userData.org_id;
                const customerId = userData.customer_id;

                // Load organization
                if (orgId) {
                    const orgDoc = await getDoc(doc(db, 'organizations', orgId));
                    if (orgDoc.exists()) {
                        setOrganization({ id: orgDoc.id, ...orgDoc.data() } as Organization);
                    }
                }

                // Load customer profile
                if (customerId) {
                    const custDoc = await getDoc(doc(db, 'customers', customerId));
                    if (custDoc.exists()) {
                        setCustomer({ id: custDoc.id, ...custDoc.data() } as Customer);
                    }
                }
            } catch (error) {
                console.error('Error loading portal data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [user]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            toast.success('Logged out successfully');
            navigate('/portal/login');
        } catch (error) {
            toast.error('Failed to log out');
        }
    };

    const primaryColor = organization?.branding?.primaryColor || '#3B82F6';
    const companyName = organization?.branding?.companyName || organization?.name || 'Service Portal';

    // Navigation items
    const navItems = [
        { path: '/portal', label: 'Dashboard', icon: '🏠' },
        { path: '/portal/jobs', label: 'My Jobs', icon: '📋' },
        { path: '/portal/quotes', label: 'Quotes', icon: '📄' },
        { path: '/portal/invoices', label: 'Invoices', icon: '💰' },
        { path: '/portal/messages', label: 'Messages', icon: '💬' },
        { path: '/portal/settings', label: 'Settings', icon: '⚙️' },
    ];

    const isActivePath = (path: string) => {
        if (path === '/portal') {
            return location.pathname === '/portal';
        }
        return location.pathname.startsWith(path);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading your portal...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top Header */}
            <header className="bg-white shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        {/* Logo / Brand */}
                        <Link to="/portal" className="flex items-center gap-3">
                            {organization?.branding?.logoUrl ? (
                                <img
                                    src={organization.branding.logoUrl}
                                    alt={companyName}
                                    className="h-8 w-auto"
                                />
                            ) : (
                                <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    {companyName.charAt(0)}
                                </div>
                            )}
                            <span className="font-semibold text-gray-900 hidden sm:block">
                                {companyName}
                            </span>
                        </Link>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center gap-1">
                            {navItems.map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${isActivePath(item.path)
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-gray-600 hover:bg-gray-100'
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>

                        {/* User Menu */}
                        <div className="flex items-center gap-4">
                            <div className="hidden sm:block text-right">
                                <p className="text-sm font-medium text-gray-900">
                                    {customer?.name || user?.email}
                                </p>
                                {customer?.companyName && (
                                    <p className="text-xs text-gray-500">{customer.companyName}</p>
                                )}
                            </div>

                            <button
                                onClick={handleLogout}
                                className="text-gray-500 hover:text-gray-700 text-sm"
                            >
                                Sign Out
                            </button>

                            {/* Mobile Menu Button */}
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="md:hidden p-2 rounded-lg hover:bg-gray-100"
                            >
                                <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    {mobileMenuOpen ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    )}
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Navigation */}
                {mobileMenuOpen && (
                    <div className="md:hidden border-t bg-white">
                        <nav className="p-4 space-y-1">
                            {navItems.map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${isActivePath(item.path)
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-gray-600 hover:bg-gray-100'
                                        }`}
                                >
                                    <span>{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                )}
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <Outlet context={{ organization, customer, loading } as PortalContext} />
            </main>

            {/* Footer */}
            <footer className="bg-white border-t mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                        <p className="text-sm text-gray-500">
                            © {new Date().getFullYear()} {companyName}. All rights reserved.
                        </p>
                        <div className="flex gap-4 text-sm">
                            <Link to="/portal/privacy" className="text-gray-500 hover:text-gray-700">
                                Privacy & Data
                            </Link>
                            <Link to="/portal/settings" className="text-gray-500 hover:text-gray-700">
                                Account Settings
                            </Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

// Hook to access portal context in child components
import { useOutletContext } from 'react-router-dom';

export function usePortalContext() {
    return useOutletContext<PortalContext>();
}
