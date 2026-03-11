/**
 * CustomerPortalLogin - Login page for customer portal
 * Supports magic links, email/password, and adapts to org branding
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
    signInWithEmailAndPassword,
    isSignInWithEmailLink,
    signInWithEmailLink,
    sendSignInLinkToEmail
} from 'firebase/auth';
import { auth, db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Organization } from '../../types';
import toast from 'react-hot-toast';

export const CustomerPortalLogin: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const orgSlug = searchParams.get('org');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [showPasswordField, setShowPasswordField] = useState(false);
    const [magicLinkSent, setMagicLinkSent] = useState(false);

    // Handle magic link sign-in
    useEffect(() => {
        if (isSignInWithEmailLink(auth, window.location.href)) {
            let storedEmail = window.localStorage.getItem('portalSignInEmail');

            if (!storedEmail) {
                storedEmail = window.prompt('Please enter your email for confirmation');
            }

            if (storedEmail) {
                setLoading(true);
                signInWithEmailLink(auth, storedEmail, window.location.href)
                    .then(() => {
                        window.localStorage.removeItem('portalSignInEmail');
                        toast.success('Successfully signed in!');
                        navigate('/portal');
                    })
                    .catch((error) => {
                        toast.error('Failed to sign in with link');
                        console.error(error);
                    })
                    .finally(() => setLoading(false));
            }
        }
    }, [navigate]);

    // Load organization branding if org slug provided
    useEffect(() => {
        const loadOrg = async () => {
            if (!orgSlug) return;

            // In production, query by slug
            // For now, we'll just show default branding
            setOrganization({
                id: 'demo',
                name: 'Demo Organization',
                slug: orgSlug,
                inboundEmail: { autoReplyEnabled: false },
                outboundEmail: { fromName: 'Demo', fromEmail: 'demo@example.com' }
            });
        };

        loadOrg();
    }, [orgSlug]);

    const handleMagicLinkRequest = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email) {
            toast.error('Please enter your email');
            return;
        }

        setLoading(true);

        try {
            const actionCodeSettings = {
                url: `${window.location.origin}/portal/login${orgSlug ? `?org=${orgSlug}` : ''}`,
                handleCodeInApp: true
            };

            await sendSignInLinkToEmail(auth, email, actionCodeSettings);
            window.localStorage.setItem('portalSignInEmail', email);
            setMagicLinkSent(true);
            toast.success('Check your email for the sign-in link!');
        } catch (error: any) {
            toast.error(error.message || 'Failed to send sign-in link');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error('Please enter email and password');
            return;
        }

        setLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            toast.success('Successfully signed in!');
            navigate('/portal');
        } catch (error: any) {
            toast.error(error.message || 'Failed to sign in');
        } finally {
            setLoading(false);
        }
    };

    const primaryColor = organization?.branding?.primaryColor || '#3B82F6';

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex flex-col">
            {/* Header */}
            <header className="p-6">
                <div className="max-w-md mx-auto flex items-center gap-3">
                    {organization?.branding?.logoUrl ? (
                        <img
                            src={organization.branding.logoUrl}
                            alt={organization.name}
                            className="h-10 w-auto"
                        />
                    ) : (
                        <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xl"
                            style={{ backgroundColor: primaryColor }}
                        >
                            {organization?.name?.charAt(0) || 'P'}
                        </div>
                    )}
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">
                            {organization?.branding?.companyName || organization?.name || 'Customer Portal'}
                        </h1>
                        <p className="text-sm text-gray-500">Service History & Account</p>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-md">
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                        <div
                            className="h-2"
                            style={{ backgroundColor: primaryColor }}
                        />

                        <div className="p-8">
                            {magicLinkSent ? (
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
                                        </svg>
                                    </div>
                                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h2>
                                    <p className="text-gray-600 mb-6">
                                        We sent a sign-in link to <strong>{email}</strong>
                                    </p>
                                    <button
                                        onClick={() => setMagicLinkSent(false)}
                                        className="text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        Use a different email
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
                                    <p className="text-gray-600 mb-6">
                                        Sign in to view your service history, invoices, and more.
                                    </p>

                                    <form onSubmit={showPasswordField ? handlePasswordLogin : handleMagicLinkRequest}>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Email Address
                                                </label>
                                                <input
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    placeholder="you@example.com"
                                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                                    required
                                                />
                                            </div>

                                            {showPasswordField && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Password
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        placeholder="••••••••"
                                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                                        required
                                                    />
                                                </div>
                                            )}

                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className="w-full py-3 px-4 text-white font-semibold rounded-lg transition disabled:opacity-50"
                                                style={{ backgroundColor: primaryColor }}
                                            >
                                                {loading ? (
                                                    <span className="flex items-center justify-center gap-2">
                                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                        </svg>
                                                        Signing in...
                                                    </span>
                                                ) : showPasswordField ? (
                                                    'Sign In'
                                                ) : (
                                                    'Send Magic Link'
                                                )}
                                            </button>
                                        </div>
                                    </form>

                                    <div className="mt-6 text-center">
                                        <button
                                            onClick={() => setShowPasswordField(!showPasswordField)}
                                            className="text-sm text-gray-500 hover:text-gray-700"
                                        >
                                            {showPasswordField
                                                ? '← Use magic link instead'
                                                : 'Sign in with password instead'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Help Text */}
                    <p className="text-center text-sm text-gray-500 mt-6">
                        Don't have access? Contact your service provider to set up portal access.
                    </p>
                </div>
            </main>

            {/* Footer */}
            <footer className="p-6 text-center text-sm text-gray-400">
                <p>Powered by DispatchBox</p>
            </footer>
        </div>
    );
};
