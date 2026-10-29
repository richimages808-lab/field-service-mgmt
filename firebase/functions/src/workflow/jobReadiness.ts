/**
 * jobReadiness.ts — Decides whether an approved job can be put on the calendar.
 *
 * "Ready to Schedule" gate:
 *   - deposit: quote requires a deposit and it hasn't been paid
 *   - parts:   org rule is "block" and the job still needs parts that haven't arrived
 *
 * When the org rule is "warn", parts produce a warning instead of a blocker.
 */

import { WorkflowSettings } from "./orgWorkflow";

export type Blocker = "deposit" | "parts";

export function jobNeedsParts(job: any): boolean {
    if (job?.parts_ready === true) return false;
    if (job?.materialSchedulingOverride === "allow_all") return false;
    const materials = Array.isArray(job?.materials_needed) ? job.materials_needed : [];
    const equipment = Array.isArray(job?.equipment_needed) ? job.equipment_needed : [];
    const unreceived = [...materials, ...equipment].some((m: any) => m && m.received !== true);
    const procurementOpen = ["pending_office_order", "ordered", "partially_received", "needed"]
        .includes(job?.parts_procurement_status);
    return unreceived || procurementOpen || job?.has_pending_po === true;
}

export function computeReadiness(job: any, wf: Pick<WorkflowSettings, "partsRule">): {
    blockers: Blocker[];
    warnings: string[];
} {
    const blockers: Blocker[] = [];
    const warnings: string[] = [];

    if (job?.deposit_required === true && job?.deposit_paid !== true) blockers.push("deposit");

    if (jobNeedsParts(job)) {
        if (wf.partsRule === "block") blockers.push("parts");
        else if (wf.partsRule === "warn") warnings.push("Parts have not arrived yet");
    }
    return { blockers, warnings };
}

export function sameList(a: string[] | undefined, b: string[] | undefined): boolean {
    const x = [...(a || [])].sort();
    const y = [...(b || [])].sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
}
