/**
 * SchedulingApprovalsPanel — Dispatcher Console strip for appointment dates.
 *
 *   • Needs your OK          — auto-proposed times not yet sent to the customer
 *   • Customer wants a change — customer asked for a different date (their picks shown)
 *   • Requested by customer   — unscheduled jobs with the customer's preferred dates
 *
 * Scheduling a job yourself counts as approval; the server then sends the
 * customer the actual date with a "Request a different time" link.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, CalendarX2, ChevronDown, ChevronUp, Send } from 'lucide-react';
import type { Job } from '../../types';
import {
    confirmJobSchedule, dismissCustomerReschedule, formatJobTime, formatWindow,
    getRequestedWindows, hasPendingCustomerReschedule, isScheduleAwaitingApproval,
} from '../../lib/scheduleConfirmation';

interface Props {
    jobs: Job[];
    user: any;
    onSelectJob?: (job: Job) => void;
}

export const SchedulingApprovalsPanel: React.FC<Props> = ({ jobs, user, onSelectJob }) => {
    const [open, setOpen] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const awaiting = useMemo(() => jobs.filter(j => isScheduleAwaitingApproval(j)), [jobs]);
    const changeReqs = useMemo(() => jobs.filter(j => hasPendingCustomerReschedule(j)), [jobs]);
    const requested = useMemo(() => jobs.filter(j =>
        !j.scheduled_at && ['pending', 'unscheduled'].includes(j.status) && !(j as any).archived &&
        getRequestedWindows(j).length > 0 && !hasPendingCustomerReschedule(j)), [jobs]);

    if (awaiting.length + changeReqs.length + requested.length === 0) return null;

    const run = async (id: string, fn: () => Promise<void>, ok: string) => {
        setBusyId(id);
        try { await fn(); toast.success(ok); }
        catch (e: any) { toast.error(e?.message || 'Something went wrong'); }
        finally { setBusyId(null); }
    };

    return (
        <div id="scheduling-approvals" className="bg-white border border-gray-200 rounded-xl shadow-sm mb-3 overflow-hidden">
            <button type="button" onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-50 to-white text-sm font-semibold text-gray-900 cursor-pointer">
                <CalendarClock className="w-4 h-4 text-amber-600" />
                Appointment dates
                <span className="text-xs font-normal text-gray-500">
                    {awaiting.length} need your OK · {changeReqs.length} customer change request{changeReqs.length === 1 ? '' : 's'} · {requested.length} waiting to be scheduled
                </span>
                {open ? <ChevronUp className="w-4 h-4 text-gray-400 ml-auto" /> : <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />}
            </button>

            {open && (
                <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {changeReqs.map(j => {
                        const r: any = (j as any).customer_reschedule_request;
                        return (
                            <li key={`c-${j.id}`} className="px-4 py-2 bg-orange-50" data-testid="approval-change-row">
                                <div className="flex items-center gap-3">
                                    <CalendarX2 className="w-4 h-4 text-orange-600 shrink-0" />
                                    <button type="button" onClick={() => onSelectJob?.(j)} className="text-sm font-medium text-gray-900 truncate hover:underline cursor-pointer">
                                        {j.customer?.name || 'Job'}
                                    </button>
                                    <span className="text-xs text-orange-800">wants a different time{j.scheduled_at ? ` (now ${formatJobTime(j)})` : ''}</span>
                                    <button type="button" disabled={busyId === j.id}
                                        onClick={() => run(j.id, () => dismissCustomerReschedule(j.id), 'Kept the current time')}
                                        className="ml-auto text-xs px-2 py-1 rounded-md border border-orange-300 text-orange-800 hover:bg-orange-100 cursor-pointer">Keep current time</button>
                                </div>
                                <div className="mt-1 pl-7 text-xs text-orange-900">
                                    Customer can do: {(r?.windows || []).map((w: any) => formatWindow(w)).join('  ·  ')}
                                    {r?.note ? <span className="italic"> — "{r.note}"</span> : null}
                                </div>
                                <div className="pl-7 text-[11px] text-orange-700">Drag the job to one of these times — the customer is sent the new date automatically.</div>
                            </li>
                        );
                    })}

                    {awaiting.map(j => (
                        <li key={`a-${j.id}`} className="flex items-center gap-3 px-4 py-2" data-testid="approval-awaiting-row">
                            <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
                            <button type="button" onClick={() => onSelectJob?.(j)} className="text-sm font-medium text-gray-900 truncate hover:underline cursor-pointer">
                                {j.customer?.name || 'Job'}
                            </button>
                            <span className="text-xs text-gray-600">Proposed: <strong>{formatJobTime(j)}</strong>{j.assigned_tech_name ? ` · ${j.assigned_tech_name}` : ''}</span>
                            <button type="button" disabled={busyId === j.id} id={`confirm-schedule-${j.id}`}
                                onClick={() => run(j.id, () => confirmJobSchedule(j.id, user), 'Confirmed — customer is being notified')}
                                className="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700 cursor-pointer disabled:opacity-50">
                                <Send className="w-3 h-3" /> Confirm & notify customer
                            </button>
                        </li>
                    ))}

                    {requested.map(j => (
                        <li key={`r-${j.id}`} className="px-4 py-2" data-testid="approval-requested-row">
                            <div className="flex items-center gap-3">
                                <CalendarClock className="w-4 h-4 text-blue-500 shrink-0" />
                                <button type="button" onClick={() => onSelectJob?.(j)} className="text-sm font-medium text-gray-900 truncate hover:underline cursor-pointer">
                                    {j.customer?.name || 'Job'}
                                </button>
                                <span className="text-xs text-gray-500">not scheduled yet</span>
                            </div>
                            <div className="mt-1 pl-7 text-xs text-blue-900">
                                Customer requested: {getRequestedWindows(j).map(w => formatWindow(w)).join('  ·  ')}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
