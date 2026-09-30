import React, { useState } from 'react';
import {
    Send,
    Mail,
    MessageSquare,
    PhoneCall,
    CheckCircle2,
    Copy,
    ExternalLink,
    Clock,
    AlertCircle,
    RotateCw,
    Share2,
    Check
} from 'lucide-react';
import { Quote } from '../../types';
import toast from 'react-hot-toast';

export interface QuoteDeliverySummaryBannerProps {
    quote: Quote;
    onOpenSendModal: () => void;
}

export const QuoteDeliverySummaryBanner: React.FC<QuoteDeliverySummaryBannerProps> = ({
    quote,
    onOpenSendModal
}) => {
    const [copied, setCopied] = useState(false);

    const directCustomerUrl = `${window.location.origin}/quote/${quote.id}`;

    const handleCopyLink = () => {
        navigator.clipboard.writeText(directCustomerUrl);
        setCopied(true);
        toast.success('Customer quote link copied to clipboard!');
        setTimeout(() => setCopied(false), 2500);
    };

    const isSent = quote.status !== 'draft';
    const sentVia = (quote.sentVia || '').toLowerCase();
    const deliveryMethods = quote.deliveryMethods || [];
    const deliveryLog = quote.deliveryLog || [];

    // Derive active channels from deliveryLog, deliveryMethods, or sentVia
    const hasEmail =
        deliveryMethods.includes('email') ||
        deliveryLog.some(l => l.channel === 'email') ||
        sentVia.includes('email') ||
        sentVia.includes('both') ||
        sentVia.includes('all');

    const hasSms =
        deliveryMethods.includes('sms') ||
        deliveryLog.some(l => l.channel === 'sms') ||
        sentVia.includes('sms') ||
        sentVia.includes('text') ||
        sentVia.includes('both') ||
        sentVia.includes('all');

    const hasCall =
        deliveryMethods.includes('call') ||
        deliveryLog.some(l => l.channel === 'call') ||
        sentVia.includes('call') ||
        sentVia.includes('voice') ||
        sentVia.includes('all');

    const emailLog = deliveryLog.filter(l => l.channel === 'email').pop();
    const smsLog = deliveryLog.filter(l => l.channel === 'sms').pop();
    const callLog = deliveryLog.filter(l => l.channel === 'call').pop();

    const formatTimestamp = (ts: any) => {
        if (!ts) return null;
        try {
            const date = ts.toDate ? ts.toDate() : new Date(ts);
            return date.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return null;
        }
    };

    const sentDateStr = formatTimestamp(quote.sentAt);

    if (!isSent) {
        return (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-amber-900 text-sm">Quote Draft — Not Yet Sent</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-800">
                                    Draft Only
                                </span>
                            </div>
                            <p className="text-xs text-amber-800 mt-1">
                                This quote has been saved internally. Deliver it to the customer via Email, SMS Text, or AI Voice Call to request approval.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onOpenSendModal}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition shrink-0"
                    >
                        <Send className="w-4 h-4" />
                        Send Quote to Customer
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                        <Share2 className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-base">Quote Delivery & Customer Dispatch</h3>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-800 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Dispatched
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {sentDateStr ? `Initially dispatched on ${sentDateStr}` : 'Quote has been dispatched to customer'}
                            {quote.viewedAt && ' • Viewed by customer'}
                        </p>
                    </div>
                </div>

                <button
                    onClick={onOpenSendModal}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0"
                >
                    <RotateCw className="w-3.5 h-3.5 text-blue-600" />
                    Send Again / Different Channel
                </button>
            </div>

            {/* Delivery Channels Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Channel: Email */}
                <div className={`p-4 rounded-xl border ${
                    hasEmail ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-200 opacity-60'
                }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${hasEmail ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
                                <Mail className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-bold text-slate-900">Email Delivery</span>
                        </div>
                        {hasEmail ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                {emailLog?.status === 'failed' ? 'Failed' : 'Sent'}
                            </span>
                        ) : (
                            <span className="text-[10px] text-slate-400 font-medium">Not used</span>
                        )}
                    </div>
                    <div className="mt-2 text-xs">
                        <p className="font-semibold text-slate-700 truncate">
                            {emailLog?.target || quote.customer?.email || 'Customer Email'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            {emailLog?.sentAt ? formatTimestamp(emailLog.sentAt) : (hasEmail && sentDateStr ? sentDateStr : 'Not sent via email')}
                        </p>
                    </div>
                </div>

                {/* Channel: SMS */}
                <div className={`p-4 rounded-xl border ${
                    hasSms ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-60'
                }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${hasSms ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                <MessageSquare className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-bold text-slate-900">SMS Text Message</span>
                        </div>
                        {hasSms ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                {smsLog?.status === 'failed' ? 'Failed' : 'Delivered'}
                            </span>
                        ) : (
                            <span className="text-[10px] text-slate-400 font-medium">Not used</span>
                        )}
                    </div>
                    <div className="mt-2 text-xs">
                        <p className="font-semibold text-slate-700 truncate">
                            {smsLog?.target || quote.customer?.phone || 'Customer Mobile'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            {smsLog?.sentAt ? formatTimestamp(smsLog.sentAt) : (hasSms && sentDateStr ? sentDateStr : 'Not sent via SMS')}
                        </p>
                    </div>
                </div>

                {/* Channel: AI Voice Call */}
                <div className={`p-4 rounded-xl border ${
                    hasCall ? 'bg-purple-50/50 border-purple-200' : 'bg-slate-50 border-slate-200 opacity-60'
                }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${hasCall ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-500'}`}>
                                <PhoneCall className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-bold text-slate-900">AI Voice Call Agent</span>
                        </div>
                        {hasCall ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                                {callLog?.status === 'failed' ? 'Failed' : 'Dispatched'}
                            </span>
                        ) : (
                            <span className="text-[10px] text-slate-400 font-medium">Not used</span>
                        )}
                    </div>
                    <div className="mt-2 text-xs">
                        <p className="font-semibold text-slate-700 truncate">
                            {callLog?.target || quote.customer?.phone || 'Customer Phone'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            {callLog?.sentAt ? formatTimestamp(callLog.sentAt) : (hasCall && sentDateStr ? sentDateStr : 'Not sent via AI Call')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Customer Direct Portal Link Footer */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-600 truncate">
                    <span className="font-semibold text-slate-700 shrink-0">Customer Portal Link:</span>
                    <span className="font-mono bg-slate-100 px-2.5 py-1 rounded-lg text-slate-800 truncate max-w-sm sm:max-w-md">
                        {directCustomerUrl}
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleCopyLink}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg flex items-center gap-1.5 transition"
                    >
                        {copied ? (
                            <>
                                <Check className="w-3.5 h-3.5 text-green-600" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Copy className="w-3.5 h-3.5" />
                                Copy Link
                            </>
                        )}
                    </button>
                    <a
                        href={`${directCustomerUrl}?mode=customer`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center gap-1.5 transition"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open Customer View
                    </a>
                </div>
            </div>
        </div>
    );
};
