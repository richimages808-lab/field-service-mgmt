import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { doc, getDoc, updateDoc, serverTimestamp, addDoc, collection, onSnapshot } from 'firebase/firestore';
import { db, functions } from '../firebase';
import { Layout } from '../components/Layout';
import { httpsCallable } from 'firebase/functions';
import { Quote } from '../types';
import { generateQuoteTerms, OrgTermsConfig, resolveQuoteTerms } from '../lib/quoteTerms';
import { QuoteJobTimeline } from '../components/QuoteJobTimeline';
import { getCachedJurisdictionTerms, applyQuoteSpecificValues } from '../lib/quoteTermsCache';
import { InlineAIQuotePanel } from '../components/InlineAIQuotePanel';
import { approveQuote, declineQuote, proposeQuoteChanges } from '../lib/quoteService';
import {
    FileText,
    CheckCircle,
    XCircle,
    Clock,
    DollarSign,
    AlertTriangle,
    User,
    MapPin,
    Phone,
    Mail,
    Calendar,
    Percent,
    Info,
    Check,
    X,
    Loader2,
    Edit,
    Send,
    MessageSquare,
    PhoneCall,
    Eye,
    CreditCard,
    ChevronDown,
    ChevronUp,
    History,
    Pencil,
    Plus,
    Trash2,
    Bot,
    Shield
} from 'lucide-react';

interface SignaturePadProps {
    onSign: (dataUrl: string) => void;
    onClear: () => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSign, onClear }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        canvas.width = canvas.offsetWidth * 2;
        canvas.height = canvas.offsetHeight * 2;
        ctx.scale(2, 2);

        // Style
        ctx.strokeStyle = '#1e40af';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, []);

    const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        if ('touches' in e) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCoords(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        setHasSignature(true);
    };

    const stopDrawing = () => {
        if (isDrawing && hasSignature) {
            const canvas = canvasRef.current;
            if (canvas) {
                onSign(canvas.toDataURL('image/png'));
            }
        }
        setIsDrawing(false);
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
        onClear();
    };

    return (
        <div className="space-y-2">
            <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-white">
                <canvas
                    ref={canvasRef}
                    className="w-full h-32 cursor-crosshair touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
                {!hasSignature && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-gray-400">Sign here</p>
                    </div>
                )}
            </div>
            <button
                onClick={clear}
                className="text-sm text-gray-500 hover:text-gray-700"
            >
                Clear signature
            </button>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
//  QUOTE TIMELINE — Color-coded, expandable communications history
// ═══════════════════════════════════════════════════════════════════════════
// ── Imported Timeline components from QuoteJobTimeline ──

export const QuoteView: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { user } = useAuth(); // If accessed by internal user
    const [quote, setQuote] = useState<Quote | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [converting, setConverting] = useState(false);

    // New Note State
    const [noteInput, setNoteInput] = useState('');
    const [submittingNote, setSubmittingNote] = useState(false);

    const isInternal = !!user && (
        user.role === 'technician' || 
        user.role === 'dispatcher' || 
        user.role === 'owner' || 
        user.site_admin === true || 
        user.email?.toLowerCase() === 'rich@richheaton.com'
    );

    const cleanDescription = (desc: string): string => {
        if (!desc) return '';
        return desc
            .replace(/^\[Portal Quote Request\]\s*/i, '')
            .replace(/^\[Public Portal Request\]\s*/i, '')
            .replace(/^urgency:\s*[a-z0-9_-]+\s*/i, '')
            .trim();
    };


    const handleAddNote = async () => {
        if (!noteInput.trim() || !token || !quote) return;

        setSubmittingNote(true);
        try {
            const newNote = {
                text: noteInput.trim(),
                createdAt: new Date().toISOString(),
                author: isInternal ? 'tech' as const : 'customer' as const,
                type: 'message' as const
            };

            const updatedNotes = [...(quote.customerNotes || []), newNote];
            await updateDoc(doc(db, 'quotes', token), {
                customerNotes: updatedNotes,
                updatedAt: serverTimestamp()
            });

            setQuote({
                ...quote,
                customerNotes: updatedNotes
            });
            setNoteInput('');
        } catch (err) {
            console.error('Error adding note:', err);
            alert('Failed to add note. Please try again.');
        } finally {
            setSubmittingNote(false);
        }
    };

    // Tech reply state
    const [techReply, setTechReply] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const [triggeringCallback, setTriggeringCallback] = useState(false);
    const [orgTermsConfig, setOrgTermsConfig] = useState<OrgTermsConfig | undefined>(undefined);
    const [cachedTerms, setCachedTerms] = useState<import('../lib/quoteTerms').TermItem[] | null>(null);

    const [showInlineEditor, setShowInlineEditor] = useState(false);

    // Approval form state & layout navigation
    const [activeTab, setActiveTab] = useState<'details' | 'approve'>('details');
    const [showTermsExpanded, setShowTermsExpanded] = useState(false);
    const [signerName, setSignerName] = useState('');
    const [signatureDataUrl, setSignatureDataUrl] = useState('');
    const [agreedToOverrun, setAgreedToOverrun] = useState(false);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
    const [showDeclineForm, setShowDeclineForm] = useState(false);
    const [showProposeForm, setShowProposeForm] = useState(false);
    const [proposeMessage, setProposeMessage] = useState('');

    const [linkedJob, setLinkedJob] = useState<any>(null);
    const [schedulingPref, setSchedulingPref] = useState<'email' | 'phone' | 'text'>('email');

    // Customer scheduling slots state
    const [slots, setSlots] = useState<{ date: string; timeWindow: 'morning' | 'afternoon' | 'evening' }[]>([
        { date: '', timeWindow: 'morning' },
        { date: '', timeWindow: 'morning' }
    ]);
    const [submittingSlots, setSubmittingSlots] = useState(false);
    const [orgSlug, setOrgSlug] = useState<string | null>(null);
    const [checkingAvailability, setCheckingAvailability] = useState<Record<number, boolean>>({});
    const [availabilityStatus, setAvailabilityStatus] = useState<Record<number, { available: boolean; message: string; availableWindows?: string[] }>>({});

    useEffect(() => {
        if (!token) {
            setError('Invalid quote link');
            setLoading(false);
            return;
        }

        const unsubscribe = onSnapshot(doc(db, 'quotes', token), async (quoteDoc) => {
            if (!quoteDoc.exists()) {
                setError('Quote not found');
                setLoading(false);
                return;
            }

            const quoteData = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

            // Check if expired
            if (quoteData.validUntil) {
                const validUntil = quoteData.validUntil.toDate ? quoteData.validUntil.toDate() : new Date(quoteData.validUntil);
                if (new Date() > validUntil) {
                    setError('This quote has expired');
                    setLoading(false);
                    return;
                }
            }

            // Mark as viewed if not already
            if (!quoteData.viewedAt) {
                try {
                    await updateDoc(doc(db, 'quotes', token), {
                        viewedAt: serverTimestamp(),
                        status: 'viewed'
                    });
                } catch (viewErr) {
                    console.warn('Failed to mark quote as viewed:', viewErr);
                }
            }

            // Set quote data and stop loading IMMEDIATELY so the UI renders
            // without waiting for auth-protected reads below.
            setQuote(quoteData);
            if (quoteData.agreement?.schedulingPreference) {
                setSchedulingPref(quoteData.agreement.schedulingPreference);
            }
            setLoading(false);

            // Best-effort enrichment: load linked job and org details.
            // These reads hit auth-protected collections (jobs, organizations)
            // and can hang indefinitely for unauthenticated or cross-org users
            // because the Firestore SDK may not resolve the promise on
            // PERMISSION_DENIED in all browser configurations. We use a 5-second
            // timeout to prevent the callback from blocking forever.
            const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
                Promise.race([
                    promise,
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
                ]);

            if (quoteData.job_id) {
                try {
                    const jobSnap = await withTimeout(getDoc(doc(db, 'jobs', quoteData.job_id)), 5000);
                    if (jobSnap && jobSnap.exists()) {
                        const jobData = { id: jobSnap.id, ...(jobSnap.data() as any) };
                        setLinkedJob(jobData);
                        if (jobData.schedulingPreference) {
                            setSchedulingPref(jobData.schedulingPreference);
                        }
                    }
                } catch (jobErr) {
                    console.warn('Failed to load linked job details:', jobErr);
                }
            }

            if (quoteData.org_id) {
                try {
                    const orgSnap = await withTimeout(getDoc(doc(db, 'organizations', quoteData.org_id)), 5000);
                    if (orgSnap && orgSnap.exists()) {
                        const orgData = orgSnap.data() as any;
                        if (orgData?.slug) {
                            setOrgSlug(orgData.slug);
                        } else if (orgData?.portalConfig?.slug) {
                            setOrgSlug(orgData.portalConfig.slug);
                        }
                        if (orgData?.settings?.termsConfig) {
                            setOrgTermsConfig(orgData.settings.termsConfig as OrgTermsConfig);
                        }
                    }
                } catch (e) {
                    console.warn('Could not load org terms config:', e);
                }
            }
        }, (err) => {
            console.error('Error loading quote snapshot:', err);
            setError('Failed to load quote');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [token]);

    // Load cached jurisdiction terms (shared across all orgs — avoids recomputation)
    useEffect(() => {
        if (!quote) return;
        const jurisdiction = quote.agreement?.jurisdictionState || 'HI';
        getCachedJurisdictionTerms(jurisdiction)
            .then(terms => setCachedTerms(terms))
            .catch(err => {
                console.warn('[QuoteView] Failed to load cached terms, falling back:', err);
                // cachedTerms stays null — fallback to generateQuoteTerms() in render
            });
    }, [quote?.agreement?.jurisdictionState]);

    const handleApprove = async () => {
        if (!quote || !token) return;

        if (!signerName.trim()) {
            alert('Please enter your name');
            return;
        }

        if (quote.agreement?.signatureRequired !== false && !signatureDataUrl) {
            alert('Please sign the quote');
            return;
        }

        if (!agreedToTerms) {
            alert('Please agree to the terms and conditions');
            return;
        }

        if (quote.overrunProtection.enabled && !agreedToOverrun) {
            alert('Please agree to the overrun protection terms');
            return;
        }

        setSubmitting(true);
        try {
            const filledSlots = slots.filter(s => s.date && s.timeWindow);
            const availabilityWindows = filledSlots.length > 0
                ? filledSlots.map(s => ({
                    day: s.date,
                    startTime: s.timeWindow === 'morning' ? '08:00' : s.timeWindow === 'afternoon' ? '12:00' : '16:00',
                    endTime: s.timeWindow === 'morning' ? '12:00' : s.timeWindow === 'afternoon' ? '16:00' : '20:00',
                    preferredTime: s.timeWindow,
                    submittedAt: new Date().toISOString()
                }))
                : undefined;

            await approveQuote({
                quoteId: token,
                signatureDataUrl,
                signerName,
                agreedToOverrun,
                ipAddress: '',
                schedulingPreference: schedulingPref,
                availabilityWindows,
                quoteData: quote
            });

            setQuote({
                ...quote,
                status: 'approved',
                agreement: {
                    ...quote.agreement,
                    schedulingPreference: schedulingPref
                }
            });
        } catch (err) {
            console.error('Error approving quote:', err);
            alert('Failed to approve quote. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleApproveAndPay = async () => {
        if (!quote || !token) return;

        if (!signerName.trim()) {
            alert('Please enter your name');
            return;
        }

        if (quote.agreement?.signatureRequired !== false && !signatureDataUrl) {
            alert('Please sign the quote');
            return;
        }

        if (!agreedToTerms) {
            alert('Please agree to the terms and conditions');
            return;
        }

        if (quote.overrunProtection.enabled && !agreedToOverrun) {
            alert('Please agree to the overrun protection terms');
            return;
        }

        setSubmitting(true);
        try {
            const filledSlots = slots.filter(s => s.date && s.timeWindow);
            const availabilityWindows = filledSlots.length > 0
                ? filledSlots.map(s => ({
                    day: s.date,
                    startTime: s.timeWindow === 'morning' ? '08:00' : s.timeWindow === 'afternoon' ? '12:00' : '16:00',
                    endTime: s.timeWindow === 'morning' ? '12:00' : s.timeWindow === 'afternoon' ? '16:00' : '20:00',
                    preferredTime: s.timeWindow,
                    submittedAt: new Date().toISOString()
                }))
                : undefined;

            // 1. Run approval (~150ms write)
            const approvePromise = approveQuote({
                quoteId: token,
                signatureDataUrl,
                signerName,
                agreedToOverrun,
                ipAddress: '',
                schedulingPreference: schedulingPref,
                availabilityWindows,
                quoteData: quote
            });

            // 2. Start Cloud Function checkout creation in parallel
            const createDepositCheckout = httpsCallable(functions, 'createDepositCheckout');
            const checkoutPromise = createDepositCheckout({ quoteId: token });

            // Run approval and checkout creation concurrently
            const [, checkoutResult] = await Promise.all([
                approvePromise,
                checkoutPromise.catch(err => {
                    console.error('Checkout creation failed in parallel:', err);
                    return null;
                })
            ]);

            const stripeUrl = (checkoutResult?.data as any)?.url;
            if (stripeUrl) {
                window.location.href = stripeUrl;
            } else {
                // Fallback to internal deposit payment page if direct Stripe URL couldn't be obtained
                navigate(`/pay/${token}?autoPay=true`);
            }
        } catch (err) {
            console.error('Error approving and paying:', err);
            try {
                const quoteSnap = await getDoc(doc(db, 'quotes', token));
                if (quoteSnap.exists() && quoteSnap.data()?.status === 'approved') {
                    navigate(`/pay/${token}?autoPay=true`);
                    return;
                }
            } catch (e) {
                // ignore
            }
            alert('Failed to approve quote. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDecline = async () => {
        if (!quote || !token) return;

        setSubmitting(true);
        try {
            await declineQuote({
                quoteId: token,
                reason: declineReason.trim() || 'No reason provided'
            });

            setQuote({
                ...quote,
                status: 'declined'
            });

        } catch (err) {
            console.error('Error declining quote:', err);
            alert('Failed to decline quote. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const isUrgent = linkedJob?.priority === 'critical' || linkedJob?.priority === 'high' || quote?.priority === 'critical' || quote?.priority === 'high';

    const getMinDate = () => {
        const offset = isUrgent ? 1 : 3;
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const addSlot = () => {
        if (slots.length < 3) {
            setSlots([...slots, { date: '', timeWindow: 'morning' }]);
        }
    };

    const removeSlot = (index: number) => {
        setSlots(slots.filter((_, i) => i !== index));
    };

    const checkSlotAvailability = async (index: number, dateVal: string) => {
        if (!dateVal || !orgSlug) return;
        
        setCheckingAvailability(prev => ({ ...prev, [index]: true }));
        try {
            const checkPortalAvailabilityFn = httpsCallable(functions, 'checkPortalAvailability');
            const result = await checkPortalAvailabilityFn({ slug: orgSlug, date: dateVal });
            const data = result.data as any;
            
            const isAvailable = !data.dayOff && data.slots.some((s: any) => s.available);
            const availableWindows = data.slots.filter((s: any) => s.available).map((s: any) => s.id);
            
            setAvailabilityStatus(prev => ({
                ...prev,
                [index]: {
                    available: isAvailable,
                    message: data.message,
                    availableWindows
                }
            }));
            
            if (isAvailable) {
                const currentWindow = slots[index].timeWindow;
                if (!availableWindows.includes(currentWindow)) {
                    const copy = [...slots];
                    copy[index].timeWindow = availableWindows[0] || 'morning';
                    setSlots(copy);
                }
            } else {
                alert(`Selected date ${dateVal} is not available: ${data.message}`);
                const copy = [...slots];
                copy[index].date = '';
                setSlots(copy);
            }
        } catch (err) {
            console.error('Failed to check availability:', err);
        } finally {
            setCheckingAvailability(prev => ({ ...prev, [index]: false }));
        }
    };

    const updateSlotDate = (index: number, val: string) => {
        const copy = [...slots];
        copy[index].date = val;
        setSlots(copy);
        if (val) {
            checkSlotAvailability(index, val);
        }
    };

    const updateSlotWindow = (index: number, val: 'morning' | 'afternoon' | 'evening') => {
        const copy = [...slots];
        copy[index].timeWindow = val;
        setSlots(copy);
    };

    const handleSubmitSlots = async () => {
        if (slots.length < 2) {
            alert('Please choose at least 2 preferred dates and times.');
            return;
        }
        if (slots.some(s => !s.date)) {
            alert('Please select dates for all your preferred slots.');
            return;
        }
        if (slots.some((s, idx) => availabilityStatus[idx] && !availabilityStatus[idx].available)) {
            alert('One or more of your selected dates are not available. Please choose available dates.');
            return;
        }

        setSubmittingSlots(true);
        try {
            const windows = slots.map(s => ({
                day: s.date,
                startTime: s.timeWindow === 'morning' ? '08:00' : s.timeWindow === 'afternoon' ? '12:00' : '16:00',
                endTime: s.timeWindow === 'morning' ? '12:00' : s.timeWindow === 'afternoon' ? '16:00' : '20:00',
                preferredTime: s.timeWindow
            }));

            // Update quote
            await updateDoc(doc(db, 'quotes', token!), {
                'agreement.availabilityWindows': windows,
                updatedAt: serverTimestamp()
            });

            // Update linked job
            if (quote?.job_id) {
                await updateDoc(doc(db, 'jobs', quote.job_id), {
                    'request.availabilityWindows': windows,
                    updatedAt: serverTimestamp()
                });
            }

            // Refresh local quote state
            setQuote(prev => prev ? {
                ...prev,
                agreement: {
                    ...prev.agreement,
                    availabilityWindows: windows
                }
            } : null);

            alert('Scheduling preferences saved successfully!');
        } catch (err) {
            console.error('Error saving scheduling slots:', err);
            alert('Failed to save preferences. Please try again.');
        } finally {
            setSubmittingSlots(false);
        }
    };

    const handleProposeChanges = async () => {
        if (!quote || !token) return;
        if (!proposeMessage.trim()) {
            alert('Please enter your proposed changes');
            return;
        }

        setSubmitting(true);
        try {
            const { proposeQuoteChanges } = await import('../lib/quoteService');
            await proposeQuoteChanges({
                quoteId: token,
                customerNotes: proposeMessage.trim()
            });

            setQuote({
                ...quote,
                status: 'tech_review',
                customerNotes: [...(quote.customerNotes || []), {
                    text: proposeMessage.trim(),
                    author: 'customer',
                    createdAt: new Date().toISOString()
                }]
            });
            setShowProposeForm(false);
            setProposeMessage('');
        } catch (err) {
            console.error('Error proposing changes:', err);
            alert('Failed to submit proposed changes. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConvertToInvoice = async () => {
        if (!quote || !user?.org_id) return;
        if (!window.confirm('Create a new Draft Invoice from this Quote?')) return;

        setConverting(true);
        try {
            const invoiceData = {
                org_id: user.org_id,
                customer_id: '',
                customer: quote.customer,
                items: quote.lineItems.map(item => ({
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    amount: item.total,
                    total: item.total
                })),
                subtotal: quote.subtotal,
                tax_amount: quote.taxAmount,
                total: quote.total,
                balance_due: quote.total,
                status: 'draft',
                createdAt: serverTimestamp(),
                payments_applied: 0,
                source_quote_id: quote.id,
                deposit_deducted: false,
                deposit_amount: 0,
                deposit_payment_id: ''
            };

            // Auto-deduct deposit if it was paid
            if (quote.agreement?.requiresDeposit && quote.agreement?.depositPaid && quote.agreement?.depositAmount) {
                const depositAmt = quote.agreement.depositAmount;
                invoiceData.balance_due = Math.max(0, quote.total - depositAmt);
                invoiceData.payments_applied = depositAmt;
                invoiceData.deposit_deducted = true;
                invoiceData.deposit_amount = depositAmt;
                invoiceData.deposit_payment_id = (quote.agreement as any)?.depositPaymentIntentId || '';
            }

            // If quote has customerId, use it
            if ((quote as any).customerId) {
                (invoiceData as any).customer_id = (quote as any).customerId;
            }

            const docRef = await addDoc(collection(db, 'invoices'), invoiceData);
            navigate(`/invoices/${docRef.id}`);

        } catch (err) {
            console.error('Error converting quote:', err);
            alert('Failed to create invoice');
        } finally {
            setConverting(false);
        }
    };

    if (loading) {
        const loadingContent = (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                    <p className="mt-2 text-gray-600">Loading quote...</p>
                </div>
            </div>
        );
        return isInternal ? <Layout>{loadingContent}</Layout> : loadingContent;
    }

    if (error) {
        const errorContent = (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-semibold text-gray-900 mb-2">Quote Unavailable</h1>
                    <p className="text-gray-600">{error}</p>
                </div>
            </div>
        );
        return isInternal ? <Layout>{errorContent}</Layout> : errorContent;
    }

    if (!quote) return null;

    const isPendingTechReview = !isInternal && (!quote.sentAt || quote.status === 'draft');

    const isApproved = quote.status === 'approved';
    const isDeclined = quote.status === 'declined';
    const isInTechReview = quote.status === 'tech_review';
    const canRespond = !isApproved && !isDeclined && !isInTechReview;

    const validUntilDate = quote.validUntil?.toDate ? quote.validUntil.toDate() : new Date(quote.validUntil);

    if (isPendingTechReview) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 py-8 px-4">
                <div className="max-w-2xl mx-auto">
                    {/* Status Banner */}
                    <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-6 text-center shadow-sm">
                        <Clock className="w-12 h-12 text-blue-600 mx-auto mb-3 animate-pulse" />
                        <h2 className="font-semibold text-blue-900 text-lg">Under Technician Review</h2>
                        <p className="text-sm text-blue-700 mt-2 max-w-md mx-auto">
                            We have received your service request. Our technical team is preparing your official estimate and will notify you as soon as it is ready for your review.
                        </p>
                    </div>

                    {/* Quote Card */}
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-blue-600 p-6 text-white">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <FileText className="w-6 h-6" />
                                        <span className="text-blue-100">Service Request</span>
                                    </div>
                                    <h1 className="text-2xl font-bold">{quote.quoteNumber}</h1>
                                    <div className="flex items-center gap-2 mt-2 text-blue-100">
                                        <Calendar className="w-4 h-4" />
                                        <span className="text-sm">
                                            Submitted {quote.createdAt?.toDate 
                                                ? quote.createdAt.toDate().toLocaleDateString() 
                                                : new Date(quote.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Quote Activity Timeline */}
                        <div className="p-5 border-b">
                            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                <History className="w-4 h-4 text-gray-400" />
                                Activity History
                            </h2>
                            <QuoteJobTimeline quoteId={quote.id} isInternal={isInternal} initialQuote={quote} />
                        </div>

                        {/* Scope of Work */}
                        <div className="p-6 border-b">
                            <h2 className="font-semibold text-gray-900 mb-2">Scope of Request</h2>
                            <p className="text-gray-700 whitespace-pre-wrap">{(() => {
                                const scope = quote.scopeOfWork || '';
                                let requestText = '';
                                const customerRequestMatch = scope.match(/Customer Request:\s*([\s\S]*?)$/i);
                                if (customerRequestMatch) {
                                    requestText = customerRequestMatch[1].trim();
                                } else if (!scope.includes('Proposed Work:') && !scope.includes('Assessment:')) {
                                    requestText = scope;
                                } else {
                                    requestText = scope
                                        .replace(/Assessment:[\s\S]*?(?=\n\n|Customer Request:|$)/i, '')
                                        .replace(/\nProposed Work:[\s\S]*?(?=\nCustomer Request:|$)/i, '')
                                        .replace(/\nSafety Notes:[\s\S]*/i, '')
                                        .trim();
                                }
                                return cleanDescription(requestText) || 'Service and repair as requested.';
                            })()}</p>
                        </div>


                        {/* Propose Changes Form */}
                        <div className="p-6 bg-slate-50/50">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                                <Edit className="w-4 h-4 text-blue-600" />
                                Need to request changes?
                            </h3>
                            <p className="text-xs text-gray-500 mb-4">
                                If you need to add details, upload photos, or adjust your service request before we finalize the estimate, write them below.
                            </p>
                            <textarea
                                value={proposeMessage}
                                onChange={(e) => setProposeMessage(e.target.value)}
                                rows={4}
                                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white resize-none shadow-sm"
                                placeholder="E.g., Actually, I'd like to change the faucet to a brushed nickel finish instead..."
                            />
                            <button
                                onClick={handleProposeChanges}
                                disabled={submitting || !proposeMessage.trim()}
                                className="mt-3 w-full inline-flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors shadow-sm"
                            >
                                {submitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    "Submit Request Update"
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center mt-6 text-sm text-gray-500">
                        <p>Powered by DispatchBox</p>
                    </div>
                </div>
            </div>
        );
    }

    const rawDepositAmount = quote?.agreement?.depositAmount || 0;
    const effectiveDepositAmount = quote?.depositCondition === 'paid_estimate'
        ? rawDepositAmount
        : Math.min(rawDepositAmount, quote?.total || 0);

    const quoteContent = (
        <div className={isInternal ? "py-4" : "min-h-screen bg-slate-50 py-8 px-4 sm:px-6"}>
            <div className="max-w-5xl mx-auto">
                {/* Header Summary Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <FileText className="w-5 h-5 text-blue-600" />
                                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Service Quote</span>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    isApproved ? 'bg-green-100 text-green-800' :
                                    isDeclined ? 'bg-red-100 text-red-800' :
                                    isInTechReview ? 'bg-amber-100 text-amber-800' :
                                    'bg-blue-100 text-blue-800'
                                }`}>
                                    {quote.status.toUpperCase().replace('_', ' ')}
                                </span>
                            </div>
                            <h1 className="text-2xl font-bold text-slate-900">{quote.quoteNumber}</h1>
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                Valid until {validUntilDate.toLocaleDateString()}
                            </p>
                        </div>
                        <div className="text-left sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 flex justify-between sm:block">
                            <div>
                                <p className="text-xs text-slate-500 font-medium">Total Amount</p>
                                <p className="text-3xl font-extrabold text-blue-600">${quote.total.toFixed(2)}</p>
                            </div>
                            {quote.agreement?.requiresDeposit && !quote.agreement?.depositPaid && (
                                <p className="text-xs font-semibold text-amber-600 mt-1">
                                    ${effectiveDepositAmount.toFixed(2)} Deposit Required
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Step Tabs for Customer Mobile / Compact Navigation */}
                    {!isInternal && canRespond && (
                        <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                            <button
                                onClick={() => setActiveTab('details')}
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                                    activeTab === 'details'
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                <FileText className="w-4 h-4" /> 1. Review Quote & Details
                            </button>
                            <button
                                onClick={() => setActiveTab('approve')}
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                                    activeTab === 'approve'
                                        ? 'bg-green-600 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                <CheckCircle className="w-4 h-4" /> 2. Schedule & Sign
                            </button>
                        </div>
                    )}
                </div>

                {/* Status Banners */}
                {isApproved && (
                    <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="font-semibold text-green-900">Quote Approved</p>
                            <p className="text-sm text-green-700">Thank you! Your technician has been notified and will confirm your schedule shortly.</p>
                        </div>
                    </div>
                )}

                {/* Deposit Payment Banner (When approved but deposit not paid) */}
                {isApproved && quote.agreement?.requiresDeposit && !quote.agreement?.depositPaid && (
                    <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <DollarSign className="w-7 h-7 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-bold text-amber-900 text-lg">
                                        {quote.depositCondition === 'paid_estimate' ? 'Paid Estimate Fee Required' : 'Deposit Payment Required'}
                                    </p>
                                    <p className="text-sm text-amber-800 mt-1 max-w-xl">
                                        {quote.depositCondition === 'paid_estimate'
                                            ? `A fee of $${effectiveDepositAmount.toFixed(2)} is required before we schedule your evaluation.`
                                            : `A deposit of $${effectiveDepositAmount.toFixed(2)} is required to start work.`
                                        }
                                    </p>
                                </div>
                            </div>
                            <a
                                href={`/pay/${quote.id}?autoPay=true`}
                                className="px-6 py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition shadow flex items-center justify-center gap-2 whitespace-nowrap"
                            >
                                <CreditCard className="w-5 h-5" />
                                Pay ${effectiveDepositAmount.toFixed(2)} Now
                            </a>
                        </div>
                    </div>
                )}

                {/* Deposit Paid Banner */}
                {isApproved && quote.agreement?.requiresDeposit && quote.agreement?.depositPaid && (
                    <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                        <Check className="w-6 h-6 text-green-600 flex-shrink-0" />
                        <div>
                            <p className="font-semibold text-green-900">
                                {quote.depositCondition === 'paid_estimate' ? 'Paid Estimate Fee Received' : 'Deposit Paid'}
                            </p>
                            <p className="text-sm text-green-700">
                                ${(quote.agreement.depositAmount || 0).toFixed(2)} received — deducted from final invoice.
                            </p>
                        </div>
                    </div>
                )}

                {/* Internal User Scheduling Widget */}
                {isInternal && isApproved && (!quote.agreement?.requiresDeposit || quote.agreement?.depositPaid) && (
                    <div className="mb-6 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-5 h-5" />
                                <h2 className="font-semibold text-lg">Select Preferred Schedule</h2>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            {quote.agreement?.availabilityWindows && quote.agreement.availabilityWindows.length > 0 ? (
                                <div className="space-y-3">
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                                        <Check className="w-4 h-4 text-green-600" />
                                        <span className="text-sm font-medium text-green-800">Preferred Times Submitted</span>
                                    </div>
                                    <div className="border rounded-xl divide-y text-sm">
                                        {quote.agreement.availabilityWindows.map((w: any, i: number) => (
                                            <div key={i} className="p-3 flex justify-between items-center bg-slate-50">
                                                <span>Option {i+1}: {w.day}</span>
                                                <span className="capitalize px-2.5 py-1 bg-blue-50 text-blue-700 font-semibold rounded-full text-xs">
                                                    {w.preferredTime}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-500">No availability windows submitted yet.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Main Content Layout: Responsive 2 Columns */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Quote Details & Scope */}
                    <div className={`lg:col-span-7 space-y-6 ${activeTab === 'details' || !canRespond ? 'block' : 'hidden lg:block'}`}>
                        {/* Scope of Work */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                                <Info className="w-5 h-5 text-blue-600" />
                                Scope of Work
                            </h2>
                            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                                {cleanDescription(quote.scopeOfWork) || 'Service and repair as requested.'}
                            </p>
                        </div>

                        {/* Quote Details & Line Items */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <DollarSign className="w-5 h-5 text-blue-600" />
                                Quote Details
                            </h2>
                            
                            {quote.presentationMode === 'single_price' ? (
                                <div className="py-3 border-b border-slate-100 mb-4">
                                    <div className="flex justify-between items-center">
                                        <p className="text-slate-800 font-semibold">Complete Service</p>
                                        <p className="font-bold text-slate-900">${quote.subtotal.toFixed(2)}</p>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">Includes all parts and labor as described in scope of work.</p>
                                </div>
                            ) : quote.presentationMode === 'category_rollup' ? (
                                <div className="space-y-3 mb-4">
                                    {Object.entries(
                                        quote.lineItems
                                            .filter(i => i.type !== 'discount')
                                            .reduce((acc, item) => {
                                                const label = item.type.charAt(0).toUpperCase() + item.type.slice(1);
                                                acc[label] = (acc[label] || 0) + item.total;
                                                return acc;
                                            }, {} as Record<string, number>)
                                    ).map(([label, total]) => (
                                        <div key={label} className="flex justify-between py-2 border-b border-slate-100 text-sm">
                                            <span className="text-slate-700 font-medium">{label} Subtotal</span>
                                            <span className="font-semibold text-slate-900">${total.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-3 mb-4">
                                    {quote.lineItems.map(item => (
                                        <div key={item.id} className="flex justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                                            <div>
                                                <p className="text-slate-800 font-medium">{item.description}</p>
                                                <p className="text-xs text-slate-500">
                                                    {item.quantity} {item.unit} × ${item.unitPrice.toFixed(2)}
                                                </p>
                                            </div>
                                            <p className={`font-semibold ${item.type === 'discount' ? 'text-green-600' : 'text-slate-900'}`}>
                                                {item.type === 'discount' ? '-' : ''}${Math.abs(item.total).toFixed(2)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Totals */}
                            <div className="pt-4 border-t border-slate-200 space-y-2">
                                {quote.presentationMode !== 'single_price' && (
                                    <div className="flex justify-between text-sm text-slate-600">
                                        <span>Subtotal</span>
                                        <span className="font-medium">${quote.subtotal.toFixed(2)}</span>
                                    </div>
                                )}
                                {quote.displayTax !== false && quote.taxAmount > 0 && (
                                    <div className="flex justify-between text-sm text-slate-600">
                                        <span>Tax ({quote.taxRate}%)</span>
                                        <span className="font-medium">${quote.taxAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                {quote.discount > 0 && (
                                    <div className="flex justify-between text-sm text-green-600 font-medium">
                                        <span>Discount {quote.discountReason ? `(${quote.discountReason})` : ''}</span>
                                        <span>-${quote.discount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xl font-bold pt-3 border-t border-slate-200 text-slate-900">
                                    <span>Total</span>
                                    <span className="text-blue-600">${quote.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Collapsible Terms & Conditions Accordion */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowTermsExpanded(!showTermsExpanded)}
                                className="w-full p-5 text-left flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-slate-500" />
                                    <span className="font-bold text-slate-800 text-sm">Terms & Conditions</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-semibold">
                                        {showTermsExpanded ? 'Hide' : 'View Terms'}
                                    </span>
                                    {showTermsExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                                </div>
                            </button>

                            {showTermsExpanded && (
                                <div className="p-5 text-xs text-slate-600 space-y-3 max-h-96 overflow-y-auto border-t border-slate-200 bg-white">
                                    {(() => {
                                        let terms;
                                        if (cachedTerms && !orgTermsConfig) {
                                            terms = applyQuoteSpecificValues(cachedTerms, {
                                                requiresDeposit: quote.agreement?.requiresDeposit || false,
                                                depositAmount: quote.agreement?.depositAmount,
                                                total: quote.total,
                                                validDays: Math.max(1, Math.ceil((validUntilDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))),
                                                companyName: undefined,
                                            });
                                        } else {
                                            terms = generateQuoteTerms({
                                                jurisdictionState: quote.agreement?.jurisdictionState || 'HI',
                                                requiresDeposit: quote.agreement?.requiresDeposit || false,
                                                depositAmount: quote.agreement?.depositAmount,
                                                total: quote.total,
                                                validDays: Math.max(1, Math.ceil((validUntilDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))),
                                                companyName: undefined,
                                                orgTermsConfig: orgTermsConfig
                                            });
                                        }
                                        const categories = [
                                            { key: 'payment', label: 'Payment' },
                                            { key: 'scope', label: 'Scope of Work' },
                                            { key: 'warranty', label: 'Warranty' },
                                            { key: 'liability', label: 'Liability & Indemnification' },
                                            { key: 'general', label: 'General Provisions' },
                                            { key: 'jurisdiction', label: 'Jurisdiction Notices' },
                                        ];
                                        let idx = 0;
                                        return categories.map(cat => {
                                            const items = terms.filter(t => t.category === cat.key);
                                            if (items.length === 0) return null;
                                            return (
                                                <div key={cat.key} className="mb-3">
                                                    <p className="font-semibold text-slate-800 uppercase tracking-wide text-[11px] mb-1">{cat.label}</p>
                                                    {items.map(item => {
                                                        idx++;
                                                        return (
                                                            <p key={item.id} className="leading-relaxed mb-1">
                                                                {idx}. {item.text}
                                                            </p>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Customer Messages / Notes */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                                <MessageSquare className="w-4 h-4 text-blue-600" />
                                Add Message or Note for Technician
                            </h3>
                            <div className="flex gap-2">
                                <textarea
                                    value={noteInput}
                                    onChange={(e) => setNoteInput(e.target.value)}
                                    placeholder="Send a message or question to the technician..."
                                    className="flex-1 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 bg-slate-50 resize-none"
                                    rows={2}
                                />
                                <button
                                    onClick={handleAddNote}
                                    disabled={submittingNote || !noteInput.trim()}
                                    className="px-4 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1 transition"
                                >
                                    {submittingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Mobile Step Switcher CTA */}
                        {canRespond && (
                            <div className="lg:hidden pt-2">
                                <button
                                    onClick={() => setActiveTab('approve')}
                                    className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-base shadow-lg hover:from-green-700 hover:to-emerald-700 transition flex items-center justify-center gap-2"
                                >
                                    Continue to Schedule & Sign <CheckCircle className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Approval & Scheduling Form */}
                    <div className={`lg:col-span-5 space-y-6 ${activeTab === 'approve' || !canRespond ? 'block' : 'hidden lg:block'}`}>
                        {canRespond && (
                            <div className="bg-white rounded-2xl shadow-lg border-2 border-blue-500/20 p-6 sticky top-6">
                                <h2 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">
                                    <CheckCircle className="w-6 h-6 text-green-600" />
                                    Schedule & Sign
                                </h2>
                                <p className="text-xs text-slate-500 mb-5">Provide your information below to confirm agreement.</p>

                                {!showDeclineForm && !showProposeForm ? (
                                    <div className="space-y-4">
                                        {/* Full Name */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                Your Full Name *
                                            </label>
                                            <input
                                                type="text"
                                                value={signerName}
                                                onChange={(e) => setSignerName(e.target.value)}
                                                className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 font-medium bg-slate-50"
                                                placeholder="Enter full name"
                                            />
                                        </div>

                                        {/* Signature Pad */}
                                        {quote.agreement?.signatureRequired !== false && (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                    Your Signature *
                                                </label>
                                                <SignaturePad
                                                    onSign={setSignatureDataUrl}
                                                    onClear={() => setSignatureDataUrl('')}
                                                />
                                            </div>
                                        )}

                                        {/* Preferred Appointment Times */}
                                        <div className="bg-blue-50/70 rounded-xl p-4 border border-blue-100 space-y-3">
                                            <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                                                <Calendar className="w-4 h-4 text-blue-600" />
                                                Preferred Appointment Times *
                                            </label>
                                            <p className="text-xs text-slate-500">Pick 2 or 3 dates that work for you.</p>
                                            
                                            <div className="space-y-2">
                                                {slots.map((slot, index) => (
                                                    <div key={index} className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                                                        <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                                                            <span>Option {index + 1}</span>
                                                            {slots.length > 2 && (
                                                                <button onClick={() => removeSlot(index)} className="text-red-400 hover:text-red-600">
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <input
                                                                type="date"
                                                                min={getMinDate()}
                                                                value={slot.date}
                                                                onChange={(e) => updateSlotDate(index, e.target.value)}
                                                                className="border border-slate-300 rounded-lg p-2 text-xs font-medium bg-slate-50"
                                                            />
                                                            <select
                                                                value={slot.timeWindow}
                                                                onChange={(e) => updateSlotWindow(index, e.target.value as any)}
                                                                disabled={!slot.date}
                                                                className="border border-slate-300 rounded-lg p-2 text-xs font-medium bg-slate-50 disabled:opacity-50"
                                                            >
                                                                <option value="morning">Morning (8am-12pm)</option>
                                                                <option value="afternoon">Afternoon (12pm-5pm)</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                ))}
                                                {slots.length < 3 && (
                                                    <button onClick={addSlot} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                                                        <Plus className="w-3.5 h-3.5" /> Add another option
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Contact Method */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                                                How should we confirm? *
                                            </label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {(['email', 'phone', 'text'] as const).map((method) => (
                                                    <button
                                                        key={method}
                                                        type="button"
                                                        onClick={() => setSchedulingPref(method)}
                                                        className={`py-2 px-2.5 rounded-xl border text-xs font-semibold capitalize transition-all flex items-center justify-center gap-1 ${
                                                            schedulingPref === method
                                                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                                        }`}
                                                    >
                                                        {method === 'email' && <Mail className="w-3.5 h-3.5" />}
                                                        {method === 'phone' && <Phone className="w-3.5 h-3.5" />}
                                                        {method === 'text' && <MessageSquare className="w-3.5 h-3.5" />}
                                                        {method}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Agreement Checkboxes */}
                                        <div className="space-y-2 pt-1">
                                            {quote.overrunProtection.enabled && (
                                                <label className="flex items-start gap-2.5 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={agreedToOverrun}
                                                        onChange={(e) => setAgreedToOverrun(e.target.checked)}
                                                        className="mt-0.5 w-4 h-4 text-blue-600 rounded"
                                                    />
                                                    <span className="text-xs text-slate-600 leading-snug">
                                                        I agree to pay up to {quote.overrunProtection.maxOverrunPercent}% over the quote if extra work is needed.
                                                    </span>
                                                </label>
                                            )}
                                            <label className="flex items-start gap-2.5 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={agreedToTerms}
                                                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                                                    className="mt-0.5 w-4 h-4 text-blue-600 rounded"
                                                />
                                                <span className="text-xs text-slate-600 leading-snug">
                                                    I have read and agree to the terms and conditions.
                                                </span>
                                            </label>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="space-y-2 pt-3 border-t border-slate-100">
                                            {quote.agreement?.requiresDeposit && !quote.agreement?.depositPaid ? (
                                                <>
                                                    <button
                                                        onClick={handleApproveAndPay}
                                                        disabled={submitting}
                                                        className="w-full py-4 px-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-base shadow-lg hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        {submitting ? (
                                                            <>
                                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                                <span>Redirecting to payment...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CreditCard className="w-5 h-5" />
                                                                Approve & Pay ${effectiveDepositAmount.toFixed(2)} Deposit
                                                            </>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={handleApprove}
                                                        disabled={submitting}
                                                        className="w-full py-2.5 px-4 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center justify-center gap-1.5"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                        Approve Only (Pay Later)
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={handleApprove}
                                                    disabled={submitting}
                                                    className="w-full py-4 px-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-base shadow-lg hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                                    Approve Quote
                                                </button>
                                            )}

                                            <div className="grid grid-cols-2 gap-2 pt-2">
                                                <button
                                                    onClick={() => setShowProposeForm(true)}
                                                    className="py-2 px-3 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
                                                >
                                                    Propose Changes
                                                </button>
                                                <button
                                                    onClick={() => setShowDeclineForm(true)}
                                                    className="py-2 px-3 border border-red-200 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-50"
                                                >
                                                    Decline
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : showDeclineForm ? (
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-slate-900">Decline Quote</h3>
                                        <p className="text-xs text-slate-600">Please provide a reason for declining (optional):</p>
                                        <textarea
                                            value={declineReason}
                                            onChange={(e) => setDeclineReason(e.target.value)}
                                            rows={3}
                                            className="w-full border border-slate-300 rounded-xl p-3 text-xs bg-slate-50"
                                            placeholder="Reason for declining..."
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowDeclineForm(false)} className="flex-1 py-2 border rounded-xl text-xs font-semibold text-slate-600">
                                                Back
                                            </button>
                                            <button onClick={handleDecline} disabled={submitting} className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                                                {submitting ? 'Declining...' : 'Confirm Decline'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-slate-900">Propose Changes</h3>
                                        <p className="text-xs text-slate-600">What would you like to adjust?</p>
                                        <textarea
                                            value={proposeMessage}
                                            onChange={(e) => setProposeMessage(e.target.value)}
                                            rows={4}
                                            className="w-full border border-slate-300 rounded-xl p-3 text-xs bg-slate-50"
                                            placeholder="e.g., Can we adjust the appointment time or line item?"
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowProposeForm(false)} className="flex-1 py-2 border rounded-xl text-xs font-semibold text-slate-600">
                                                Cancel
                                            </button>
                                            <button onClick={handleProposeChanges} disabled={submitting} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                                                {submitting ? 'Submitting...' : 'Submit Changes'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-6 text-sm text-gray-500">
                    <p>Powered by DispatchBox</p>
                </div>
            </div>
        </div>
    );

    if (isInternal) {
        return (
            <Layout>
                <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto">
                    {/* Header */}
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <button
                                onClick={() => navigate('/quotes')}
                                className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-1 mb-2"
                            >
                                &larr; Back to Quotes
                            </button>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-gray-900">
                                    Quote {quote.quoteNumber || quote.id}
                                </h1>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                    quote.status === 'approved' ? 'bg-green-100 text-green-800' :
                                    quote.status === 'declined' ? 'bg-red-100 text-red-800' :
                                    quote.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                                    quote.status === 'viewed' ? 'bg-purple-100 text-purple-800' :
                                    quote.status === 'tech_review' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                                    'bg-gray-100 text-gray-800'
                                }`}>
                                    {quote.status === 'tech_review' ? 'Needs Review' : quote.status.charAt(0).toUpperCase() + quote.status.slice(1).replace('_', ' ')}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Technical and AI Dashboard View for quote management.
                            </p>
                        </div>
                    </div>

                    {/* Inline AI Quote Panel */}
                    <InlineAIQuotePanel
                        job={{
                            ...linkedJob,
                            id: quote.job_id,
                            active_quote_id: quote.id
                        }}
                        onQuoteSent={() => {}}
                        onNavigateToQuote={(jobId, quoteId) => navigate(`/quotes/${quoteId}/edit`)}
                    />
                </div>
            </Layout>
        );
    }
    return quoteContent;
};
