/**
 * scheduleConfirmation.ts — Staff approval of appointment dates.
 *
 * Flow:
 *   1. Customer picks 2–3 preferred dates when approving the quote
 *      (saved on job.request.availabilityWindows).
 *   2. A dispatcher/tech schedules the job. Scheduling it yourself = approval.
 *      Auto-scheduled times are only proposals (schedule_confirmation.status
 *      = 'pending') until someone taps "Confirm & notify customer".
 *   3. The server then sends the customer the actual date with a
 *      "Request a different time" link.
 *   4. If the customer asks for another date, job.customer_reschedule_request
 *      is 'pending' until staff set a new time (server marks it resolved).
 */

import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface AvailabilityWindow {
    day: string;            // YYYY-MM-DD
    preferredTime?: string; // morning | afternoon | evening
    startTime?: string;     // HH:mm
    endTime?: string;       // HH:mm
}

const WINDOW_LABELS: Record<string, string> = {
    morning: 'Morning (8am–12pm)',
    afternoon: 'Afternoon (12–5pm)',
    evening: 'Evening (5–8pm)',
};

export function formatWindow(w: AvailabilityWindow): string {
    let dayText = w.day;
    if (/^\d{4}-\d{2}-\d{2}$/.test(w.day || '')) {
        const d = new Date(`${w.day}T12:00:00`);
        dayText = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    const slot = (w.preferredTime && WINDOW_LABELS[w.preferredTime])
        || (w.startTime && w.endTime ? `${w.startTime}–${w.endTime}` : '');
    return slot ? `${dayText} · ${slot}` : dayText;
}

export function getRequestedWindows(job: any): AvailabilityWindow[] {
    const raw = job?.request?.availabilityWindows;
    return Array.isArray(raw) ? raw.filter((w: any) => w && w.day) : [];
}

export function isScheduleAwaitingApproval(job: any): boolean {
    return !!job?.scheduled_at && job?.schedule_confirmation?.status === 'pending';
}

export function hasPendingCustomerReschedule(job: any): boolean {
    return job?.customer_reschedule_request?.status === 'pending';
}

export function formatJobTime(job: any): string {
    const v = job?.scheduled_at;
    if (!v) return '';
    const d = v?.toDate ? v.toDate() : new Date(v);
    if (isNaN(d.getTime())) return '';
    try {
        return d.toLocaleString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            ...(job?.timezone ? { timeZone: job.timezone } : {}),
        });
    } catch {
        return d.toLocaleString();
    }
}

/** Staff approves the proposed time → server sends the customer the actual date. */
export async function confirmJobSchedule(jobId: string, user: { uid?: string; displayName?: string | null; email?: string | null; name?: string } | null) {
    await updateDoc(doc(db, 'jobs', jobId), {
        schedule_confirmation: {
            status: 'confirmed',
            confirmedBy: user?.uid || 'staff',
            confirmedByName: user?.name || user?.displayName || user?.email || 'Staff',
            confirmedAt: serverTimestamp(),
        },
    });
}

/** Keep the current time (customer will be re-sent nothing); just closes the request. */
export async function dismissCustomerReschedule(jobId: string) {
    await updateDoc(doc(db, 'jobs', jobId), {
        'customer_reschedule_request.status': 'dismissed',
        'customer_reschedule_request.resolvedAt': serverTimestamp(),
        reschedule_requested: false,
    });
}
