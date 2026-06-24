import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { logGeminiUsage } from '../billing';
import { getFlashModel, getLatestFlashModelName } from './aiConfig';

const db = admin.firestore();

interface AIRecommendation {
    diagnosis: string;
    solution: string;
    partsNeeded: Array<{ name: string; estimatedCost?: number }>;
    toolsNeeded?: string[];
    estimatedDuration: number;
    confidence: number;
    safetyWarnings?: string[];
    customerAvailability?: string[];
}

/**
 * Analyze a job using Gemini AI to provide diagnosis, solution, and parts recommendations
 */
export const analyzeJobWithAI = functions.https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { jobId } = data;

    if (!jobId) {
        throw new functions.https.HttpsError('invalid-argument', 'jobId is required');
    }

    try {
        // Fetch job details
        const jobDoc = await db.collection('jobs').doc(jobId).get();

        if (!jobDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Job not found');
        }

        const job = jobDoc.data();
        if (!job) {
            throw new functions.https.HttpsError('not-found', 'Job data is empty');
        }

        // Fetch technician's inventory if available
        const techInventory = await fetchTechInventory(context.auth.uid);

        // Build the prompt for Gemini
        const prompt = buildAnalysisPrompt(job, techInventory);

        // Call Gemini API
        const model = await getFlashModel();
        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'analyzeJobWithAI');
        }

        const text = response.text();

        // Parse the AI response
        const recommendation = parseAIResponse(text, techInventory);

        // Save recommendation to job document
        await db.collection('jobs').doc(jobId).update({
            aiRecommendation: recommendation,
            aiAnalyzedAt: FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            recommendation,
        };
    } catch (error: any) {
        console.error('AI analysis failed:', error);
        throw new functions.https.HttpsError('internal', `AI analysis failed: ${error.message}`);
    }
});

/**
 * Generate an AI job estimate from raw form data (before saving the job).
 * Returns diagnosis, solution, parts, estimated duration, cost breakdown, and confidence.
 */
export const generateJobEstimate = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { description, category, priority, address, siteName, orgId } = data;

    if (!description || typeof description !== 'string' || description.trim().length < 5) {
        throw new functions.https.HttpsError('invalid-argument', 'A job description is required (at least 5 characters)');
    }

    try {
        // Fetch the org's materials inventory for real pricing context
        let orgMaterials: any[] = [];
        const resolvedOrgId = orgId || (context.auth as any)?.token?.org_id || 'demo-org';

        try {
            const materialsSnap = await db.collection('materials')
                .where('org_id', '==', resolvedOrgId)
                .get();
            orgMaterials = materialsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (err) {
            console.warn('Could not fetch org materials for estimate:', err);
        }

        // Build a lightweight job-like object for the prompt builder
        const pseudoJob = {
            customer: { name: 'Customer', address: address || '' },
            request: { description: description.trim(), type: category || 'General Service', photos: [] },
            priority: priority || 'medium',
            complexity: 'unknown',
            site_name: siteName || ''
        };

        const prompt = buildEstimatePrompt(pseudoJob, orgMaterials);

        const model = await getFlashModel();
        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'generateJobEstimate');
        }

        const text = response.text();
        const recommendation = parseAIResponse(text, []);

        // Cross-reference parts with org inventory for real pricing
        if (orgMaterials.length > 0) {
            recommendation.partsNeeded = recommendation.partsNeeded.map(part => {
                const match = findMaterialMatch(part.name, orgMaterials);
                if (match) {
                    // Use vendor pricing if available, then unitCost, then AI estimate
                    const vendors = match.vendors as any[] | undefined;
                    let bestCost = part.estimatedCost || 0;
                    let vendorName: string | undefined;

                    if (vendors && vendors.length > 0) {
                        const preferredVendorId = match.preferredVendorId;
                        let bestVendor = preferredVendorId
                            ? vendors.find((v: any) => v.vendorId === preferredVendorId)
                            : null;
                        if (!bestVendor) {
                            bestVendor = vendors.find((v: any) => v.unitCost != null && v.unitCost > 0);
                        }
                        if (bestVendor && bestVendor.unitCost > 0) {
                            bestCost = bestVendor.unitCost;
                            vendorName = bestVendor.vendorName;
                        }
                    }

                    if (bestCost === (part.estimatedCost || 0) && match.unitCost && match.unitCost > 0) {
                        bestCost = match.unitCost;
                    }

                    return {
                        ...part,
                        name: match.name || part.name, // Use canonical inventory name
                        estimatedCost: bestCost > 0 ? bestCost : part.estimatedCost,
                        materialId: match.id,
                        priceSource: vendorName ? 'vendor' : (match.unitCost > 0 ? 'inventory' : 'ai_estimate'),
                        vendorName,
                    };
                }
                return part;
            });
        }

        // Calculate a simple cost estimate summary from the parts
        const totalMaterialCost = recommendation.partsNeeded.reduce(
            (sum, p) => sum + (p.estimatedCost || 0) * ((p as any).quantity || 1), 0
        );

        return {
            success: true,
            recommendation,
            costSummary: {
                estimatedMaterialCost: Math.round(totalMaterialCost * 100) / 100,
                estimatedLaborMinutes: recommendation.estimatedDuration,
                partsCount: recommendation.partsNeeded.length,
            }
        };
    } catch (error: any) {
        console.error('AI job estimate failed:', error);
        throw new functions.https.HttpsError('internal', `AI estimate failed: ${error.message}`);
    }
});

/**
 * Build the estimate prompt for Gemini — works with raw form data (no saved job required)
 * Includes org materials inventory for real pricing when available.
 */
function buildEstimatePrompt(job: any, orgMaterials: any[] = []): string {
    // Build a compact inventory summary for the AI to reference
    let inventoryContext = '';
    if (orgMaterials.length > 0) {
        const inventoryLines = orgMaterials
            .filter(m => m.name && (m.unitCost > 0 || m.unitPrice > 0 || (m.vendors && m.vendors.length > 0)))
            .slice(0, 100) // Limit to 100 items to avoid token overflow
            .map(m => {
                // Get the best price from vendors or unitCost
                let price = m.unitCost || m.unitPrice || 0;
                let source = 'inventory';
                if (m.vendors && m.vendors.length > 0) {
                    const bestVendor = m.vendors.find((v: any) => v.unitCost > 0);
                    if (bestVendor) {
                        price = bestVendor.unitCost;
                        source = bestVendor.vendorName || 'vendor';
                    }
                }
                return `- ${m.name}: $${price.toFixed(2)} (${source})${m.quantity != null ? ` [${m.quantity} in stock]` : ''}`;
            });

        if (inventoryLines.length > 0) {
            inventoryContext = `\n\n**Company Materials Inventory (use these prices when a match exists):**\n${inventoryLines.join('\n')}`;
        }
    }

    return `You are an expert field service technician assistant specializing in HVAC, plumbing, electrical, and general home services. Analyze this service request and provide a detailed, complete estimate.

**Service Request:**
- Issue Description: ${job.request.description}
- Service Type: ${job.request.type || 'General Service'}
- Priority: ${job.priority}
- Location: ${job.customer.address || 'Not specified'}
${job.site_name ? `- Site: ${job.site_name}` : ''}
${inventoryContext}

**Please provide a structured analysis in the following JSON format:**

{
  "diagnosis": "Brief diagnosis of the likely issue (2-3 sentences)",
  "solution": "Step-by-step recommended solution (3-5 steps)",
  "partsNeeded": [
    {"name": "Major item/fixture name", "estimatedCost": 250.00, "quantity": 2},
    {"name": "Accessory/supply item", "estimatedCost": 15.50, "quantity": 1}
  ],
  "toolsNeeded": ["Pipe wrench", "Basin wrench", "Level"],
  "estimatedDuration": 90,
  "confidence": 0.85,
  "safetyWarnings": ["Warning 1", "Warning 2"]
}

**CRITICAL GUIDELINES:**
1. **INCLUDE ALL MAJOR ITEMS FIRST.** If the job involves installing, replacing, or providing fixtures or equipment (e.g., toilets, faucets, water heaters, AC units, light fixtures, circuit breakers, bidets, garbage disposals, etc.), these MUST be listed in partsNeeded with realistic retail pricing. These are the PRIMARY cost items the customer is paying for.
2. Then include all necessary accessories, connectors, supplies, and consumables (e.g., wax rings, supply lines, mounting hardware, caulk, fittings, wire nuts, etc.).
3. NEVER include technician-owned tools in partsNeeded — only items that are installed, consumed, or left behind on-site.
4. **toolsNeeded** should list the technician tools/equipment needed for this job (e.g., pipe wrench, basin wrench, drill, level, multimeter, etc.). These are tools the tech brings — NOT parts left behind.
5. If a Company Materials Inventory is provided above, match items against it and use those prices. For items not in inventory, use realistic current retail pricing (e.g., a standard toilet costs $150-400, a bidet $50-300, etc.).
6. Each part MUST have a realistic estimatedCost in USD. Never use $0 or leave cost blank.
7. Estimate realistic duration in minutes (include travel, diagnosis, repair, and cleanup).
8. Confidence should be 0-1 based on how much information was provided. Vague descriptions = lower confidence.
9. Include safety warnings if applicable (electrical hazards, gas lines, water damage, etc.).
10. If the description is vague, lower confidence and note what additional information would help.

Respond ONLY with valid JSON, no additional text.`;
}

/**
 * Find a matching material in the org inventory by name (fuzzy match)
 */
function findMaterialMatch(name: string, inventory: any[]): any | null {
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9\s]/g, '');

    // Exact match first
    let match = inventory.find(m => (m.name || '').toLowerCase() === normalizedName);
    if (match) return match;

    // Substring match
    match = inventory.find(m => {
        const mName = (m.name || '').toLowerCase();
        return mName.includes(normalizedName) || normalizedName.includes(mName);
    });
    if (match) return match;

    // Word overlap match (at least 60% of words match)
    const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
    if (nameWords.length === 0) return null;

    match = inventory.find(m => {
        const mWords = (m.name || '').toLowerCase().split(/\s+/);
        const overlap = nameWords.filter(w => mWords.some((mw: string) => mw.includes(w) || w.includes(mw))).length;
        return overlap / Math.max(nameWords.length, 1) >= 0.6;
    });

    return match || null;
}


/**
 * Automatically analyze jobs when they're created
 */
export const autoAnalyzeNewJob = functions.firestore
    .document('jobs/{jobId}')
    .onCreate(async (snap, context) => {
        const job = snap.data();
        const jobId = context.params.jobId;

        // Only analyze if there's a description and it's not a parts run
        if (!job.request?.description || job.type === 'parts_run') {
            return;
        }

        try {
            // Fetch technician's inventory if assigned
            const techInventory = job.assigned_tech_id
                ? await fetchTechInventory(job.assigned_tech_id)
                : [];

            // Build the prompt
            const prompt = buildAnalysisPrompt(job, techInventory);

            // Call Gemini API
            const model = await getFlashModel();
            const result = await model.generateContent(prompt);
            const response = await result.response;

            if (response.usageMetadata?.totalTokenCount) {
                await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'autoAnalyzeNewJob');
            }

            const text = response.text();

            // Parse the AI response
            const recommendation = parseAIResponse(text, techInventory);

            // Save recommendation
            await snap.ref.update({
                aiRecommendation: recommendation,
                aiAnalyzedAt: FieldValue.serverTimestamp(),
            });

            console.log(`AI analysis completed for job ${jobId}`);
        } catch (error) {
            console.error(`AI analysis failed for job ${jobId}:`, error);
            // Don't throw - job creation should still succeed even if AI fails
        }
    });

/**
 * Fetch technician's parts and tools inventory
 */
async function fetchTechInventory(techId: string): Promise<any[]> {
    try {
        const inventorySnapshot = await db
            .collection('inventory')
            .where('techId', '==', techId)
            .get();

        return inventorySnapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error('Failed to fetch inventory:', error);
        return [];
    }
}

/**
 * Build the analysis prompt for Gemini
 */
function buildAnalysisPrompt(job: any, inventory: any[]): string {
    const inventoryList = inventory.length > 0
        ? `\n\nTechnician's current inventory:\n${inventory.map(item => `- ${item.name} (${item.quantity || 'unknown qty'})`).join('\n')}`
        : '\n\nNote: Technician inventory is empty or not available.';

    return `You are an expert HVAC, plumbing, and electrical technician assistant. Analyze this service job and provide recommendations.

**Job Details:**
- Customer: ${job.customer.name}
- Issue Description: ${job.request.description}
- Job Type: ${job.request.type || 'General Service'}
- Photos Available: ${job.request.photos?.length || 0}
- Priority: ${job.priority}
- Complexity: ${job.complexity || 'unknown'}
${inventoryList}

**Please provide a structured analysis in the following JSON format:**

{
  "diagnosis": "Brief diagnosis of the likely issue (2-3 sentences)",
  "solution": "Step-by-step recommended solution (3-5 steps)",
  "partsNeeded": [
    {"name": "Major item/fixture name", "estimatedCost": 250.00, "quantity": 2},
    {"name": "Accessory/supply item", "estimatedCost": 15.50, "quantity": 1}
  ],
  "toolsNeeded": ["Pipe wrench", "Basin wrench", "Level"],
  "estimatedDuration": 90,
  "confidence": 0.85,
  "safetyWarnings": ["Warning 1", "Warning 2"],
  "customerAvailability": ["Monday morning", "Any time Tuesday"]
}

**Guidelines:**
1. **INCLUDE ALL MAJOR ITEMS FIRST.** If the job involves installing, replacing, or providing fixtures or equipment (e.g., toilets, faucets, water heaters, AC units, light fixtures, bidets, garbage disposals, etc.), these MUST be listed in partsNeeded with realistic retail pricing.
2. Then include all necessary accessories, connectors, supplies, and consumables.
3. NEVER include technician-owned tools in partsNeeded — only items installed, consumed, or left behind on-site.
4. **toolsNeeded** should list the technician tools/equipment needed (e.g., pipe wrench, drill, multimeter). These are tools the tech brings — NOT parts left behind.
5. Check if parts are in technician's inventory (mark as "inInventory": true if found).
6. Each part MUST have a realistic estimatedCost in USD and a quantity. Never use $0.
7. Estimate realistic duration in minutes.
8. Confidence should be 0-1 based on information quality.
9. Include safety warnings if applicable (electrical hazards, gas lines, etc.).
10. If the description is vague, lower confidence and suggest what information is needed.
11. Extract any mentioned customer availability, scheduling preferences, or preferred days/times into the customerAvailability array. If none are mentioned, return an empty array.

Respond ONLY with valid JSON, no additional text.`;
}

/**
 * Parse the AI response and structure it
 */
function parseAIResponse(text: string, inventory: any[]): AIRecommendation {
    try {
        // Extract JSON from response (remove markdown code blocks if present)
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }

        const parsed = JSON.parse(jsonText);

        const toolKeywords = [
            'tape measure', 'measuring tape', 'wrench', 'screwdriver', 'drill',
            'pliers', 'level', 'hammer', 'saw', 'multimeter', 'voltmeter',
            'pipe cutter', 'tubing cutter', 'torch', 'soldering iron',
            'wire stripper', 'crimper', 'inspection camera', 'flashlight',
            'utility knife', 'box cutter', 'pry bar', 'crowbar', 'chisel',
            'channel locks', 'basin wrench', 'socket set', 'ratchet',
            'allen wrench', 'hex key', 'stud finder', 'fish tape',
            'snake', 'auger', 'plunger', 'shop vac', 'vacuum',
            'ladder', 'step ladder', 'extension cord', 'work light',
            'safety glasses', 'gloves', 'knee pads', 'dust mask',
            'drop cloth', 'tarp', 'bucket'
        ];

        // Filter out any technician-owned tools from partsNeeded
        const filteredParts = (parsed.partsNeeded || []).filter((part: any) => {
            const nameLower = (part.name || '').toLowerCase();
            const isActuallyATool = toolKeywords.some(kw => nameLower.includes(kw));
            return !isActuallyATool;
        });

        // Check each part against inventory
        const partsNeeded = filteredParts.map((part: any) => {
            const inInventory = inventory.some(item =>
                item.name.toLowerCase().includes(part.name.toLowerCase()) ||
                part.name.toLowerCase().includes(item.name.toLowerCase())
            );

            return {
                ...part,
                inInventory,
            };
        });

        return {
            diagnosis: parsed.diagnosis || 'Analysis pending',
            solution: parsed.solution || 'See job details for more information',
            partsNeeded,
            toolsNeeded: parsed.toolsNeeded || [],
            estimatedDuration: parsed.estimatedDuration || 60,
            confidence: parsed.confidence || 0.5,
            safetyWarnings: parsed.safetyWarnings || [],
            customerAvailability: parsed.customerAvailability || [],
        };
    } catch (error) {
        console.error('Failed to parse AI response:', error);
        console.error('Raw response:', text);

        // Return a fallback recommendation
        return {
            diagnosis: 'AI analysis could not be completed. Please review job manually.',
            solution: 'Review the job description and customer photos to determine the best approach.',
            partsNeeded: [],
            estimatedDuration: 60,
            confidence: 0.3,
            customerAvailability: [],
        };
    }
}

/**
 * Catalog parts and tools from an image
 */
export const catalogInventoryFromImage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { imageUrl, techId } = data;

    if (!imageUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'imageUrl is required');
    }

    try {
        const model = await getFlashModel();

        // Fetch the image
        const imagePart = {
            inlineData: {
                data: imageUrl.split(',')[1], // Remove data:image/jpeg;base64, prefix
                mimeType: 'image/jpeg',
            },
        };

        const prompt = `Analyze this image and catalog all visible parts, tools, and equipment.
For each item, provide:
- name: The specific name of the item
- category: "part", "tool", or "equipment"
- quantity: Estimated quantity visible (or 1 if just one)
- condition: "new", "used", or "unknown"

Common categories to look for:
- HVAC parts: filters, capacitors, contactors, thermostats, refrigerant, coils
- Plumbing parts: pipes, fittings, valves, washers, drain cleaners
- Electrical parts: wire, breakers, outlets, switches, wire nuts, tape
- Tools: wrenches, screwdrivers, multimeters, gauges, drills
- Safety: gloves, goggles, respirators

Respond with a JSON array:
[
  {"name": "Item name", "category": "part", "quantity": 5, "condition": "new"},
  ...
]

Respond ONLY with valid JSON array, no additional text.`;

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'catalogInventoryFromImage');
        }

        const text = response.text();

        // Parse response
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }

        const items = JSON.parse(jsonText);

        // Save to inventory collection
        const batch = db.batch();
        for (const item of items) {
            const docRef = db.collection('inventory').doc();
            batch.set(docRef, {
                ...item,
                techId: techId || context.auth.uid,
                imageUrl,
                catalogedAt: FieldValue.serverTimestamp(),
                catalogedBy: 'ai',
            });
        }
        await batch.commit();

        return {
            success: true,
            itemsFound: items.length,
            items,
        };
    } catch (error: any) {
        console.error('Inventory cataloging failed:', error);
        throw new functions.https.HttpsError('internal', `Cataloging failed: ${error.message}`);
    }
});
