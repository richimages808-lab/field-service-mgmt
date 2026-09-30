import React, { useState, useEffect } from 'react';
import {
    X,
    Mail,
    MessageSquare,
    PhoneCall,
    Send,
    Check,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Sparkles,
    User,
    Phone,
    DollarSign,
    Layers,
    Info
} from 'lucide-react';
import { dispatchQuoteDelivery } from '../../lib/quoteService';
import toast from 'react-hot-toast';

export interface SendQuoteDeliveryModalProps {
    isOpen: boolean;
    onClose: () => void;
    quoteId: string;
    quoteNumber: string;
    total: number;
    customerName: string;
    initialEmail?: string;
    initialPhone?: string;
    orgId: string;
    jobId?: string;
    scopeOfWork?: string;
    onSuccess?: (quoteId: string, channels: string[]) => void;
}

export type DeliveryPreset =
    | 'email_only'
    | 'sms_only'
    | 'call_only'
    | 'text_and_email'
    | 'call_and_email'
    | 'call_and_text'
    | 'all_three';

export const SendQuoteDeliveryModal: React.FC<SendQuoteDeliveryModalProps> = ({
    isOpen,
    onClose,
    quoteId,
    quoteNumber,
    total,
    customerName,
    initialEmail = '',
    initialPhone = '',
    orgId,
    jobId,
    scopeOfWork,
    onSuccess
}) => {
    // Channel selection state
    const [emailEnabled, setEmailEnabled] = useState(true);
    const [smsEnabled, setSmsEnabled] = useState(false);
    const [callEnabled, setCallEnabled] = useState(false);

    // Recipient state
    const [email, setEmail] = useState(initialEmail);
    const [phone, setPhone] = useState(initialPhone);
    const [name, setName] = useState(customerName);

    const [isSending, setIsSending] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    // Sync initial values when modal opens or props change
    useEffect(() => {
        if (isOpen) {
            setEmail(initialEmail || '');
            setPhone(initialPhone || '');
            setName(customerName || '');
            setValidationError(null);
            // Default to Email if available; if only phone, default to SMS
            if (initialEmail) {
                setEmailEnabled(true);
            } else if (initialPhone) {
                setEmailEnabled(false);
                setSmsEnabled(true);
            }
        }
    }, [isOpen, initialEmail, initialPhone, customerName]);

    if (!isOpen) return null;

    // Apply quick preset
    const applyPreset = (preset: DeliveryPreset) => {
        setValidationError(null);
        switch (preset) {
            case 'email_only':
                setEmailEnabled(true);
                setSmsEnabled(false);
                setCallEnabled(false);
                break;
            case 'sms_only':
                setEmailEnabled(false);
                setSmsEnabled(true);
                setCallEnabled(false);
                break;
            case 'call_only':
                setEmailEnabled(false);
                setSmsEnabled(false);
                setCallEnabled(true);
                break;
            case 'text_and_email':
                setEmailEnabled(true);
                setSmsEnabled(true);
                setCallEnabled(false);
                break;
            case 'call_and_email':
                setEmailEnabled(true);
                setSmsEnabled(false);
                setCallEnabled(true);
                break;
            case 'call_and_text':
                setEmailEnabled(false);
                setSmsEnabled(true);
                setCallEnabled(true);
                break;
            case 'all_three':
                setEmailEnabled(true);
                setSmsEnabled(true);
                setCallEnabled(true);
                break;
        }
    };

    // Calculate current preset tag
    const getCurrentPreset = (): DeliveryPreset | 'custom' => {
        if (emailEnabled && smsEnabled && callEnabled) return 'all_three';
        if (emailEnabled && smsEnabled && !callEnabled) return 'text_and_email';
        if (emailEnabled && !smsEnabled && callEnabled) return 'call_and_email';
        if (!emailEnabled && smsEnabled && callEnabled) return 'call_and_text';
        if (emailEnabled && !smsEnabled && !callEnabled) return 'email_only';
        if (!emailEnabled && smsEnabled && !callEnabled) return 'sms_only';
        if (!emailEnabled && !smsEnabled && callEnabled) return 'call_only';
        return 'custom';
    };

    const currentPreset = getCurrentPreset();
    const countSelected = (emailEnabled ? 1 : 0) + (smsEnabled ? 1 : 0) + (callEnabled ? 1 : 0);

    const handleSend = async () => {
        setValidationError(null);

        if (!emailEnabled && !smsEnabled && !callEnabled) {
            setValidationError('Please select at least one delivery channel (Email, SMS, or AI Call).');
            return;
        }

        if (emailEnabled && !email.trim()) {
            setValidationError('Customer email address is required for email delivery.');
            return;
        }

        if ((smsEnabled || callEnabled) && !phone.trim()) {
            setValidationError('Customer phone number is required for SMS or AI voice call delivery.');
            return;
        }

        setIsSending(true);

        try {
            const result = await dispatchQuoteDelivery({
                quoteId,
                quoteNumber,
                total,
                customerName: name.trim() || 'Customer',
                customerEmail: email.trim(),
                customerPhone: phone.trim(),
                orgId,
                jobId,
                scopeOfWork,
                channels: {
                    email: emailEnabled,
                    sms: smsEnabled,
                    call: callEnabled
                }
            });

            if (result.channelsDelivered.length > 0) {
                const labels = result.channelsDelivered.map(c => {
                    if (c === 'email') return 'Email';
                    if (c === 'sms') return 'SMS Text';
                    if (c === 'call') return 'AI Voice Call';
                    return c;
                });
                toast.success(`Quote successfully dispatched via ${labels.join(', ')}!`, {
                    duration: 5000,
                    icon: '🚀'
                });
                onSuccess?.(quoteId, result.channelsDelivered);
                onClose();
            } else {
                const errMsgs = Object.values(result.errors).join('; ');
                toast.error(`Delivery issue: ${errMsgs || 'Could not complete delivery.'}`);
            }
        } catch (error: any) {
            console.error('Dispatch error:', error);
            toast.error(error.message || 'Failed to dispatch quote. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-5 text-white flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm">
                                {quoteNumber}
                            </span>
                            <span className="text-white/80 text-xs font-medium">
                                Total: <strong className="text-white">${total.toFixed(2)}</strong>
                            </span>
                        </div>
                        <h2 className="text-xl font-bold mt-1 text-white flex items-center gap-2">
                            <Send className="w-5 h-5 text-blue-200" />
                            Send Quote to Customer
                        </h2>
                        <p className="text-xs text-blue-100 mt-0.5">
                            Choose how you would like this quote delivered to {name || 'the customer'}.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSending}
                        className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                    {/* Error Banner */}
                    {validationError && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div className="flex-1 text-xs text-red-700 font-medium">
                                {validationError}
                            </div>
                        </div>
                    )}

                    {/* Quick Preset Selector Buttons */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                Quick Combination Presets
                            </label>
                            <span className="text-[11px] text-slate-400">1-click select</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => applyPreset('text_and_email')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                                    currentPreset === 'text_and_email'
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <MessageSquare className="w-3 h-3 text-emerald-500" />
                                <Mail className="w-3 h-3 text-blue-400" />
                                Text & Email
                            </button>

                            <button
                                type="button"
                                onClick={() => applyPreset('call_and_email')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                                    currentPreset === 'call_and_email'
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <PhoneCall className="w-3 h-3 text-purple-500" />
                                <Mail className="w-3 h-3 text-blue-400" />
                                AI Call & Email
                            </button>

                            <button
                                type="button"
                                onClick={() => applyPreset('call_and_text')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                                    currentPreset === 'call_and_text'
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <PhoneCall className="w-3 h-3 text-purple-500" />
                                <MessageSquare className="w-3 h-3 text-emerald-500" />
                                AI Call & Text
                            </button>

                            <button
                                type="button"
                                onClick={() => applyPreset('all_three')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5 ${
                                    currentPreset === 'all_three'
                                        ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white border-transparent shadow-sm'
                                        : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                                }`}
                            >
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                All 3 (AI Call, Text & Email)
                            </button>

                            <button
                                type="button"
                                onClick={() => applyPreset('email_only')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition border flex items-center gap-1.5 ${
                                    currentPreset === 'email_only'
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <Mail className="w-3 h-3" />
                                Email Only
                            </button>

                            <button
                                type="button"
                                onClick={() => applyPreset('sms_only')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition border flex items-center gap-1.5 ${
                                    currentPreset === 'sms_only'
                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <MessageSquare className="w-3 h-3" />
                                SMS Only
                            </button>

                            <button
                                type="button"
                                onClick={() => applyPreset('call_only')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition border flex items-center gap-1.5 ${
                                    currentPreset === 'call_only'
                                        ? 'bg-purple-600 text-white border-purple-600'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <PhoneCall className="w-3 h-3" />
                                AI Call Only
                            </button>
                        </div>
                    </div>

                    {/* Delivery Channels (Checkboxes with Details & Inline Fields) */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                            <span>Delivery Channels ({countSelected} selected)</span>
                            <span className="text-[11px] font-normal text-slate-500 lowercase">select all channels that apply</span>
                        </label>

                        {/* Channel 1: Email */}
                        <div
                            onClick={() => setEmailEnabled(!emailEnabled)}
                            className={`p-4 rounded-2xl border-2 transition cursor-pointer ${
                                emailEnabled
                                    ? 'border-blue-500 bg-blue-50/40 shadow-sm'
                                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={emailEnabled}
                                    onChange={(e) => setEmailEnabled(e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                />
                                <div className="p-2 rounded-xl bg-blue-100 text-blue-600 shrink-0">
                                    <Mail className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-bold text-slate-900">Email Delivery</h4>
                                        {emailEnabled && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-600 mt-0.5">
                                        Sends a branded quote breakdown with a secure 1-click link to review, sign, and pay online.
                                    </p>

                                    {emailEnabled && (
                                        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                                Customer Email Address *
                                            </label>
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="customer@example.com"
                                                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Channel 2: SMS Text */}
                        <div
                            onClick={() => setSmsEnabled(!smsEnabled)}
                            className={`p-4 rounded-2xl border-2 transition cursor-pointer ${
                                smsEnabled
                                    ? 'border-emerald-500 bg-emerald-50/40 shadow-sm'
                                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={smsEnabled}
                                    onChange={(e) => setSmsEnabled(e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                                />
                                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 shrink-0">
                                    <MessageSquare className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-bold text-slate-900">SMS Text Message</h4>
                                        {smsEnabled && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-600 mt-0.5">
                                        Sends an instant SMS text to customer mobile with total quote amount and direct approval link.
                                    </p>

                                    {smsEnabled && (
                                        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                                Customer Mobile Phone Number *
                                            </label>
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder="(808) 555-0123"
                                                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Channel 3: AI Phone Call Agent */}
                        <div
                            onClick={() => setCallEnabled(!callEnabled)}
                            className={`p-4 rounded-2xl border-2 transition cursor-pointer ${
                                callEnabled
                                    ? 'border-purple-500 bg-purple-50/40 shadow-sm'
                                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={callEnabled}
                                    onChange={(e) => setCallEnabled(e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1 w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                                />
                                <div className="p-2 rounded-xl bg-purple-100 text-purple-600 shrink-0">
                                    <PhoneCall className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                                            AI Voice Call Agent
                                            <span className="text-[10px] font-semibold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <Sparkles className="w-2.5 h-2.5 text-purple-600" /> Automated
                                            </span>
                                        </h4>
                                        {callEnabled && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-600 mt-0.5">
                                        AI assistant calls customer to walk through the estimate scope, answer questions, and offer to text/email approval link.
                                    </p>

                                    {callEnabled && (
                                        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                                Customer Phone for AI Call *
                                            </label>
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder="(808) 555-0123"
                                                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Customer Name Confirmation */}
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" /> Customer Contact Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Customer Name"
                            className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                        {countSelected === 0 ? (
                            <span className="text-amber-600 font-medium flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" /> Please select at least one delivery option
                            </span>
                        ) : (
                            <span className="text-slate-600 font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                                Ready to deliver via {
                                    [
                                        emailEnabled ? 'Email' : null,
                                        smsEnabled ? 'SMS' : null,
                                        callEnabled ? 'AI Call' : null
                                    ].filter(Boolean).join(' + ')
                                }
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSending}
                            className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={isSending || countSelected === 0}
                            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 ${
                                callEnabled && emailEnabled && smsEnabled
                                    ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white hover:opacity-95'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                        >
                            {isSending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Dispatching Quote...
                                </>
                            ) : (
                                <>
                                    <Send className="w-4 h-4" />
                                    Send Quote ({countSelected} {countSelected === 1 ? 'Channel' : 'Channels'})
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
