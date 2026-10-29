/**
 * partsReadiness.ts — Single source of truth for a job's parts readiness.
 *
 * Whenever any purchase order linked to a job changes, recompute the job's
 * parts status from ALL of that job's purchase orders:
 *   - every non-canceled PO is 'received'        → parts_ready = true,  status 'ready'
 *   - any PO received or partially received      → parts_ready = false, status 'partially_received'
 *   - POs exist but nothing received yet         → parts_ready = false, status 'ordered'
 *   - draft-only POs                             → parts_ready = false, status 'pending_office_order'
 *
 * Previously, marking ANY single PO received flagged the whole job ready, even
 * when other POs for the same job were still open or the receipt was partial.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

export type JobPartsStatus = "ready" | "partially_received" | "ordered" | "pending_office_order";

/** Pure helper (exported for unit tests). */
export function computePartsStatus(poStatuses: string[]): { status: JobPartsStatus; ready: boolean } | null {
    const active = poStatuses.filter(s => s !== "canceled" && s !== "cancelled");
    if (active.length === 0) return null; // nothing to say — leave job untouched

    if (active.every(s => s === "received")) return { status: "ready", ready: true };
    if (active.some(s => s === "received" || s === "partially_received")) {
        return { status: "partially_received", ready: false };
    }
    if (active.some(s => s === "sent")) return { status: "ordered", ready: false };
    return { status: "pending_office_order", ready: false };
}

export async function syncJobPartsReadiness(jobId: string): Promise<void> {
    const jobRef = db.collection("jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return;

    const posSnap = await db.collection("purchaseOrders").where("jobId", "==", jobId).get();
    const result = computePartsStatus(posSnap.docs.map(d => (d.data().status as string) || "draft"));
    if (!result) return;

    const job = jobSnap.data() || {};
    if (job.parts_ready === result.ready && job.parts_procurement_status === result.status) return;

    await jobRef.update({
        parts_ready: result.ready,
        equipment_ready: result.ready,
        parts_procurement_status: result.status,
        "parts_request.procurementStatus": result.status,
        parts_status_synced_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[PartsReadiness] Job ${jobId} → ${result.status} (from ${posSnap.size} PO(s))`);
}

export const onPurchaseOrderWriteSyncJobParts = functions.firestore
    .document("purchaseOrders/{poId}")
    .onWrite(async (change) => {
        const before = change.before.exists ? change.before.data() : null;
        const after = change.after.exists ? change.after.data() : null;

        const statusChanged = before?.status !== after?.status;
        const jobChanged = before?.jobId !== after?.jobId;
        if (!statusChanged && !jobChanged) return null;

        const jobIds = new Set<string>();
        if (after?.jobId) jobIds.add(after.jobId);
        if (before?.jobId) jobIds.add(before.jobId);

        for (const jobId of jobIds) {
            try {
                await syncJobPartsReadiness(jobId);
            } catch (err) {
                console.error(`[PartsReadiness] Failed for job ${jobId}:`, (err as Error).message);
            }
        }
        return null;
    });
