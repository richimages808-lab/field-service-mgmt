import React, { useState, useEffect } from 'react';
import { X, Send, Mail, MessageSquare, Phone, Mic, Clock, User, Calendar, Edit, ChevronRight, AlertCircle, Wrench, History, Link2, Sparkles } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Job } from '../types';
import { parseMessageForTickets, getSuggestedActions, MessageIntent } from '../lib/TicketMentionParser';

export interface CustomerMessage {
    id: string;
    jobId: string;
    customerId?: string;
    customerName: string;
    customerContact: string; // email or phone
    customerEmail?: string;
    customerPhone?: string;
    type: 'email' | 'sms' | 'voicemail';
    direction: 'inbound' | 'outbound';
    content: string;
    subject?: string;
    timestamp: Date;
    read: boolean;
    replied: boolean;
    transcription?: string;
    transcriptionPending?: boolean;
}

interface CustomerMessageModalProps {
    message: CustomerMessage | null;
    onClose: () => void;
    onSendReply: (messageId: string, reply: string, method: 'email' | 'sms') => Promise<void>;
    customerJobs?: Job[]; // Open jobs for this customer
    communicationHistory?: CustomerMessage[]; // Past messages with this customer
    onEditJob?: (jobId: string) => void;
    onRescheduleJob?: (jobId: string) => void;
    onScheduleJob?: (jobId: string) => void;
}

// Canned response templates
const CANNED_RESPONSES = [
    { label: 'Confirm appointment', text: 'Your appointment is confirmed for {{date}} at {{time}}. {{techName}} will be there. Reply if you need to make any changes!' },
    { label: 'Request reschedule', text: 'I\'d be happy to reschedule. What dates/times work best for you?' },
    { label: 'Parts on order', text: 'We\'ve ordered the parts needed for your repair. We\'ll contact you once they arrive to schedule the service.' },
    { label: 'Follow-up', text: 'Just following up on your recent service. Is everything working properly? Let us know if you have any questions!' },
];

export const CustomerMessageModal: React.FC<CustomerMessageModalProps> = ({
    message,
    onClose,
    onSendReply,
    customerJobs = [],
    communicationHistory = [],
    onEditJob,
    onRescheduleJob,
    onScheduleJob
}) => {
    const [reply, setReply] = useState('');
    const [replyMethod, setReplyMethod] = useState<'email' | 'sms'>(message?.type === 'sms' ? 'sms' : 'email');
    const [sending, setSending] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showCannedResponses, setShowCannedResponses] = useState(false);
    const [parsedMessage, setParsedMessage] = useState<ReturnType<typeof parseMessageForTickets> | null>(null);

    // Parse message for ticket references when message changes
    useEffect(() => {
        if (message && message.content) {
            const parsed = parseMessageForTickets(message.content, customerJobs);
            setParsedMessage(parsed);
        }
    }, [message, customerJobs]);

    if (!message) return null;

    const handleSend = async () => {
        if (!reply.trim()) return;

        setSending(true);
        try {
            await onSendReply(message.id, reply, replyMethod);
            setReply('');
            onClose();
        } catch (error) {
            console.error('Failed to send reply:', error);
        }
        setSending(false);
    };

    const handleCannedResponse = (template: string) => {
        // Replace variables in template
        let text = template;
        if (customerJobs.length > 0) {
            const job = customerJobs[0];
            const scheduledDate = job.scheduled_at?.toDate?.();
            text = text.replace('{{date}}', scheduledDate ? format(scheduledDate, 'EEEE, MMMM d') : '[date]');
            text = text.replace('{{time}}', scheduledDate ? format(scheduledDate, 'h:mm a') : '[time]');
            text = text.replace('{{techName}}', job.assigned_tech_name || 'Your technician');
        }
        setReply(text);
        setShowCannedResponses(false);
    };

    const getTypeIcon = () => {
        switch (message.type) {
            case 'email':
                return <Mail className="w-5 h-5 text-blue-600" />;
            case 'sms':
                return <MessageSquare className="w-5 h-5 text-green-600" />;
            case 'voicemail':
                return <Phone className="w-5 h-5 text-purple-600" />;
        }
    };

    const getTypeBadge = () => {
        const colors = {
            email: 'bg-blue-100 text-blue-800',
            sms: 'bg-green-100 text-green-800',
            voicemail: 'bg-purple-100 text-purple-800'
        };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[message.type]}`}>
                {message.type.toUpperCase()}
            </span>
        );
    };

    const getIntentBadge = (intent: MessageIntent) => {
        const config: Record<MessageIntent, { color: string; label: string }> = {
            schedule_request: { color: 'bg-blue-100 text-blue-800', label: '📅 Schedule Request' },
            reschedule_request: { color: 'bg-orange-100 text-orange-800', label: '🔄 Reschedule Request' },
            cancellation_request: { color: 'bg-red-100 text-red-800', label: '❌ Cancellation' },
            question: { color: 'bg-yellow-100 text-yellow-800', label: '❓ Question' },
            confirmation: { color: 'bg-green-100 text-green-800', label: '✅ Confirmation' },
            complaint: { color: 'bg-red-100 text-red-800', label: '⚠️ Complaint' },
            update: { color: 'bg-gray-100 text-gray-800', label: '📝 Update' },
            general: { color: 'bg-gray-100 text-gray-800', label: '💬 General' }
        };

        const { color, label } = config[intent];
        return <span className={`px-2 py-0.5 rounded text-xs ${color}`}>{label}</span>;
    };

    const suggestedActions = parsedMessage ? getSuggestedActions(parsedMessage.detectedIntent || 'general', parsedMessage.detectedReferences) : [];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex">
                {/* Left Panel - History & Tickets */}
                <div className={`bg-gray-50 border-r w-80 flex-shrink-0 ${showHistory ? 'block' : 'hidden lg:block'}`}>
                    {/* Customer Info */}
                    <div className="p-4 border-b bg-white">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">{message.customerName}</h3>
                                <p className="text-xs text-gray-500">{message.customerContact}</p>
                            </div>
                        </div>
                    </div>

                    {/* Open Tickets Section */}
                    <div className="p-4 border-b">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <Wrench className="w-4 h-4" />
                            Open Tickets ({customerJobs.length})
                        </h4>
                        {customerJobs.length === 0 ? (
                            <p className="text-sm text-gray-500">No open tickets</p>
                        ) : (
                            <div className="space-y-2">
                                {customerJobs.map(job => (
                                    <div key={job.id} className="bg-white rounded-lg p-3 border border-gray-200 hover:border-blue-300 transition">
                                        <div className="flex items-start justify-between mb-1">
                                            <span className="text-xs font-mono text-gray-400">#{job.id.slice(-6)}</span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${job.status === 'scheduled' ? 'bg-green-100 text-green-700' :
                                                    job.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-gray-100 text-gray-700'
                                                }`}>
                                                {job.status}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium text-gray-900 line-clamp-1">{job.request.description}</p>
                                        {job.scheduled_at && (
                                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {format(job.scheduled_at.toDate(), 'MMM d, h:mm a')}
                                            </p>
                                        )}
                                        <div className="flex gap-2 mt-2">
                                            {onEditJob && (
                                                <button
                                                    onClick={() => onEditJob(job.id)}
                                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                >
                                                    <Edit className="w-3 h-3" />
                                                    Edit
                                                </button>
                                            )}
                                            {job.scheduled_at && onRescheduleJob && (
                                                <button
                                                    onClick={() => onRescheduleJob(job.id)}
                                                    className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
                                                >
                                                    <Calendar className="w-3 h-3" />
                                                    Reschedule
                                                </button>
                                            )}
                                            {!job.scheduled_at && onScheduleJob && (
                                                <button
                                                    onClick={() => onScheduleJob(job.id)}
                                                    className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1"
                                                >
                                                    <Calendar className="w-3 h-3" />
                                                    Schedule
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Communication History */}
                    <div className="p-4 overflow-y-auto" style={{ maxHeight: '300px' }}>
                        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <History className="w-4 h-4" />
                            Communication History ({communicationHistory.length})
                        </h4>
                        {communicationHistory.length === 0 ? (
                            <p className="text-sm text-gray-500">No previous messages</p>
                        ) : (
                            <div className="space-y-2">
                                {communicationHistory.slice(0, 10).map(msg => (
                                    <div
                                        key={msg.id}
                                        className={`p-2 rounded-lg text-xs ${msg.direction === 'outbound'
                                                ? 'bg-blue-50 border-l-2 border-blue-400'
                                                : 'bg-gray-100 border-l-2 border-gray-400'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium">
                                                {msg.direction === 'outbound' ? 'You' : msg.customerName.split(' ')[0]}
                                            </span>
                                            <span className="text-gray-400">
                                                {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                                            </span>
                                        </div>
                                        <p className="text-gray-600 line-clamp-2">
                                            {msg.type === 'voicemail' ? '🎤 Voicemail' : msg.content}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Current Message & Reply */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Header */}
                    <div className="bg-gray-50 px-6 py-4 border-b flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {getTypeIcon()}
                            <div>
                                <h2 className="font-semibold text-gray-900">{message.customerName}</h2>
                                <p className="text-sm text-gray-500">{message.customerContact}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowHistory(!showHistory)}
                                className="lg:hidden p-2 hover:bg-gray-200 rounded-lg transition"
                                title="Toggle history"
                            >
                                <History className="w-5 h-5 text-gray-500" />
                            </button>
                            {getTypeBadge()}
                            <button
                                onClick={onClose}
                                className="p-1 hover:bg-gray-200 rounded-full transition"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                    </div>

                    {/* Message Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                            <Clock className="w-3 h-3" />
                            <span>{format(message.timestamp, 'MMM d, yyyy h:mm a')}</span>
                            {parsedMessage?.detectedIntent && parsedMessage.detectedIntent !== 'general' && (
                                getIntentBadge(parsedMessage.detectedIntent)
                            )}
                        </div>

                        {/* Detected Ticket References */}
                        {parsedMessage && parsedMessage.detectedReferences.length > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                                <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
                                    <Link2 className="w-4 h-4" />
                                    Referenced Tickets
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {parsedMessage.detectedReferences.map((ref, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => onEditJob?.(ref.jobId)}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-blue-300 rounded text-sm text-blue-700 hover:bg-blue-100 transition"
                                        >
                                            <span className="font-mono text-xs">#{ref.jobId.slice(-6)}</span>
                                            <span className="text-gray-500">-</span>
                                            <span className="truncate max-w-[150px]">{ref.jobTitle}</span>
                                            <span className={`text-xs px-1 py-0.5 rounded ${ref.confidence === 'high' ? 'bg-green-100 text-green-700' :
                                                    ref.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-gray-100 text-gray-600'
                                                }`}>
                                                {ref.confidence}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {message.type === 'voicemail' ? (
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Mic className="w-5 h-5 text-purple-600" />
                                    <span className="font-medium text-purple-800">Voicemail Message</span>
                                </div>

                                {message.transcriptionPending ? (
                                    <div className="bg-white rounded-lg p-4 border border-purple-100">
                                        <div className="flex items-center gap-2 text-purple-600 mb-2">
                                            <div className="animate-pulse w-3 h-3 bg-purple-500 rounded-full"></div>
                                            <span className="font-medium">AI Transcription Coming Soon</span>
                                        </div>
                                        <p className="text-sm text-gray-600">
                                            Voicemail transcription is being developed. For now, please listen to the voicemail directly.
                                        </p>
                                        <button className="mt-3 text-sm text-purple-600 hover:text-purple-800 font-medium">
                                            🎧 Play Voicemail (Coming Soon)
                                        </button>
                                    </div>
                                ) : message.transcription ? (
                                    <div className="bg-white rounded-lg p-4 border border-purple-100">
                                        <p className="text-sm text-gray-700 italic">"{message.transcription}"</p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-purple-700">No transcription available</p>
                                )}
                            </div>
                        ) : (
                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <p className="text-gray-800 whitespace-pre-wrap">{message.content}</p>
                            </div>
                        )}

                        {/* Suggested Actions */}
                        {suggestedActions.length > 0 && (
                            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <h4 className="text-sm font-medium text-yellow-800 mb-2 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4" />
                                    Suggested Actions
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {suggestedActions.map((action, idx) => (
                                        <button
                                            key={idx}
                                            className="px-3 py-1 bg-white border border-yellow-300 rounded-full text-sm text-yellow-800 hover:bg-yellow-100 transition"
                                        >
                                            {action}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Reply Section */}
                    {message.type !== 'voicemail' && (
                        <div className="px-6 pb-6 border-t bg-gray-50">
                            <div className="pt-4">
                                <div className="flex items-center justify-between mb-3">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Reply via:
                                    </label>
                                    <button
                                        onClick={() => setShowCannedResponses(!showCannedResponses)}
                                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        Quick Responses
                                    </button>
                                </div>

                                {/* Canned Responses Dropdown */}
                                {showCannedResponses && (
                                    <div className="mb-3 p-2 bg-white border border-gray-200 rounded-lg shadow-sm">
                                        <div className="grid grid-cols-2 gap-2">
                                            {CANNED_RESPONSES.map((response, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleCannedResponse(response.text)}
                                                    className="text-left p-2 text-sm hover:bg-gray-100 rounded transition"
                                                >
                                                    {response.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2 mb-3">
                                    <button
                                        onClick={() => setReplyMethod('email')}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${replyMethod === 'email'
                                            ? 'bg-blue-100 text-blue-800 border-2 border-blue-500'
                                            : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                                            }`}
                                    >
                                        <Mail className="w-4 h-4" />
                                        Email
                                    </button>
                                    <button
                                        onClick={() => setReplyMethod('sms')}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${replyMethod === 'sms'
                                            ? 'bg-green-100 text-green-800 border-2 border-green-500'
                                            : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                                            }`}
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                        SMS
                                    </button>
                                </div>

                                <textarea
                                    value={reply}
                                    onChange={(e) => setReply(e.target.value)}
                                    placeholder={`Type your ${replyMethod === 'email' ? 'email' : 'text message'} reply...`}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                    rows={3}
                                />

                                <div className="flex justify-between mt-3">
                                    <span className="text-xs text-gray-400">
                                        {replyMethod === 'sms' ? `${reply.length}/160 characters` : ''}
                                    </span>
                                    <button
                                        onClick={handleSend}
                                        disabled={!reply.trim() || sending}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                                    >
                                        <Send className="w-4 h-4" />
                                        {sending ? 'Sending...' : 'Send Reply'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Voicemail Call Back */}
                    {message.type === 'voicemail' && (
                        <div className="px-6 pb-6 border-t bg-gray-50">
                            <div className="pt-4">
                                <p className="text-sm text-gray-600 mb-3">
                                    This is a voicemail. You can call back or send a text/email.
                                </p>
                                <div className="flex gap-2">
                                    <a
                                        href={`tel:${message.customerContact}`}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
                                    >
                                        <Phone className="w-4 h-4" />
                                        Call Back
                                    </a>
                                    <button
                                        onClick={() => setReplyMethod('sms')}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                        Send Text
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
