/**
 * aiLearning.ts — Per-Organization AI Learning System
 * 
 * Captures patterns from:
 * 1. Completed jobs (what materials were actually used vs. AI-recommended)
 * 2. Quote modifications (what dispatchers changed in AI-generated quotes)
 * 
 * Stores learned patterns per org in `organizations/{orgId}/ai_patterns/{patternKey}`
 * These patterns are then injected into AI prompts to make future recommendations
 * more accurate for each specific business.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { isItemRelevantToRequest } from './scopeRelevance';

const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════

export interface MaterialPattern {
    name: string;
    avgQuantity: number;
    frequency: number;       // How many times this material appeared across completed jobs
    avgCost: number;
    totalCostSum: number;     // Running sum for computing average
    totalQtySum: number;      // Running sum for computing average
}

export interface CorrectionPattern {
    aiRecommended: string;    // What the AI originally said
    humanCorrected: string;   // What the dispatcher changed it to (or "REMOVED")
    frequency: number;
}

export interface OrgAiPattern {
    org_id: string;
    patternKey: string;         // Normalized key like "plumbing__clogged_drain"
    jobCategory: string;        // e.g., "plumbing", "hvac", "electrical"
    jobType: string;            // e.g., "clogged_drain", "leaking_faucet"
    displayLabel: string;       // Human-readable: "Clogged Drain"

    // Learned from completed jobs
    commonMaterials: MaterialPattern[];
    commonTools: string[];
    avgDuration: number;        // Average actual duration in minutes
    totalDurationSum: number;   // Running sum for computing average

    // Learned from quote corrections
    corrections: CorrectionPattern[];
    removedItems: Array<{ name: string; frequency: number }>;
    addedItems: Array<{ name: string; frequency: number }>;

    // Metadata
    sampleSize: number;         // Number of data points contributing to this pattern
    lastUpdated: FirebaseFirestore.Timestamp;
    confidence: number;         // 0-1, computed from sample size
}

// ═══════════════════════════════════════════════════════════════════════
// JOB TYPE CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Normalize a job description into a canonical category + type pair.
 * Uses the AI's jobClassification if available, otherwise falls back to keyword matching.
 */
export function classifyJobType(
    description: string,
    aiClassification?: { jobType?: string; tradeCategory?: string; primaryItem?: string | null }
): { category: string; type: string; displayLabel: string; patternKey: string } {

    // Prefer the AI's own classification if it exists
    if (aiClassification?.tradeCategory && aiClassification?.jobType) {
        const category = normalizeCategory(aiClassification.tradeCategory);
        const type = normalizeType(aiClassification.jobType, aiClassification.primaryItem || '', description);
        const displayLabel = buildDisplayLabel(type);
        return {
            category,
            type,
            displayLabel,
            patternKey: `${category}__${type}`,
        };
    }

    // Fallback: keyword-based classification
    const descLower = description.toLowerCase();
    const category = detectCategory(descLower);
    const type = detectType(descLower, category);
    const displayLabel = buildDisplayLabel(type);

    return {
        category,
        type,
        displayLabel,
        patternKey: `${category}__${type}`,
    };
}

function normalizeCategory(raw: string): string {
    const cat = raw.toLowerCase().trim();
    const categoryMap: Record<string, string> = {
        'plumbing': 'plumbing',
        'electrical': 'electrical',
        'hvac': 'hvac',
        'general': 'general',
        'carpentry': 'carpentry',
        'appliance': 'appliance',
        'painting': 'general',
        'landscaping': 'general',
        'low_voltage': 'low_voltage',
        'low voltage': 'low_voltage',
        'low-voltage': 'low_voltage',
        'security': 'low_voltage',
        'networking': 'low_voltage',
        'roofing': 'roofing',
    };
    return categoryMap[cat] || 'general';
}

function normalizeType(jobType: string, primaryItem: string, description: string): string {
    const jt = jobType.toLowerCase().trim();
    const pi = primaryItem.toLowerCase().trim();
    const desc = description.toLowerCase();

    // Combine job type + primary item for specificity
    // e.g., "repair" + "toilet" => "toilet_repair"
    if (pi && pi !== 'null' && pi !== 'n/a') {
        const normalizedItem = pi.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        const normalizedType = jt.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        return `${normalizedItem}_${normalizedType}`;
    }

    // Try to detect primary item from description
    const itemKeywords = [
        'toilet', 'faucet', 'sink', 'drain', 'water_heater', 'garbage_disposal',
        'dishwasher', 'shower', 'bathtub', 'pipe', 'sewer', 'ac_unit',
        'furnace', 'thermostat', 'ceiling_fan', 'light_fixture', 'outlet',
        'circuit_breaker', 'switch', 'door', 'window', 'roof', 'gutter',
        'camera', 'nvr', 'doorbell',
    ];

    for (const item of itemKeywords) {
        const readable = item.replace(/_/g, ' ');
        if (desc.includes(readable)) {
            const normalizedType = jt.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            return `${item}_${normalizedType}`;
        }
    }

    return jt.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'general_service';
}

function detectCategory(descLower: string): string {
    const lowVoltageKw = ['camera', 'nvr', 'dvr', 'cctv', 'surveillance', 'doorbell', 'cat5', 'cat6', 'ethernet', 'poe', 'access point', 'security system', 'alarm', 'low voltage', 'intercom'];
    const plumbingKw = ['toilet', 'faucet', 'sink', 'drain', 'pipe', 'plumb', 'water heater', 'leak', 'clog', 'sewer', 'shower', 'bathtub', 'garbage disposal'];
    const electricalKw = ['outlet', 'switch', 'breaker', 'wiring', 'electric', 'light', 'circuit', 'panel', 'ceiling fan', 'dimmer'];
    const hvacKw = ['hvac', 'air condition', 'furnace', 'heater', 'thermostat', 'duct', 'ac unit', 'heat pump', 'refrigerant', 'condenser'];
    const applianceKw = ['dishwasher', 'washer', 'dryer', 'refrigerator', 'oven', 'stove', 'microwave', 'appliance'];

    // Low-voltage first: camera/NVR words are highly specific and must not fall into the generic bucket
    if (lowVoltageKw.some(kw => new RegExp(`\\b${kw}`, 'i').test(descLower))) return 'low_voltage';
    if (plumbingKw.some(kw => descLower.includes(kw))) return 'plumbing';
    if (electricalKw.some(kw => descLower.includes(kw))) return 'electrical';
    if (hvacKw.some(kw => descLower.includes(kw))) return 'hvac';
    if (applianceKw.some(kw => descLower.includes(kw))) return 'appliance';
    return 'general';
}

function detectType(descLower: string, category: string): string {
    // Detect the action type
    let action = 'service';
    if (descLower.match(/\b(clog|blocked|backup|backed up|slow drain)\b/)) action = 'clog_repair';
    else if (descLower.match(/\b(leak|drip|seep|running)\b/)) action = 'leak_repair';
    else if (descLower.match(/\b(install|mount|put in|add|set up)\b/)) action = 'installation';
    else if (descLower.match(/\b(replac|swap|new|upgrade)\b/)) action = 'replacement';
    else if (descLower.match(/\b(repair|fix|broken|not working|malfunction|noise|rattle)\b/)) action = 'repair';
    else if (descLower.match(/\b(inspect|check|diagnos|assess|evaluat)\b/)) action = 'inspection';
    else if (descLower.match(/\b(maintenance|maintain|service|tune.?up|clean)\b/)) action = 'maintenance';

    // Detect the primary subject
    const subjects: Array<[RegExp, string]> = [
        [/\b(camera|nvr|dvr|cctv|surveillance)/i, 'security_camera'],
        [/doorbell/i, 'doorbell'],
        [/\b(ethernet|cat ?5|cat ?6|network|access point|wifi|wi-fi)/i, 'network_cabling'],
        [/toilet/i, 'toilet'],
        [/faucet/i, 'faucet'],
        [/sink/i, 'sink'],
        [/drain/i, 'drain'],
        [/water heater|hot water/i, 'water_heater'],
        [/garbage disposal/i, 'garbage_disposal'],
        [/dishwasher/i, 'dishwasher'],
        [/shower/i, 'shower'],
        [/bathtub|tub/i, 'bathtub'],
        [/pipe/i, 'pipe'],
        [/sewer/i, 'sewer'],
        [/ac unit|air condition|condenser/i, 'ac_unit'],
        [/furnace/i, 'furnace'],
        [/thermostat/i, 'thermostat'],
        [/ceiling fan/i, 'ceiling_fan'],
        [/light|fixture/i, 'light_fixture'],
        [/outlet|receptacle/i, 'outlet'],
        [/circuit breaker|panel/i, 'circuit_breaker'],
        [/switch/i, 'switch'],
    ];

    for (const [re, subject] of subjects) {
        if (re.test(descLower)) {
            return `${subject}_${action}`;
        }
    }

    return `${category}_${action}`;
}

function buildDisplayLabel(type: string): string {
    return type
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════
// PATTERN UPSERT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calculate confidence score based on sample size.
 * Follows a logarithmic curve: more samples = higher confidence, but diminishing returns.
 */
function calculateConfidence(sampleSize: number): number {
    if (sampleSize <= 0) return 0;
    if (sampleSize >= 50) return 0.95;
    // Logarithmic curve: confidence = 0.3 + 0.65 * (1 - e^(-sampleSize/10))
    return Math.min(0.95, 0.3 + 0.65 * (1 - Math.exp(-sampleSize / 10)));
}

/**
 * Merge a new material entry into the existing commonMaterials array.
 * Updates running averages for quantity and cost.
 */
function mergeMaterial(
    existing: MaterialPattern[],
    newName: string,
    newQty: number,
    newCost: number
): MaterialPattern[] {
    const materials = [...existing];
    const nameLower = newName.toLowerCase().trim();

    // Find existing entry by fuzzy name match
    const idx = materials.findIndex(m => {
        const existingLower = m.name.toLowerCase().trim();
        return existingLower === nameLower ||
            existingLower.includes(nameLower) ||
            nameLower.includes(existingLower);
    });

    if (idx >= 0) {
        const m = materials[idx];
        m.frequency += 1;
        m.totalQtySum += newQty;
        m.totalCostSum += newCost;
        m.avgQuantity = Math.round((m.totalQtySum / m.frequency) * 100) / 100;
        m.avgCost = Math.round((m.totalCostSum / m.frequency) * 100) / 100;
    } else {
        materials.push({
            name: newName,
            avgQuantity: newQty,
            frequency: 1,
            avgCost: newCost,
            totalCostSum: newCost,
            totalQtySum: newQty,
        });
    }

    return materials;
}

/**
 * Merge a frequency-counted item (for removedItems, addedItems arrays).
 */
function mergeFrequencyItem(
    existing: Array<{ name: string; frequency: number }>,
    newName: string
): Array<{ name: string; frequency: number }> {
    const items = [...existing];
    const nameLower = newName.toLowerCase().trim();

    const idx = items.findIndex(i => i.name.toLowerCase().trim() === nameLower);
    if (idx >= 0) {
        items[idx].frequency += 1;
    } else {
        items.push({ name: newName, frequency: 1 });
    }

    return items;
}

/**
 * Merge a correction pattern.
 */
function mergeCorrection(
    existing: CorrectionPattern[],
    aiRecommended: string,
    humanCorrected: string
): CorrectionPattern[] {
    const corrections = [...existing];
    const aiLower = aiRecommended.toLowerCase().trim();
    const humanLower = humanCorrected.toLowerCase().trim();

    const idx = corrections.findIndex(c =>
        c.aiRecommended.toLowerCase().trim() === aiLower &&
        c.humanCorrected.toLowerCase().trim() === humanLower
    );

    if (idx >= 0) {
        corrections[idx].frequency += 1;
    } else {
        corrections.push({ aiRecommended, humanCorrected, frequency: 1 });
    }

    return corrections;
}

// ═══════════════════════════════════════════════════════════════════════
// TRIGGER 1: JOB COMPLETION → LEARN FROM OUTCOMES
// ═══════════════════════════════════════════════════════════════════════

/**
 * When a job is completed, compare the AI recommendation to what was actually used
 * and store the learned patterns for the organization.
 */
export const onJobCompletedLearnPatterns = functions.firestore
    .document('jobs/{jobId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const previousData = change.before.data();
        const jobId = context.params.jobId;

        const isCompleted = newData.status === 'completed' && previousData.status !== 'completed';
        const prevParts = previousData.parts || previousData.materials || previousData.costs?.parts;
        const newParts = newData.parts || newData.materials || newData.costs?.parts;
        const partsChanged = JSON.stringify(prevParts) !== JSON.stringify(newParts);
        const durationChanged = (previousData.estimated_duration !== newData.estimated_duration && !!newData.estimated_duration) ||
                                (previousData.actualDuration !== newData.actualDuration && !!newData.actualDuration);

        // Fire when status transitions to 'completed' OR when parts/duration were updated
        if (!isCompleted && !partsChanged && !durationChanged) {
            return null;
        }

        const orgId = newData.org_id;
        if (!orgId) {
            console.warn(`[AILearning] Job ${jobId} updated but has no org_id`);
            return null;
        }

        const aiRec = newData.aiRecommendation;
        const description = newData.request?.description || newData.title || newData.category || '';

        // Learn what materials are used for this type of job
        const actualItems: Array<{ name: string; quantity: number; cost?: number }> = [];

        if (newData.costs?.parts?.items && Array.isArray(newData.costs.parts.items)) {
            for (const item of newData.costs.parts.items) {
                if (item.name && item.quantity > 0) {
                    actualItems.push({
                        name: item.name,
                        quantity: item.quantity,
                        cost: item.unitPrice || item.cost || 0,
                    });
                }
            }
        }

        if (Array.isArray(newData.parts)) {
            for (const item of newData.parts) {
                const name = item.name || item.description;
                if (name && (item.quantity > 0 || item.qty > 0)) {
                    actualItems.push({
                        name,
                        quantity: item.quantity || item.qty || 1,
                        cost: item.unitCost || item.cost || item.unitPrice || 0,
                    });
                }
            }
        }

        if (Array.isArray(newData.materials)) {
            for (const item of newData.materials) {
                const name = item.name || item.description;
                if (name) {
                    actualItems.push({
                        name,
                        quantity: item.quantity || 1,
                        cost: item.cost || item.unitPrice || 0,
                    });
                }
            }
        }

        const jobDurationMins = Number(newData.actualDuration) ||
            (newData.costs?.labor?.hours ? Number(newData.costs.labor.hours) * 60 : 0) ||
            (newData.estimated_duration ? Number(newData.estimated_duration) : 0);

        // If there's no description and no parts and no duration, nothing to learn
        if (!description && actualItems.length === 0 && jobDurationMins === 0) {
            console.log(`[AILearning] Job ${jobId}: no description, parts, or duration to learn from`);
            return null;
        }

        try {
            // Classify the job type
            const classification = classifyJobType(description, aiRec?.jobClassification);
            console.log(`[AILearning] Job ${jobId} classified as: ${classification.patternKey}`);

            // Get the pattern document reference
            const patternRef = db
                .collection('organizations').doc(orgId)
                .collection('ai_patterns').doc(classification.patternKey);

            await db.runTransaction(async (transaction) => {
                const patternDoc = await transaction.get(patternRef);
                const existing: Partial<OrgAiPattern> = patternDoc.exists ? patternDoc.data() as OrgAiPattern : {};

                let commonMaterials = existing.commonMaterials || [];
                let commonTools = existing.commonTools || [];
                let removedItems = existing.removedItems || [];
                let addedItems = existing.addedItems || [];
                const sampleSize = (existing.sampleSize || 0) + 1;
                const totalDurationSum = (existing.totalDurationSum || 0) + (jobDurationMins > 0 ? jobDurationMins : 0);

                // ── Learn from actual parts used ──
                for (const item of actualItems) {
                    commonMaterials = mergeMaterial(
                        commonMaterials,
                        item.name,
                        item.quantity,
                        item.cost || 0
                    );
                }

                // ── Learn from tools ──
                if (Array.isArray(newData.tools)) {
                    for (const t of newData.tools) {
                        const toolName = typeof t === 'string' ? t : t.name;
                        if (toolName && !commonTools.includes(toolName)) {
                            commonTools.push(toolName);
                        }
                    }
                }
                if (aiRec?.toolsRequired && Array.isArray(aiRec.toolsRequired)) {
                    for (const tool of aiRec.toolsRequired) {
                        const toolName = typeof tool === 'string' ? tool : tool.name;
                        if (toolName && !commonTools.includes(toolName)) {
                            commonTools.push(toolName);
                        }
                    }
                }

                // ── Compare AI-recommended parts vs actual parts used ──
                if (aiRec?.partsNeeded && Array.isArray(aiRec.partsNeeded)) {
                    const actualNames = actualItems.map(i => i.name.toLowerCase().trim());
                    const aiNames = aiRec.partsNeeded.map((p: any) => (p.name || '').toLowerCase().trim());

                    // Items AI recommended but tech didn't use
                    for (const aiPart of aiRec.partsNeeded) {
                        const aiName = (aiPart.name || '').toLowerCase().trim();
                        const wasUsed = actualNames.some((an: string) => an.includes(aiName) || aiName.includes(an));
                        if (!wasUsed && aiName) {
                            removedItems = mergeFrequencyItem(removedItems, aiPart.name);
                        }
                    }

                    // Items tech used but AI didn't recommend
                    for (const actualItem of actualItems) {
                        const actualName = actualItem.name.toLowerCase().trim();
                        const wasRecommended = aiNames.some((rn: string) => rn.includes(actualName) || actualName.includes(rn));
                        if (!wasRecommended) {
                            addedItems = mergeFrequencyItem(addedItems, actualItem.name);
                        }
                    }
                }

                // ── Build the updated pattern ──
                const updatedPattern: OrgAiPattern = {
                    org_id: orgId,
                    patternKey: classification.patternKey,
                    jobCategory: classification.category,
                    jobType: classification.type,
                    displayLabel: classification.displayLabel,
                    commonMaterials,
                    commonTools,
                    avgDuration: sampleSize > 0 && totalDurationSum > 0 ? Math.round(totalDurationSum / sampleSize) : (existing.avgDuration || 0),
                    totalDurationSum,
                    corrections: existing.corrections || [],
                    removedItems,
                    addedItems,
                    sampleSize,
                    lastUpdated: admin.firestore.Timestamp.now(),
                    confidence: calculateConfidence(sampleSize),
                };

                transaction.set(patternRef, updatedPattern, { merge: true });
            });

            console.log(`[AILearning] Successfully learned from job ${jobId} → pattern: ${classification.patternKey}`);

        } catch (error) {
            // Non-critical: don't let learning failures break job completion
            console.error(`[AILearning] Error learning from job ${jobId}:`, error);
        }

        return null;
    });


// ═══════════════════════════════════════════════════════════════════════
// TRIGGER 2: QUOTE MODIFICATION → LEARN FROM CORRECTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * When a quote is updated (version incremented), compare the current lineItems
 * to the previous version to capture what the dispatcher changed.
 */
export const onQuoteUpdatedLearnCorrections = functions.firestore
    .document('quotes/{quoteId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const previousData = change.before.data();
        const quoteId = context.params.quoteId;

        const newVersion = newData.version || 0;
        const prevVersion = previousData.version || 0;
        const prevLineItems: any[] = previousData.lineItems || [];
        const newLineItems: any[] = newData.lineItems || [];

        // Check if anything meaningful changed (materials, labor, tools/equipment, scope)
        const prevSig = JSON.stringify(prevLineItems.map((li: any) => ({ t: li.type, d: li.description, q: li.quantity, p: li.unitPrice })));
        const newSig = JSON.stringify(newLineItems.map((li: any) => ({ t: li.type, d: li.description, q: li.quantity, p: li.unitPrice })));
        const scopeChanged = (previousData.scopeOfWork || '') !== (newData.scopeOfWork || '');

        if (prevSig === newSig && !scopeChanged && newVersion <= prevVersion) {
            return null;
        }

        const orgId = newData.org_id;
        const jobId = newData.job_id;

        if (!orgId) {
            console.warn(`[AILearning] Quote ${quoteId} updated but has no org_id`);
            return null;
        }

        // Get the job to find the description and AI classification
        let jobDescription = '';
        let aiClassification: any = null;

        if (jobId) {
            try {
                const jobDoc = await db.collection('jobs').doc(jobId).get();
                if (jobDoc.exists) {
                    const jobData = jobDoc.data();
                    jobDescription = jobData?.request?.description || jobData?.title || '';
                    aiClassification = jobData?.aiRecommendation?.jobClassification;
                }
            } catch (e) {
                console.warn(`[AILearning] Could not fetch job ${jobId} for quote ${quoteId}:`, e);
            }
        }

        // If no job description, try the quote's scope of work
        if (!jobDescription) {
            jobDescription = newData.scopeOfWork || '';
        }

        if (!jobDescription) {
            console.log(`[AILearning] Quote ${quoteId}: no job description to classify`);
            return null;
        }

        // Extract material line items
        const prevMaterials = prevLineItems
            .filter((li: any) => li.type === 'material')
            .map((li: any) => ({ name: li.description, quantity: li.quantity, unitPrice: li.unitPrice }));

        const newMaterials = newLineItems
            .filter((li: any) => li.type === 'material')
            .map((li: any) => ({ name: li.description, quantity: li.quantity, unitPrice: li.unitPrice }));

        try {
            const classification = classifyJobType(jobDescription, aiClassification);
            console.log(`[AILearning] Quote ${quoteId} correction detected → pattern: ${classification.patternKey}`);

            const patternRef = db
                .collection('organizations').doc(orgId)
                .collection('ai_patterns').doc(classification.patternKey);

            await db.runTransaction(async (transaction) => {
                const patternDoc = await transaction.get(patternRef);
                const existing: Partial<OrgAiPattern> = patternDoc.exists ? patternDoc.data() as OrgAiPattern : {};

                let corrections = existing.corrections || [];
                let removedItems = existing.removedItems || [];
                let addedItems = existing.addedItems || [];
                let commonMaterials = existing.commonMaterials || [];
                let commonTools = existing.commonTools || [];
                const sampleSize = (existing.sampleSize || 0) + 1;

                const prevNamesSet = new Set(prevMaterials.map((m: any) => m.name.toLowerCase().trim()));
                const newNamesSet = new Set(newMaterials.map((m: any) => m.name.toLowerCase().trim()));

                // 1. Materials dispatcher REMOVED from the quote
                for (const prev of prevMaterials) {
                    const prevName = prev.name.toLowerCase().trim();
                    if (!newNamesSet.has(prevName)) {
                        removedItems = mergeFrequencyItem(removedItems, prev.name);
                        corrections = mergeCorrection(corrections, prev.name, 'REMOVED');
                        console.log(`[AILearning] Quote ${quoteId}: "${prev.name}" was REMOVED by dispatcher`);
                    }
                }

                // 2. Materials dispatcher ADDED to the quote
                for (const curr of newMaterials) {
                    const currName = curr.name.toLowerCase().trim();
                    if (!prevNamesSet.has(currName)) {
                        addedItems = mergeFrequencyItem(addedItems, curr.name);
                        commonMaterials = mergeMaterial(commonMaterials, curr.name, curr.quantity, curr.unitPrice || 0);
                        console.log(`[AILearning] Quote ${quoteId}: "${curr.name}" was ADDED by dispatcher`);
                    }
                }

                // 3. Materials that had quantity or price changes
                for (const curr of newMaterials) {
                    const currName = curr.name.toLowerCase().trim();
                    const prev = prevMaterials.find((p: any) => p.name.toLowerCase().trim() === currName);
                    if (prev && (prev.quantity !== curr.quantity || prev.unitPrice !== curr.unitPrice)) {
                        corrections = mergeCorrection(corrections, `${prev.name} (qty:${prev.quantity}, $${prev.unitPrice})`, `${curr.name} (qty:${curr.quantity}, $${curr.unitPrice})`);
                        console.log(`[AILearning] Quote ${quoteId}: "${curr.name}" qty/price adjusted (${prev.quantity}→${curr.quantity}, $${prev.unitPrice}→$${curr.unitPrice})`);
                    }
                }

                // 4. Labor hours / duration changes
                const prevLaborItems = prevLineItems.filter((li: any) => li.type === 'labor');
                const newLaborItems = newLineItems.filter((li: any) => li.type === 'labor');
                const prevLaborHours = prevLaborItems.reduce((sum, li) => sum + (Number(li.quantity) || 0), 0);
                const newLaborHours = newLaborItems.reduce((sum, li) => sum + (Number(li.quantity) || 0), 0);

                let totalDurationSum = existing.totalDurationSum || 0;
                let avgDuration = existing.avgDuration || 0;

                if (newLaborHours > 0) {
                    const newDurationMins = Math.round(newLaborHours * 60);
                    if (prevLaborHours !== newLaborHours || avgDuration === 0) {
                        totalDurationSum += newDurationMins;
                        avgDuration = Math.round(totalDurationSum / sampleSize);
                        if (prevLaborHours > 0) {
                            corrections = mergeCorrection(corrections, `${prevLaborHours}h labor`, `${newLaborHours}h labor`);
                        }
                        console.log(`[AILearning] Quote ${quoteId}: labor adjusted (${prevLaborHours}h → ${newLaborHours}h). New avgDuration: ${avgDuration}min`);
                    }
                }

                // 5. Equipment / Tools line items
                const prevTools = prevLineItems.filter((li: any) => li.type === 'equipment').map((li: any) => li.description);
                const newTools = newLineItems.filter((li: any) => li.type === 'equipment').map((li: any) => li.description);

                for (const tool of newTools) {
                    if (tool && !commonTools.includes(tool)) {
                        commonTools.push(tool);
                        console.log(`[AILearning] Quote ${quoteId}: tool/equipment "${tool}" ADDED`);
                    }
                }
                for (const tool of prevTools) {
                    if (tool && !newTools.includes(tool)) {
                        removedItems = mergeFrequencyItem(removedItems, tool);
                        console.log(`[AILearning] Quote ${quoteId}: tool/equipment "${tool}" REMOVED`);
                    }
                }

                const updatedPattern: Partial<OrgAiPattern> = {
                    org_id: orgId,
                    patternKey: classification.patternKey,
                    jobCategory: classification.category,
                    jobType: classification.type,
                    displayLabel: classification.displayLabel,
                    corrections,
                    removedItems,
                    addedItems,
                    commonMaterials,
                    commonTools,
                    avgDuration: avgDuration > 0 ? avgDuration : (existing.avgDuration || 0),
                    totalDurationSum,
                    sampleSize,
                    lastUpdated: admin.firestore.Timestamp.now(),
                    confidence: calculateConfidence(sampleSize),
                };

                transaction.set(patternRef, updatedPattern, { merge: true });
            });

            console.log(`[AILearning] Successfully learned corrections from quote ${quoteId}`);

        } catch (error) {
            console.error(`[AILearning] Error learning from quote ${quoteId}:`, error);
        }

        return null;
    });


// ═══════════════════════════════════════════════════════════════════════
// PATTERN RETRIEVAL (for prompt injection)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch the most relevant org-learned patterns for a given job description.
 * Returns patterns sorted by relevance (exact match > category match).
 * 
 * This is called by the prompt builders before generating an AI recommendation.
 */
/**
 * Directly fetch the raw OrgAiPattern document if it exists.
 * Used for post-processing and deterministic pattern enforcement.
 */
export async function getOrgPattern(
    orgId: string,
    description: string,
    aiClassification?: { jobType?: string; tradeCategory?: string; primaryItem?: string | null }
): Promise<OrgAiPattern | null> {
    if (!orgId || !description) return null;

    try {
        const classification = classifyJobType(description, aiClassification);
        const exactDoc = await db
            .collection('organizations').doc(orgId)
            .collection('ai_patterns').doc(classification.patternKey)
            .get();

        if (exactDoc.exists) {
            return scopePatternToRequest(exactDoc.data() as OrgAiPattern, description);
        }
        return null;
    } catch (e) {
        console.warn(`[AILearning] Error getting raw org pattern for ${orgId}:`, e);
        return null;
    }
}

/**
 * Fetch the most relevant org-learned patterns for a given job description.
 * Returns patterns sorted by relevance (exact match > category match).
 * 
 * This is called by the prompt builders before generating an AI recommendation.
 */
export async function fetchOrgPatterns(
    orgId: string,
    description: string,
    aiClassification?: { jobType?: string; tradeCategory?: string; primaryItem?: string | null }
): Promise<string> {
    if (!orgId || !description) return '';

    try {
        const classification = classifyJobType(description, aiClassification);

        // Try exact pattern match first
        const exactRef = db
            .collection('organizations').doc(orgId)
            .collection('ai_patterns').doc(classification.patternKey);

        const exactDoc = await exactRef.get();

        const patterns: OrgAiPattern[] = [];

        // Add exact match first (even if sample size 1 so previous manual changes apply immediately)
        if (exactDoc.exists) {
            const data = exactDoc.data() as OrgAiPattern;
            if (data.sampleSize >= 1) {
                patterns.push(data);
            }
        }

        // Also fetch category-wide patterns for broader context (without requiring composite index)
        try {
            const categorySnap = await db
                .collection('organizations').doc(orgId)
                .collection('ai_patterns')
                .where('jobCategory', '==', classification.category)
                .limit(10)
                .get();

            const categoryDocs = categorySnap.docs
                .map(d => d.data() as OrgAiPattern)
                .filter(p => p.patternKey !== classification.patternKey && p.sampleSize >= 1)
                .sort((a, b) => (b.sampleSize || 0) - (a.sampleSize || 0))
                .slice(0, 5);

            patterns.push(...categoryDocs);
        } catch (catErr) {
            console.warn(`[AILearning] Non-critical category patterns fetch issue:`, catErr);
        }

        if (patterns.length === 0) return '';

        // Strip learned materials that belong to a different trade than this request
        const scopedPatterns = patterns.map(p => scopePatternToRequest(p, description));

        // Build the prompt section
        return buildPatternPromptSection(scopedPatterns, classification);

    } catch (error) {
        console.warn(`[AILearning] Error fetching org patterns for ${orgId}:`, error);
        return '';
    }
}

/**
 * Return a copy of a learned pattern with materials / added items that are
 * irrelevant to the current request's trade removed. Generic buckets
 * (e.g. general__general_installation) can accumulate items from many unrelated
 * jobs — without this, a fridge water line learned on one install gets forced
 * onto a camera install.
 */
export function scopePatternToRequest(pattern: OrgAiPattern, description: string): OrgAiPattern {
    if (!pattern || !description) return pattern;
    const keep = (name: string) => {
        const ok = isItemRelevantToRequest(name || '', description);
        if (!ok) console.log(`[AILearning] Ignoring learned item "${name}" from pattern ${pattern.patternKey} — not relevant to request`);
        return ok;
    };
    return {
        ...pattern,
        commonMaterials: (pattern.commonMaterials || []).filter(m => keep(m.name)),
        addedItems: (pattern.addedItems || []).filter(a => keep(a.name)),
    };
}

/**
 * Format learned patterns into a prompt section for the AI.
 */
function buildPatternPromptSection(
    patterns: OrgAiPattern[],
    currentClassification: { category: string; type: string; displayLabel: string }
): string {
    if (patterns.length === 0) return '';

    let section = `
══════════════════════════════════════════════
YOUR ORGANIZATION'S LEARNED PATTERNS
══════════════════════════════════════════════
The following patterns have been learned from this specific organization's completed jobs and manual dispatcher corrections.
Use these patterns to make your recommendations match this company's actual workflow, tools, materials, and pricing preferences.
`;

    // Exact match pattern (most valuable)
    const exactMatch = patterns.find(p => p.jobType === currentClassification.type);
    if (exactMatch && exactMatch.sampleSize >= 1) {
        section += `
▸ EXACT MATCH: "${exactMatch.displayLabel}" (${exactMatch.sampleSize} past jobs/quotes recorded, ${Math.round(exactMatch.confidence * 100)}% confidence)
`;

        if (exactMatch.commonMaterials.length > 0) {
            const topMaterials = exactMatch.commonMaterials
                .sort((a, b) => b.frequency - a.frequency)
                .slice(0, 10);
            section += `  Most commonly used materials by this company:\n`;
            for (const m of topMaterials) {
                section += `    - ${m.name} (used in ${m.frequency}/${exactMatch.sampleSize} records, avg qty: ${m.avgQuantity}, avg cost: $${m.avgCost.toFixed(2)})\n`;
            }
        }

        if (exactMatch.removedItems.length > 0) {
            const topRemoved = exactMatch.removedItems
                .sort((a, b) => b.frequency - a.frequency)
                .slice(0, 5);
            section += `  Items dispatchers frequently REMOVED from default quotes:\n`;
            for (const r of topRemoved) {
                section += `    ✗ ${r.name} (removed ${r.frequency} times) — DO NOT recommend this item\n`;
            }
        }

        if (exactMatch.addedItems.length > 0) {
            const topAdded = exactMatch.addedItems
                .sort((a, b) => b.frequency - a.frequency)
                .slice(0, 5);
            section += `  Items dispatchers frequently ADDED to default quotes:\n`;
            for (const a of topAdded) {
                section += `    ✓ ${a.name} (added ${a.frequency} times) — YOU MUST INCLUDE this item in partsNeeded\n`;
            }
        }

        if (exactMatch.commonTools && exactMatch.commonTools.length > 0) {
            section += `  Tools required/used by this company: ${exactMatch.commonTools.slice(0, 8).join(', ')}\n`;
        }

        if (exactMatch.avgDuration > 0) {
            section += `  Company standard actual job duration: ${exactMatch.avgDuration} minutes (use this for estimatedDuration)\n`;
        }

        if (exactMatch.corrections.length > 0) {
            const topCorrections = exactMatch.corrections
                .filter(c => c.frequency >= 1)
                .sort((a, b) => b.frequency - a.frequency)
                .slice(0, 5);
            if (topCorrections.length > 0) {
                section += `  Recurring dispatcher corrections:\n`;
                for (const c of topCorrections) {
                    section += `    "${c.aiRecommended}" → "${c.humanCorrected}" (${c.frequency} times)\n`;
                }
            }
        }
    }

    // Related category patterns
    const relatedPatterns = patterns.filter(p => p.jobType !== currentClassification.type && p.sampleSize >= 1);
    if (relatedPatterns.length > 0) {
        section += `\n▸ RELATED ${currentClassification.category.toUpperCase()} JOBS AT THIS COMPANY:\n`;
        for (const rp of relatedPatterns.slice(0, 3)) {
            section += `  - "${rp.displayLabel}": ${rp.sampleSize} records`;
            if (rp.commonMaterials.length > 0) {
                const topNames = rp.commonMaterials
                    .sort((a, b) => b.frequency - a.frequency)
                    .slice(0, 3)
                    .map(m => m.name);
                section += `, common materials: ${topNames.join(', ')}`;
            }
            section += '\n';
        }
    }

    section += `
CRITICAL INSTRUCTIONS FOR RESPECTING THIS COMPANY'S RULES:
1. Prioritize materials and tools from the "EXACT MATCH" section above.
2. If an item appears in "frequently REMOVED" or is marked ✗, DO NOT include it in partsNeeded under any circumstances.
3. If an item appears in "frequently ADDED" or is marked ✓, YOU MUST INCLUDE IT in partsNeeded.
4. If a company standard duration is provided, calibrate your estimatedDuration to match it.
`;

    return section;
}

/**
 * Deterministically applies learned patterns to an AI recommendation,
 * ensuring duration calibration, tool additions, removed item filtering,
 * and added item injections are strictly enforced.
 */
export function applyPatternToRecommendation(recommendation: any, rawOrgPattern: OrgAiPattern | null) {
    if (!recommendation || !rawOrgPattern) return;

    // 1. Duration calibration from learned actuals
    if (rawOrgPattern.avgDuration && rawOrgPattern.avgDuration > 0) {
        const original = recommendation.estimatedDuration;
        recommendation.estimatedDuration = Math.round(rawOrgPattern.avgDuration);
        console.log(`[PatternEnforcement] Duration calibrated to company pattern: ${original}min → ${recommendation.estimatedDuration}min`);
    }

    // 2. Tools requirement enforcement
    if (Array.isArray(rawOrgPattern.commonTools) && rawOrgPattern.commonTools.length > 0) {
        recommendation.toolsNeeded = recommendation.toolsNeeded || [];
        const existingTools = new Set(recommendation.toolsNeeded.map((t: string) => t.toLowerCase()));
        for (const tool of rawOrgPattern.commonTools) {
            if (tool && !existingTools.has(tool.toLowerCase())) {
                recommendation.toolsNeeded.push(tool);
                existingTools.add(tool.toLowerCase());
            }
        }
    }

    // 3. Removed items enforcement (do not recommend items dispatchers removed)
    if (Array.isArray(rawOrgPattern.removedItems) && rawOrgPattern.removedItems.length > 0 && Array.isArray(recommendation.partsNeeded)) {
        const removedNames = rawOrgPattern.removedItems.map(r => r.name.toLowerCase().trim());
        recommendation.partsNeeded = recommendation.partsNeeded.filter((p: any) => {
            if (!p || !p.name) return true;
            const pName = p.name.toLowerCase().trim();
            const isRemoved = removedNames.some(rn => pName === rn || pName.includes(rn) || rn.includes(pName));
            if (isRemoved) {
                console.log(`[PatternEnforcement] Filtered out company-removed part: "${p.name}"`);
            }
            return !isRemoved;
        });
    }

    // 4. Added items enforcement (ensure items dispatchers frequently added are included)
    if (Array.isArray(rawOrgPattern.addedItems) && rawOrgPattern.addedItems.length > 0) {
        recommendation.partsNeeded = recommendation.partsNeeded || [];
        const existingParts = new Set(recommendation.partsNeeded.map((p: any) => (p.name || '').toLowerCase().trim()));
        for (const added of rawOrgPattern.addedItems) {
            const addedName = (added.name || '').trim();
            if (!addedName || existingParts.has(addedName.toLowerCase())) continue;

            const matInfo = Array.isArray(rawOrgPattern.commonMaterials)
                ? rawOrgPattern.commonMaterials.find(m => m.name.toLowerCase().trim() === addedName.toLowerCase())
                : null;

            recommendation.partsNeeded.push({
                name: addedName,
                quantity: matInfo?.avgQuantity || 1,
                estimatedCost: matInfo?.avgCost || 25,
                essential: true,
                _source: 'org_learned_pattern'
            });
            existingParts.add(addedName.toLowerCase());
            console.log(`[PatternEnforcement] Injected company-added part: "${addedName}"`);
        }
    }
}

