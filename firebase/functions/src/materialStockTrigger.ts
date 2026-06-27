/**
 * materialStockTrigger.ts — Auto-unblock jobs when material stock arrives.
 *
 * When a material's `quantity` increases (e.g., stock replenished, PO received),
 * this trigger checks for any jobs that are `materialSchedulingBlocked` and need
 * that material. If the stock now meets the requirement, it clears the block
 * and re-triggers the scheduling flow.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Firestore trigger: fires when any material document is updated.
 * Checks if quantity increased and unblocks any waiting jobs.
 */
export const onMaterialStockUpdated = functions.firestore
    .document("materials/{materialId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const materialId = context.params.materialId;

        // Only act when quantity increased
        const oldQty = before.quantity || 0;
        const newQty = after.quantity || 0;
        if (newQty <= oldQty) return null;

        const orgId = after.organizationId || after.org_id;
        if (!orgId) {
            console.warn(`[MaterialStockTrigger] Material ${materialId} has no org ID. Skipping.`);
            return null;
        }

        console.log(`[MaterialStockTrigger] Material ${materialId} stock increased: ${oldQty} → ${newQty}`);

        // Find jobs blocked on materials for this org
        const blockedJobsSnap = await db.collection("jobs")
            .where("org_id", "==", orgId)
            .where("materialSchedulingBlocked", "==", true)
            .get();

        if (blockedJobsSnap.empty) {
            console.log(`[MaterialStockTrigger] No blocked jobs found for org ${orgId}.`);
            return null;
        }

        console.log(`[MaterialStockTrigger] Found ${blockedJobsSnap.size} blocked job(s) for org ${orgId}. Checking if they can be unblocked.`);

        let unblocked = 0;

        for (const jobDoc of blockedJobsSnap.docs) {
            const jobData = jobDoc.data();
            const jobId = jobDoc.id;

            // Get the job's linked quote
            const quoteId = jobData.active_quote_id || jobData.quoteId;
            if (!quoteId) continue;

            try {
                const quoteDoc = await db.collection("quotes").doc(quoteId).get();
                if (!quoteDoc.exists) continue;

                const quoteData = quoteDoc.data()!;
                const lineItems: any[] = quoteData.lineItems || [];

                // Check if this material is in the quote
                const materialItems = lineItems.filter(
                    (item: any) => item.type === "material" && item.materialId
                );

                // Check if ALL materials are now in stock
                let allInStock = true;
                let thisJobNeedsMaterial = false;

                for (const item of materialItems) {
                    if (item.materialId === materialId) {
                        thisJobNeedsMaterial = true;
                    }

                    // Check current stock for each material
                    const matDoc = await db.collection("materials").doc(item.materialId).get();
                    if (!matDoc.exists) continue;

                    const currentStock = matDoc.data()!.quantity || 0;
                    const needed = item.quantity || 1;

                    if (currentStock < needed) {
                        allInStock = false;
                        break; // No need to check further
                    }
                }

                // Only unblock if this job actually needed the updated material AND all materials are in stock
                if (thisJobNeedsMaterial && allInStock) {
                    console.log(`[MaterialStockTrigger] Job ${jobId}: All materials now in stock. Unblocking and re-triggering scheduling.`);

                    await jobDoc.ref.update({
                        materialSchedulingBlocked: false,
                        materialBlockedReason: null,
                        materialBlockedAt: null,
                        // Clear callbackInitiated so the scheduling trigger fires again
                        callbackInitiated: null,
                    });

                    unblocked++;
                }
            } catch (err) {
                console.error(`[MaterialStockTrigger] Error checking job ${jobId}:`, (err as Error).message);
            }
        }

        if (unblocked > 0) {
            console.log(`[MaterialStockTrigger] Unblocked ${unblocked} job(s) after material ${materialId} stock update.`);
        }

        return null;
    });
