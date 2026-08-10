import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logGeminiUsage } from '../billing';

import { getFlashModel } from './aiConfig';

export interface MaterialRequirement {
    name: string;
    quantity: number;
    unit: string;
    notes?: string;
}

export interface InStockMaterial extends MaterialRequirement {
    inventoryId: string;
    currentStock: number;
}

export interface PurchasableMaterial extends MaterialRequirement {
    suggestedSupplier: string;
    estimatedUnitCost: number;
    reasoning: string;
}

export interface AssessJobMaterialsResponse {
    inStock: InStockMaterial[];
    requiresPurchase: PurchasableMaterial[];
    generalAdvice: string;
}

interface AssessJobMaterialsRequest {
    jobId: string;
    orgId: string;
    sourcingPreference?: 'lowest_cost' | 'total_visit_cost' | 'local_availability' | 'urgent_local_availability' | 'fastest_shipping' | 'preferred_vendor' | 'optimal';
    sourcingPriorities?: string[];
}

export const assessJobMaterials = functions.https.onCall(
    async (data: AssessJobMaterialsRequest, context): Promise<AssessJobMaterialsResponse> => {
        // Validate authentication
        if (!context.auth) {
            throw new functions.https.HttpsError(
                'unauthenticated',
                'User must be authenticated to use the AI Material Router'
            );
        }

        const { jobId, orgId, sourcingPreference, sourcingPriorities } = data;

        if (!jobId || !orgId) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'jobId and orgId are required'
            );
        }

        try {
            const db = admin.firestore();
            
            // 1. Fetch Job
            const jobDoc = await db.collection('jobs').doc(jobId).get();
            if (!jobDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Job not found');
            }
            const jobData = jobDoc.data();
            const jobDescription = jobData?.request?.description || jobData?.description || 'No description provided';
            const jobTitle = jobData?.title || jobData?.category || 'General Service';
            const isUrgentJob = jobData?.priority === 'urgent' || jobData?.priority === 'emergency' || jobData?.isEmergency === true;

            // Fetch Org Default & Situation Matrix Sourcing Strategy if none provided
            let effectiveStrategy = sourcingPreference;
            if (!effectiveStrategy) {
                const orgDoc = await db.collection('organizations').doc(orgId).get();
                const settings = orgDoc.data()?.settings || {};
                const situationRules = settings.situationRules || {};
                
                if (isUrgentJob) {
                    effectiveStrategy = situationRules.emergency || 'urgent_local_availability';
                } else if (jobData?.jobType === 'restock' || jobData?.isBulkRestock === true) {
                    effectiveStrategy = situationRules.bulk_restock || 'lowest_cost';
                } else if (jobData?.isWarrantyJob || jobData?.priority === 'high_quality') {
                    effectiveStrategy = situationRules.high_quality || 'highest_quality';
                } else {
                    effectiveStrategy = situationRules.standard || settings.defaultSourcingStrategy || 'total_visit_cost';
                }
            }

            // 2. Fetch Inventory
            const inventorySnapshot = await db.collection('materials')
                .where('org_id', '==', orgId)
                .get();
            
            const inventoryItems = inventorySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name,
                currentStock: doc.data().quantity || 0,
                unit: doc.data().unit || 'each'
            }));

            // 3. Formulate Sourcing Prioritization Rule
            let strategyInstruction = '';
            if (effectiveStrategy === 'total_visit_cost') {
                strategyInstruction = `\nSOURCING PRIORITIZATION RULE: Total Visit Cost Optimization.
- Group all required purchasable materials together to source them from a SINGLE primary supplier or local supply house (e.g. Home Depot, Lowe's, Ferguson, Grainger) whenever possible.
- Minimizing technician trip overhead, extra shipping/delivery fees, and total visit downtime is paramount over small individual item cost differences.`;
            } else if (effectiveStrategy === 'local_availability') {
                strategyInstruction = `\nSOURCING PRIORITIZATION RULE: Local Parts Availability.
- Prioritize suppliers with physical brick-and-mortar stores or local supply houses near service sites (e.g. Home Depot, Lowe's, Ferguson, local electrical/plumbing supply house).
- Ensure parts can be picked up locally today by the technician without waiting for shipping.`;
            } else if (effectiveStrategy === 'urgent_local_availability' || (isUrgentJob && effectiveStrategy === 'optimal')) {
                strategyInstruction = `\nSOURCING PRIORITIZATION RULE: URGENT / Emergency Local Availability.
- This is an urgent/emergency callout. Prioritize immediate local store/supply house counter availability above all else so the tech can pick up parts right away.
- Accept slightly higher unit costs if it guarantees instant local availability today.`;
            } else if (effectiveStrategy === 'lowest_cost') {
                strategyInstruction = `\nSOURCING PRIORITIZATION RULE: Lowest Unit Cost.
- Select the vendor or supplier offering the absolute lowest per-unit purchase price for each individual part.`;
            } else {
                strategyInstruction = `\nSOURCING PRIORITIZATION RULE: Balanced / Optimal Sourcing.
- Balance unit price, local store availability, delivery speed, and overall job travel efficiency.`;
            }

            if (sourcingPriorities && sourcingPriorities.length > 0) {
                strategyInstruction += `\nMulti-Priority Preference Hierarchy (in order of importance): ${sourcingPriorities.join(' -> ')}.`;
            }

            // 4. Construct Prompt
            const prompt = `You are an expert master tradesman and logistics planner. 
A technician is assigned a job:
Job Category/Title: ${jobTitle}
Job Description: ${jobDescription}
Job Priority: ${jobData?.priority || 'Normal'}
${strategyInstruction}

Step 1: Determine the most accurate list of materials needed to comfortably complete this job. Be thorough but realistic. **CRITICAL:** ONLY list physical materials and parts that get installed or consumed at the job site. NEVER include tools (e.g., tape measure, wrench, screwdriver, drill, level, multimeter) in these lists, as the technician already owns them and the customer should not be billed for them.
Step 2: Cross-reference your required materials with the organization's current available inventory:
${JSON.stringify(inventoryItems, null, 2)}

Step 3: Categorize the needed materials into two lists:
- "inStock": Items that are fully covered by the current available inventory. Provide the inventoryId matching the item.
- "requiresPurchase": Items that are NOT in stock or where the required quantity exceeds current stock. 

For items that require purchase, determine the best physical location to obtain it based on the SOURCING PRIORITIZATION RULE specified above. Provide a clear reasoning explaining why this supplier fits the active sourcing priority.

Return ONLY a valid JSON object matching this exact structure:
{
  "inStock": [
    {
      "name": "string",
      "quantity": number,
      "unit": "string",
      "inventoryId": "string",
      "currentStock": number,
      "notes": "string"
    }
  ],
  "requiresPurchase": [
    {
      "name": "string",
      "quantity": number,
      "unit": "string",
      "suggestedSupplier": "string",
      "estimatedUnitCost": number,
      "reasoning": "string"
    }
  ],
  "generalAdvice": "string"
}
Ensure there is NO markdown formatting, just the raw JSON object.`;

            // 4. Call Gemini
            const generativeModel = await getFlashModel();
            const result = await generativeModel.generateContent(prompt);
            const response = await result.response;

            if (response.usageMetadata?.totalTokenCount) {
                // Log usage
                await logGeminiUsage(response.usageMetadata.totalTokenCount, 'gemini-3.5-flash', 'assessJobMaterials');
            }

            const text = response.text() || '';
            
            // 5. Parse JSON
            let cleanText = text.trim();
            if (cleanText.startsWith('```json')) {
                cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            } else if (cleanText.startsWith('```')) {
                cleanText = cleanText.replace(/```\n?/g, '');
            }

            const parsed = JSON.parse(cleanText) as AssessJobMaterialsResponse;

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

            const filterOutTools = (list: any[]) => {
                if (!list || !Array.isArray(list)) return [];
                return list.filter((item: any) => {
                    const nameLower = (item.name || '').toLowerCase();
                    const isActuallyATool = toolKeywords.some(kw => nameLower.includes(kw));
                    return !isActuallyATool;
                });
            };

            if (parsed.inStock) {
                parsed.inStock = filterOutTools(parsed.inStock);
            }
            if (parsed.requiresPurchase) {
                parsed.requiresPurchase = filterOutTools(parsed.requiresPurchase);
            }

            return parsed;

        } catch (error: any) {
            console.error('Error assessing job materials:', error);
            throw new functions.https.HttpsError(
                'internal',
                `Failed to assess job materials: ${error.message}`
            );
        }
    }
);
