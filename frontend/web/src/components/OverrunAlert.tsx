import React, { useState, useEffect } from 'react';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Quote, OverrunRequest, QuoteLineItem } from '../types';
import {
    AlertTriangle,
    DollarSign,
    Send,
    Phone,
    MessageSquare,
    Mail,
    CheckCircle,
    X,
    Plus,
    Clock,
    Mic
} from 'lucide-react';

interface OverrunAlertProps {
    quote: Quote;
    currentTotal: number; // Actual running total during job
    jobId: string;
    onOverrunApproved?: () => void;
}

export const OverrunAlert: React.FC<OverrunAlertProps> = ({
    quote,
    currentTotal,
    jobId,
    onOverrunApproved
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [contactMethod, setContactMethod] = useState<'sms' | 'email' | 'phone'>('sms');
    const [overrunReason, setOverrunReason] = useState('');
    const [additionalItems, setAdditionalItems] = useState<QuoteLineItem[]>([]);
    const [sending, setSending] = useState(false);

    const quoteTotal = quote.total;
    const maxAllowedTotal = quoteTotal * (1 + quote.overrunProtection.maxOverrunPercent / 100);
    const amountOver = currentTotal - quoteTotal;
    const percentOver = ((currentTotal - quoteTotal) / quoteTotal) * 100;

    const isApproaching = currentTotal >= quoteTotal * 0.9 && currentTotal < quoteTotal;
    const isOverQuote = currentTotal > quoteTotal;
    const isOverThreshold = currentTotal > maxAllowedTotal;

    // Don't show if under 90% of quote and overrun protection is disabled
    if (!quote.overrunProtection.enabled || (currentTotal < quoteTotal * 0.9)) {
        return null;
    }

    const getAlertLevel = () => {
        if (isOverThreshold) return 'critical';
        if (isOverQuote) return 'warning';
        if (isApproaching) return 'info';
        return 'none';
    };

    const alertLevel = getAlertLevel();

    const alertStyles = {
        info: 'bg-blue-50 border-blue-200 text-blue-800',
        warning: 'bg-amber-50 border-amber-200 text-amber-800',
        critical: 'bg-red-50 border-red-200 text-red-800'
    };

    const iconStyles = {
        info: 'text-blue-600',
        warning: 'text-amber-600',
        critical: 'text-red-600'
    };

    const addAdditionalItem = () => {
        const newItem: QuoteLineItem = {
            id: crypto.randomUUID(),
            type: 'material',
            description: '',
            quantity: 1,
            unit: 'each',
            unitPrice: 0,
            total: 0,
            taxable: true,
            isOptional: false
        };
        setAdditionalItems([...additionalItems, newItem]);
    };

    const updateAdditionalItem = (id: string, updates: Partial<QuoteLineItem>) => {
        setAdditionalItems(additionalItems.map(item => {
            if (item.id === id) {
                const updated = { ...item, ...updates };
                updated.total = updated.quantity * updated.unitPrice;
                return updated;
            }
            return item;
        }));
    };

    const removeAdditionalItem = (id: string) => {
        setAdditionalItems(additionalItems.filter(item => item.id !== id));
    };

    const additionalTotal = additionalItems.reduce((sum, item) => sum + item.total, 0);
    const newTotal = currentTotal + additionalTotal;
    const newPercentOver = ((newTotal - quoteTotal) / quoteTotal) * 100;

    const handleSendOverrunRequest = async () => {
        if (!overrunReason.trim()) {
            alert('Please provide a reason for the additional costs');
            return;
        }

        setSending(true);
        try {
            const overrunRequest: Omit<OverrunRequest, 'id'> = {
                org_id: quote.org_id,
                job_id: jobId,
                quote_id: quote.id,
                reason: overrunReason,
                additionalItems,
                additionalTotal,
                newTotal,
                percentOverOriginal: newPercentOver,
                requestedAt: serverTimestamp(),
                requestedBy: '', // Will be set by auth
                sentToCustomer: true,
                sentVia: contactMethod,
                status: 'pending'
            };

            await addDoc(collection(db, 'overrunRequests'), overrunRequest);

            // TODO: Actually send SMS/email/phone call

            alert(`Overrun request sent via ${contactMethod}. Waiting for customer approval.`);
            setShowContactModal(false);

        } catch (error) {
            console.error('Error sending overrun request:', error);
            alert('Failed to send request. Please try again.');
        } finally {
            setSending(false);
        }
    };

    const handleVerbalApproval = async () => {
        if (!overrunReason.trim()) {
            alert('Please provide a reason for the additional costs');
            return;
        }

        const approvalNotes = prompt('Enter notes about the verbal approval (who approved, when, any conditions):');
        if (!approvalNotes) return;

        setSending(true);
        try {
            const overrunRequest: Omit<OverrunRequest, 'id'> = {
                org_id: quote.org_id,
                job_id: jobId,
                quote_id: quote.id,
                reason: overrunReason,
                additionalItems,
                additionalTotal,
                newTotal,
                percentOverOriginal: newPercentOver,
                requestedAt: serverTimestamp(),
                requestedBy: '',
                sentToCustomer: true,
                sentVia: 'phone',
                customerResponse: 'approved',
                respondedAt: serverTimestamp(),
                approvalMethod: 'verbal',
                verbalApprovalNotes: approvalNotes,
                status: 'approved'
            };

            await addDoc(collection(db, 'overrunRequests'), overrunRequest);

            alert('Verbal approval recorded.');
            setShowContactModal(false);
            onOverrunApproved?.();

        } catch (error) {
            console.error('Error recording approval:', error);
            alert('Failed to record approval. Please try again.');
        } finally {
            setSending(false);
        }
    };

    if (alertLevel === 'none') return null;

    return (
        <>
            <div className={`border rounded-lg p-4 ${alertStyles[alertLevel]}`}>
                <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-5 h-5 mt-0.5 ${iconStyles[alertLevel]}`} />
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <h3 className="font-medium">
                                {isApproaching && 'Approaching Quote Limit'}
                                {isOverQuote && !isOverThreshold && 'Over Quote (Within Approved Range)'}
                                {isOverThreshold && 'EXCEEDS APPROVED OVERRUN - Contact Required'}
                            </h3>
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="text-sm underline"
                            >
                                {isExpanded ? 'Less' : 'Details'}
                            </button>
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                            <div>
                                <p className="opacity-75">Quote</p>
                                <p className="font-semibold">${quoteTotal.toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="opacity-75">Current</p>
                                <p className="font-semibold">${currentTotal.toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="opacity-75">Over By</p>
                                <p className={`font-semibold ${isOverQuote ? '' : 'opacity-50'}`}>
                                    {isOverQuote ? `$${amountOver.toFixed(2)} (${percentOver.toFixed(1)}%)` : '-'}
                                </p>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-3">
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full flex">
                                    <div
                                        className="bg-green-500 h-full"
                                        style={{ width: `${Math.min(100, (quoteTotal / maxAllowedTotal) * 100)}%` }}
                                    />
                                    <div
                                        className={`h-full ${isOverThreshold ? 'bg-red-500' : 'bg-amber-500'}`}
                                        style={{
                                            width: `${Math.max(0, Math.min(
                                                ((currentTotal - quoteTotal) / maxAllowedTotal) * 100,
                                                ((maxAllowedTotal - quoteTotal) / maxAllowedTotal) * 100
                                            ))}%`
                                        }}
                                    />
                                    {isOverThreshold && (
                                        <div
                                            className="bg-red-600 h-full"
                                            style={{ width: `${((currentTotal - maxAllowedTotal) / maxAllowedTotal) * 100}%` }}
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between text-xs mt-1 opacity-75">
                                <span>$0</span>
                                <span>Quote: ${quoteTotal.toFixed(0)}</span>
                                <span>Max: ${maxAllowedTotal.toFixed(0)} (+{quote.overrunProtection.maxOverrunPercent}%)</span>
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-current/20">
                                <p className="text-sm opacity-75 mb-2">
                                    {isOverThreshold ? (
                                        <>
                                            Current costs exceed the customer's pre-approved {quote.overrunProtection.maxOverrunPercent}% overrun limit.
                                            <strong> You MUST contact the customer before proceeding.</strong>
                                        </>
                                    ) : isOverQuote ? (
                                        <>
                                            Costs are ${amountOver.toFixed(2)} over quote but within the customer's pre-approved
                                            {' '}{quote.overrunProtection.maxOverrunPercent}% overrun threshold.
                                            You may proceed, but consider notifying the customer.
                                        </>
                                    ) : (
                                        <>
                                            You're at {((currentTotal / quoteTotal) * 100).toFixed(0)}% of the quoted amount.
                                            Plan carefully to stay within budget.
                                        </>
                                    )}
                                </p>
                            </div>
                        )}

                        {isOverThreshold && (
                            <div className="mt-4">
                                <button
                                    onClick={() => setShowContactModal(true)}
                                    className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                                >
                                    <Phone className="w-4 h-4 mr-2" />
                                    Contact Customer for Approval
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Contact Modal */}
            {showContactModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold">Request Overrun Approval</h2>
                            <button onClick={() => setShowContactModal(false)} className="p-1 hover:bg-gray-100 rounded">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Current Status */}
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <span className="text-red-600">Original Quote:</span>
                                        <span className="font-medium ml-2">${quoteTotal.toFixed(2)}</span>
                                    </div>
                                    <div>
                                        <span className="text-red-600">Current Total:</span>
                                        <span className="font-medium ml-2">${currentTotal.toFixed(2)}</span>
                                    </div>
                                    <div>
                                        <span className="text-red-600">Approved Max:</span>
                                        <span className="font-medium ml-2">${maxAllowedTotal.toFixed(2)}</span>
                                    </div>
                                    <div>
                                        <span className="text-red-600">Over By:</span>
                                        <span className="font-medium ml-2">${(currentTotal - maxAllowedTotal).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Reason */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Reason for Additional Costs *
                                </label>
                                <textarea
                                    value={overrunReason}
                                    onChange={(e) => setOverrunReason(e.target.value)}
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                                    placeholder="Explain what additional work or materials are needed..."
                                />
                            </div>

                            {/* Additional Items */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Additional Items
                                    </label>
                                    <button
                                        onClick={addAdditionalItem}
                                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add Item
                                    </button>
                                </div>

                                {additionalItems.length > 0 && (
                                    <div className="space-y-2">
                                        {additionalItems.map(item => (
                                            <div key={item.id} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                                                <input
                                                    type="text"
                                                    value={item.description}
                                                    onChange={(e) => updateAdditionalItem(item.id, { description: e.target.value })}
                                                    className="flex-1 border border-gray-300 rounded p-1 text-sm"
                                                    placeholder="Description"
                                                />
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => updateAdditionalItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                                    className="w-16 border border-gray-300 rounded p-1 text-sm text-center"
                                                    min="0"
                                                />
                                                <span className="text-gray-400">×</span>
                                                <input
                                                    type="number"
                                                    value={item.unitPrice}
                                                    onChange={(e) => updateAdditionalItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                                    className="w-20 border border-gray-300 rounded p-1 text-sm text-right"
                                                    min="0"
                                                    step="0.01"
                                                />
                                                <span className="w-20 text-right font-medium">${item.total.toFixed(2)}</span>
                                                <button
                                                    onClick={() => removeAdditionalItem(item.id)}
                                                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        <div className="text-right text-sm font-medium">
                                            Additional Total: ${additionalTotal.toFixed(2)}
                                        </div>
                                    </div>
                                )}

                                {additionalItems.length > 0 && (
                                    <div className="mt-2 p-2 bg-amber-50 rounded text-sm">
                                        <strong>New Total:</strong> ${newTotal.toFixed(2)} ({newPercentOver.toFixed(1)}% over original quote)
                                    </div>
                                )}
                            </div>

                            {/* Contact Method */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Contact Method
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => setContactMethod('sms')}
                                        className={`p-3 border rounded-lg flex flex-col items-center gap-1 ${contactMethod === 'sms' ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                                            }`}
                                    >
                                        <MessageSquare className={`w-5 h-5 ${contactMethod === 'sms' ? 'text-blue-600' : 'text-gray-400'}`} />
                                        <span className="text-xs">SMS</span>
                                    </button>
                                    <button
                                        onClick={() => setContactMethod('email')}
                                        className={`p-3 border rounded-lg flex flex-col items-center gap-1 ${contactMethod === 'email' ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                                            }`}
                                    >
                                        <Mail className={`w-5 h-5 ${contactMethod === 'email' ? 'text-blue-600' : 'text-gray-400'}`} />
                                        <span className="text-xs">Email</span>
                                    </button>
                                    <button
                                        onClick={() => setContactMethod('phone')}
                                        className={`p-3 border rounded-lg flex flex-col items-center gap-1 ${contactMethod === 'phone' ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                                            }`}
                                    >
                                        <Phone className={`w-5 h-5 ${contactMethod === 'phone' ? 'text-blue-600' : 'text-gray-400'}`} />
                                        <span className="text-xs">Phone</span>
                                    </button>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-2 pt-4 border-t">
                                <button
                                    onClick={handleSendOverrunRequest}
                                    disabled={sending}
                                    className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    Send Approval Request via {contactMethod.toUpperCase()}
                                </button>

                                <button
                                    onClick={handleVerbalApproval}
                                    disabled={sending}
                                    className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 font-medium disabled:opacity-50"
                                >
                                    <Mic className="w-4 h-4 mr-2" />
                                    Record Verbal Approval
                                </button>

                                <button
                                    onClick={() => setShowContactModal(false)}
                                    className="w-full px-4 py-2 text-gray-600 hover:text-gray-800"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
