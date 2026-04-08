import { VendorAssignment, MaterialItem, ToolItem } from '../types';
import { Vendor } from '../types/Vendor';

/**
 * Determines the optimal vendor for an item based on assigned logic.
 * 
 * Logic Evaluation Order:
 * 1. Filtering: Removes vendors that are inactive or no longer exist.
 * 2. Primary sorting based on the `globalVendorPreference` and `preferredVendorId` defined by the User/AI.
 */
export const determineOptimalVendor = (
    materialOrAssignments: MaterialItem | ToolItem | VendorAssignment[] | undefined,
    availableVendors: Vendor[]
): VendorAssignment | null => {
    let assignments: VendorAssignment[] | undefined;
    let preferredId: string | undefined;

    if (!materialOrAssignments) return null;

    if (Array.isArray(materialOrAssignments)) {
        assignments = materialOrAssignments;
    } else {
        assignments = materialOrAssignments.vendors;
        preferredId = materialOrAssignments.preferredVendorId;
    }

    if (!assignments || assignments.length === 0) return null;

    // Filter out assignments where the vendor has been deleted or deactivated
    const validAssignments = assignments.filter(assignment => {
        const vendor = availableVendors.find(v => v.id === assignment.vendorId);
        return vendor && vendor.active !== false;
    });

    if (validAssignments.length === 0) return null;

    // If an AI evaluation or user explicitly set a preferred ID globally, use that
    if (preferredId) {
        const winner = validAssignments.find(v => v.vendorId === preferredId);
        if (winner) return winner;
    }

    // Default to the first valid one if only one exists
    if (validAssignments.length === 1) return validAssignments[0];

    // Score or sort the assignments based on legacy logic if no global preference winner is found
    return validAssignments.reduce((best, current) => {
        if (!best) return current;

        const bestDef = best.priorityLogic;
        const currentDef = current.priorityLogic;

        // If the current explicitly says it's preferred and we haven't found a preferred
        if (currentDef === 'preferred' && bestDef !== 'preferred') return current;

        // If both are lowest_price, compare cost
        if (currentDef === 'lowest_price') {
            if (bestDef !== 'lowest_price') return current; // Prioritize lowest_price metric
            const cCost = current.unitCost || Infinity;
            const bCost = best.unitCost || Infinity;
            return cCost < bCost ? current : best;
        }

        // If both are fastest_shipping, compare days
        if (currentDef === 'fastest_shipping') {
            if (bestDef !== 'fastest_shipping' && bestDef !== 'lowest_price') return current;
            const cDays = current.estimatedDeliveryDays || Infinity;
            const bDays = best.estimatedDeliveryDays || Infinity;
            if (cDays < bDays) return current;
            return best;
        }

        return best;
    }, validAssignments[0]);
};
