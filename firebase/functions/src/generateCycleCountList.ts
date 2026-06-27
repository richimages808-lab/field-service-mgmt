/**
 * generateCycleCountList.ts — Generates cycle count task lists
 * based on ABC classification and scheduling configuration.
 *
 * Can be called on-demand or scheduled daily.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * On-demand callable: generateCycleCount
 * Creates a new cycle count document with line items for materials
 * that are due for counting based on their ABC class and schedule.
 */
export const generateCycleCount = functions.https.onCall(
    async (data: { orgId?: string }, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
        }

        // Determine org
        const orgId = data.orgId;
        if (!orgId) {
            throw new functions.https.HttpsError("invalid-argument", "orgId is required");
        }

        console.log(`[CycleCount] Generating cycle count for org ${orgId}`);

        // Load org config
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (!orgDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Organization not found");
        }
        const orgData = orgDoc.data()!;
        const config = orgData.cycleCountConfig;

        if (!config?.enabled) {
            return { success: false, error: "Cycle counting is not enabled" };
        }

        // Load all materials for this org
        const matsSnap = await db.collection("materials").where("org_id", "==", orgId).get();
        const materials = matsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const now = new Date();
        const dueItems: any[] = [];

        for (const mat of materials as any[]) {
            const abcClass = mat.abcClass || classifyMaterial(mat, config.classificationMethod);
            const frequencyDays = abcClass === "A" ? config.aFrequencyDays
                : abcClass === "B" ? config.bFrequencyDays
                : config.cFrequencyDays;

            // Check if the item is due for counting
            const lastCounted = mat.lastCountedAt?.toDate?.() || null;
            const daysSinceCount = lastCounted
                ? Math.floor((now.getTime() - lastCounted.getTime()) / (1000 * 60 * 60 * 24))
                : Infinity;

            if (daysSinceCount >= frequencyDays) {
                dueItems.push({
                    ...mat,
                    abcClass,
                    daysSinceCount,
                });
            }
        }

        if (dueItems.length === 0) {
            return { success: true, message: "No materials due for cycle counting", itemCount: 0 };
        }

        // Create the cycle count document
        const countName = `Cycle Count — ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
        const countRef = await db.collection("inventoryCounts").add({
            org_id: orgId,
            type: "cycle",
            name: countName,
            status: "draft",
            scope: {},
            blindCount: false,
            createdBy: context.auth.uid,
            createdByName: "System (Auto-Generated)",
            createdAt: admin.firestore.Timestamp.now(),
            totalItems: dueItems.length,
            countedItems: 0,
            varianceItems: 0,
            totalVarianceValue: 0,
        });

        // Create line items sorted by pick-path
        dueItems.sort((a, b) => {
            const pathA = [a.zone || "", a.aisle || "", a.rack || "", a.shelf || ""].join("-");
            const pathB = [b.zone || "", b.aisle || "", b.rack || "", b.shelf || ""].join("-");
            return pathA.localeCompare(pathB);
        });

        const batch = db.batch();
        for (const item of dueItems) {
            const lineRef = db.collection("inventoryCounts").doc(countRef.id).collection("lines").doc();
            batch.set(lineRef, {
                materialId: item.id,
                materialName: item.name || "Unknown Material",
                sku: item.sku || "",
                binLocation: item.binLocation || "",
                location: item.location || "",
                zone: item.zone || "",
                aisle: item.aisle || "",
                rack: item.rack || "",
                shelf: item.shelf || "",
                expectedQty: item.quantity || 0,
                status: "pending",
                unitCost: item.unitCost || 0,
            });
        }
        await batch.commit();

        console.log(`[CycleCount] Created cycle count "${countName}" with ${dueItems.length} items`);

        return {
            success: true,
            countId: countRef.id,
            countName,
            itemCount: dueItems.length,
        };
    }
);

/**
 * Auto-classify a material based on the org's classification method.
 */
function classifyMaterial(mat: any, method: string): "A" | "B" | "C" {
    if (method === "unit_cost") {
        const cost = mat.unitCost || 0;
        if (cost >= 50) return "A";
        if (cost >= 10) return "B";
        return "C";
    }
    if (method === "monthly_usage") {
        const usage = mat.averageMonthlyUsage || 0;
        if (usage >= 20) return "A";
        if (usage >= 5) return "B";
        return "C";
    }
    return "C"; // Default for manual mode without assignment
}
