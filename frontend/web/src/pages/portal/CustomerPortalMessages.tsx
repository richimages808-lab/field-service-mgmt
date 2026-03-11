/**
 * CustomerPortalMessages - Customer communication history and messaging
 */

import React, { useEffect, useState } from 'react';
import { usePortalContext } from './CustomerPortalLayout';
import { db } from '../../firebase';
import { collection, query, where, orderBy, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import { Communication } from '../../types';
import toast from 'react-hot-toast';

export const CustomerPortalMessages: React.FC = () => {
    const { customer, organization, loading: contextLoading } = usePortalContext();

    const [communications, setCommunications] = useState<Communication[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    // New message form
    const [newMessage, setNewMessage] = useState('');
    const [subject, setSubject] = useState('');

    useEffect(() => {
        const fetchCommunications = async () => {
            if (!customer) {
                setLoading(false);
                return;
            }

            try {
                const q = query(
                    collection(db, 'communications'),
                    where('customer_id', '==', customer.id),
                    orderBy('createdAt', 'desc')
                );
                const snapshot = await getDocs(q);
                setCommunications(
                    snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Communication))
                );
            } catch (error) {
                console.error('Error fetching communications:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCommunications();
    }, [customer]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!newMessage.trim() || !customer || !organization) {
            toast.error('Please enter a message');
            return;
        }

        setSending(true);

        try {
            // Create new communication record
            await addDoc(collection(db, 'communications'), {
                org_id: organization.id,
                customer_id: customer.id,
                type: 'email',
                direction: 'inbound',
                status: 'pending',
                subject: subject || 'Message from Customer Portal',
                content: newMessage,
                from: customer.email || 'Customer',
                to: organization.outboundEmail?.fromEmail || 'support',
                isAutomated: false,
                containsPII: false,
                isArchived: false,
                createdAt: Timestamp.now()
            });

            toast.success('Message sent successfully!');
            setNewMessage('');
            setSubject('');

            // Refresh messages
            const q = query(
                collection(db, 'communications'),
                where('customer_id', '==', customer.id),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            setCommunications(
                snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Communication))
            );
        } catch (error) {
            console.error('Error sending message:', error);
            toast.error('Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const getTypeIcon = (type: string) => {
        const icons: Record<string, string> = {
            email: '✉️',
            sms: '💬',
            voicemail: '🎤',
            call: '📞',
            note: '📝',
            system: '🔔'
        };
        return icons[type] || '💬';
    };

    const getDirectionColor = (direction: string) => {
        if (direction === 'inbound') return 'bg-blue-50 border-blue-200';
        if (direction === 'outbound') return 'bg-gray-50 border-gray-200';
        return 'bg-yellow-50 border-yellow-200';
    };

    if (contextLoading || loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
                <p className="text-gray-500">View your communication history and send us a message</p>
            </div>

            {/* New Message Form */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="font-semibold text-gray-900">Send a Message</h2>
                </div>
                <form onSubmit={handleSendMessage} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Subject <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="What is this about?"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Message
                        </label>
                        <textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="How can we help you?"
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                            required
                        />
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={sending || !newMessage.trim()}
                            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            {sending ? 'Sending...' : 'Send Message'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Communication History */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b">
                    <h2 className="font-semibold text-gray-900">Message History</h2>
                </div>

                {communications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <p className="text-4xl mb-4">💬</p>
                        <p className="font-medium">No messages yet</p>
                        <p className="text-sm">Send us a message and we'll get back to you!</p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {communications.map((comm) => (
                            <div
                                key={comm.id}
                                className={`p-4 ${getDirectionColor(comm.direction)}`}
                            >
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl">{getTypeIcon(comm.type)}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium text-gray-900">
                                                {comm.direction === 'inbound' ? 'You' : organization?.name || 'Support'}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {formatDate(comm.createdAt)}
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${comm.direction === 'inbound'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                {comm.direction === 'inbound' ? 'Sent' : 'Received'}
                                            </span>
                                        </div>
                                        {comm.subject && (
                                            <p className="text-sm font-medium text-gray-800 mb-1">
                                                {comm.subject}
                                            </p>
                                        )}
                                        <p className="text-gray-700 whitespace-pre-wrap">
                                            {comm.content}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
