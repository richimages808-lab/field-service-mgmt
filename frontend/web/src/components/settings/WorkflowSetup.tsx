/**
 * WorkflowSetup — "How do you run your jobs?"
 *
 * One screen, a few plain questions. The first answer (who does the work)
 * fills in sensible defaults for everything else, so most businesses only
 * answer one question and hit Save. Saved to organizations/{id}.settings.workflow
 * and read by both the app (useOrgWorkflow) and the server workflow engine.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { User, Users, Building2, Check, Save } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useOrgWorkflow, saveWorkflow, defaultsForTeamType, WORKFLOW_LABELS } from '../../lib/workflowSettings';
import type { OrgWorkflowSettings, TeamType, BillingMode, PartsRule, SchedulingMode } from '../../types';

interface Choice<T extends string> { value: T; label: string; hint?: string }

function ChoiceRow<T extends string>({ id, value, choices, onChange }: {
    id: string; value: T; choices: Choice<T>[]; onChange: (v: T) => void;
}) {
    return (
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" id={id}>
            {choices.map(c => {
                const active = c.value === value;
                return (
                    <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        id={`${id}-${c.value}`}
                        onClick={() => onChange(c.value)}
                        className={`relative text-left rounded-xl border-2 px-3 py-2.5 transition-all cursor-pointer ${active
                            ? 'border-blue-600 bg-blue-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-blue-300'}`}
                    >
                        {active && <Check className="absolute top-2 right-2 w-4 h-4 text-blue-600" />}
                        <div className="text-sm font-semibold text-gray-900 pr-5">{c.label}</div>
                        {c.hint && <div className="text-xs text-gray-500 mt-0.5">{c.hint}</div>}
                    </button>
                );
            })}
        </div>
    );
}

function YesNo({ id, value, onChange, yes = 'Yes', no = 'No' }: {
    id: string; value: boolean; onChange: (v: boolean) => void; yes?: string; no?: string;
}) {
    return (
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" id={id}>
            {[true, false].map(v => (
                <button
                    key={String(v)}
                    type="button"
                    id={`${id}-${v ? 'yes' : 'no'}`}
                    onClick={() => onChange(v)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${value === v
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'}`}
                >
                    {v ? yes : no}
                </button>
            ))}
        </div>
    );
}

const Question: React.FC<{ n: number; title: string; help?: string; children: React.ReactNode }> = ({ n, title, help, children }) => (
    <section className="py-4 border-t border-gray-100 first:border-t-0">
        <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{n}</span>
            <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                {help && <p className="text-xs text-gray-500 mt-0.5 mb-2">{help}</p>}
                <div className="mt-2">{children}</div>
            </div>
        </div>
    </section>
);

export const WorkflowSetup: React.FC = () => {
    const { user } = useAuth() as any;
    const { workflow, loading } = useOrgWorkflow();
    const [wf, setWf] = useState<OrgWorkflowSettings>(workflow);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (!dirty) setWf(workflow); }, [loading, JSON.stringify(workflow)]); // eslint-disable-line react-hooks/exhaustive-deps

    const update = (patch: Partial<OrgWorkflowSettings>) => { setWf(w => ({ ...w, ...patch })); setDirty(true); };

    const pickTeam = (teamType: TeamType) => {
        // Changing team size resets the other answers to that size's defaults
        setWf(w => ({ ...w, ...defaultsForTeamType(teamType), teamType,
            defaultLaborRate: w.defaultLaborRate, defaultMaterialMarkup: w.defaultMaterialMarkup }));
        setDirty(true);
    };

    const handleSave = async () => {
        if (!user?.org_id) return;
        setSaving(true);
        try {
            await saveWorkflow(user.org_id, wf);
            setDirty(false);
            toast.success('Workflow saved');
        } catch (e: any) {
            console.error(e);
            toast.error('Could not save: ' + (e?.message || 'unknown error'));
        } finally {
            setSaving(false);
        }
    };

    const isSolo = wf.teamType === 'solo';
    let n = 0;

    return (
        <div className="space-y-4" id="workflow-setup">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-white shadow-sm">
                <h2 className="text-lg font-bold">How do you run your jobs?</h2>
                <p className="text-sm text-blue-100 mt-1">
                    Answer the first question and we'll fill in the rest. You can change any answer later.
                </p>
                {!workflow.configured && (
                    <p className="mt-2 inline-block text-xs bg-white/20 rounded-full px-3 py-1">
                        Not set up yet — we're using defaults for a {WORKFLOW_LABELS.teamType[workflow.teamType].toLowerCase()}.
                    </p>
                )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-2">
                <Question n={++n} title="Who does the work?">
                    <div className="grid gap-2 sm:grid-cols-3" id="wf-team-type">
                        {([
                            ['solo', User, 'Just me', 'I quote, schedule and do the work.'],
                            ['small_team', Users, 'Small team', '2–10 techs. Someone assigns the jobs.'],
                            ['company', Building2, 'Company', 'Office staff or a dispatcher runs the board.'],
                        ] as const).map(([val, Icon, label, hint]) => {
                            const active = wf.teamType === val;
                            return (
                                <button key={val} type="button" id={`wf-team-type-${val}`} onClick={() => pickTeam(val)}
                                    className={`relative text-left rounded-xl border-2 p-3 transition-all cursor-pointer ${active
                                        ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                                    {active && <Check className="absolute top-2 right-2 w-4 h-4 text-blue-600" />}
                                    <Icon className={`w-5 h-5 mb-1 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                                    <div className="text-sm font-semibold text-gray-900">{label}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{hint}</div>
                                </button>
                            );
                        })}
                    </div>
                </Question>

                <Question n={++n} title="How do you charge customers?">
                    <ChoiceRow<BillingMode> id="wf-billing" value={wf.billingMode} onChange={v => update({ billingMode: v })} choices={[
                        { value: 'fixed', label: 'Fixed-price quotes', hint: 'Customer approves one price.' },
                        { value: 'time_and_materials', label: 'Time & materials', hint: 'Hourly rate + materials.' },
                        { value: 'per_job', label: 'Choose on each job', hint: 'Pick when writing the quote.' },
                    ]} />
                    {wf.billingMode !== 'fixed' && (
                        <div className="mt-3 flex flex-wrap gap-3">
                            <label className="text-xs text-gray-600">Default hourly rate ($)
                                <input id="wf-labor-rate" type="number" min={0} value={wf.defaultLaborRate}
                                    onChange={e => update({ defaultLaborRate: Number(e.target.value) || 0 })}
                                    className="mt-1 block w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                            </label>
                            <label className="text-xs text-gray-600">Default materials markup (%)
                                <input id="wf-markup" type="number" min={0} value={wf.defaultMaterialMarkup}
                                    onChange={e => update({ defaultMaterialMarkup: Number(e.target.value) || 0 })}
                                    className="mt-1 block w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                            </label>
                        </div>
                    )}
                </Question>

                <Question n={++n} title="After the customer approves, how does the job get on the calendar?">
                    <ChoiceRow<SchedulingMode> id="wf-scheduling" value={wf.schedulingMode} onChange={v => update({ schedulingMode: v })} choices={[
                        { value: 'manual', label: "I'll schedule it", hint: isSolo ? 'From my calendar.' : 'From the Dispatcher Console.' },
                        { value: 'auto', label: 'Book it automatically', hint: 'Best tech + first open time that fits.' },
                        { value: 'customer_picks', label: 'Customer picks a time', hint: 'We text/call them to choose.' },
                    ]} />
                </Question>

                <Question n={++n} title="If parts aren't in yet, can the job still be scheduled?">
                    <ChoiceRow<PartsRule> id="wf-parts" value={wf.partsRule} onChange={v => update({ partsRule: v })} choices={[
                        { value: 'schedule_anyway', label: 'Yes, schedule anyway' },
                        { value: 'warn', label: 'Yes, but warn me' },
                        { value: 'block', label: 'No, wait for parts' },
                    ]} />
                </Question>

                <Question n={++n} title="Do you pack parts & tools for each job before the tech leaves?"
                    help="Turns on the Job Prep checklist. Leave off if techs grab what they need.">
                    <YesNo id="wf-prep" value={wf.prepEnabled} onChange={v => update({ prepEnabled: v })} yes="Yes, use Job Prep" no="No" />
                </Question>

                {!isSolo && (
                    <Question n={++n} title="Should techs tap “Accept” when a job is dispatched to them?"
                        help="You'll see who hasn't confirmed yet on the Dispatcher Console.">
                        <YesNo id="wf-dispatch-ack" value={wf.requireDispatchAck} onChange={v => update({ requireDispatchAck: v })} />
                    </Question>
                )}

                <Question n={++n} title="Text/email the customer when their appointment is booked?">
                    <YesNo id="wf-notify" value={wf.notifyCustomerOnSchedule} onChange={v => update({ notifyCustomerOnSchedule: v })} />
                </Question>
            </div>

            <div className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 px-5 py-3">
                <p className="text-xs text-gray-600">
                    {isSolo
                        ? 'Your flow: Quote → Approved → Schedule → Start job → Complete → Invoice'
                        : `Your flow: Quote → Approved → Schedule → Dispatch${wf.requireDispatchAck ? ' → Tech accepts' : ''} → En route → Complete → Invoice`}
                    {wf.prepEnabled ? ' (with Job Prep before dispatch)' : ''}
                </p>
                <button id="wf-save" type="button" onClick={handleSave} disabled={saving || (!dirty && workflow.configured)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving…' : workflow.configured ? 'Save changes' : 'Save my workflow'}
                </button>
            </div>
        </div>
    );
};
