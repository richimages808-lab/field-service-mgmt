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
    // allow_all — no material constraint
    if (mode === "allow_all") {
        return { readyDate: null, details: [] };
    }

    // 1. Get the job to find the linked quote
    const jobDoc = await db.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) {
        console.warn(`[MaterialAvailability] Job ${jobId} not found`);
        return { readyDate: null, details: [] };
    }
    const jobData = jobDoc.data()!;
    const quoteId = jobData.active_quote_id || jobData.quoteId;

    if (!quoteId) {
        // No linked quote — can't determine materials, allow scheduling
        console.log(`[MaterialAvailability] Job ${jobId} has no linked quote. Allowing scheduling.`);
        return { readyDate: null, details: [] };
    }

    // 2. Fetch the quote's line items
    const quoteDoc = await db.collection("quotes").doc(quoteId).get();
    if (!quoteDoc.exists) {
        console.warn(`[MaterialAvailability] Quote ${quoteId} not found for job ${jobId}`);
        return { readyDate: null, details: [] };
    }
    const quoteData = quoteDoc.data()!;
    const lineItems: any[] = quoteData.lineItems || [];

    // 3. Filter to material line items that have a linked materialId
    const materialItems = lineItems.filter(
        (item: any) => item.type === "material" && item.materialId
    );

    if (materialItems.length === 0) {
        // No tracked materials in this quote — allow scheduling
        return { readyDate: null, details: [] };
    }

    // 4. Check stock and compute delivery estimates for each material
    const details: MaterialAvailabilityDetail[] = [];
    const now = new Date();
    let latestReadyDate: Date | null = null;
    const outOfStockItems: MaterialAvailabilityDetail[] = [];

    for (const item of materialItems) {
        const materialDoc = await db.collection("materials").doc(item.materialId).get();

        if (!materialDoc.exists) {
            // Material deleted or not found — skip it, don't block scheduling
            console.warn(`[MaterialAvailability] Material ${item.materialId} not found. Skipping.`);
            continue;
        }

        const materialData = materialDoc.data()!;
        const currentStock = materialData.quantity || 0;
        const needed = item.quantity || 1;
        const isInStock = currentStock >= needed;

        const detail: MaterialAvailabilityDetail = {
            materialId: item.materialId,
            name: materialData.name || item.description || "Unknown Material",
            quantityNeeded: needed,
            quantityInStock: currentStock,
            inStock: isInStock,
        };

        if (!isInStock) {
            // Determine estimated delivery from vendor assignments
            const vendors: any[] = materialData.vendors || [];
            let bestDeliveryDays = DEFAULT_LEAD_TIME_DAYS;
            let bestVendorName: string | undefined;
            let selectedVendorHasDelivery = false;

            if (vendors.length > 0) {
                // Use preferred vendor if set, otherwise find the fastest
                const preferredVendorId = materialData.preferredVendorId;
                let selectedVendor: any = null;

                if (preferredVendorId) {
                    selectedVendor = vendors.find((v: any) => v.vendorId === preferredVendorId);
                }

                if (!selectedVendor) {
                    // Find the vendor with the shortest delivery time
                    const vendorsWithDelivery = vendors.filter(
                        (v: any) => v.estimatedDeliveryDays != null && v.estimatedDeliveryDays > 0
                    );
                    if (vendorsWithDelivery.length > 0) {
                        selectedVendor = vendorsWithDelivery.reduce((best: any, v: any) =>
                            v.estimatedDeliveryDays < best.estimatedDeliveryDays ? v : best
                        );
                    } else {
                        // No vendor has delivery info — use the first vendor for name
                        selectedVendor = vendors[0];
                    }
                }

                if (selectedVendor) {
                    bestDeliveryDays = selectedVendor.estimatedDeliveryDays || DEFAULT_LEAD_TIME_DAYS;
                    bestVendorName = selectedVendor.vendorName;
                    selectedVendorHasDelivery = selectedVendor.estimatedDeliveryDays != null && selectedVendor.estimatedDeliveryDays > 0;
                }
            }

            // Compute estimated ready date (business days from now)
            const readyDate = addBusinessDays(now, bestDeliveryDays);

            detail.estimatedDeliveryDays = bestDeliveryDays;
            detail.estimatedReadyDate = readyDate;
            detail.vendorName = bestVendorName;
            // Flag when we're using the default fallback, not a vendor-provided value
            detail.isEstimated = (bestDeliveryDays === DEFAULT_LEAD_TIME_DAYS && !selectedVendorHasDelivery);

            outOfStockItems.push(detail);

            if (!latestReadyDate || readyDate > latestReadyDate) {
                latestReadyDate = readyDate;
            }
        }

        details.push(detail);
    }

    // 5. Apply mode-specific logic
    if (mode === "in_stock_only" && outOfStockItems.length > 0) {
        const missingNames = outOfStockItems.map(d => d.name).join(", ");
        return {
            readyDate: null,
            blockedReason: `The following materials are not in stock: ${missingNames}. Scheduling is deferred until materials are available.`,
            details,
        };
    }

    if (mode === "estimated_availability" && latestReadyDate) {
        console.log(
            `[MaterialAvailability] Job ${jobId}: Earliest materials ready date is ${latestReadyDate.toISOString()}. ` +
            `${outOfStockItems.length} item(s) pending delivery.`
        );
        return { readyDate: latestReadyDate, details };
    }

    // All materials in stock — no constraint
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
