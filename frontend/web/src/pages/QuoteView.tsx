import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { doc, getDoc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { Quote } from '../types';
import { generateQuoteTerms } from '../lib/quoteTerms';
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
    PhoneCall
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

export const QuoteView: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { user } = useAuth(); // If accessed by internal user
    const [quote, setQuote] = useState<Quote | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [converting, setConverting] = useState(false);

    // Tech reply state
    const [techReply, setTechReply] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const [triggeringCallback, setTriggeringCallback] = useState(false);

    // Approval form state
    const [signerName, setSignerName] = useState('');
    const [signatureDataUrl, setSignatureDataUrl] = useState('');
    const [agreedToOverrun, setAgreedToOverrun] = useState(false);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
    const [showDeclineForm, setShowDeclineForm] = useState(false);
    const [showProposeForm, setShowProposeForm] = useState(false);
    const [proposeMessage, setProposeMessage] = useState('');

    useEffect(() => {
        const loadQuote = async () => {
            if (!token) {
                setError('Invalid quote link');
                setLoading(false);
                return;
            }

            try {
                const quoteDoc = await getDoc(doc(db, 'quotes', token));
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
            } catch (err) {
                console.error('Error loading quote:', err);
                setError('Failed to load quote');
            } finally {
                setLoading(false);
            }
        };

        loadQuote();
    }, [token]);

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
                ipAddress: '' // Would need server-side to get actual IP
            });

            setQuote({
                ...quote,
                status: 'approved'
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
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                    <p className="mt-2 text-gray-600">Loading quote...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-semibold text-gray-900 mb-2">Quote Unavailable</h1>
                    <p className="text-gray-600">{error}</p>
                </div>
            </div>
        );
    }

    if (!quote) return null;

    const isApproved = quote.status === 'approved';
    const isDeclined = quote.status === 'declined';
    const isInTechReview = quote.status === 'tech_review';
    const canRespond = !isApproved && !isDeclined && !isInTechReview;

    const validUntilDate = quote.validUntil?.toDate ? quote.validUntil.toDate() : new Date(quote.validUntil);

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 py-8 px-4">
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
                                    onClick={() => navigate(`/quotes/${quote.id}/edit`)}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors"
                                >
                                    <Edit className="w-4 h-4" />
                                    Revise &amp; Resend Quote
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

                    {/* Customer Notes / Negotiation History */}
                    {quote.customerNotes && quote.customerNotes.length > 0 && (
                        <div className="p-6 border-b bg-yellow-50">
                            <h2 className="font-semibold text-gray-900 mb-4">Communication History</h2>
                            <div className="space-y-4">
                                {quote.customerNotes.map((note, index) => {
                                    // Status change entries render as centered timeline events
                                    if (note.type === 'status_change' || note.author === 'system') {
                                        return (
                                            <div key={index} className="flex flex-col items-center py-2">
                                                <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-full px-4 py-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                                                    <span className="text-xs font-medium text-gray-600">{note.text}</span>
                                                </div>
                                                {note.waitingFor && (
                                                    <span className={`mt-1 text-xs font-bold px-3 py-0.5 rounded-full ${
                                                        note.waitingFor === 'customer'
                                                            ? 'bg-blue-100 text-blue-700'
                                                            : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        ⏳ Waiting for {note.waitingFor === 'customer' ? 'Customer' : 'Technician'}
                                                    </span>
                                                )}
                                                <span className="text-[10px] text-gray-400 mt-0.5">
                                                    {new Date(note.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                        );
                                    }

                                    // Regular message notes
                                    return (
                                        <div key={index} className={`flex flex-col ${note.author === 'customer' ? 'items-end' : 'items-start'}`}>
                                            <div className={`p-3 rounded-lg max-w-[80%] ${note.author === 'customer' ? 'bg-blue-100 text-blue-900' : 'bg-white border text-gray-800'}`}>
                                                <p className="text-sm shadow-sm">{note.text}</p>
                                            </div>
                                            <span className="text-xs text-gray-500 mt-1">
                                                {note.author === 'customer' ? 'Customer' : 'Technician'} • {new Date(note.createdAt).toLocaleString()}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Current status indicator */}
                            {quote.status && (
                                <div className="mt-4 pt-3 border-t border-yellow-200">
                                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                                        quote.status === 'tech_review'
                                            ? 'bg-amber-200 text-amber-800'
                                            : quote.status === 'sent'
                                            ? 'bg-blue-200 text-blue-800'
                                            : quote.status === 'approved'
                                            ? 'bg-green-200 text-green-800'
                                            : 'bg-gray-200 text-gray-700'
                                    }`}>
                                        <span className={`w-2 h-2 rounded-full ${
                                            quote.status === 'tech_review' ? 'bg-amber-500 animate-pulse'
                                            : quote.status === 'sent' ? 'bg-blue-500'
                                            : quote.status === 'approved' ? 'bg-green-500'
                                            : 'bg-gray-400'
                                        }`} />
                                        {quote.status === 'tech_review' && '⏳ Waiting for Technician to respond'}
                                        {quote.status === 'sent' && '⏳ Waiting for Customer to review'}
                                        {quote.status === 'approved' && '✅ Quote Approved'}
                                        {quote.status === 'declined' && '❌ Quote Declined'}
                                        {quote.status === 'viewed' && '👁 Customer Viewing Quote'}
                                        {quote.status === 'draft' && '📝 Draft'}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Scope of Work — customer-friendly view (hide technical repair steps) */}
                    <div className="p-6 border-b">
                        <h2 className="font-semibold text-gray-900 mb-2">Scope of Work</h2>
                        <p className="text-gray-700 whitespace-pre-wrap">{(() => {
                            const scope = quote.scopeOfWork || '';
                            // Extract only the customer request portion, not the AI diagnosis/repair steps
                            const customerRequestMatch = scope.match(/Customer Request:\s*([\s\S]*?)$/i);
                            if (customerRequestMatch) return customerRequestMatch[1].trim();
                            // If no "Proposed Work" or "Assessment" sections, show the full scope
                            if (!scope.includes('Proposed Work:') && !scope.includes('Assessment:')) return scope;
                            // Fallback: strip out technical sections
                            return scope
                                .replace(/Assessment:[\s\S]*?(?=\n\n|Customer Request:|$)/i, '')
                                .replace(/\nProposed Work:[\s\S]*?(?=\nCustomer Request:|$)/i, '')
                                .replace(/\nSafety Notes:[\s\S]*/i, '')
                                .trim() || 'Service and repair as requested.';
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
                                const terms = generateQuoteTerms({
                                    jurisdictionState: quote.agreement?.jurisdictionState || 'HI',
                                    requiresDeposit: quote.agreement?.requiresDeposit || false,
                                    depositAmount: quote.agreement?.depositAmount,
                                    total: quote.total,
                                    validDays: Math.max(1, Math.ceil((validUntilDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))),
                                    companyName: undefined
                                });
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
                                                const isUpperCase = item.text === item.text.toUpperCase() || item.text.startsWith('TO THE FULLEST') || item.text.startsWith('IN NO EVENT') || item.text.startsWith('EXCEPT AS') || item.text.startsWith('NOTICE') || item.text.startsWith('PRELIMINARY') || item.text.startsWith('HAWAII') || item.text.startsWith('CALIFORNIA') || item.text.startsWith('TEXAS') || item.text.startsWith('FLORIDA');
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
                                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                                        <button
                                            onClick={handleApprove}
                                            disabled={submitting}
                                            className="flex-1 inline-flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
                                        >
                                            {submitting ? (
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                            ) : (
                                                <>
                                                    <Check className="w-5 h-5 mr-2" />
                                                    Approve
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setShowProposeForm(true)}
                                            className="flex-1 inline-flex items-center justify-center px-4 py-3 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium"
                                        >
                                            Propose Changes
                                        </button>
                                        <button
                                            onClick={() => setShowDeclineForm(true)}
                                            className="flex-1 inline-flex items-center justify-center px-4 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-medium"
                                        >
                                            <X className="w-5 h-5 mr-2" />
                                            Decline
                                        </button>
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
};
