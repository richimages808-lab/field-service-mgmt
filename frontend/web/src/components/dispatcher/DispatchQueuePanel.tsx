/**
 * DispatchQueuePanel — the "Dispatched" step on the Dispatcher Console.
 *
 * For the day being viewed:
 *   • Ready to dispatch     — scheduled + has a tech → [Dispatch] / [Dispatch all]
 *   • Waiting for accept    — dispatched, tech hasn't tapped Accept (amber)
 *   • Confirmed / en route  — just a count
 * If Job Prep is on, jobs whose prep isn't packed show "Prep not done" and
 * need a deliberate "Dispatch anyway".
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Send, CheckCircle2, Clock, PackageX, Undo2, ChevronDown, ChevronUp } from 'lucide-react';
import { isSameDay } from 'date-fns';
import type { Job, UserProfile, OrgWorkflowSettings } from '../../types';
import { dispatchJobs, findPrepNotDone, undispatchJob } from '../../lib/dispatchService';

interface Props {
    jobs: Job[];
    technicians: UserProfile[];
    viewDate: Date;
    workflow: OrgWorkflowSettings;
    orgId: string;
    dispatcherUid: string;
    parseDate: (v: any) => Date | null;
}

export const DispatchQueuePanel: React.FC<Props> = ({ jobs, technicians, viewDate, workflow, orgId, dispatcherUid, parseDate }) => {
    const [open, setOpen] = useState(true);
    const [busy, setBusy] = useState(false);
    const [prepNotDone, setPrepNotDone] = useState<Set<string>>(new Set());

    const dayJobs = useMemo(() => jobs.filter(j => {
        const d = parseDate(j.scheduled_at || (j as any).scheduled_start);
        return d && isSameDay(d, viewDate);
    }), [jobs, viewDate, parseDate]);

    const ready = dayJobs.filter(j => j.status === 'scheduled' && j.assigned_tech_id);
    const dispatched = dayJobs.filter(j => j.status === 'dispatched');
    const waitingAck = workflow.requireDispatchAck ? dispatched.filter(j => !j.dispatch_acknowledged_at) : [];
    const confirmed = dispatched.length - waitingAck.length + dayJobs.filter(j => j.status === 'en_route' || j.status === 'in_progress').length;

    const readyKey = ready.map(j => j.id).join(',');
    useEffect(() => {
        if (!workflow.prepEnabled || ready.length === 0) { setPrepNotDone(new Set()); return; }
        let cancelled = false;
        findPrepNotDone(orgId, ready.map(j => j.id))
            .then(s => { if (!cancelled) setPrepNotDone(s); })
            .catch(e => console.warn('Prep check failed', e));
        return () => { cancelled = true; };
    }, [readyKey, workflow.prepEnabled, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

    const techName = (id?: string) => { const t: any = technicians.find(x => x.id === id); return t?.name || t?.displayName || t?.email || 'Unassigned'; };
    const timeOf = (j: Job) => parseDate(j.scheduled_at || (j as any).scheduled_start)?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) || '';

    const doDispatch = async (list: Job[], override = false) => {
        if (list.length === 0) return;
        setBusy(true);
        try {
            const n = await dispatchJobs(list, dispatcherUid, { prepOverride: override });
            toast.success(`Dispatched ${n} job${n === 1 ? '' : 's'}`);
        } catch (e: any) {
            console.error(e);
            toast.error('Dispatch failed: ' + (e?.message || 'unknown error'));
        } finally {
            setBusy(false);
        }
    };

    const dispatchable = ready.filter(j => !prepNotDone.has(j.id));
    if (dayJobs.length === 0) return null;

    return (
        <div id="dispatch-queue" className="bg-white border border-gray-200 rounded-xl shadow-sm mb-3 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-white">
                <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-sm font-semibold text-gray-900 cursor-pointer">
                    <Send className="w-4 h-4 text-indigo-600" />
                    Dispatch
                    <span className="text-xs font-normal text-gray-500">
                        {ready.length} ready · {waitingAck.length} waiting to accept · {confirmed} confirmed
                    </span>
                    {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                <button
                    id="dispatch-all-btn"
                    type="button"
                    disabled={busy || dispatchable.length === 0}
                    onClick={() => doDispatch(dispatchable)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
                >
                    <Send className="w-3.5 h-3.5" /> Dispatch all ready ({dispatchable.length})
                </button>
            </div>

            {open && (ready.length > 0 || waitingAck.length > 0) && (
                <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
                    {waitingAck.map(j => (
                        <li key={j.id} className="flex items-center gap-3 px-4 py-2 bg-amber-50" data-testid="dispatch-waiting-row">
                            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="text-xs text-gray-500 w-16">{timeOf(j)}</span>
                            <span className="text-sm text-gray-900 flex-1 truncate">{j.customer?.name || 'Job'} — {techName(j.assigned_tech_id)}</span>
                            <span className="text-xs font-medium text-amber-700">Waiting for tech to accept</span>
                            <button type="button" title="Undo dispatch" onClick={() => undispatchJob(j.id).catch(() => toast.error('Undo failed'))}
                                className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer"><Undo2 className="w-3.5 h-3.5" /></button>
                        </li>
                    ))}
                    {ready.map(j => {
                        const prepBlocked = prepNotDone.has(j.id);
                        return (
                            <li key={j.id} className="flex items-center gap-3 px-4 py-2" data-testid="dispatch-ready-row">
                                {prepBlocked ? <PackageX className="w-4 h-4 text-rose-500 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                                <span className="text-xs text-gray-500 w-16">{timeOf(j)}</span>
                                <span className="text-sm text-gray-900 flex-1 truncate">{j.customer?.name || 'Job'} — {techName(j.assigned_tech_id)}</span>
                                {prepBlocked ? (
                                    <>
                                        <span className="text-xs font-medium text-rose-600">Prep not done</span>
                                        <button type="button" disabled={busy} onClick={() => doDispatch([j], true)}
                                            className="text-xs px-2 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 cursor-pointer">Dispatch anyway</button>
                                    </>
                                ) : (
                                    <button type="button" disabled={busy} onClick={() => doDispatch([j])} id={`dispatch-btn-${j.id}`}
                                        className="text-xs px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 cursor-pointer">Dispatch</button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
