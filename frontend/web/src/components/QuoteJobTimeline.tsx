import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import {
    FileText, Clock, CheckCircle, XCircle, DollarSign, Eye,
    Send, ChevronDown, ChevronUp, User, Wrench, Bot, Loader2, CreditCard,
    Mail, MessageSquare, Phone, Link, Package
} from 'lucide-react';
import { InlineAIQuotePanel } from './InlineAIQuotePanel';

export interface TimelineEvent {
    id: string;
    type: 'created' | 'sent' | 'viewed' | 'message' | 'status_change' | 'revised' | 'approved' | 'declined' | 'deposit_paid' | 'job_scheduled' | 'job_in_progress' | 'job_completed' | 'invoice_created' | 'invoice_paid';
    text: string;
    author: 'customer' | 'tech' | 'system';
    timestamp: Date;
    waitingFor?: 'customer' | 'tech';
    meta?: any;
    price?: number;
    version?: number;
}

interface QuoteJobTimelineProps {
    quoteId?: string;
    jobId?: string;
    initialQuote?: any;
    initialJob?: any;
    initialInvoices?: any[];
    isInternal: boolean;
}

export function buildTimeline(quote?: any, job?: any, invoices?: any[]): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    const toDate = (v: any): Date | null => {
        if (!v) return null;
        if (v.toDate) return v.toDate();
        if (typeof v === 'string') return new Date(v);
        if (v instanceof Date) return v;
        if (v.seconds) return new Date(v.seconds * 1000);
        return null;
    };

    // 1. Quote Created
    if (quote) {
        const quoteCreated = toDate(quote.createdAt);
        if (quoteCreated) {
            const originalTotal = quote.previousVersions && quote.previousVersions.length > 0
                ? quote.previousVersions[0].total
                : quote.total;

            const isOriginalAi = quote.createdBy === 'AI Auto-Quote' || (quote.previousVersions && quote.previousVersions.length > 0 && quote.previousVersions[0].createdBy === 'AI Auto-Quote');
            
            const originalVersion = quote.previousVersions && quote.previousVersions.length > 0
                ? quote.previousVersions[0]
                : quote;

            const items = originalVersion.lineItems || [];
            const laborCount = items.filter((i: any) => i.type === 'labor').length;
            const materialCount = items.filter((i: any) => i.type === 'material').length;
            const equipmentCount = items.filter((i: any) => i.type === 'equipment').length;
            const travelCount = items.filter((i: any) => i.type === 'travel').length;

            events.push({
                id: 'quote-created',
                type: 'created',
                text: quote.createdBy === 'AI Auto-Quote'
                    ? `AI generated quote (Original Price: $${(originalTotal || 0).toFixed(2)})`
                    : `Quote created (Original Price: $${(originalTotal || 0).toFixed(2)})`,
                author: 'system',
                timestamp: quoteCreated,
                meta: {
                    isAiGenerated: isOriginalAi,
                    lineItems: items,
                    sentVia: quote.sentVia,
                    sentAt: quote.sentAt ? toDate(quote.sentAt) : null,
                    laborCount,
                    materialCount,
                    equipmentCount,
                    travelCount,
                    total: originalVersion.total,
                    subtotal: originalVersion.subtotal,
                    taxAmount: originalVersion.taxAmount,
                    discount: originalVersion.discount,
                    taxRate: originalVersion.taxRate,
                }
            });
        }

        // 2. Quote Sent
        const quoteSent = toDate(quote.sentAt);
        if (quoteSent) {
            events.push({
                id: 'quote-sent',
                type: 'sent',
                text: `Quote sent to customer (Price: $${(quote.total || 0).toFixed(2)})`,
                author: 'system',
                timestamp: quoteSent,
                waitingFor: 'customer'
            });
        }

        // 3. Quote Viewed
        const quoteViewed = toDate(quote.viewedAt);
        if (quoteViewed) {
            events.push({
                id: 'quote-viewed',
                type: 'viewed',
                text: 'Customer opened the quote',
                author: 'system',
                timestamp: quoteViewed,
            });
        }

        // 4. Revisions
        if (quote.previousVersions && quote.previousVersions.length > 0) {
            quote.previousVersions.forEach((ver: any, i: number) => {
                const vDate = toDate(ver.updatedAt) || toDate(ver.sentAt);
                if (vDate) {
                    const nextTotal = quote.previousVersions && i + 1 < quote.previousVersions.length
                        ? quote.previousVersions[i + 1].total
                        : quote.total;
                    events.push({
                        id: `quote-revised-${i}`,
                        type: 'revised',
                        text: `Quote revised (Version ${i + 1} → Version ${i + 2}): Price changed from $${(ver.total || 0).toFixed(2)} to $${(nextTotal || 0).toFixed(2)}`,
                        author: 'tech',
                        timestamp: vDate,
                    });
                }
            });
        }

        // 5. Customer Notes / Communications (like messages)
        if (quote.customerNotes && quote.customerNotes.length > 0) {
            quote.customerNotes.forEach((note: any, i: number) => {
                const noteDate = toDate(note.createdAt);
                if (!noteDate) return;

                if (note.type === 'status_change') {
                    events.push({
                        id: `quote-note-${i}`,
                        type: 'status_change',
                        text: note.text,
                        author: 'system',
                        timestamp: noteDate,
                        waitingFor: note.waitingFor
                    });
                } else {
                    events.push({
                        id: `quote-note-${i}`,
                        type: 'message',
                        text: note.text,
                        author: note.author || 'customer',
                        timestamp: noteDate,
                    });
                }
            });
        }

        // 6. Quote Approved
        const quoteApproved = toDate(quote.approvedAt);
        if (quoteApproved) {
            events.push({
                id: 'quote-approved',
                type: 'approved',
                text: `Quote approved${quote.agreement?.customerSignature?.signerName ? ` by ${quote.agreement.customerSignature.signerName}` : ''} (Price: $${(quote.total || 0).toFixed(2)})`,
                author: 'system',
                timestamp: quoteApproved,
            });
        }

        // 7. Quote Declined
        const quoteDeclined = toDate(quote.declinedAt);
        if (quoteDeclined) {
            events.push({
                id: 'quote-declined',
                type: 'declined',
                text: `Quote declined${quote.declineReason ? `: "${quote.declineReason}"` : ''} (Price: $${(quote.total || 0).toFixed(2)})`,
                author: 'system',
                timestamp: quoteDeclined,
            });
        }

        // 8. Deposit Paid
        const depositPaid = toDate(quote.agreement?.depositPaidAt);
        if (depositPaid) {
            events.push({
                id: 'quote-deposit-paid',
                type: 'deposit_paid',
                text: `Deposit of $${(quote.agreement?.depositAmount || 0).toFixed(2)} paid via ${quote.agreement?.depositPaymentMethod || 'card'}`,
                author: 'system',
                timestamp: depositPaid,
            });
        }
    }

    // 9. Job Created (if no quote was found, or standalone)
    if (job) {
        const jobCreated = toDate(job.createdAt);
        const quoteCreatedTime = (quote && quote.createdAt) ? toDate(quote.createdAt)?.getTime() : null;
        if (jobCreated && (!quoteCreatedTime || jobCreated.getTime() < quoteCreatedTime - 60000)) {
            events.push({
                id: 'job-created',
                type: 'created',
                text: 'Job request submitted',
                author: 'system',
                timestamp: jobCreated,
            });
        }

        // 10. Job Scheduled
        if (job.status === 'scheduled' || job.scheduled_at || job.scheduled_start) {
            const schedDate = toDate(job.scheduled_at) || toDate(job.scheduled_start) || toDate(job.updatedAt) || new Date();
            events.push({
                id: 'job-scheduled',
                type: 'job_scheduled',
                text: `Job scheduled for ${toDate(job.scheduled_start || job.scheduled_at)?.toLocaleString() || 'service'}`,
                author: 'system',
                timestamp: schedDate,
            });
        }

        // 11. Job In Progress
        if (job.status === 'in_progress' || job.status === 'completed') {
            const date = toDate(job.updatedAt) || new Date();
            events.push({
                id: 'job-in-progress',
                type: 'job_in_progress',
                text: 'Technician started work on site',
                author: 'system',
                timestamp: new Date(date.getTime() - 30 * 60 * 1000), // Estimate 30 min prior
            });
        }

        // 12. Job Completed
        if (job.status === 'completed') {
            const date = toDate(job.completed_at) || toDate(job.finished_at) || toDate(job.updatedAt) || new Date();
            events.push({
                id: 'job-completed',
                type: 'job_completed',
                text: 'Work completed & job signed off',
                author: 'system',
                timestamp: date,
            });
        }
    }

    // 13. Invoices & Payments
    if (invoices && invoices.length > 0) {
        invoices.forEach((inv, idx) => {
            const invCreated = toDate(inv.createdAt);
            if (invCreated) {
                events.push({
                    id: `invoice-created-${idx}`,
                    type: 'invoice_created',
                    text: `Invoice ${inv.invoiceNumber || 'created'} issued for $${(inv.total || 0).toFixed(2)}`,
                    author: 'system',
                    timestamp: invCreated,
                });
            }

            if (inv.status === 'paid') {
                const paidDate = toDate(inv.paidAt) || toDate(inv.updatedAt) || new Date();
                events.push({
                    id: `invoice-paid-${idx}`,
                    type: 'invoice_paid',
                    text: `Payment of $${(inv.total || 0).toFixed(2)} received in full`,
                    author: 'system',
                    timestamp: paidDate,
                });
            }
        });
    }

    // Sort chronologically
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Resolve quote prices at each step if a quote exists
    if (quote) {
        // Build a sorted list of versions with their active timestamps
        const versions: { total: number; timestamp: number; version: number }[] = [];
        
        // 1. Add older versions from previousVersions
        if (quote.previousVersions && quote.previousVersions.length > 0) {
            quote.previousVersions.forEach((ver: any, index: number) => {
                const date = toDate(ver.updatedAt) || toDate(ver.sentAt) || toDate(ver.createdAt);
                if (date) {
                    versions.push({
                        total: ver.total || 0,
                        timestamp: date.getTime(),
                        version: index + 1
                    });
                }
            });
        }
        
        // 2. Add current version
        const currentDate = toDate(quote.updatedAt) || toDate(quote.sentAt) || toDate(quote.createdAt) || new Date();
        versions.push({
            total: quote.total || 0,
            timestamp: currentDate.getTime(),
            version: quote.version || (versions.length + 1)
        });
        
        // Sort versions by timestamp ascending
        versions.sort((a, b) => a.timestamp - b.timestamp);
        
        // 3. For each event, determine the active version and price at that timestamp
        events.forEach(evt => {
            // Find the version active at the event's timestamp
            let activePrice = versions[0]?.total ?? quote.total ?? 0;
            let activeVersion = versions[0]?.version ?? 1;
            
            for (const ver of versions) {
                if (evt.timestamp.getTime() >= ver.timestamp) {
                    activePrice = ver.total;
                    activeVersion = ver.version;
                } else {
                    break;
                }
            }
            evt.price = activePrice;
            evt.version = activeVersion;
        });
    }

    return events;
}

function formatTimeAgo(d: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const TimelineRow: React.FC<{
    event: TimelineEvent;
}> = ({ event }) => {
    const [isOpen, setIsOpen] = useState(false);

    const getEventStyle = () => {
        const text = event.text.toLowerCase();

        // 1. Payment / Invoice Paid
        if (text.includes('payment') || text.includes('paid') || event.type === 'invoice_paid' || event.type === 'deposit_paid') {
            return {
                bg: 'bg-emerald-50 hover:bg-emerald-100/70 border-emerald-150',
                text: 'text-emerald-850',
                badgeText: 'text-emerald-700 bg-emerald-100/50',
                icon: <DollarSign className="w-3.5 h-3.5" />,
                label: 'Payment'
            };
        }

        // 2. Approved / Sign-off
        if (text.includes('approved') || text.includes('sign off') || text.includes('signed off') || event.type === 'approved' || event.type === 'job_completed') {
            return {
                bg: 'bg-green-50 hover:bg-green-100/70 border-green-150',
                text: 'text-green-850',
                badgeText: 'text-green-700 bg-green-100/50',
                icon: <CheckCircle className="w-3.5 h-3.5" />,
                label: 'Sign-off'
            };
        }

        // 3. Declined/Rejected/Cancelled
        if (text.includes('declined') || text.includes('rejected') || text.includes('cancel') || event.type === 'declined') {
            return {
                bg: 'bg-rose-50 hover:bg-rose-100/70 border-rose-150',
                text: 'text-rose-850',
                badgeText: 'text-rose-700 bg-rose-100/50',
                icon: <XCircle className="w-3.5 h-3.5" />,
                label: 'Declined'
            };
        }

        // 4. Sent / Issued / Delivery
        if (text.includes('sent to customer') || text.includes('issued') || event.type === 'sent' || event.type === 'invoice_created') {
            return {
                bg: 'bg-sky-50 hover:bg-sky-100/70 border-sky-150',
                text: 'text-sky-850',
                badgeText: 'text-sky-700 bg-sky-100/50',
                icon: <Send className="w-3.5 h-3.5" />,
                label: 'Delivery'
            };
        }

        // 5. Customer message / note
        if (event.type === 'message' && event.author === 'customer') {
            return {
                bg: 'bg-indigo-50 hover:bg-indigo-100/70 border-indigo-150',
                text: 'text-indigo-850',
                badgeText: 'text-indigo-700 bg-indigo-100/50',
                icon: <User className="w-3.5 h-3.5" />,
                label: 'Customer note'
            };
        }

        // 6. Tech message / note
        if (event.type === 'message' && event.author === 'tech') {
            return {
                bg: 'bg-violet-50 hover:bg-violet-100/70 border-violet-150',
                text: 'text-violet-850',
                badgeText: 'text-violet-700 bg-violet-100/50',
                icon: <Wrench className="w-3.5 h-3.5" />,
                label: 'Technician note'
            };
        }

        // 7. Work started/scheduled (Service Work)
        if (text.includes('scheduled') || text.includes('started work') || event.type === 'job_scheduled' || event.type === 'job_in_progress') {
            return {
                bg: 'bg-amber-50 hover:bg-amber-100/70 border-amber-150',
                text: 'text-amber-850',
                badgeText: 'text-amber-700 bg-amber-100/50',
                icon: <Clock className="w-3.5 h-3.5" />,
                label: 'Service Work'
            };
        }

        // 8. Default System/Created
        return {
            bg: 'bg-slate-50 hover:bg-slate-100/70 border-slate-200',
            text: 'text-slate-700',
            badgeText: 'text-slate-650 bg-slate-150',
            icon: event.text.includes('AI') ? <Bot className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />,
            label: 'System'
        };
    };

    const style = getEventStyle();

    return (
        <div className={`border rounded-lg ${style.bg} transition-all duration-150 overflow-hidden mb-2 shadow-sm`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left text-xs font-medium focus:outline-none"
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`p-1 rounded-md ${style.badgeText} flex-shrink-0 flex items-center justify-center`}>
                        {style.icon}
                    </span>
                    <div className="truncate flex items-center gap-2 flex-wrap">
                        <span className={`font-bold mr-1.5 ${style.text}`}>{style.label}:</span>
                        <span className="text-gray-750">
                            {event.type === 'message'
                                ? `"${event.text.substring(0, 100)}${event.text.length > 100 ? '...' : ''}"`
                                : event.text
                            }
                        </span>
                        {event.meta?.isAiGenerated && (
                            <>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-750 border border-indigo-150 shrink-0">
                                    <Bot className="w-2.5 h-2.5 text-indigo-500" />
                                    AI Generated
                                </span>
                                {(event.meta.laborCount > 0 || event.meta.materialCount > 0 || event.meta.equipmentCount > 0 || event.meta.travelCount > 0) && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                                        {event.meta.laborCount > 0 && `${event.meta.laborCount}L `}
                                        {event.meta.materialCount > 0 && `${event.meta.materialCount}M `}
                                        {event.meta.equipmentCount > 0 && `${event.meta.equipmentCount}E `}
                                        {event.meta.travelCount > 0 && `${event.meta.travelCount}T`}
                                    </span>
                                )}
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 ${
                                    event.meta.sentVia 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' 
                                        : 'bg-amber-50 text-amber-700 border border-amber-150'
                                }`}>
                                    {event.meta.sentVia ? `Sent: ${event.meta.sentVia === 'both' ? 'Email/SMS' : event.meta.sentVia.toUpperCase()}` : 'Draft / Not Sent'}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 pl-2">
                    {event.price !== undefined && (
                        <span 
                            className="text-[10px] font-bold bg-white/90 text-gray-800 px-1.5 py-0.5 rounded-md border border-gray-200 font-mono shadow-sm flex items-center gap-0.5"
                            title={`Quote price at this step (v${event.version || 1})`}
                        >
                            <DollarSign className="w-2.5 h-2.5 text-gray-400" />
                            {event.price.toFixed(2)}
                        </span>
                    )}
                    <span className="text-[10px] text-gray-400 font-normal">
                        {formatTimeAgo(event.timestamp)}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-450 transition-transform duration-200 ${isOpen ? 'rotate-180 text-gray-600' : ''}`} />
                </div>
            </button>

            {isOpen && (
                <div className="px-4 pb-3 pt-2.5 border-t border-dashed border-gray-200 bg-white/70 text-xs text-gray-600 space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span>Actor: <strong className="text-gray-500 capitalize">{event.author}</strong></span>
                        <span>Date: {event.timestamp.toLocaleString()}</span>
                    </div>
                    <p className="text-gray-750 leading-relaxed whitespace-pre-wrap mt-1">
                        {event.text}
                    </p>

                    {/* AI Quote Breakdown details */}
                    {event.meta?.lineItems && event.meta.lineItems.length > 0 && (
                        <div className="mt-3 bg-white rounded-lg border border-gray-200 p-3 shadow-inner">
                            <h4 className="font-bold text-gray-850 mb-2 flex items-center gap-1.5">
                                <Bot className="w-3.5 h-3.5 text-indigo-500" />
                                AI Quote Breakdown
                            </h4>
                            <div className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden bg-gray-50/20">
                                {event.meta.lineItems.map((item: any) => (
                                    <div key={item.id} className="p-2 flex items-center justify-between text-xs hover:bg-gray-50/30 transition-colors">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="p-1 rounded bg-white border border-gray-150 flex-shrink-0 flex items-center justify-center">
                                                {item.type === 'labor' && <Wrench className="w-3 h-3 text-blue-500" />}
                                                {item.type === 'material' && <Package className="w-3 h-3 text-emerald-500" />}
                                                {item.type === 'equipment' && <Bot className="w-3 h-3 text-purple-500" />}
                                                {item.type === 'travel' && <Clock className="w-3 h-3 text-amber-500" />}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-gray-850 truncate">{item.description}</p>
                                                <p className="text-gray-450 text-[10px] mt-0.5">
                                                    {item.quantity} {item.unit || 'qty'} × ${item.unitPrice.toFixed(2)}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="font-bold text-gray-850 font-mono pl-3 shrink-0">
                                            ${item.total.toFixed(2)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Totals Summary */}
                            <div className="mt-3 pt-2.5 border-t border-gray-200 text-xs space-y-1.5 text-gray-500 max-w-xs ml-auto">
                                <div className="flex justify-between">
                                    <span>Subtotal</span>
                                    <span className="font-mono text-gray-700">${(event.meta.subtotal || 0).toFixed(2)}</span>
                                </div>
                                {event.meta.taxAmount > 0 && (
                                    <div className="flex justify-between">
                                        <span>Tax ({event.meta.taxRate || 0}%)</span>
                                        <span className="font-mono text-gray-700">${event.meta.taxAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                {event.meta.discount > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span>Discount</span>
                                        <span className="font-mono">-${event.meta.discount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xs font-bold text-gray-800 pt-2 border-t border-dashed border-gray-200">
                                    <span>Total Price</span>
                                    <span className="font-mono text-indigo-600">${(event.meta.total || 0).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* How it was communicated to the customer */}
                    {event.meta?.isAiGenerated && (
                        <div className="mt-3 bg-indigo-50/50 rounded-lg border border-indigo-100 p-3 flex items-start gap-3 text-xs text-indigo-900">
                            <span className="p-1.5 rounded-md bg-white border border-indigo-150 text-indigo-600 flex-shrink-0 flex items-center justify-center shadow-sm">
                                {event.meta.sentVia === 'email' && <Mail className="w-4 h-4" />}
                                {event.meta.sentVia === 'sms' && <MessageSquare className="w-4 h-4" />}
                                {event.meta.sentVia === 'voice' && <Phone className="w-4 h-4" />}
                                {event.meta.sentVia === 'link' && <Link className="w-4 h-4" />}
                                {event.meta.sentVia === 'both' && <Mail className="w-4 h-4" />}
                                {!event.meta.sentVia && <Bot className="w-4 h-4" />}
                            </span>
                            <div>
                                <p className="font-bold text-indigo-950">Communication Method</p>
                                <p className="text-indigo-850 mt-1 leading-relaxed">
                                    {event.meta.sentVia ? (
                                        <>
                                            This quote was automatically sent to the customer via{' '}
                                            <span className="font-bold uppercase text-indigo-900">
                                                {event.meta.sentVia === 'both' ? 'Email and SMS' : event.meta.sentVia}
                                            </span>
                                            {event.meta.sentAt ? ` on ${new Date(event.meta.sentAt).toLocaleString()}` : ''}.
                                        </>
                                    ) : (
                                        <>
                                            This quote is currently saved as a draft and has not been sent to the customer yet.
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>
                    )}

                    {event.waitingFor && (
                        <div className="mt-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                event.waitingFor === 'customer' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                            }`}>
                                ⏳ Waiting for {event.waitingFor === 'customer' ? 'Customer' : 'Technician'}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const QuoteJobTimeline: React.FC<QuoteJobTimelineProps> = ({
    quoteId,
    jobId,
    initialQuote,
    initialJob,
    initialInvoices,
    isInternal
}) => {
    const [quote, setQuote] = useState<any>(initialQuote || null);
    const [job, setJob] = useState<any>(initialJob || null);
    const [invoices, setInvoices] = useState<any[]>(initialInvoices || []);
    const [loading, setLoading] = useState(false);
    const [showInlineEditor, setShowInlineEditor] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const reload = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    useEffect(() => {
        // Skip fetching on initial load if already provided or neither ID is provided
        if (refreshTrigger === 0 && (initialQuote || quote) && (initialJob || job) && (initialInvoices || invoices.length > 0)) return;
        if (!quoteId && !jobId && !quote?.id) return;

        const loadTimelineDetails = async () => {
            setLoading(true);
            try {
                let resolvedJob = job;
                let resolvedQuote = quote;

                const activeQuoteId = quoteId || quote?.id || (job || initialJob)?.quote_id || (job || initialJob)?.quoteId;

                if (activeQuoteId) {
                    const quoteDoc = await getDoc(doc(db, 'quotes', activeQuoteId));
                    if (quoteDoc.exists()) {
                        resolvedQuote = { id: quoteDoc.id, ...(quoteDoc.data() as any) };
                        setQuote(resolvedQuote);
                    }
                }

                const activeJobId = jobId || (resolvedQuote || initialQuote)?.job_id || (resolvedQuote || initialQuote)?.jobId;
                if (activeJobId) {
                    const jobDoc = await getDoc(doc(db, 'jobs', activeJobId));
                    if (jobDoc.exists()) {
                        resolvedJob = { id: jobDoc.id, ...(jobDoc.data() as any) };
                        setJob(resolvedJob);
                    }
                }

                // Load Invoices
                const invoicesRef = collection(db, 'invoices');
                const queries = [];
                if (resolvedJob) {
                    queries.push(query(invoicesRef, where('job_id', '==', resolvedJob.id)));
                    queries.push(query(invoicesRef, where('source_job_id', '==', resolvedJob.id)));
                }
                if (resolvedQuote) {
                    queries.push(query(invoicesRef, where('quote_id', '==', resolvedQuote.id)));
                }

                const loadedInvoicesMap = new Map<string, any>();
                for (const q of queries) {
                    const snap = await getDocs(q);
                    snap.docs.forEach(d => {
                        loadedInvoicesMap.set(d.id, { id: d.id, ...(d.data() as any) });
                    });
                }

                setInvoices(Array.from(loadedInvoicesMap.values()));
            } catch (err) {
                console.warn('[QuoteJobTimeline] Error fetching timeline details:', err);
            } finally {
                setLoading(false);
            }
        };

        loadTimelineDetails();
    }, [quoteId, jobId, refreshTrigger]);

    const events = useMemo(() => {
        return buildTimeline(quote, job, invoices);
    }, [quote, job, invoices]);

    const filteredEvents = useMemo(() => {
        let evts = events;
        if (!isInternal) {
            // For customers: hide internal system events, AI-related details, and tech notes.
            // Only show: delivery events (sent), customer notes/messages, approval, decline, and change requests.
            const customerVisibleTypes = new Set(['sent', 'approved', 'declined', 'tech_review', 'message', 'note', 'viewed']);
            evts = evts.filter(e => {
                // Hide all system "created" events (they expose AI generation, original pricing, etc.)
                if (e.type === 'created') return false;
                // Hide technician-authored messages (internal notes)
                if (e.author === 'tech' && e.type === 'message') return false;
                // Hide any events with AI metadata
                if (e.meta?.isAiGenerated) return false;
                // Only show known customer-safe event types
                return customerVisibleTypes.has(e.type);
            });
        }
        return evts;
    }, [events, isInternal]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-3 text-xs text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                Loading timeline details...
            </div>
        );
    }

    if (filteredEvents.length === 0) {
        return <p className="text-xs text-gray-400 italic py-2">No history events found</p>;
    }

    return (
        <div className="space-y-1 mt-2">
            {filteredEvents.map((evt) => (
                <TimelineRow key={evt.id} event={evt} />
            ))}

            {isInternal && quote && (quote.status === 'tech_review' || quote.status === 'draft') && (
                <div className="mt-3 pt-3 border-t border-gray-150 flex flex-col gap-3">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowInlineEditor(!showInlineEditor);
                        }}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all shadow-sm ${
                            showInlineEditor
                                ? 'bg-slate-100 text-slate-750 border border-slate-200 hover:bg-slate-200'
                                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md'
                        }`}
                    >
                        <Bot className="w-4 h-4" />
                        {showInlineEditor ? 'Hide Inline Editor' : 'Review & Edit AI Quote Inline'}
                    </button>

                    {showInlineEditor && (
                        <div className="border border-indigo-150 rounded-xl p-4 bg-white/50 shadow-inner mt-1">
                            <InlineAIQuotePanel
                                job={{ id: quote.job_id || quote.jobId || job?.id || jobId, active_quote_id: quote.id }}
                                onQuoteSent={() => {
                                    setShowInlineEditor(false);
                                    reload();
                                }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
