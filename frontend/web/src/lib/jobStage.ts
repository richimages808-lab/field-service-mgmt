/**
 * jobStage.ts — ONE place that turns a job's raw data into what people see:
 * a stage label, a color, why it's waiting, and exactly one "next action".
 *
 * Pipeline:
 *   New → Quoted → Approved (waiting) → Ready to schedule → Scheduled →
 *   Dispatched → On the way → On site → Completed → Invoiced → Paid
 *
 * Use getJobStage() everywhere (job list, job detail, dispatcher, tech app)
 * so wording is identical across the product.
 */

import type { Job, OrgWorkflowSettings } from '../types';

export type StageKey =
    | 'new' | 'quoted' | 'waiting' | 'ready' | 'scheduled' | 'dispatched'
    | 'en_route' | 'on_site' | 'completed' | 'invoiced' | 'paid' | 'cancelled';

export type NextActionId =
    | 'create_quote' | 'view_quote' | 'collect_deposit' | 'order_parts' | 'schedule'
    | 'dispatch' | 'await_ack' | 'accept' | 'start_driving' | 'check_in' | 'complete'
    | 'create_invoice' | 'send_invoice' | 'record_payment' | 'none';

export interface JobStage {
    key: StageKey;
    label: string;
    /** Tailwind classes for a pill badge */
    badgeClass: string;
    /** Short explanation shown under the label, e.g. "Waiting on deposit" */
    detail?: string;
    nextAction: { id: NextActionId; label: string };
    /** Ordered index for progress bars (0-based) */
    step: number;
}

export const PIPELINE_STEPS: Array<{ key: StageKey; label: string }> = [
    { key: 'new', label: 'New' },
    { key: 'quoted', label: 'Quoted' },
    { key: 'ready', label: 'Approved' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'dispatched', label: 'Dispatched' },
    { key: 'en_route', label: 'On the way' },
    { key: 'on_site', label: 'On site' },
    { key: 'completed', label: 'Completed' },
    { key: 'invoiced', label: 'Invoiced' },
];

const BADGE: Record<StageKey, string> = {
    new: 'bg-slate-100 text-slate-700 border-slate-200',
    quoted: 'bg-violet-50 text-violet-700 border-violet-200',
    waiting: 'bg-amber-50 text-amber-800 border-amber-200',
    ready: 'bg-sky-50 text-sky-700 border-sky-200',
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    dispatched: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    en_route: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    on_site: 'bg-orange-50 text-orange-700 border-orange-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    invoiced: 'bg-teal-50 text-teal-700 border-teal-200',
    paid: 'bg-green-100 text-green-800 border-green-300',
    cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

const STEP_INDEX: Record<StageKey, number> = {
    new: 0, quoted: 1, waiting: 2, ready: 2, scheduled: 3, dispatched: 4,
    en_route: 5, on_site: 6, completed: 7, invoiced: 8, paid: 8, cancelled: 0,
};

function make(key: StageKey, label: string, nextAction: JobStage['nextAction'], detail?: string): JobStage {
    return { key, label, badgeClass: BADGE[key], detail, nextAction, step: STEP_INDEX[key] };
}

/** True when an approved job is waiting to be put on the calendar. */
export function isAwaitingSchedule(job: Partial<Job>): boolean {
    if (job.status === 'unscheduled') return true;
    // Legacy: approved jobs used to be left in 'pending'
    return job.status === 'pending' && (job as any).quoteStatus === 'approved';
}

export interface StageContext {
    workflow?: Pick<OrgWorkflowSettings, 'teamType' | 'requireDispatchAck'>;
    /** Linked invoice status if known: draft | sent | paid | partial | overdue | void */
    invoiceStatus?: string;
    /** Viewing as the assigned tech (changes the next action wording) */
    viewerIsTech?: boolean;
}

export function getJobStage(job: Partial<Job>, ctx: StageContext = {}): JobStage {
    const solo = ctx.workflow?.teamType === 'solo';
    const status = job.status;

    if (status === 'cancelled') return make('cancelled', 'Cancelled', { id: 'none', label: '' });

    if (status === 'completed') {
        const inv = ctx.invoiceStatus;
        if (inv === 'paid') return make('paid', 'Paid', { id: 'none', label: '' });
        if (inv && ['sent', 'partial', 'overdue'].includes(inv)) {
            return make('invoiced', 'Invoiced', { id: 'record_payment', label: 'Record payment' },
                inv === 'overdue' ? 'Payment overdue' : inv === 'partial' ? 'Partially paid' : 'Waiting for payment');
        }
        if (job.invoice_id || inv === 'draft') {
            return make('completed', 'Completed', { id: 'send_invoice', label: 'Review & send invoice' }, 'Draft invoice ready');
        }
        return make('completed', 'Completed', { id: 'create_invoice', label: 'Create invoice' });
    }

    if (status === 'in_progress') return make('on_site', 'On site', { id: 'complete', label: 'Complete job' });
    if (status === 'en_route') return make('en_route', 'On the way', { id: 'check_in', label: 'Check in on site' });

    if (status === 'dispatched') {
        const acked = !!job.dispatch_acknowledged_at;
        const needsAck = !!ctx.workflow?.requireDispatchAck && !solo;
        if (ctx.viewerIsTech) {
            return needsAck && !acked
                ? make('dispatched', 'Dispatched', { id: 'accept', label: 'Accept job' }, 'Please confirm you got this job')
                : make('dispatched', 'Dispatched', { id: 'start_driving', label: 'Start driving' });
        }
        return needsAck && !acked
            ? make('dispatched', 'Dispatched', { id: 'await_ack', label: 'Waiting for tech to accept' }, 'Tech has not confirmed yet')
            : make('dispatched', 'Dispatched', { id: 'none', label: '' }, acked ? 'Tech confirmed' : undefined);
    }

    if (status === 'scheduled') {
        // Solo businesses skip the dispatch step — they just start driving.
        if (solo || ctx.viewerIsTech) return make('scheduled', 'Scheduled', { id: 'start_driving', label: 'Start driving' });
        return make('scheduled', 'Scheduled', { id: 'dispatch', label: 'Dispatch to tech' });
    }

    if (isAwaitingSchedule(job)) {
        const blockers = job.blockers || [];
        if (blockers.includes('deposit')) {
            return make('waiting', 'Approved — waiting', { id: 'collect_deposit', label: 'Collect deposit' }, 'Waiting on deposit');
        }
        if (blockers.includes('parts')) {
            return make('waiting', 'Approved — waiting', { id: 'order_parts', label: 'Check parts orders' }, 'Waiting on parts');
        }
        const warn = (job.scheduling_warnings || [])[0];
        const autoFailed = (job as any).autoScheduleFailed ? 'Auto-booking could not find a slot' : undefined;
        return make('ready', 'Ready to schedule', { id: 'schedule', label: 'Schedule' }, warn || autoFailed);
    }

    if (status === 'quote_pending') return make('quoted', 'Quoted', { id: 'view_quote', label: 'View quote' }, 'Waiting for customer');

    // 'pending' (and anything unknown) = new request
    return make('new', 'New request', { id: 'create_quote', label: 'Create quote' });
}
