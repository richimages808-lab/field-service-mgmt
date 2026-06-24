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
    Bot
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

    // Approval form state
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
                await updateDoc(doc(db, 'quotes', token), {
                    viewedAt: serverTimestamp(),
                    status: 'viewed'
                });
            }

            setQuote(quoteData);
            if (quoteData.agreement?.schedulingPreference) {
                setSchedulingPref(quoteData.agreement.schedulingPreference);
            }

            // Load linked job details
            if (quoteData.job_id) {
                try {
                    const jobDoc = await getDoc(doc(db, 'jobs', quoteData.job_id));
                    if (jobDoc.exists()) {
                        const jobData = { id: jobDoc.id, ...(jobDoc.data() as any) };
                        setLinkedJob(jobData);
                        if (jobData.schedulingPreference) {
                            setSchedulingPref(jobData.schedulingPreference);
                        }
                    }
                } catch (jobErr) {
                    console.warn('Failed to load linked job details:', jobErr);
                }
            }

            // Load org termsConfig for T&C customization
            if (quoteData.org_id) {
                try {
                    const orgDoc = await getDoc(doc(db, 'organizations', quoteData.org_id));
                    if (orgDoc.exists()) {
                        const orgData = orgDoc.data() as any;
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
            
            setLoading(false);
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
            // Use quote service for approval workflow
            const { approveQuote } = await import('../lib/quoteService');
            await approveQuote({
                quoteId: token,
                signatureDataUrl,
                signerName,
                agreedToOverrun,
                ipAddress: '', // Would need server-side to get actual IP
                schedulingPreference: schedulingPref
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

    const handleDecline = async () => {
        if (!quote || !token) return;

        setSubmitting(true);
        try {
            // Use quote service for decline workflow
            const { declineQuote } = await import('../lib/quoteService');
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

    const quoteContent = (
        <div className={isInternal ? "py-4" : "min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 py-8 px-4"}>
            <div className="max-w-2xl mx-auto">
                {/* Status Banner */}
                {isApproved && (
                    <div className="mb-6 bg-green-100 border border-green-300 rounded-xl p-4 flex items-center gap-3">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                        <div className="flex-1">
                            <p className="font-medium text-green-800">Quote Approved</p>
                            <p className="text-sm text-green-700">Thank you! Your technician will contact you shortly.</p>
                        </div>
                    </div>
                )}

                {/* Deposit Payment CTA — shown when approved and deposit is required but not paid */}
                {isApproved && quote.agreement?.requiresDeposit && !quote.agreement?.depositPaid && (
                    <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-xl p-5">
                        <div className="flex items-start gap-3">
                            <DollarSign className="w-6 h-6 text-amber-600 mt-0.5" />
                            <div className="flex-1">
                                <p className="font-semibold text-amber-900">
                                    {quote.depositCondition === 'paid_estimate' ? 'Paid Estimate Fee Required' : 'Deposit Payment Required'}
                                </p>
                                <p className="text-sm text-amber-800 mt-1">
                                    {quote.depositCondition === 'paid_estimate'
                                        ? `A paid estimate fee of $${(quote.agreement.depositAmount || 0).toFixed(2)} is required before we can schedule your on-site evaluation. This fee will be applied toward your final invoice if work proceeds.`
                                        : `A deposit of $${(quote.agreement.depositAmount || 0).toFixed(2)} is required before work can begin. This amount will be deducted from your final invoice.`
                                    }
                                </p>
                                <a
                                    href={`/pay/${quote.id}`}
                                    className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition shadow-sm"
                                >
                                    <DollarSign className="w-4 h-4" />
                                    Pay ${(quote.agreement.depositAmount || 0).toFixed(2)} Now
                                </a>
                            </div>
                        </div>
                    </div>
                )}

                {/* Deposit Paid Confirmation */}
                {isApproved && quote.agreement?.requiresDeposit && quote.agreement?.depositPaid && (
                    <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                        <Check className="w-6 h-6 text-green-600" />
                        <div>
                            <p className="font-medium text-green-800">
                                {quote.depositCondition === 'paid_estimate' ? 'Paid Estimate Fee Received' : 'Deposit Paid'}
                            </p>
                            <p className="text-sm text-green-700">
                                ${(quote.agreement.depositAmount || 0).toFixed(2)} received — this will be deducted from your final invoice.
                            </p>
                        </div>
                    </div>
                )}

                {/* Scheduling Widget */}
                {isApproved && (!quote.agreement?.requiresDeposit || quote.agreement?.depositPaid) && (
                    <div className="mb-6 bg-white rounded-2xl shadow-xl overflow-hidden border border-blue-100">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-5 h-5" />
                                <h2 className="font-semibold text-lg">Select Your Preferred Schedule</h2>
                            </div>
                            <p className="text-sm text-blue-100 mt-1">
                                {isUrgent 
                                    ? "Since this job is marked as urgent, you can request times starting as early as tomorrow." 
                                    : "Please select 2 to 3 preferred dates/times for your appointment. We require at least a 3-day buffer to prepare."}
                            </p>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* If availability windows are already submitted, show confirmation */}
                            {quote.agreement?.availabilityWindows && quote.agreement.availabilityWindows.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                                        <Check className="w-5 h-5 text-green-600 mt-0.5" />
                                        <div>
                                            <p className="font-medium text-green-800">Preferred Times Submitted</p>
                                            <p className="text-sm text-green-700">We have received your availability and will confirm the final appointment slot soon.</p>
                                        </div>
                                    </div>
                                    <div className="border border-gray-150 rounded-xl divide-y">
                                        {quote.agreement.availabilityWindows.map((window: any, index: number) => {
                                            const formattedDate = new Date(window.day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                                            const windowLabel = window.preferredTime === 'morning' ? 'Morning (8am - 12pm)' : window.preferredTime === 'afternoon' ? 'Afternoon (12pm - 4pm)' : 'Evening (4pm - 8pm)';
                                            return (
                                                <div key={index} className="p-3.5 flex justify-between items-center bg-gray-50 text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-gray-500">Option {index + 1}:</span>
                                                        <span className="text-gray-900 font-medium">{formattedDate}</span>
                                                    </div>
                                                    <span className="capitalize px-3 py-1 bg-blue-50 text-blue-700 font-semibold rounded-full text-xs">
                                                        {windowLabel}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {slots.map((slot, index) => (
                                        <div key={index} className="flex flex-col sm:flex-row gap-3 items-end sm:items-center bg-gray-50 p-4 rounded-xl border border-gray-150 relative">
                                            <div className="flex-1 w-full relative">
                                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1.5">
                                                    Preferred Date {index + 1}
                                                    {checkingAvailability[index] && (
                                                        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                                                    )}
                                                </label>
                                                <input
                                                    type="date"
                                                    min={getMinDate()}
                                                    value={slot.date}
                                                    onChange={(e) => updateSlotDate(index, e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                                                />
                                            </div>
                                            <div className="w-full sm:w-48">
                                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Time Window</label>
                                                <select
                                                    value={slot.timeWindow}
                                                    onChange={(e) => updateSlotWindow(index, e.target.value as any)}
                                                    disabled={!slot.date || checkingAvailability[index]}
                                                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
                                                >
                                                    {!slot.date ? (
                                                        <option value="">Select Date First</option>
                                                    ) : checkingAvailability[index] ? (
                                                        <option value="">Checking...</option>
                                                    ) : (
                                                        <>
                                                            {(!availabilityStatus[index] || availabilityStatus[index]?.availableWindows?.includes('morning')) && (
                                                                <option value="morning">Morning (8am - 12pm)</option>
                                                            )}
                                                            {(!availabilityStatus[index] || availabilityStatus[index]?.availableWindows?.includes('afternoon')) && (
                                                                <option value="afternoon">Afternoon (12pm - 5pm)</option>
                                                            )}
                                                        </>
                                                    )}
                                                </select>
                                            </div>
                                            {slots.length > 2 && (
                                                <button
                                                    onClick={() => removeSlot(index)}
                                                    className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors self-end sm:self-center"
                                                    title="Remove Option"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}

                                    <div className="flex justify-between items-center pt-2">
                                        {slots.length < 3 ? (
                                            <button
                                                type="button"
                                                onClick={addSlot}
                                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                                            >
                                                <Plus className="w-4 h-4" /> Add Another Option
                                            </button>
                                        ) : (
                                            <span className="text-xs text-gray-400">Maximum of 3 preferred times.</span>
                                        )}
                                        <span className="text-xs text-gray-500">Please provide 2 or 3 choices.</span>
                                    </div>

                                    <button
                                        onClick={handleSubmitSlots}
                                        disabled={submittingSlots || slots.length < 2}
                                        className="w-full inline-flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors mt-2"
                                    >
                                        {submittingSlots ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            "Submit Preferred Times"
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {isDeclined && (
                    <div className="mb-6 bg-red-100 border border-red-300 rounded-xl p-4 flex items-center gap-3">
                        <XCircle className="w-6 h-6 text-red-600" />
                        <div>
                            <p className="font-medium text-red-800">Quote Declined</p>
                            <p className="text-sm text-red-700">This quote has been declined.</p>
                        </div>
                    </div>
                )}

                {isInTechReview && !user && (
                    <div className="mb-6 bg-blue-100 border border-blue-300 rounded-xl p-4 flex items-center gap-3">
                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                        <div>
                            <p className="font-medium text-blue-800">Under Technician Review</p>
                            <p className="text-sm text-blue-700">You requested changes. The technician is reviewing your request.</p>
                        </div>
                    </div>
                )}

                {/* ── Tech/Dispatcher Response Panel ── */}
                {isInTechReview && user && (
                    <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-xl overflow-hidden">
                        <div className="p-4 bg-amber-100 border-b border-amber-200 flex items-center gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                            <div className="flex-1">
                                <p className="font-semibold text-amber-900">Customer Change Request</p>
                                <p className="text-sm text-amber-700">The customer has requested changes to this quote. Review and respond below.</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Latest customer note */}
                            {quote.customerNotes && quote.customerNotes.length > 0 && (() => {
                                const latestCustomerNote = [...quote.customerNotes].reverse().find(n => n.author === 'customer');
                                return latestCustomerNote ? (
                                    <div className="bg-white border border-amber-200 rounded-lg p-4">
                                        <div className="flex items-start gap-2">
                                            <MessageSquare className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs font-semibold text-amber-700 mb-1">Customer said:</p>
                                                <p className="text-sm text-gray-900">&ldquo;{latestCustomerNote.text}&rdquo;</p>
                                                <p className="text-xs text-gray-500 mt-1">{new Date(latestCustomerNote.createdAt).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : null;
                            })()}

                            {/* Quick reply */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reply to Customer</label>
                                <textarea
                                    value={techReply}
                                    onChange={(e) => setTechReply(e.target.value)}
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                                    placeholder="E.g., Sure, I can adjust the quote to remove the piping and focus on the sink replacement. Here's the updated pricing..."
                                />
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => setShowInlineEditor(!showInlineEditor)}
                                    className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                                        showInlineEditor
                                            ? 'bg-slate-200 text-slate-800 hover:bg-slate-350'
                                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}
                                >
                                    <Bot className="w-4 h-4" />
                                    {showInlineEditor ? 'Hide Inline Editor' : 'Revise Quote Inline'}
                                </button>
                                <button
                                    onClick={() => navigate(`/quotes/${quote.id}/edit`)}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors"
                                >
                                    <Edit className="w-4 h-4" />
                                    Full Page Editor
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!techReply.trim()) {
                                            alert('Please enter a reply message first.');
                                            return;
                                        }
                                        setSendingReply(true);
                                        try {
                                            const newNote = {
                                                text: techReply.trim(),
                                                createdAt: new Date().toISOString(),
                                                author: 'tech' as const,
                                                type: 'message' as const,
                                            };
                                            const statusNote = {
                                                text: 'Technician replied — awaiting customer response',
                                                createdAt: new Date().toISOString(),
                                                author: 'system' as const,
                                                type: 'status_change' as const,
                                                waitingFor: 'customer' as const,
                                            };
                                            const updatedNotes = [...(quote.customerNotes || []), newNote, statusNote];
                                            await updateDoc(doc(db, 'quotes', token!), {
                                                customerNotes: updatedNotes,
                                                status: 'sent',
                                                updatedAt: serverTimestamp()
                                            });
                                            setQuote({ ...quote, customerNotes: updatedNotes, status: 'sent' as any });
                                            setTechReply('');
                                            alert('Reply sent! Quote status set back to Sent so the customer can review and approve.');
                                        } catch (err) {
                                            console.error('Error sending reply:', err);
                                            alert('Failed to send reply.');
                                        } finally {
                                            setSendingReply(false);
                                        }
                                    }}
                                    disabled={sendingReply || !techReply.trim()}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                    {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Send Reply (No Price Change)
                                </button>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={async () => {
                                        if (!window.confirm('This will trigger an AI callback to the customer to discuss the updated quote. Continue?')) return;
                                        setTriggeringCallback(true);
                                        try {
                                            await addDoc(collection(db, 'pending_callbacks'), {
                                                orgId: quote.org_id,
                                                customerPhone: quote.customer?.phone || '',
                                                customerName: quote.customer?.name || 'Customer',
                                                quoteId: quote.id,
                                                jobId: quote.job_id || '',
                                                status: 'pending',
                                                source: 'tech_review_callback',
                                                createdAt: serverTimestamp()
                                            });
                                            alert('AI callback scheduled! The customer will receive a call within minutes.');
                                        } catch (err) {
                                            console.error('Error scheduling callback:', err);
                                            alert('Failed to schedule callback.');
                                        } finally {
                                            setTriggeringCallback(false);
                                        }
                                    }}
                                    disabled={triggeringCallback}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                    {triggeringCallback ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                                    Trigger AI Callback
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 text-center">
                                <strong>Revise &amp; Resend</strong> opens the quote editor to adjust line items and pricing. <strong>Send Reply</strong> adds your message and re-sends the same quote for approval.
                            </p>

                            {/* Inline AI Quote Panel */}
                            {showInlineEditor && (
                                <div className="mt-4 border-t border-dashed border-gray-200 pt-4 bg-white rounded-xl p-4 shadow-inner">
                                    <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                        <Bot className="w-4 h-4 text-indigo-600" />
                                        Revise Quote Inline
                                    </h4>
                                    <InlineAIQuotePanel
                                        job={{ id: quote.job_id, active_quote_id: quote.id }}
                                        onQuoteSent={() => setShowInlineEditor(false)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Deposit Banner (pre-approval) */}
                {quote.agreement?.requiresDeposit && !isApproved && !isDeclined && (
                    <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                        <DollarSign className="w-6 h-6 text-blue-600" />
                        <div>
                            <p className="font-medium text-blue-800">
                                {quote.depositCondition === 'paid_estimate' ? 'Paid Estimate Required' : 'Deposit Required'}
                            </p>
                            <p className="text-sm text-blue-700">
                                {quote.depositCondition === 'paid_estimate'
                                    ? <>A paid estimate fee of <strong>${quote.agreement.depositAmount?.toFixed(2)}</strong> will be collected after approval.</>
                                    : <>A deposit of <strong>${quote.agreement.depositAmount?.toFixed(2)}</strong> is required to start work.</>
                                }
                            </p>
                        </div>
                    </div>
                )}

                {/* Quote Card */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-600 p-6 text-white">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <FileText className="w-6 h-6" />
                                    <span className="text-blue-100">Service Quote</span>
                                </div>
                                <h1 className="text-2xl font-bold">{quote.quoteNumber}</h1>
                                <div className="flex items-center gap-2 mt-2 text-blue-100">
                                    <Calendar className="w-4 h-4" />
                                    <span className="text-sm">Valid until {validUntilDate.toLocaleDateString()}</span>
                                </div>
                            </div>
                            {user && isApproved && (
                                <button
                                    onClick={handleConvertToInvoice}
                                    disabled={converting}
                                    className="bg-white text-blue-600 px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                                    Convert to Invoice
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quote Activity Timeline */}
                    <div className="p-5 border-b">
                        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                            <History className="w-4 h-4 text-gray-400" />
                            Quote Activity
                        </h2>
                        <QuoteJobTimeline quoteId={quote.id} isInternal={isInternal} initialQuote={quote} />
                    </div>

                    {/* Notes & Messages Form */}
                    <div className="p-5 border-b bg-slate-50/50">
                        <h3 className="font-semibold text-xs text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5" />
                            Add Message or Note
                        </h3>
                        <div className="flex gap-3 items-end">
                            <div className="flex-1">
                                <textarea
                                    value={noteInput}
                                    onChange={(e) => setNoteInput(e.target.value)}
                                    placeholder={
                                        isInternal
                                            ? "Send a message or add an internal/customer note..."
                                            : "Send a message or question to the technician..."
                                    }
                                    className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white resize-none shadow-sm"
                                    rows={2}
                                />
                            </div>
                            <button
                                onClick={handleAddNote}
                                disabled={submittingNote || !noteInput.trim()}
                                className="h-[46px] px-5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
                            >
                                {submittingNote ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        <span>Send</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Scope of Work — customer-friendly view (hide technical repair steps) */}
                    <div className="p-6 border-b">
                        <h2 className="font-semibold text-gray-900 mb-2">Scope of Work</h2>
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


                    {/* Line Items */}
                    <div className="p-6 border-b">
                        <h2 className="font-semibold text-gray-900 mb-4">Quote Details</h2>
                        
                        {(quote.presentationMode === 'single_price') ? (
                            <div className="py-2 border-b border-gray-100 mb-4">
                                <div className="flex justify-between items-center">
                                    <p className="text-gray-800 font-medium">Complete Service</p>
                                    <p className="font-medium text-gray-900">${quote.subtotal.toFixed(2)}</p>
                                </div>
                                <p className="text-sm text-gray-500 mt-1">Includes all parts and labor as described in the scope of work.</p>
                            </div>
                        ) : (quote.presentationMode === 'category_rollup') ? (
                            <div className="space-y-2 mb-4">
                                {Object.entries(
                                    quote.lineItems
                                        .filter(i => i.type !== 'discount')
                                        .reduce((acc, item) => {
                                            const label = item.type.charAt(0).toUpperCase() + item.type.slice(1);
                                            acc[label] = (acc[label] || 0) + item.total;
                                            return acc;
                                        }, {} as Record<string, number>)
                                ).map(([label, total]) => (
                                    <div key={label} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                                        <p className="text-gray-800 font-medium">{label} Subtotal</p>
                                        <p className="font-medium text-gray-900">${total.toFixed(2)}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2 mb-4">
                                {quote.lineItems.map(item => (
                                    <div key={item.id} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                                        <div>
                                            <p className="text-gray-800">{item.description}</p>
                                            <p className="text-sm text-gray-500">
                                                {item.quantity} {item.unit} × ${item.unitPrice.toFixed(2)}
                                            </p>
                                        </div>
                                        <p className={`font-medium ${item.type === 'discount' ? 'text-green-600' : 'text-gray-900'}`}>
                                            {item.type === 'discount' ? '-' : ''}${Math.abs(item.total).toFixed(2)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Totals */}
                        <div className="pt-4 border-t space-y-2">
                            {quote.presentationMode !== 'single_price' && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Subtotal</span>
                                    <span>${quote.subtotal.toFixed(2)}</span>
                                </div>
                            )}
                            
                            {quote.displayTax !== false && quote.taxAmount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Tax ({quote.taxRate}%)</span>
                                    <span>${quote.taxAmount.toFixed(2)}</span>
                                </div>
                            )}
                            
                            {quote.discount > 0 && (
                                <div className="flex justify-between text-sm text-green-600">
                                    <span>
                                        Discount 
                                        {quote.discountReason ? ` (${quote.discountReason})` : ''}
                                    </span>
                                    <span>-${quote.discount.toFixed(2)}</span>
                                </div>
                            )}
                            
                            <div className="flex justify-between text-xl font-bold pt-2 border-t">
                                <span>Total</span>
                                <span className="text-blue-600">${quote.total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Estimated Duration */}
                    <div className="px-6 py-4 bg-gray-50 border-b flex items-center gap-3">
                        <Clock className="w-5 h-5 text-gray-400" />
                        <div>
                            <p className="text-sm text-gray-500">Estimated Duration</p>
                            <p className="font-medium">
                                {Math.floor(quote.estimatedDuration / 60)}h {quote.estimatedDuration % 60}m
                            </p>
                        </div>
                    </div>

                    {/* Overrun Protection Notice */}
                    {quote.overrunProtection.enabled && (
                        <div className="p-6 border-b bg-amber-50">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div>
                                    <h3 className="font-medium text-amber-900">Cost Variance Agreement</h3>
                                    <p className="text-sm text-amber-800 mt-1">
                                        By approving this quote, you agree to pay up to <strong>{quote.overrunProtection.maxOverrunPercent}%</strong> more
                                        than the quoted amount (up to <strong>${((quote.total * quote.overrunProtection.maxOverrunPercent) / 100).toFixed(2)}</strong> additional)
                                        if unforeseen circumstances require additional work or materials. For any costs exceeding this threshold,
                                        your technician will contact you for approval before proceeding.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Terms */}
                    <div className="p-6 border-b">
                        <h3 className="font-medium text-gray-900 mb-2">Terms & Conditions</h3>
                        <div className="text-sm text-gray-600 space-y-1 max-h-64 overflow-y-auto p-3 bg-gray-50 rounded-lg border border-gray-200">
                            {(() => {
                                // Use cached terms if available (shared across all orgs), otherwise fallback to direct generation
                                let terms;
                                if (cachedTerms && !orgTermsConfig) {
                                    // No org customizations — use cached defaults with quote-specific values applied
                                    terms = applyQuoteSpecificValues(cachedTerms, {
                                        requiresDeposit: quote.agreement?.requiresDeposit || false,
                                        depositAmount: quote.agreement?.depositAmount,
                                        total: quote.total,
                                        validDays: Math.max(1, Math.ceil((validUntilDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))),
                                        companyName: undefined,
                                    });
                                } else {
                                    // Org has customizations — use the full resolve engine (still fast, just not cached)
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
                                    { key: 'jurisdiction', label: 'Jurisdiction-Specific Notices' },
                                ];
                                let idx = 0;
                                return categories.map(cat => {
                                    const items = terms.filter(t => t.category === cat.key);
                                    if (items.length === 0) return null;
                                    return (
                                        <div key={cat.key} className="mb-3">
                                            <p className="font-semibold text-gray-700 text-xs uppercase tracking-wide mb-1">{cat.label}</p>
                                            {items.map(item => {
                                                idx++;
                                                const isUpperCase = item.text === item.text.toUpperCase() || item.text.startsWith('TO THE FULLEST') || item.text.startsWith('IN NO EVENT') || item.text.startsWith('EXCEPT AS') || item.text.startsWith('NOTICE') || item.text.startsWith('PRELIMINARY') || item.text.startsWith('HAWAII') || item.text.startsWith('CALIFORNIA') || item.text.startsWith('TEXAS') || item.text.startsWith('FLORIDA') || item.text.startsWith('NEW YORK') || item.text.startsWith('ILLINOIS') || item.text.startsWith('PENNSYLVANIA') || item.text.startsWith('GEORGIA') || item.text.startsWith('ARIZONA') || item.text.startsWith('WASHINGTON') || item.text.startsWith('OREGON') || item.text.startsWith('COLORADO') || item.text.startsWith('NEVADA') || item.text.startsWith('VIRGINIA') || item.text.startsWith('CONNECTICUT') || item.text.startsWith('NEW JERSEY') || item.text.startsWith('MARYLAND') || item.text.startsWith('MASSACHUSETTS') || item.text.startsWith('LOUISIANA') || item.text.startsWith('TENNESSEE') || item.text.startsWith('NORTH CAROLINA') || item.text.startsWith('MICHIGAN') || item.text.startsWith('DISTRICT') || item.text.startsWith('WIDERRUFSBELEHRUNG') || item.text.startsWith('DATENSCHUTZHINWEIS') || item.text.startsWith('DIE GESAMTHAFTUNG');
                                                return (
                                                    <p key={item.id} className={isUpperCase ? 'font-semibold text-gray-800' : ''}>
                                                        {idx}. {item.text}
                                                    </p>
                                                );
                                            })}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    {/* Approval Form */}
                    {canRespond && (
                        <div className="p-6">
                            {!showDeclineForm && !showProposeForm ? (
                                <div className="space-y-6">
                                    {/* Signer Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Your Full Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={signerName}
                                            onChange={(e) => setSignerName(e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                                            placeholder="Enter your name"
                                        />
                                    </div>

                                    {/* Signature */}
                                    {quote.agreement?.signatureRequired !== false && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Your Signature *
                                            </label>
                                            <SignaturePad
                                                onSign={setSignatureDataUrl}
                                                onClear={() => setSignatureDataUrl('')}
                                            />
                                        </div>
                                    )}

                                    {/* Scheduling Preferences Selector */}
                                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                        <label className="block text-sm font-semibold text-gray-800 mb-1">
                                            How would you like us to schedule your appointment? *
                                        </label>
                                        <p className="text-xs text-gray-500 mb-3">
                                            Choose your preferred contact method. We will reach out using this method to finalize the schedule.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                            <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                                schedulingPref === 'email'
                                                    ? 'bg-blue-50 border-blue-500 text-blue-900 font-medium'
                                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                            }`}>
                                                <input
                                                    type="radio"
                                                    name="scheduling_preference"
                                                    value="email"
                                                    checked={schedulingPref === 'email'}
                                                    onChange={() => setSchedulingPref('email')}
                                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                />
                                                <div className="flex items-center gap-1.5">
                                                    <Mail className="w-4 h-4 text-blue-600" />
                                                    <span className="text-sm">Email me</span>
                                                </div>
                                            </label>
                                            <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                                schedulingPref === 'phone'
                                                    ? 'bg-blue-50 border-blue-500 text-blue-900 font-medium'
                                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                            }`}>
                                                <input
                                                    type="radio"
                                                    name="scheduling_preference"
                                                    value="phone"
                                                    checked={schedulingPref === 'phone'}
                                                    onChange={() => setSchedulingPref('phone')}
                                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                />
                                                <div className="flex items-center gap-1.5">
                                                    <Phone className="w-4 h-4 text-blue-600" />
                                                    <span className="text-sm">Call me</span>
                                                </div>
                                            </label>
                                            <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                                schedulingPref === 'text'
                                                    ? 'bg-blue-50 border-blue-500 text-blue-900 font-medium'
                                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                            }`}>
                                                <input
                                                    type="radio"
                                                    name="scheduling_preference"
                                                    value="text"
                                                    checked={schedulingPref === 'text'}
                                                    onChange={() => setSchedulingPref('text')}
                                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                />
                                                <div className="flex items-center gap-1.5">
                                                    <MessageSquare className="w-4 h-4 text-blue-600" />
                                                    <span className="text-sm">Text me</span>
                                                </div>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Agreements */}
                                    <div className="space-y-3">
                                        {quote.overrunProtection.enabled && (
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={agreedToOverrun}
                                                    onChange={(e) => setAgreedToOverrun(e.target.checked)}
                                                    className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-700">
                                                    I agree to pay up to {quote.overrunProtection.maxOverrunPercent}% over the quoted amount
                                                    if additional work is needed
                                                </span>
                                            </label>
                                        )}

                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={agreedToTerms}
                                                onChange={(e) => setAgreedToTerms(e.target.checked)}
                                                className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">
                                                I have read and agree to the terms and conditions
                                            </span>
                                        </label>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-col gap-3 pt-4">
                                        {/* Primary: Approve (or Approve & Pay if deposit required) */}
                                        {quote.agreement?.requiresDeposit && !quote.agreement?.depositPaid ? (
                                            <>
                                                <button
                                                    onClick={async () => {
                                                        // Validate first
                                                        if (!signerName.trim()) { alert('Please enter your name'); return; }
                                                        if (quote.agreement?.signatureRequired !== false && !signatureDataUrl) { alert('Please sign the quote'); return; }
                                                        if (!agreedToTerms) { alert('Please agree to the terms and conditions'); return; }
                                                        if (quote.overrunProtection.enabled && !agreedToOverrun) { alert('Please agree to the overrun protection terms'); return; }
                                                        
                                                        setSubmitting(true);
                                                        try {
                                                            // Step 1: Approve the quote
                                                            const { approveQuote } = await import('../lib/quoteService');
                                                            await approveQuote({ quoteId: token!, signatureDataUrl, signerName, agreedToOverrun, ipAddress: '', schedulingPreference: schedulingPref });
                                                            
                                                            // Step 2: Redirect to Stripe checkout for deposit
                                                            const createDepositCheckout = httpsCallable(functions, 'createDepositCheckout');
                                                            const result = await createDepositCheckout({ quoteId: token });
                                                            const data = result.data as { url: string };
                                                            if (data.url) {
                                                                window.location.href = data.url;
                                                            } else {
                                                                // Fallback: approved but checkout failed — show approved state
                                                                setQuote({
                                                                    ...quote,
                                                                    status: 'approved',
                                                                    agreement: {
                                                                        ...quote.agreement,
                                                                        schedulingPreference: schedulingPref
                                                                    }
                                                                });
                                                            }
                                                        } catch (err) {
                                                            console.error('Error approving/paying:', err);
                                                            // If approve succeeded but checkout failed, still show approved
                                                            const quoteDoc = await getDoc(doc(db, 'quotes', token!));
                                                            if (quoteDoc.exists() && quoteDoc.data().status === 'approved') {
                                                                setQuote({
                                                                    ...quote,
                                                                    status: 'approved',
                                                                    agreement: {
                                                                        ...quote.agreement,
                                                                        schedulingPreference: schedulingPref
                                                                    }
                                                                });
                                                                alert('Quote approved! You can pay the deposit from the banner above.');
                                                            } else {
                                                                alert('Failed to approve quote. Please try again.');
                                                            }
                                                        } finally {
                                                            setSubmitting(false);
                                                        }
                                                    }}
                                                    disabled={submitting}
                                                    className="w-full inline-flex items-center justify-center px-4 py-3.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 shadow-sm text-base"
                                                >
                                                    {submitting ? (
                                                        <Loader2 className="w-5 h-5 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <CreditCard className="w-5 h-5 mr-2" />
                                                            Approve & Pay ${(quote.agreement.depositAmount || 0).toFixed(2)} {quote.depositCondition === 'paid_estimate' ? 'Estimate Fee' : 'Deposit'}
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={handleApprove}
                                                    disabled={submitting}
                                                    className="w-full inline-flex items-center justify-center px-4 py-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 font-medium disabled:opacity-50"
                                                >
                                                    <Check className="w-4 h-4 mr-1.5" />
                                                    Approve Only (pay later)
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={handleApprove}
                                                disabled={submitting}
                                                className="w-full inline-flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
                                            >
                                                {submitting ? (
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Check className="w-5 h-5 mr-2" />
                                                        Approve Quote
                                                    </>
                                                )}
                                            </button>
                                        )}

                                        {/* Secondary actions */}
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setShowProposeForm(true)}
                                                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 font-medium text-sm"
                                            >
                                                Propose Changes
                                            </button>
                                            <button
                                                onClick={() => setShowDeclineForm(true)}
                                                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium text-sm"
                                            >
                                                <X className="w-4 h-4 mr-1.5" />
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : showDeclineForm ? (
                                <div className="space-y-4">
                                    <h3 className="font-medium text-gray-900">Decline Quote</h3>
                                    <p className="text-sm text-gray-600">
                                        Please let us know why you're declining this quote (optional):
                                    </p>
                                    <textarea
                                        value={declineReason}
                                        onChange={(e) => setDeclineReason(e.target.value)}
                                        rows={3}
                                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                                        placeholder="Reason for declining..."
                                    />
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowDeclineForm(false)}
                                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                                        >
                                            Back
                                        </button>
                                        <button
                                            onClick={handleDecline}
                                            disabled={submitting}
                                            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                        >
                                            {submitting ? 'Declining...' : 'Confirm Decline'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <h3 className="font-medium text-gray-900">Propose Changes</h3>
                                    <p className="text-sm text-gray-600">
                                        What would you like to change about this quote? 
                                    </p>
                                    <textarea
                                        value={proposeMessage}
                                        onChange={(e) => setProposeMessage(e.target.value)}
                                        rows={4}
                                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                                        placeholder="E.g., Can we remove the premium filter?"
                                    />
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowProposeForm(false)}
                                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleProposeChanges}
                                            disabled={submitting}
                                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {submitting ? 'Submitting...' : 'Submit Changes'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
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
