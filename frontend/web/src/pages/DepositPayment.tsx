import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
    Loader2,
    CheckCircle,
    Shield,
    CreditCard,
    AlertTriangle,
    FileText,
    ArrowLeft,
    Clock
} from 'lucide-react';

interface QuoteData {
    id: string;
    quoteNumber: string;
    org_id: string;
    job_id: string;
    customer_id: string;
    scopeOfWork: string;
    total: number;
    status: string;
    depositCondition?: string;
    agreement: {
        requiresDeposit: boolean;
        depositAmount?: number;
        depositPaid?: boolean;
        depositPaidAt?: any;
        depositCheckoutSessionId?: string;
        depositPaymentUrl?: string;
    };
    customer?: {
        name?: string;
        email?: string;
        phone?: string;
    };
}

interface OrgData {
    name: string;
    branding?: {
        primaryColor?: string;
        logoUrl?: string;
    };
    settings?: {
        upfrontPaymentPolicy?: {
            disclaimerText?: string;
        };
    };
}

export const DepositPayment: React.FC = () => {
    const { quoteId } = useParams<{ quoteId: string }>();
    const [searchParams] = useSearchParams();
    const [quote, setQuote] = useState<QuoteData | null>(null);
    const [org, setOrg] = useState<OrgData | null>(null);
    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState('');

    const status = searchParams.get('status'); // 'success' or 'cancelled'

    // Load quote + org data
    useEffect(() => {
        if (!quoteId) return;

        const fetchData = async () => {
            try {
                const quoteSnap = await getDoc(doc(db, 'quotes', quoteId));
                if (!quoteSnap.exists()) {
                    setError('Quote not found. Please check your link and try again.');
                    setLoading(false);
                    return;
                }

                const quoteData = { id: quoteSnap.id, ...quoteSnap.data() } as QuoteData;
                setQuote(quoteData);

                // Load org
                if (quoteData.org_id) {
                    const orgSnap = await getDoc(doc(db, 'organizations', quoteData.org_id));
                    if (orgSnap.exists()) {
                        setOrg(orgSnap.data() as OrgData);
                    }
                }
            } catch (err) {
                console.error('Error loading payment data:', err);
                setError('Failed to load payment information. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [quoteId]);

    // Real-time listener for deposit status (auto-updates when webhook fires)
    useEffect(() => {
        if (!quoteId) return;

        const unsubscribe = onSnapshot(doc(db, 'quotes', quoteId), (snap) => {
            if (snap.exists()) {
                const data = { id: snap.id, ...snap.data() } as QuoteData;
                setQuote(data);
            }
        });

        return () => unsubscribe();
    }, [quoteId]);


    const primaryColor = org?.branding?.primaryColor || '#6366f1';
    const companyName = org?.name || 'Service Provider';
    const disclaimer = org?.settings?.upfrontPaymentPolicy?.disclaimerText ||
        'This deposit is non-refundable if services are cancelled within 24 hours of the scheduled appointment. Deposit amount will be deducted from your final invoice.';
    const isPaidEstimate = quote?.depositCondition === 'paid_estimate';
    const depositLabel = isPaidEstimate ? 'Paid Estimate Fee' : 'Deposit';
    const isDepositPaid = quote?.agreement?.depositPaid;

    const rawDepositAmount = quote?.agreement?.depositAmount || 0;
    const effectiveDepositAmount = isPaidEstimate
        ? rawDepositAmount
        : Math.min(rawDepositAmount, quote?.total || 0);

    const handlePay = useCallback(async () => {
        if (!quoteId || paying) return;
        setPaying(true);
        setError('');

        try {
            // Fast path: if quote already has a valid checkout URL and stored deposit amount matches effective deposit
            if (quote?.agreement?.depositPaymentUrl && quote?.agreement?.depositAmount === effectiveDepositAmount) {
                window.location.href = quote.agreement.depositPaymentUrl;
                return;
            }

            const functions = getFunctions();
            const createDepositCheckout = httpsCallable(functions, 'createDepositCheckout');
            const result = await createDepositCheckout({ quoteId });
            const data = result.data as { url: string; sessionId: string };

            if (data.url) {
                window.location.href = data.url;
            } else {
                setError('Failed to create payment session. Please try again.');
            }
        } catch (err: any) {
            console.error('Checkout error:', err);
            const msg = err?.message || err?.details || 'An error occurred. Please try again.';
            if (msg.includes('already been paid')) {
                // Refresh quote data
                const quoteSnap = await getDoc(doc(db, 'quotes', quoteId));
                if (quoteSnap.exists()) {
                    setQuote({ id: quoteSnap.id, ...quoteSnap.data() } as QuoteData);
                }
            } else {
                setError(msg);
            }
        } finally {
            setPaying(false);
        }
    }, [quoteId, paying, quote, effectiveDepositAmount]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-500">Loading payment details...</p>
                </div>
            </div>
        );
    }

    if (error && !quote) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
                    <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Payment Error</h1>
                    <p className="text-gray-600">{error}</p>
                </div>
            </div>
        );
    }

    // Success state (from Stripe redirect OR real-time update)
    if (status === 'success' || isDepositPaid) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
                    <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
                         style={{ backgroundColor: `${primaryColor}15` }}>
                        <CheckCircle className="w-10 h-10" style={{ color: primaryColor }} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Received!</h1>
                    <p className="text-gray-600 mb-6">
                        Your {depositLabel.toLowerCase()} of <strong>${effectiveDepositAmount.toFixed(2)}</strong> has been
                        processed successfully. {companyName} has been notified.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Quote</span>
                            <span className="font-medium">#{quote?.quoteNumber}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">{depositLabel}</span>
                            <span className="font-medium text-green-600">${effectiveDepositAmount.toFixed(2)} ✓</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Remaining Balance</span>
                            <span className="font-medium">${Math.max(0, (quote?.total || 0) - effectiveDepositAmount).toFixed(2)}</span>
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-6">
                        A confirmation has been sent to your contact information on file. You can close this page.
                    </p>
                </div>
            </div>
        );
    }

    // Cancelled state
    if (status === 'cancelled') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-amber-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
                    <Clock className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Payment Cancelled</h1>
                    <p className="text-gray-600 mb-6">
                        No charges were made. You can try again whenever you're ready.
                    </p>
                    <button
                        onClick={() => window.location.href = `/pay/${quoteId}`}
                        className="px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition"
                        style={{ backgroundColor: primaryColor }}
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    // Main payment page
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
            <div className="max-w-lg w-full">
                {/* Header */}
                <div className="text-center mb-8">
                    {org?.branding?.logoUrl ? (
                        <img
                            src={org.branding.logoUrl}
                            alt={companyName}
                            className="h-16 mx-auto mb-4 object-contain"
                        />
                    ) : (
                        <div className="w-16 h-16 rounded-xl mx-auto mb-4 flex items-center justify-center"
                             style={{ backgroundColor: primaryColor }}>
                            <span className="text-2xl font-bold text-white">{companyName.charAt(0)}</span>
                        </div>
                    )}
                    <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
                    <p className="text-gray-500 mt-1">{isPaidEstimate ? 'Paid Estimate' : 'Secure Payment'}</p>
                </div>

                {/* Payment Card */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    {/* Top accent bar */}
                    <div className="h-1.5" style={{ backgroundColor: primaryColor }} />

                    <div className="p-6 sm:p-8">
                        {/* Quote Summary */}
                        <div className="flex items-start gap-3 mb-6">
                            <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm text-gray-500">Quote #{quote?.quoteNumber}</p>
                                <p className="text-gray-800 font-medium">{quote?.scopeOfWork || 'Service request'}</p>
                                {quote?.customer?.name && (
                                    <p className="text-sm text-gray-500 mt-1">For: {quote.customer.name}</p>
                                )}
                            </div>
                        </div>

                        {/* Amount breakdown */}
                        <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-3">
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Quote Total</span>
                                <span>${(quote?.total || 0).toFixed(2)}</span>
                            </div>
                            <div className="border-t border-gray-200 pt-3 flex justify-between">
                                <span className="font-semibold text-gray-900">{depositLabel} Due Now</span>
                                <span className="text-2xl font-bold" style={{ color: primaryColor }}>
                                    ${effectiveDepositAmount.toFixed(2)}
                                </span>
                            </div>
                            {!isPaidEstimate && (
                                <p className="text-xs text-gray-400">
                                    Remaining ${Math.max(0, (quote?.total || 0) - effectiveDepositAmount).toFixed(2)} due upon completion
                                </p>
                            )}
                            {isPaidEstimate && (
                                <p className="text-xs text-gray-400">
                                    This fee covers the on-site evaluation. If work proceeds, it will be applied toward the final invoice.
                                </p>
                            )}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Pay Button */}
                        <button
                            onClick={handlePay}
                            disabled={paying}
                            className="w-full py-4 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                            style={{ backgroundColor: primaryColor }}
                        >
                            {paying ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Redirecting to secure checkout...
                                </>
                            ) : (
                                <>
                                    <CreditCard className="w-5 h-5" />
                                    Pay ${effectiveDepositAmount.toFixed(2)}
                                </>
                            )}
                        </button>

                        {/* Security notice */}
                        <div className="flex items-center justify-center gap-2 mt-4 text-xs text-gray-400">
                            <Shield className="w-3.5 h-3.5" />
                            <span>Payments secured by Stripe. Your card info never touches our servers.</span>
                        </div>

                        {/* Disclaimer */}
                        <div className="mt-6 pt-5 border-t border-gray-100">
                            <p className="text-xs text-gray-400 leading-relaxed">
                                {disclaimer}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Back to quote link */}
                <div className="text-center mt-6">
                    <a
                        href={`/quote/${quoteId}`}
                        className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1 transition"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        View full quote
                    </a>
                </div>
            </div>
        </div>
    );
};
