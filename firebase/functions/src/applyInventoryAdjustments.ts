/**
 * applyInventoryAdjustments.ts — Callable function to batch-apply
 * inventory count adjustments, optionally creating audit trail records.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

interface AdjustmentRequest {
    countId: string;
    createAuditTrail: boolean;
}

export const applyInventoryAdjustments = functions.https.onCall(
    async (data: AdjustmentRequest, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
        }

        const { countId, createAuditTrail } = data;
        if (!countId) {
            throw new functions.https.HttpsError("invalid-argument", "countId is required");
        }

        console.log(`[InventoryAdjustment] Applying adjustments for count ${countId}, audit=${createAuditTrail}`);

        // Load the count
        const countDoc = await db.collection("inventoryCounts").doc(countId).get();
        if (!countDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Count not found");
        }
        const countData = countDoc.data()!;

        // Load lines with variances
        const linesSnap = await db.collection("inventoryCounts").doc(countId).collection("lines").get();
        const varianceLines = linesSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((l: any) => l.variance && l.variance !== 0 && l.countedQty !== undefined);

        if (varianceLines.length === 0) {
            return { success: true, adjustments: 0 };
        }

        const batch = db.batch();
        const now = admin.firestore.Timestamp.now();

        for (const line of varianceLines as any[]) {
            // Update material quantity
            const matRef = db.collection("materials").doc(line.materialId);
            batch.update(matRef, {
                quantity: line.countedQty,
                lastCountedAt: now,
                lastCountVariance: line.variance,
                updatedAt: now,
            });

            // Optionally create audit trail
            if (createAuditTrail) {
                const auditRef = db.collection("materialUsage").doc();
                batch.set(auditRef, {
                    org_id: countData.org_id,
                    job_id: "",
                    material_id: line.materialId,
                    materialName: line.materialName,
                    quantity: Math.abs(line.variance),
                    type: line.variance > 0 ? "adjustment_gain" : "adjustment_loss",
                    notes: `Inventory count adjustment: "${countData.name}". Expected: ${line.expectedQty}, Counted: ${line.countedQty}`,
                    createdAt: now,
                    createdBy: context.auth.uid,
                });
            }

            // Update line status
            const lineRef = db.collection("inventoryCounts").doc(countId).collection("lines").doc(line.id);
            batch.update(lineRef, { status: "approved" });
        }

        // Mark count as completed
        batch.update(db.collection("inventoryCounts").doc(countId), {
            status: "completed",
            completedAt: now,
        });

        await batch.commit();

        console.log(`[InventoryAdjustment] Applied ${varianceLines.length} adjustments for count ${countId}`);

        return {
            success: true,
            adjustments: varianceLines.length,
            auditTrailCreated: createAuditTrail,
        };
    }
);
