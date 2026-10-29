/**
 * jobWorkflowTrigger.ts — Keeps approved jobs moving.
 *
 * For every job in `unscheduled` (approved, not yet on the calendar):
 *   1. Recompute the Ready-to-Schedule gate → writes `blockers`, `scheduling_warnings`,
 *      `ready_to_schedule`. Re-runs automatically whenever deposit/parts change
 *      (e.g. Stripe deposit webhook, PO received → partsReadiness.ts).
 *   2. If the gate is open and the org chose "Automatically book", run the single
 *      server auto-scheduler once per readiness state (no retry loops).
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getOrgWorkflow } from "./orgWorkflow";
import { computeReadiness, sameList } from "./jobReadiness";
import { runAutoSchedule } from "./autoSchedule";

export const onJobWorkflowUpdate = functions.firestore
    .document("jobs/{jobId}")
    .onWrite(async (change, context) => {
        if (!change.after.exists) return null;
        const job: any = change.after.data();
        const jobId = context.params.jobId;

        if (job.status !== "unscheduled" || job.archived === true || !job.org_id) return null;

        const wf = await getOrgWorkflow(job.org_id);
        const { blockers, warnings } = computeReadiness(job, wf);

        if (!sameList(blockers, job.blockers) || !sameList(warnings, job.scheduling_warnings)
            || job.ready_to_schedule !== (blockers.length === 0)) {
            await change.after.ref.update({
                blockers,
                scheduling_warnings: warnings,
                ready_to_schedule: blockers.length === 0,
            });
            return null; // the update re-fires this trigger with fresh data
        }

        if (blockers.length > 0 || wf.schedulingMode !== "auto" || job.assigned_tech_id) return null;

        // One attempt per readiness state — prevents loops when no slot is found.
        const attemptKey = `${job.deposit_paid === true}|${job.parts_ready === true}|${job.estimated_duration || 60}|${JSON.stringify(job.request?.availabilityWindows || [])}`;
        if (job.autoScheduleAttemptKey === attemptKey) return null;
        await change.after.ref.update({ autoScheduleAttemptKey: attemptKey });

        try {
            const res = await runAutoSchedule(jobId);
            console.log(`[JobWorkflow] Auto-schedule ${jobId}: ${res.scheduled ? "scheduled" : "not scheduled"} — ${res.reason}`);
        } catch (err) {
            console.error(`[JobWorkflow] Auto-schedule error for ${jobId}:`, (err as Error).message);
            await change.after.ref.update({
                autoScheduleFailed: true,
                autoScheduleReason: "Auto-scheduling hit an error. Please schedule manually.",
                autoScheduledAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        return null;
    });
