import * as functions from 'firebase-functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { logGeminiUsage } from '../billing';

const db = admin.firestore();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface AIRecommendation {
    diagnosis: string;
    solution: string;
    partsNeeded: Array<{ name: string; estimatedCost?: number }>;
    estimatedDuration: number;
    confidence: number;
    safetyWarnings?: string[];
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
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(response.usageMetadata.totalTokenCount, 'gemini-1.5-flash', 'analyzeJobWithAI');
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
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const result = await model.generateContent(prompt);
            const response = await result.response;

            if (response.usageMetadata?.totalTokenCount) {
                await logGeminiUsage(response.usageMetadata.totalTokenCount, 'gemini-1.5-flash', 'autoAnalyzeNewJob');
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
    {"name": "Part name", "estimatedCost": 25.99},
    {"name": "Another part", "estimatedCost": 15.50}
  ],
  "estimatedDuration": 90,
  "confidence": 0.85,
  "safetyWarnings": ["Warning 1", "Warning 2"]
}

**Guidelines:**
1. Be specific and practical
2. Only recommend parts that are likely needed
3. Check if parts are in technician's inventory (mark as "inInventory": true if found)
4. Estimate realistic duration in minutes
5. Confidence should be 0-1 based on information quality
6. Include safety warnings if applicable (electrical hazards, gas lines, etc.)
7. If the description is vague, lower confidence and suggest what information is needed

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

        // Check each part against inventory
        const partsNeeded = (parsed.partsNeeded || []).map((part: any) => {
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
            estimatedDuration: parsed.estimatedDuration || 60,
            confidence: parsed.confidence || 0.5,
            safetyWarnings: parsed.safetyWarnings || [],
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
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
            await logGeminiUsage(response.usageMetadata.totalTokenCount, 'gemini-1.5-flash', 'catalogInventoryFromImage');
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
