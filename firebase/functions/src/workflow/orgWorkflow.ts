/**
 * orgWorkflow.ts — Organization workflow settings (server copy).
 *
 * Mirrors frontend/web/src/lib/workflowSettings.ts. Keep the two in sync.
 *
 * Each organization answers a handful of plain questions in Settings → Workflow Setup.
 * Unanswered questions fall back to defaults derived from the team type, and
 * team type itself falls back to the billing plan.
 */

import * as admin from "firebase-admin";

export type TeamType = "solo" | "small_team" | "company";
export type BillingMode = "fixed" | "time_and_materials" | "per_job";
export type PartsRule = "schedule_anyway" | "warn" | "block";
export type SchedulingMode = "manual" | "auto" | "customer_picks";

export interface WorkflowSettings {
    teamType: TeamType;
    billingMode: BillingMode;
    partsRule: PartsRule;
    schedulingMode: SchedulingMode;
    prepEnabled: boolean;
    requireDispatchAck: boolean;
    notifyCustomerOnSchedule: boolean;
    defaultLaborRate: number;       // $/hr used for Time & Materials
    defaultMaterialMarkup: number;  // % used for Time & Materials
    configured: boolean;            // true once the org has saved Workflow Setup
}

export function defaultsForTeamType(teamType: TeamType): Omit<WorkflowSettings, "teamType" | "configured"> {
    switch (teamType) {
        case "solo":
            return {
                billingMode: "per_job", partsRule: "schedule_anyway", schedulingMode: "manual",
                prepEnabled: false, requireDispatchAck: false, notifyCustomerOnSchedule: true,
                defaultLaborRate: 95, defaultMaterialMarkup: 25,
            };
        case "company":
            return {
                billingMode: "per_job", partsRule: "warn", schedulingMode: "auto",
                prepEnabled: true, requireDispatchAck: true, notifyCustomerOnSchedule: true,
                defaultLaborRate: 125, defaultMaterialMarkup: 30,
            };
        case "small_team":
        default:
            return {
                billingMode: "per_job", partsRule: "warn", schedulingMode: "auto",
                prepEnabled: false, requireDispatchAck: true, notifyCustomerOnSchedule: true,
                defaultLaborRate: 110, defaultMaterialMarkup: 25,
            };
    }
}

function inferTeamType(org: any): TeamType {
    if (org?.plan === "individual") return "solo";
    if (org?.plan === "enterprise") return "company";
    return "small_team";
}

function partsRuleFromLegacy(mode?: string): PartsRule | undefined {
    if (mode === "in_stock_only") return "block";
    if (mode === "estimated_availability") return "warn";
    if (mode === "allow_all") return "schedule_anyway";
    return undefined;
}

/** Pure resolver (exported for tests). */
export function resolveWorkflow(org: any): WorkflowSettings {
    const saved = org?.settings?.workflow || {};
    const teamType: TeamType = saved.teamType || inferTeamType(org);
    const d = defaultsForTeamType(teamType);

    let schedulingMode: SchedulingMode = saved.schedulingMode || d.schedulingMode;
    if (!saved.schedulingMode && org?.autoCallbackEnabled === true) schedulingMode = "customer_picks";

    return {
        teamType,
        billingMode: saved.billingMode || d.billingMode,
        partsRule: saved.partsRule || partsRuleFromLegacy(org?.materialSchedulingMode) || d.partsRule,
        schedulingMode,
        prepEnabled: saved.prepEnabled ?? d.prepEnabled,
        requireDispatchAck: teamType === "solo" ? false : (saved.requireDispatchAck ?? d.requireDispatchAck),
        notifyCustomerOnSchedule: saved.notifyCustomerOnSchedule
            ?? (org?.settings?.jobScheduledNotification?.enabled ?? d.notifyCustomerOnSchedule),
        defaultLaborRate: Number(saved.defaultLaborRate) || d.defaultLaborRate,
        defaultMaterialMarkup: Number(saved.defaultMaterialMarkup ?? d.defaultMaterialMarkup),
        configured: !!saved.teamType,
    };
}

export async function getOrgWorkflow(orgId: string): Promise<WorkflowSettings> {
    const snap = await admin.firestore().collection("organizations").doc(orgId).get();
    return resolveWorkflow(snap.exists ? snap.data() : {});
}
