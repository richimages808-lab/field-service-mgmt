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

        // Handle total_visit_cost (consolidates to primary local vendors)
        if (currentDef === 'total_visit_cost') {
            if (bestDef !== 'total_visit_cost' && bestDef !== 'preferred') return current;
            const cCost = current.unitCost || Infinity;
            const bCost = best.unitCost || Infinity;
            return cCost < bCost ? current : best;
        }

        // Handle local_availability & urgent_local_availability (prioritize local stores/stock)
        if (currentDef === 'local_availability' || currentDef === 'urgent_local_availability') {
            if (bestDef !== 'local_availability' && bestDef !== 'urgent_local_availability' && bestDef !== 'preferred') return current;
            const cDays = current.estimatedDeliveryDays || 0;
            const bDays = best.estimatedDeliveryDays || 0;
            if (cDays <= bDays) return current;
            return best;
        }

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

export interface AlternateVendorItem {
    vendorId: string;
    vendorName: string;
    unitCost: number;
    vendorProductUrl?: string;
    vendorProductTitle?: string;
    estimatedDeliveryDays?: number;
    stockQuantity?: number;
    isLocalVendor?: boolean;
    localDistanceMiles?: number;
    priorityReason?: string;
}

export function findBestMatchingMaterial(partName: string, materialsList: any[]): any {
    if (!partName || !materialsList?.length) return null;
    const pClean = partName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
    const pTokens = pClean.split(/\s+/).filter(t => t.length >= 3);
    if (!pTokens.length) return null;

    const STOP_WORDS = new Set([
        'and', 'for', 'the', 'with', 'standard', 'pro', 'each', 'pack', 'set',
        'unit', 'duty', 'heavy', 'size', 'type', 'general', 'service', 'item', 'inch'
    ]);

    // Distinct nouns/components that must NEVER cross-match (e.g. filter vs conditioner)
    const NOUN_CONFLICT_GROUPS = [
        ['filter', 'conditioner', 'heater', 'disposal', 'faucet', 'toilet', 'sink', 'shower', 'tub', 'boiler', 'furnace'],
        ['pump', 'compressor', 'motor', 'capacitor', 'contactor', 'flapper', 'cartridge', 'thermostat'],
        ['pipe', 'hose', 'fitting', 'coupling', 'elbow', 'adapter', 'valve', 'trap']
    ];

    const pSignificant = pTokens.filter(t => !STOP_WORDS.has(t));
    if (!pSignificant.length) return null;

    let bestMatch: any = null;
    let highestScore = 0;

    for (const m of materialsList) {
        if (!m || !m.name) continue;
        const mClean = (m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
        if (mClean === pClean) return m;

        // Check for noun collisions (e.g. query has "conditioner", inventory has "filter")
        let hasConflict = false;
        for (const group of NOUN_CONFLICT_GROUPS) {
            const pHas = group.filter(word => pClean.includes(word));
            const mHas = group.filter(word => mClean.includes(word));
            if (pHas.length > 0 && mHas.length > 0) {
                // If both have keywords in the same group, they MUST overlap on at least one keyword
                const overlap = pHas.some(w => mHas.includes(w));
                if (!overlap) {
                    hasConflict = true;
                    break;
                }
            }
        }
        if (hasConflict) continue;

        // Substring match only if length ratio is very close (e.g. >= 75%)
        if ((mClean.includes(pClean) || pClean.includes(mClean)) && 
            Math.min(mClean.length, pClean.length) / Math.max(mClean.length, pClean.length) >= 0.75) {
            return m;
        }

        const mTokens = mClean.split(/\s+/).filter(t => t.length >= 3);
        const mSignificant = mTokens.filter(t => !STOP_WORDS.has(t));
        if (!mSignificant.length) continue;

        let matchCount = 0;
        for (const pt of pSignificant) {
            if (mSignificant.includes(pt)) {
                matchCount += 1;
            } else if (mSignificant.some(mt => mt.length >= 4 && (mt.includes(pt) || pt.includes(mt)))) {
                matchCount += 0.5;
            }
        }

        const requiredMatches = Math.max(2, Math.min(pSignificant.length, mSignificant.length) * 0.6);
        const overlapRatio = matchCount / Math.max(pSignificant.length, 1);

        if (matchCount >= requiredMatches && overlapRatio >= 0.55 && matchCount > highestScore) {
            highestScore = matchCount;
            bestMatch = m;
        }
    }
    return bestMatch;
}

const DEFAULT_VENDORS_SPEC = [
    { name: 'Home Depot', isLocal: true, deliveryDays: 0, multiplier: 1.0, stock: 12 },
    { name: "Lowe's", isLocal: true, deliveryDays: 0, multiplier: 1.02, stock: 8 },
    { name: 'Amazon Business', isLocal: false, deliveryDays: 1, multiplier: 0.96, stock: 25 },
    { name: 'Ferguson Plumbing Supply', isLocal: true, deliveryDays: 0, multiplier: 1.01, stock: 15 },
    { name: 'Johnstone Supply', isLocal: true, deliveryDays: 0, multiplier: 1.03, stock: 10 },
    { name: 'Grainger Industrial Supply', isLocal: false, deliveryDays: 1, multiplier: 1.07, stock: 20 },
];

export function buildAllVendorPricing(
    partName: string,
    rawBaseCost: number,
    existingAlternates: AlternateVendorItem[] = [],
    orgVendorsList: any[] = []
): AlternateVendorItem[] {
    const baseCost = rawBaseCost > 0 ? rawBaseCost : 10;
    const results: AlternateVendorItem[] = [];
    const usedNames = new Set<string>();

    // 1. First add all existing alternates from catalog/inventory
    for (const alt of existingAlternates) {
        if (!alt || !alt.vendorName) continue;
        results.push({
            ...alt,
            unitCost: Math.round(alt.unitCost * 100) / 100
        });
        usedNames.add(alt.vendorName.toLowerCase().trim());
    }

    // 2. Identify all vendors to include: union of orgVendorsList and DEFAULT_VENDORS_SPEC
    const targetVendors: Array<{ name: string; isLocal: boolean; deliveryDays: number; multiplier: number; stock: number; id?: string }> = [];

    // Add orgVendors first
    for (const ov of orgVendorsList) {
        if (!ov || !ov.name) continue;
        const normName = ov.name.toLowerCase().trim();
        const spec = DEFAULT_VENDORS_SPEC.find(s => s.name.toLowerCase() === normName || normName.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(normName));
        targetVendors.push({
            id: ov.id || ov.name,
            name: ov.name,
            isLocal: ov.isLocal !== undefined ? ov.isLocal : (spec ? spec.isLocal : true),
            deliveryDays: spec ? spec.deliveryDays : (ov.isLocal ? 0 : 2),
            multiplier: spec ? spec.multiplier : 1.0,
            stock: spec ? spec.stock : 10
        });
    }

    // Supplement with any standard vendors not already in targetVendors
    for (const spec of DEFAULT_VENDORS_SPEC) {
        if (!targetVendors.some(tv => tv.name.toLowerCase() === spec.name.toLowerCase() || tv.name.toLowerCase().includes(spec.name.toLowerCase()))) {
            targetVendors.push({
                id: spec.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                name: spec.name,
                isLocal: spec.isLocal,
                deliveryDays: spec.deliveryDays,
                multiplier: spec.multiplier,
                stock: spec.stock
            });
        }
    }

    // 3. For each target vendor not yet in results, compute realistic product price for that company
    for (const tv of targetVendors) {
        const norm = tv.name.toLowerCase().trim();
        if (usedNames.has(norm)) continue;

        const unitCost = Math.round(baseCost * tv.multiplier * 100) / 100;
        const query = encodeURIComponent(partName);
        let productUrl = '';
        if (tv.name.includes('Home Depot')) productUrl = `https://www.homedepot.com/s/${query}`;
        else if (tv.name.includes("Lowe's")) productUrl = `https://www.lowes.com/search?searchTerm=${query}`;
        else if (tv.name.includes('Amazon')) productUrl = `https://www.amazon.com/s?k=${query}`;
        else if (tv.name.includes('Ferguson')) productUrl = `https://www.ferguson.com/search?q=${query}`;
        else if (tv.name.includes('Johnstone')) productUrl = `https://www.johnstonesupply.com/search?q=${query}`;
        else if (tv.name.includes('Grainger')) productUrl = `https://www.grainger.com/search?searchQuery=${query}`;

        results.push({
            vendorId: tv.id || tv.name,
            vendorName: tv.name,
            unitCost,
            vendorProductUrl: productUrl,
            vendorProductTitle: `${partName} (${tv.name})`,
            estimatedDeliveryDays: tv.deliveryDays,
            stockQuantity: tv.stock,
            isLocalVendor: tv.isLocal,
            localDistanceMiles: tv.isLocal ? 4.2 : undefined
        });
        usedNames.add(norm);
    }

    return results;
}

export function selectVendorByOrgPriorities(
    vendors: AlternateVendorItem[],
    orgSettings?: any
): { selectedVendor: AlternateVendorItem; priorityReason: string } {
    if (!vendors || vendors.length === 0) {
        return { selectedVendor: null as any, priorityReason: '' };
    }

    const strategy = orgSettings?.defaultSourcingStrategy || orgSettings?.situationRules?.standard || 'lowest_cost';
    const preferredVendorId = orgSettings?.defaultVendorId;

    // 1. Explicit Preferred Vendor
    if (strategy === 'preferred_vendor' || preferredVendorId) {
        const pref = vendors.find(v => 
            (preferredVendorId && (v.vendorId === preferredVendorId || v.vendorName.toLowerCase().includes(preferredVendorId.toLowerCase()))) ||
            v.vendorName.toLowerCase().includes('preferred')
        );
        if (pref) {
            return { selectedVendor: pref, priorityReason: 'Preferred Supplier Strategy' };
        }
    }

    // 2. Lowest Cost / Price
    if (strategy === 'lowest_cost' || strategy === 'lowest_price') {
        const sorted = [...vendors].sort((a, b) => a.unitCost - b.unitCost);
        return { selectedVendor: sorted[0], priorityReason: 'Org Priority: Lowest Cost' };
    }

    // 3. Local Availability / Emergency Stock
    if (strategy === 'local_availability' || strategy === 'urgent_local_availability') {
        const localInStock = vendors.filter(v => v.isLocalVendor && (v.stockQuantity ?? 1) > 0);
        if (localInStock.length > 0) {
            localInStock.sort((a, b) => a.unitCost - b.unitCost);
            return { selectedVendor: localInStock[0], priorityReason: 'Org Priority: Local Branch Availability' };
        }
    }

    // 4. Fastest Shipping / Immediate Pickup
    if (strategy === 'fastest_shipping') {
        const sorted = [...vendors].sort((a, b) => (a.estimatedDeliveryDays ?? 3) - (b.estimatedDeliveryDays ?? 3) || a.unitCost - b.unitCost);
        return { selectedVendor: sorted[0], priorityReason: 'Org Priority: Fastest Fulfillment' };
    }

    // 5. Total Visit Cost (Consolidates with primary local hub)
    if (strategy === 'total_visit_cost') {
        const primaryLocal = vendors.find(v => v.isLocalVendor && (v.vendorName.includes('Home Depot') || v.vendorName.includes("Lowe's")));
        if (primaryLocal) {
            return { selectedVendor: primaryLocal, priorityReason: 'Org Priority: Total Visit Cost' };
        }
    }

    // 6. Optimal / Balanced Pick: Local in-stock with lowest cost
    const sorted = [...vendors].sort((a, b) => {
        if (a.isLocalVendor && !b.isLocalVendor) return -1;
        if (!a.isLocalVendor && b.isLocalVendor) return 1;
        return a.unitCost - b.unitCost;
    });
    return { selectedVendor: sorted[0], priorityReason: 'Org Priority: Optimal Sourcing' };
}

/**
 * Determines whether a tool identified by the AI estimate is already owned by the shop/technician
 * or represents standard technician tool gear (tape measures, screwdrivers, cordless drills,
 * levels, cutting tools, utility knives, circuit testers, meters, etc.).
 * 
 * If true, the tool should NOT be added as a billable equipment line item to the customer's quote.
 */
export function isToolOwnedOrStandard(toolName: string, shopTools: any[] = []): boolean {
    if (!toolName) return false;
    const nameLower = toolName.toLowerCase().trim();

    // 1. Check direct or fuzzy match against the organization's tools collection
    const queryTokens = nameLower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 3);
    for (const st of shopTools) {
        const stName = (st.name || '').toLowerCase();
        if (stName.includes(nameLower) || nameLower.includes(stName)) {
            return true;
        }
        const stTokens = stName.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length >= 3);
        const matchCount = queryTokens.filter(t => stTokens.includes(t)).length;
        if (queryTokens.length > 0 && matchCount >= Math.min(2, queryTokens.length)) {
            return true;
        }
    }

    // 2. Standard technician & contractor tools that shops always own and never bill to a customer quote
    const STANDARD_SHOP_TOOL_TERMS = [
        'tape measure', 'measuring tape',
        'screwdriver', 'screw driver', 'driver bit', 'hex key', 'allen wrench',
        'cordless drill', 'drill driver', 'drill bit', 'hammer drill',
        'torpedo level', 'level',
        'utility knife', 'box cutter', 'cutting tool', 'snips', 'shears', 'pipe cutter', 'tubing cutter',
        'circuit tester', 'outlet tester', 'multimeter', 'voltage tester', 'voltage detector',
        'pliers', 'wire stripper', 'crimper', 'adjustable wrench', 'pipe wrench', 'channel lock', 'channellock',
        'basin wrench', 'putty knife', 'spud wrench', 'plunger', 'drain snake', 'toilet auger', 'closet auger',
        'caulk gun', 'wire fish tape', 'socket set', 'socket wrench', 'hammer', 'wrench set', 'mallet', 'chisel',
        'saw', 'hacksaw', 'staple gun', 'heat gun',
        'manifold gauge', 'gauge set', 'vacuum pump', 'leak detector', 'recovery machine',
        'step ladder', 'ladder', 'flashlight', 'work light', 'drop cloth', 'broom', 'dustpan'
    ];

    for (const term of STANDARD_SHOP_TOOL_TERMS) {
        if (nameLower.includes(term)) {
            return true;
        }
    }

    return false;
}

/**
 * Classifies equipment as one-time use (job rental / consumable rig / job-specific disposable)
 * vs long-term use (capital shop tool / company equipment asset).
 */
export function classifyEquipmentUsage(equipmentName: string): 'one_time' | 'long_term' {
    if (!equipmentName) return 'long_term';
    const lower = equipmentName.toLowerCase().trim();

    const ONE_TIME_TERMS = [
        'rental', 'rented', 'rent', 'lease',
        'scaffold', 'scaffolding', 'ditch witch', 'trencher rental', 'crane',
        'dumpster', 'trailer rental', 'lift rental', 'boom lift', 'scissor lift',
        'disposable', 'one-time', 'single use', 'containment tent', 'core drill rental',
        'generator rental', 'dehumidifier rental', 'air scrubber rental', 'job site fence',
        'porta potty', 'temporary power'
    ];

    for (const term of ONE_TIME_TERMS) {
        if (lower.includes(term)) {
            return 'one_time';
        }
    }

    return 'long_term';
}



