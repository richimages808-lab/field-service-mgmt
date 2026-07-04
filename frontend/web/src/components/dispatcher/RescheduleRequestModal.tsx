import React, { useState } from 'react';
import { Clock, Calendar, MessageSquare, Send, X, AlertTriangle } from 'lucide-react';
import { doc, collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Job } from '../../types';
import toast from 'react-hot-toast';

interface RescheduleRequestModalProps {
    job: Job;
    techId: string;
    techName: string;
    onClose: () => void;
}

export const RescheduleRequestModal: React.FC<RescheduleRequestModalProps> = ({
    job, techId, techName, onClose
}) => {
    const [requestedDate, setRequestedDate] = useState('');
    const [requestedTime, setRequestedTime] = useState('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!reason.trim()) {
            toast.error('Please provide a reason for the reschedule request.');
            return;
        }

        setSubmitting(true);
        try {
            const requestData: any = {
                jobId: job.id,
                techId,
                techName,
                reason: reason.trim(),
                status: 'pending',
                createdAt: Timestamp.now(),
                customerName: job.customer?.name || 'Unknown',
                currentScheduledAt: job.scheduled_at || null,
            };

            if (requestedDate) {
                const dateTime = requestedTime
                    ? new Date(`${requestedDate}T${requestedTime}`)
                    : new Date(`${requestedDate}T09:00`);
                requestData.requestedNewTime = Timestamp.fromDate(dateTime);
            }

            // Write to rescheduleRequests subcollection on the job
            const requestsRef = collection(db, 'jobs', job.id, 'rescheduleRequests');
            await addDoc(requestsRef, requestData);

            toast.success('Reschedule request sent to dispatcher');
            onClose();
        } catch (error) {
            console.error('Error submitting reschedule request:', error);
            toast.error('Failed to send reschedule request.');
        } finally {
            setSubmitting(false);
        }
    };

    const currentSchedule = job.scheduled_at
        ? (() => {
            const d = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
            return d instanceof Date && !isNaN(d.getTime())
                ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                : 'Not scheduled';
        })()
        : 'Not scheduled';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-500 text-white rounded-full flex items-center justify-center">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-base">Request Reschedule</h3>
                            <p className="text-xs text-gray-500">{job.customer?.name || 'Job'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {/* Current schedule */}
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Current Schedule</div>
                            <div className="text-sm text-gray-800 font-medium">{currentSchedule}</div>
                        </div>
                    </div>

                    {/* Requested new date/time (optional) */}
                    <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">Preferred New Date & Time <span className="text-gray-400 font-normal">(optional)</span></label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={requestedDate}
                                onChange={(e) => setRequestedDate(e.target.value)}
                                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                            />
                            <input
                                type="time"
                                value={requestedTime}
                                onChange={(e) => setRequestedTime(e.target.value)}
                                className="w-28 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">
                            Reason for Reschedule <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Customer not available, equipment delay, scheduling conflict..."
                            rows={3}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                        />
                    </div>

                    {/* Info note */}
                    <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2 text-[11px] text-blue-700">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <p>Your dispatcher will review this request and either approve a new time or keep the current schedule.</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || !reason.trim()}
                        className="px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {submitting ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Send className="w-3.5 h-3.5" />
                        )}
                        {submitting ? 'Sending...' : 'Send Request'}
                    </button>
                </div>
            </div>
        </div>
    );
};
