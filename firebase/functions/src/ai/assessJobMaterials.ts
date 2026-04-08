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

        const { jobId, orgId } = data;

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

            // 3. Construct Prompt
            const prompt = `You are an expert master tradesman and logistics planner. 
A technician is assigned a job:
Job Category/Title: ${jobTitle}
Job Description: ${jobDescription}

Step 1: Determine the most accurate list of materials needed to comfortably complete this job. Be thorough but realistic.
Step 2: Cross-reference your required materials with the organization's current available inventory:
${JSON.stringify(inventoryItems, null, 2)}

Step 3: Categorize the needed materials into two lists:
- "inStock": Items that are fully covered by the current available inventory. Provide the inventoryId matching the item.
- "requiresPurchase": Items that are NOT in stock or where the required quantity exceeds current stock. 

For items that require purchase, determine the best physical location to obtain it based on lowest cost and standard routing efficiency (e.g., "Home Depot", "Lowe's", "Ferguson Plumbing Supply", "Grainger", "Local Electrical Supply House"). Provide a brief reasoning for this supplier choice.

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
                await logGeminiUsage(response.usageMetadata.totalTokenCount, 'gemini-2.5-flash', 'assessJobMaterials');
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
