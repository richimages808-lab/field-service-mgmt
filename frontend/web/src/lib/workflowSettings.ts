/**
 * workflowSettings.ts — How this business chose to run Quote → Complete.
 *
 * Mirrors firebase/functions/src/workflow/orgWorkflow.ts (keep in sync).
 * Answers are saved in organizations/{orgId}.settings.workflow by
 * Settings → Workflow Setup. Unanswered questions use team-type defaults.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import type { OrgWorkflowSettings, TeamType, PartsRule, SchedulingMode } from '../types';

export function defaultsForTeamType(teamType: TeamType): Omit<OrgWorkflowSettings, 'teamType' | 'configured'> {
    switch (teamType) {
        case 'solo':
            return {
                billingMode: 'per_job', partsRule: 'schedule_anyway', schedulingMode: 'manual',
                prepEnabled: false, requireDispatchAck: false, notifyCustomerOnSchedule: true,
                defaultLaborRate: 95, defaultMaterialMarkup: 25,
            };
        case 'company':
            return {
                billingMode: 'per_job', partsRule: 'warn', schedulingMode: 'auto',
                prepEnabled: true, requireDispatchAck: true, notifyCustomerOnSchedule: true,
                defaultLaborRate: 125, defaultMaterialMarkup: 30,
            };
        case 'small_team':
        default:
            return {
                billingMode: 'per_job', partsRule: 'warn', schedulingMode: 'auto',
                prepEnabled: false, requireDispatchAck: true, notifyCustomerOnSchedule: true,
                defaultLaborRate: 110, defaultMaterialMarkup: 25,
            };
    }
}

function inferTeamType(org: any): TeamType {
    if (org?.plan === 'individual') return 'solo';
    if (org?.plan === 'enterprise') return 'company';
    return 'small_team';
}

function partsRuleFromLegacy(mode?: string): PartsRule | undefined {
    if (mode === 'in_stock_only') return 'block';
    if (mode === 'estimated_availability') return 'warn';
    if (mode === 'allow_all') return 'schedule_anyway';
    return undefined;
}

export function resolveWorkflow(org: any): OrgWorkflowSettings {
    const saved = org?.settings?.workflow || {};
    const teamType: TeamType = saved.teamType || inferTeamType(org);
    const d = defaultsForTeamType(teamType);

    let schedulingMode: SchedulingMode = saved.schedulingMode || d.schedulingMode;
    if (!saved.schedulingMode && org?.autoCallbackEnabled === true) schedulingMode = 'customer_picks';

    return {
        teamType,
        billingMode: saved.billingMode || d.billingMode,
        partsRule: saved.partsRule || partsRuleFromLegacy(org?.materialSchedulingMode) || d.partsRule,
        schedulingMode,
        prepEnabled: saved.prepEnabled ?? d.prepEnabled,
        requireDispatchAck: teamType === 'solo' ? false : (saved.requireDispatchAck ?? d.requireDispatchAck),
        notifyCustomerOnSchedule: saved.notifyCustomerOnSchedule
            ?? (org?.settings?.jobScheduledNotification?.enabled ?? d.notifyCustomerOnSchedule),
        defaultLaborRate: Number(saved.defaultLaborRate) || d.defaultLaborRate,
        defaultMaterialMarkup: Number(saved.defaultMaterialMarkup ?? d.defaultMaterialMarkup),
        configured: !!saved.teamType,
    };
}

/**
 * Save Workflow Setup answers. Also writes the legacy settings other parts of
 * the system already read, so everything stays consistent:
 *   partsRule        → materialSchedulingMode
 *   schedulingMode   → autoCallbackEnabled (customer picks a time by text/call)
 *   notifyCustomer…  → settings.jobScheduledNotification.enabled
 */
export async function saveWorkflow(orgId: string, wf: OrgWorkflowSettings): Promise<void> {
    const legacyParts = wf.partsRule === 'block' ? 'in_stock_only'
        : wf.partsRule === 'warn' ? 'estimated_availability' : 'allow_all';
    const { configured: _c, ...toSave } = wf;
    await updateDoc(doc(db, 'organizations', orgId), {
        'settings.workflow': { ...toSave, teamType: wf.teamType, savedAt: new Date().toISOString() },
        materialSchedulingMode: legacyParts,
        autoCallbackEnabled: wf.schedulingMode === 'customer_picks',
        'settings.jobScheduledNotification.enabled': wf.notifyCustomerOnSchedule,
    });
}

// ── React hook (shared live subscription per org) ──
type Entry = { org: any; listeners: Set<() => void>; unsub?: () => void };
const cache = new Map<string, Entry>();

function getEntry(orgId: string): Entry {
    let e = cache.get(orgId);
    if (!e) {
        const entry: Entry = { org: undefined, listeners: new Set() };
        cache.set(orgId, entry);
        entry.unsub = onSnapshot(doc(db, 'organizations', orgId), snap => {
            entry.org = snap.exists() ? { id: snap.id, ...snap.data() } : {};
            entry.listeners.forEach(l => l());
        }, () => {
            entry.org = entry.org || {};
            entry.listeners.forEach(l => l());
        });
        e = entry;
    }
    return e;
}

export function useOrgWorkflow(): { workflow: OrgWorkflowSettings; org: any; loading: boolean } {
    const { user } = useAuth() as any;
    const orgId: string | undefined = user?.org_id;

    const subscribe = useCallback((cb: () => void) => {
        if (!orgId) return () => {};
        const e = getEntry(orgId);
        e.listeners.add(cb);
        return () => { e.listeners.delete(cb); };
    }, [orgId]);
    const getSnapshot = useCallback(() => (orgId ? getEntry(orgId).org : undefined), [orgId]);
    const org = useSyncExternalStore(subscribe, getSnapshot);

    const workflow = useMemo(() => resolveWorkflow(org || {}), [org]);
    return { workflow, org, loading: org === undefined };
}

// ── Plain-language labels used by the setup screen, help docs and badges ──
export const WORKFLOW_LABELS = {
    teamType: {
        solo: 'Just me',
        small_team: 'Small team (2–10 techs)',
        company: 'Company with an office / dispatcher',
    },
    billingMode: {
        fixed: 'Fixed-price quotes',
        time_and_materials: 'Time & materials',
        per_job: 'Let me choose on each job',
    },
    partsRule: {
        schedule_anyway: 'Schedule anyway',
        warn: 'Warn me, but let me schedule',
        block: "Don't schedule until parts arrive",
    },
    schedulingMode: {
        manual: "I'll put jobs on the calendar myself",
        auto: 'Automatically book the best tech & time',
        customer_picks: 'Let the customer pick a time (text/call)',
    },
} as const;
