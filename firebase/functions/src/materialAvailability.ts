/**
 * materialAvailability.ts — Compute when materials will be ready for a job.
 *
 * Used by the scheduling system to decide the earliest date a job can be
 * offered to a customer based on inventory stock levels and vendor lead times.
 */

import * as admin from "firebase-admin";

const db = admin.firestore();

// Default lead time (business days) when a vendor has no estimatedDeliveryDays
const DEFAULT_LEAD_TIME_DAYS = 3;

export interface MaterialAvailabilityDetail {
    materialId: string;
    name: string;
    quantityNeeded: number;
    quantityInStock: number;
    inStock: boolean;
    estimatedDeliveryDays?: number;
    estimatedReadyDate?: Date;
    vendorName?: string;
    /** True when delivery days is a default estimate, not vendor-provided */
    isEstimated?: boolean;
}

export interface MaterialReadyResult {
    /** The earliest date when all materials are expected to be available, or null if allow_all */
    readyDate: Date | null;
    /** If set, scheduling should be blocked entirely (used for in_stock_only mode) */
    blockedReason?: string;
    /** Per-material breakdown for transparency / logging */
    details: MaterialAvailabilityDetail[];
}

/**
 * Compute the earliest date when all required materials for a job will be ready.
 *
 * @param orgId  - Organization ID
 * @param jobId  - Job ID (used to find linked quote and its material line items)
 * @param mode   - The org's material scheduling mode
 * @returns MaterialReadyResult with readyDate, optional blockedReason, and details
 */
export async function computeMaterialReadyDate(
    orgId: string,
    jobId: string,
    mode: "allow_all" | "estimated_availability" | "in_stock_only"
): Promise<MaterialReadyResult> {
    // 1. Fetch the job
    const jobDoc = await db.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) {
        console.warn(`[MaterialAvailability] Job ${jobId} not found`);
        return { readyDate: null, details: [] };
    }
    const jobData = jobDoc.data()!;

    // Fetch organization settings to get material buffer days
    let materialBufferDays = 0;
    try {
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (orgDoc.exists) {
            const orgData = orgDoc.data();
            materialBufferDays = orgData?.materialBufferDays != null ? Number(orgData.materialBufferDays) : 0;
        }
    } catch (e) {
        console.warn("[MaterialAvailability] Failed to fetch organization settings:", e);
    }

    // 2. Resolve required materials from both Quote and AI Recommendation
    const unifiedRequiredMaterials: {
        materialId?: string;
        name: string;
        quantity: number;
    }[] = [];

    // Check quote first
    const quoteId = jobData.active_quote_id || jobData.quoteId;
    if (quoteId) {
        try {
            const quoteDoc = await db.collection("quotes").doc(quoteId).get();
            if (quoteDoc.exists) {
                const quoteData = quoteDoc.data()!;
                const lineItems: any[] = quoteData.lineItems || [];
                for (const item of lineItems) {
                    if (item.type === "material") {
                        unifiedRequiredMaterials.push({
                            materialId: item.materialId || undefined,
                            name: item.name || item.description || "Unknown Material",
                            quantity: item.quantity || 1
                        });
                    }
                }
            }
        } catch (e) {
            console.warn(`[MaterialAvailability] Error fetching quote:`, e);
        }
    }

    // Supplement with AI Recommendation partsNeeded
    const partsNeeded: any[] = jobData.aiRecommendation?.partsNeeded || [];
    for (const part of partsNeeded) {
        const nameLower = part.name.toLowerCase();
        const exists = unifiedRequiredMaterials.some(m => m.name.toLowerCase() === nameLower);
        if (!exists) {
            unifiedRequiredMaterials.push({
                name: part.name,
                quantity: part.quantity || 1
            });
        }
    }

    if (unifiedRequiredMaterials.length === 0) {
        // No materials required — no constraint
        return { readyDate: null, details: [] };
    }

    // 3. Evaluate each material against inventory and compute ready date
    const details: MaterialAvailabilityDetail[] = [];
    const now = new Date();
    let latestReadyDate: Date | null = null;
    const outOfStockItems: MaterialAvailabilityDetail[] = [];

    // Pre-fetch all materials for the organization to optimize case-insensitive matching
    let allOrgMaterials: admin.firestore.QueryDocumentSnapshot[] = [];
    try {
        const allMaterialsSnap = await db.collection("materials")
            .where("org_id", "==", orgId)
            .get();
        allOrgMaterials = allMaterialsSnap.docs;
    } catch (err) {
        console.warn("[MaterialAvailability] Failed to pre-fetch organization materials:", err);
    }

    for (const item of unifiedRequiredMaterials) {
        let materialDoc: admin.firestore.DocumentSnapshot | admin.firestore.QueryDocumentSnapshot | null = null;
        
        if (item.materialId) {
            // Find by ID in the pre-fetched list
            const preFetched = allOrgMaterials.find(doc => doc.id === item.materialId);
            if (preFetched) {
                materialDoc = preFetched;
            } else {
                try {
                    const doc = await db.collection("materials").doc(item.materialId).get();
                    if (doc.exists) materialDoc = doc;
                } catch (e) { /* ignored */ }
            }
        } else {
            // Case-insensitive search by name in pre-fetched list
            const matched = allOrgMaterials.find(
                doc => doc.data().name?.toLowerCase() === item.name.toLowerCase()
            );
            if (matched) {
                materialDoc = matched;
            }
        }

        let currentStock = 0;
        let materialName = item.name;
        let vendors: any[] = [];
        let preferredVendorId: string | undefined;

        if (materialDoc) {
            const data = materialDoc.data()!;
            currentStock = data.quantity || 0;
            materialName = data.name || item.name;
            vendors = data.vendors || [];
            preferredVendorId = data.preferredVendorId;
        }

        const needed = item.quantity;
        const isInStock = currentStock >= needed;

        const detail: MaterialAvailabilityDetail = {
            materialId: materialDoc ? materialDoc.id : "untracked",
            name: materialName,
            quantityNeeded: needed,
            quantityInStock: currentStock,
            inStock: isInStock,
        };

        if (!isInStock) {
            let bestDeliveryDays = DEFAULT_LEAD_TIME_DAYS;
            let bestVendorName: string | undefined;
            let selectedVendorHasDelivery = false;

            if (vendors.length > 0) {
                let selectedVendor: any = null;
                if (preferredVendorId) {
                    selectedVendor = vendors.find((v: any) => v.vendorId === preferredVendorId);
                }

                if (!selectedVendor) {
                    const vendorsWithDelivery = vendors.filter(
                        (v: any) => v.estimatedDeliveryDays != null && v.estimatedDeliveryDays > 0
                    );
                    if (vendorsWithDelivery.length > 0) {
                        selectedVendor = vendorsWithDelivery.reduce((best: any, v: any) =>
                            v.estimatedDeliveryDays < best.estimatedDeliveryDays ? v : best
                        );
                    } else {
                        selectedVendor = vendors[0];
                    }
                }

                if (selectedVendor) {
                    bestDeliveryDays = selectedVendor.estimatedDeliveryDays || DEFAULT_LEAD_TIME_DAYS;
                    bestVendorName = selectedVendor.vendorName;
                    selectedVendorHasDelivery = selectedVendor.estimatedDeliveryDays != null && selectedVendor.estimatedDeliveryDays > 0;
                }
            }

            // Add the organization's configurable receiving/handling buffer
            bestDeliveryDays += materialBufferDays;

            const readyDate = addBusinessDays(now, bestDeliveryDays);

            detail.estimatedDeliveryDays = bestDeliveryDays;
            detail.estimatedReadyDate = readyDate;
            detail.vendorName = bestVendorName;
            detail.isEstimated = (bestDeliveryDays === (DEFAULT_LEAD_TIME_DAYS + materialBufferDays) && !selectedVendorHasDelivery);

            outOfStockItems.push(detail);

            if (!latestReadyDate || readyDate > latestReadyDate) {
                latestReadyDate = readyDate;
            }
        }

        details.push(detail);
    }

    // 4. Mode-specific response logic
    if (mode === "in_stock_only" && outOfStockItems.length > 0) {
        const missingNames = outOfStockItems.map(d => d.name).join(", ");
        return {
            readyDate: null,
            blockedReason: `The following materials are not in stock: ${missingNames}. Scheduling is deferred until materials are available.`,
            details,
        };
    }

    // For both estimated_availability and allow_all modes, if parts are out of stock,
    // we return the estimated ready date so that the schedule recommendations
    // are deferred until the parts can arrive.
    if (latestReadyDate) {
        console.log(
            `[MaterialAvailability] Job ${jobId}: Earliest materials ready date is ${latestReadyDate.toISOString()}. ` +
            `${outOfStockItems.length} item(s) pending delivery.`
        );
        return { readyDate: latestReadyDate, details };
    }

    return { readyDate: null, details };
}

/**
 * Add N business days (Mon-Fri) to a date.
 */
function addBusinessDays(startDate: Date, businessDays: number): Date {
    const result = new Date(startDate);
    let daysAdded = 0;

    while (daysAdded < businessDays) {
        result.setDate(result.getDate() + 1);
        const dayOfWeek = result.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            daysAdded++;
        }
    }

    return result;
}
