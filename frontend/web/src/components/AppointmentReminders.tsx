import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { AppointmentReminder, Job } from '../types';
import { Bell, Send, Clock, Check, X, AlertCircle, Phone, Mail, MessageSquare, Plus, Trash2 } from 'lucide-react';

interface AppointmentRemindersProps {
    job: Job;
    compact?: boolean;
}

const REMINDER_TEMPLATES = {
    '24h_before': {
        label: '24 Hours Before',
        sms: 'Reminder: Your appointment with {company} is tomorrow at {time}. Address: {address}. Reply CONFIRM to confirm or call {phone} to reschedule.',
        email: 'This is a reminder that your service appointment is scheduled for tomorrow.\n\nDate: {date}\nTime: {time}\nAddress: {address}\n\nPlease ensure someone is available to provide access. If you need to reschedule, please call us at {phone}.'
    },
    '2h_before': {
        label: '2 Hours Before',
        sms: '{company}: Your technician will arrive in approximately 2 hours. Current ETA: {time}. Call {phone} with any questions.',
        email: 'Your technician is scheduled to arrive in approximately 2 hours.\n\nETA: {time}\nAddress: {address}\n\nPlease ensure someone is available.'
    },
    'on_the_way': {
        label: 'On The Way',
        sms: 'Your {company} technician is on the way! ETA: {eta} minutes. Technician: {tech_name}.',
        email: 'Good news! Your technician is on the way.\n\nTechnician: {tech_name}\nEstimated Arrival: {eta} minutes\n\nPlease ensure access is available.'
    }
};

export const AppointmentReminders: React.FC<AppointmentRemindersProps> = ({
    job,
    compact = false
}) => {
    const { user } = useAuth();
    const [reminders, setReminders] = useState<AppointmentReminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [sending, setSending] = useState(false);

    // Form state
    const [reminderType, setReminderType] = useState<'sms' | 'email'>('sms');
    const [templateKey, setTemplateKey] = useState<keyof typeof REMINDER_TEMPLATES>('24h_before');
    const [customMessage, setCustomMessage] = useState('');
    const [scheduleTime, setScheduleTime] = useState<string>('');

    const orgId = (user as any)?.org_id || 'demo-org';

    useEffect(() => {
        const remindersQuery = query(
            collection(db, 'appointment_reminders'),
            where('job_id', '==', job.id),
            orderBy('scheduledFor', 'desc')
        );

        const unsubscribe = onSnapshot(remindersQuery, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as AppointmentReminder));
            setReminders(data);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching reminders:', error);
            setLoading(false);
        });

        return unsubscribe;
    }, [job.id]);

    const fillTemplate = (template: string) => {
        const scheduledTime = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
        return template
            .replace(/{company}/g, 'DispatchBox')
            .replace(/{date}/g, scheduledTime.toLocaleDateString())
            .replace(/{time}/g, scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
            .replace(/{address}/g, job.customer.address)
            .replace(/{phone}/g, '(808) 555-1234')
            .replace(/{tech_name}/g, job.assigned_tech_name || 'Your technician')
            .replace(/{eta}/g, '15-20');
    };

    const handleScheduleReminder = async () => {
        if (!user) return;

        setSending(true);

        try {
            const template = REMINDER_TEMPLATES[templateKey];
            const message = customMessage || fillTemplate(reminderType === 'sms' ? template.sms : template.email);

            let scheduledFor;
            if (scheduleTime) {
                scheduledFor = Timestamp.fromDate(new Date(scheduleTime));
            } else {
                // Calculate based on template
                const jobTime = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
                const offset = templateKey === '24h_before' ? 24 * 60 : templateKey === '2h_before' ? 2 * 60 : 0;
                const reminderTime = new Date(jobTime.getTime() - offset * 60 * 1000);
                scheduledFor = Timestamp.fromDate(reminderTime);
            }

            const reminderData = {
                job_id: job.id,
                org_id: orgId,
                type: reminderType,
                scheduledFor,
                status: 'pending' as const,
                message,
                ...(reminderType === 'sms' ? { recipientPhone: job.customer.phone } : { recipientEmail: job.customer.email })
            };

            await addDoc(collection(db, 'appointment_reminders'), reminderData);

            setShowScheduleForm(false);
            setCustomMessage('');
            setScheduleTime('');
        } catch (error) {
            console.error('Error scheduling reminder:', error);
            alert('Failed to schedule reminder');
        }

        setSending(false);
    };

    const handleSendNow = async (type: 'sms' | 'email', templateKey: keyof typeof REMINDER_TEMPLATES) => {
        if (!user) return;

        setSending(true);

        try {
            const template = REMINDER_TEMPLATES[templateKey];
            const message = fillTemplate(type === 'sms' ? template.sms : template.email);

            // In production, this would call a Firebase Function to send via Twilio/SendGrid
            // For now, we just record it
            await addDoc(collection(db, 'appointment_reminders'), {
                job_id: job.id,
                org_id: orgId,
                type,
                scheduledFor: serverTimestamp(),
                sentAt: serverTimestamp(),
                status: 'sent' as const,
                message,
                ...(type === 'sms' ? { recipientPhone: job.customer.phone } : { recipientEmail: job.customer.email })
            });

            alert(`${type.toUpperCase()} notification sent!`);
        } catch (error) {
            console.error('Error sending notification:', error);
            alert('Failed to send notification');
        }

        setSending(false);
    };

    const handleCancelReminder = async (reminderId: string) => {
        if (!confirm('Cancel this scheduled reminder?')) return;

        try {
            await updateDoc(doc(db, 'appointment_reminders', reminderId), {
                status: 'cancelled',
                cancelledAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Error cancelling reminder:', error);
        }
    };

    const handleDeleteReminder = async (reminderId: string) => {
        if (!confirm('Delete this reminder record?')) return;

        try {
            await deleteDoc(doc(db, 'appointment_reminders', reminderId));
        } catch (error) {
            console.error('Error deleting reminder:', error);
        }
    };

    const getStatusBadge = (status: AppointmentReminder['status']) => {
        switch (status) {
            case 'pending':
                return <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
            case 'sent':
                return <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full flex items-center gap-1"><Check className="w-3 h-3" /> Sent</span>;
            case 'failed':
                return <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Failed</span>;
            case 'cancelled':
                return <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full flex items-center gap-1"><X className="w-3 h-3" /> Cancelled</span>;
        }
    };

    if (compact) {
        const pendingReminders = reminders.filter(r => r.status === 'pending');
        const sentReminders = reminders.filter(r => r.status === 'sent');

        return (
            <div className="bg-white rounded-lg shadow p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold">Reminders</span>
                    </div>
                    <div className="flex gap-1">
                        <button
                            onClick={() => handleSendNow('sms', 'on_the_way')}
                            disabled={sending}
                            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                            title="Send SMS"
                        >
                            <MessageSquare className="w-3 h-3" />
                        </button>
                        <button
                            onClick={() => handleSendNow('email', 'on_the_way')}
                            disabled={sending}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            title="Send Email"
                        >
                            <Mail className="w-3 h-3" />
                        </button>
                    </div>
                </div>
                <div className="text-xs text-gray-500">
                    {pendingReminders.length > 0 && <p>{pendingReminders.length} scheduled</p>}
                    {sentReminders.length > 0 && <p>{sentReminders.length} sent</p>}
                    {reminders.length === 0 && <p>No reminders configured</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Appointment Reminders</h3>
                </div>
                <button
                    onClick={() => setShowScheduleForm(!showScheduleForm)}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                    <Plus className="w-4 h-4" />
                    Schedule
                </button>
            </div>

            {/* Quick Send Buttons */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">Quick Notify:</p>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => handleSendNow('sms', 'on_the_way')}
                        disabled={sending || !job.customer.phone}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                    >
                        <MessageSquare className="w-4 h-4" />
                        SMS: On The Way
                    </button>
                    <button
                        onClick={() => handleSendNow('email', 'on_the_way')}
                        disabled={sending || !job.customer.email}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                    >
                        <Mail className="w-4 h-4" />
                        Email: On The Way
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    To: {job.customer.phone || 'No phone'} | {job.customer.email || 'No email'}
                </p>
            </div>

            {/* Schedule Form */}
            {showScheduleForm && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                    <h4 className="font-medium mb-3">Schedule New Reminder</h4>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setReminderType('sms')}
                                    className={`flex-1 px-3 py-2 rounded text-sm flex items-center justify-center gap-1 ${
                                        reminderType === 'sms'
                                            ? 'bg-green-100 text-green-700 border border-green-300'
                                            : 'bg-white border border-gray-300 text-gray-600'
                                    }`}
                                >
                                    <MessageSquare className="w-4 h-4" /> SMS
                                </button>
                                <button
                                    onClick={() => setReminderType('email')}
                                    className={`flex-1 px-3 py-2 rounded text-sm flex items-center justify-center gap-1 ${
                                        reminderType === 'email'
                                            ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                            : 'bg-white border border-gray-300 text-gray-600'
                                    }`}
                                >
                                    <Mail className="w-4 h-4" /> Email
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
                            <select
                                value={templateKey}
                                onChange={(e) => setTemplateKey(e.target.value as keyof typeof REMINDER_TEMPLATES)}
                                className="w-full p-2 border rounded"
                            >
                                {Object.entries(REMINDER_TEMPLATES).map(([key, template]) => (
                                    <option key={key} value={key}>{template.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Custom Time (optional)
                        </label>
                        <input
                            type="datetime-local"
                            value={scheduleTime}
                            onChange={(e) => setScheduleTime(e.target.value)}
                            className="w-full p-2 border rounded"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Leave empty to send at default time for template
                        </p>
                    </div>

                    <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Message Preview
                        </label>
                        <textarea
                            value={customMessage || fillTemplate(reminderType === 'sms'
                                ? REMINDER_TEMPLATES[templateKey].sms
                                : REMINDER_TEMPLATES[templateKey].email
                            )}
                            onChange={(e) => setCustomMessage(e.target.value)}
                            rows={4}
                            className="w-full p-2 border rounded text-sm"
                        />
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleScheduleReminder}
                            disabled={sending}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Clock className="w-4 h-4" />
                            {sending ? 'Scheduling...' : 'Schedule Reminder'}
                        </button>
                        <button
                            onClick={() => { setShowScheduleForm(false); setCustomMessage(''); }}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Reminders List */}
            {loading ? (
                <p className="text-gray-500 text-sm">Loading reminders...</p>
            ) : reminders.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                    No reminders scheduled for this job.
                </p>
            ) : (
                <div className="space-y-2">
                    {reminders.map(reminder => (
                        <div
                            key={reminder.id}
                            className="p-3 rounded-lg border bg-white flex items-start justify-between"
                        >
                            <div className="flex items-start gap-3">
                                <div className={`p-2 rounded ${
                                    reminder.type === 'sms' ? 'bg-green-100' : 'bg-blue-100'
                                }`}>
                                    {reminder.type === 'sms' ? (
                                        <MessageSquare className={`w-4 h-4 text-green-600`} />
                                    ) : (
                                        <Mail className={`w-4 h-4 text-blue-600`} />
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm">
                                            {reminder.type.toUpperCase()}
                                        </span>
                                        {getStatusBadge(reminder.status)}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {reminder.status === 'sent'
                                            ? `Sent: ${reminder.sentAt?.toDate?.().toLocaleString() || 'Recently'}`
                                            : `Scheduled: ${reminder.scheduledFor?.toDate?.().toLocaleString() || 'Soon'}`
                                        }
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                        {reminder.message}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {reminder.status === 'pending' && (
                                    <button
                                        onClick={() => handleCancelReminder(reminder.id)}
                                        className="p-1 text-gray-400 hover:text-orange-600"
                                        title="Cancel"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDeleteReminder(reminder.id)}
                                    className="p-1 text-gray-400 hover:text-red-600"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
