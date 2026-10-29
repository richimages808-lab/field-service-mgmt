/**
 * ScheduleApprovalCard — on Job Detail. Shows, in plain language:
 *   • the customer's requested dates (from quote approval or a change request)
 *   • a proposed (auto-scheduled) time waiting for staff OK → [Confirm & notify customer]
 *   • a customer "different time" request → pick a new time, or [Keep current time]
 *   • what the customer was told, once sent
 */
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast';
import { CalendarClock, CalendarCheck2, CalendarX2, Send } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import {
    confirmJobSchedule, dismissCustomerReschedule, formatJobTime, formatWindow,
    getRequestedWindows, hasPendingCustomerReschedule, isScheduleAwaitingApproval,
} from '../../lib/scheduleConfirmation';

export const ScheduleApprovalCard: React.FC<{ job: any; compact?: boolean }> = ({ job: initialJob, compact }) => {
    const { user } = useAuth() as any;
    const [busy, setBusy] = useState(false);
    const [live, setLive] = useState<any>(null);
    const jobId = initialJob?.id;
    useEffect(() => {
        if (!jobId) return;
        return onSnapshot(doc(db, 'jobs', jobId), snap => {
            if (snap.exists()) setLive({ id: snap.id, ...snap.data() });
        }, () => { /* ignore */ });
    }, [jobId]);
    const job = live || initialJob;
    if (!job || ['completed', 'cancelled'].includes(job.status)) return null;

    const windows = getRequestedWindows(job);
    const awaiting = isScheduleAwaitingApproval(job);
    const customerReq = hasPendingCustomerReschedule(job) ? job.customer_reschedule_request : null;
    const notice = job.customer_schedule_notice;
    const unscheduled = !job.scheduled_at;

    if (!awaiting && !customerReq && !(unscheduled && windows.length > 0) && !notice) return null;

    const onConfirm = async () => {
        setBusy(true);
        try {
            await confirmJobSchedule(job.id, user);
            toast.success('Confirmed — the customer is being sent the appointment date.');
        } catch (e: any) {
            toast.error('Could not confirm: ' + (e?.message || 'error'));
        } finally { setBusy(false); }
    };
    const onKeep = async () => {
        setBusy(true);
        try {
            await dismissCustomerReschedule(job.id);
            toast('Kept the current time. Let the customer know if needed.', { icon: '📅' });
        } catch (e: any) {
            toast.error('Could not update: ' + (e?.message || 'error'));
        } finally { setBusy(false); }
    };

    return (
        <div id="schedule-approval-card" className={`rounded-xl border bg-white shadow-sm ${compact ? 'p-3' : 'p-4'} space-y-3`}>
            {customerReq && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3" data-testid="customer-reschedule-request">
                    <div className="flex items-center gap-2 text-sm font-semibold text-orange-900">
                        <CalendarX2 className="w-4 h-4" /> Customer asked for a different time
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-orange-900">
                        {(customerReq.windows || []).map((w: any, i: number) => (
                            <li key={i}>• {formatWindow(w)}</li>
                        ))}
                    </ul>
                    {customerReq.note && <p className="mt-2 text-xs italic text-orange-800">"{customerReq.note}"</p>}
                    <p className="mt-2 text-xs text-orange-800">
                        Pick a new time on the Dispatcher Console or with Edit Job — the customer is sent the new date automatically.
                    </p>
                    <button type="button" disabled={busy} onClick={onKeep} id="keep-current-time-btn"
                        className="mt-2 text-xs px-2.5 py-1 rounded-md border border-orange-300 text-orange-800 hover:bg-orange-100 cursor-pointer disabled:opacity-50">
                        Keep current time
                    </button>
                </div>
            )}

            {awaiting && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="schedule-awaiting-approval">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                        <CalendarClock className="w-4 h-4" /> Proposed time — not sent to the customer yet
                    </div>
                    <p className="mt-1 text-sm text-amber-900">
                        {formatJobTime(job)}{job.assigned_tech_name ? ` · ${job.assigned_tech_name}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-amber-800">Auto-scheduling picked this time. Confirm it (or move it) and the customer is sent the actual date.</p>
                    <button type="button" disabled={busy} onClick={onConfirm} id="confirm-schedule-btn"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700 cursor-pointer disabled:opacity-50">
                        <Send className="w-3.5 h-3.5" /> Confirm & notify customer
                    </button>
                </div>
            )}

            {windows.length > 0 && (unscheduled || awaiting) && !customerReq && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3" data-testid="customer-requested-times">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                        <CalendarClock className="w-4 h-4" /> Customer's requested times
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-blue-900">
                        {windows.map((w, i) => <li key={i}>• {formatWindow(w)}</li>)}
                    </ul>
                    {unscheduled && (
                        <p className="mt-2 text-xs text-blue-800">Schedule one of these on the Dispatcher Console. Once you schedule it, the customer is sent the actual date.</p>
                    )}
                </div>
            )}

            {notice && !awaiting && !customerReq && job.scheduled_at && (
                <div className="flex items-start gap-2 text-xs text-emerald-800" data-testid="customer-schedule-notice">
                    <CalendarCheck2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Customer {notice.sent ? 'was sent' : 'could not be sent'} the appointment date: <strong>{notice.timeText}</strong>{notice.sent ? ' — with a link to request a different time.' : ''}</span>
                </div>
            )}
        </div>
    );
};
