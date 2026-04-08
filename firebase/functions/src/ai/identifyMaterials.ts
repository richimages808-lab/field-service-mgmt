/**
 * AI-powered material and tool identification from images
 * Uses Vertex AI Vision API to identify materials and tools from photos
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logGeminiUsage } from '../billing';

if (!admin.apps.length) {
    admin.initializeApp();
}

import { getFlashModel } from './aiConfig';

export interface AIIdentifiedMaterial {
    name: string;
    quantity: number;
    unit: string;
    category: 'parts' | 'consumables' | 'materials' | 'equipment' | 'other';
    confidence: number; // 0-100
    suggestedSKU?: string;
    suggestedUnitCost?: number;
    suggestedUnitPrice?: number;
    notes?: string;
}

export interface AIIdentifiedTool {
    name: string;
    category: 'hand_tool' | 'power_tool' | 'diagnostic' | 'safety' | 'specialized' | 'other';
    condition: 'excellent' | 'good' | 'fair' | 'needs_replacement';
    quantity?: number;
    location?: string;
    confidence: number; // 0-100
    notes?: string;
}

interface IdentifyMaterialsRequest {
    imageUrls: string[];
    type: 'materials' | 'tools';
    orgId: string;
}

interface IdentifyMaterialsResponse {
    items: (AIIdentifiedMaterial | AIIdentifiedTool)[];
    processingTime: number;
    imageCount: number;
}

/**
 * Identify materials or tools from images using Vertex AI
 */
export const identifyMaterials = functions.https.onCall(
    async (data: IdentifyMaterialsRequest, context): Promise<IdentifyMaterialsResponse> => {
        const startTime = Date.now();

        // Validate authentication
        if (!context.auth) {
            throw new functions.https.HttpsError(
                'unauthenticated',
                'User must be authenticated to identify materials'
            );
        }

        const { imageUrls, type = 'materials', orgId } = data;

        // Validate input
        if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'imageUrls must be a non-empty array'
            );
        }

        if (imageUrls.length > 10) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Cannot process more than 10 images at once'
            );
        }

        if (!orgId) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'orgId is required'
            );
        }

        // Verify user belongs to the organization
        const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'User document not found'
            );
        }

        const userData = userDoc.data();
        const userOrgId = userData?.org_id;
        const isOwner = context.auth.uid === orgId; // Admins implicitly act as their own org

        if (userOrgId !== orgId && !isOwner) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'User does not belong to the specified organization'
            );
        }

        try {
            const allIdentifiedItems: (AIIdentifiedMaterial | AIIdentifiedTool)[] = [];

            // Process each image
            for (let i = 0; i < imageUrls.length; i++) {
                const imageUrl = imageUrls[i];

                // Download image from Firebase Storage
                const bucket = admin.storage().bucket();
                const filePath = extractStoragePathFromUrl(imageUrl);
                const file = bucket.file(filePath);

                // Get file as base64
                const [fileBuffer] = await file.download();
                const base64Image = fileBuffer.toString('base64');

                // Create prompt based on type
                const prompt = type === 'materials'
                    ? createMaterialsPrompt()
                    : createToolsPrompt();

                // Call Gemini API with vision
                const imagePart = {
                    inlineData: {
                        data: base64Image,
                        mimeType: 'image/jpeg',
                    },
                };

                const generativeVisionModel = await getFlashModel();
                const result = await generativeVisionModel.generateContent([prompt, imagePart]);
                const response = await result.response;

                if (response.usageMetadata?.totalTokenCount) {
                    await logGeminiUsage(response.usageMetadata.totalTokenCount, 'gemini-2.5-flash', 'identifyMaterials');
                }

                const text = response.text() || '';
                
                console.log(`[identifyMaterials] RAW AI OUTPUT for type ${type}:`, text);

                // Parse the JSON response
                const identifiedItems = parseAIResponse(text, type);
                allIdentifiedItems.push(...identifiedItems);
            }

            const processingTime = Date.now() - startTime;

            return {
                items: allIdentifiedItems,
                processingTime,
                imageCount: imageUrls.length
            };

        } catch (error: any) {
            console.error('Error identifying materials:', error);
            throw new functions.https.HttpsError(
                'internal',
                `Failed to identify materials: ${error.message}`
            );
        }
    }
);

/**
 * Extract storage path from Firebase Storage URL
 */
function extractStoragePathFromUrl(url: string): string {
    // Handle both formats:
    // - https://storage.googleapis.com/bucket-name/path
    // - https://firebasestorage.googleapis.com/v0/b/bucket-name/o/path?token=...

    if (url.includes('firebasestorage.googleapis.com')) {
        const match = url.match(/\/o\/(.+?)\?/);
        if (match) {
            return decodeURIComponent(match[1]);
        }
    } else if (url.includes('storage.googleapis.com')) {
        const parts = url.split('/');
        return parts.slice(4).join('/');
    }

    throw new Error('Invalid storage URL format');
}

/**
 * Create prompt for material identification
 */
function createMaterialsPrompt(): string {
    return `You are an expert at identifying construction, plumbing, HVAC, electrical materials, and small hardware from photos.

Analyze this image carefully. Pay special attention to small items like nails, screws, bolts, anchors, or washers. Identify ALL materials, parts, and supplies visible. For each item, provide:

1. name: A clear, professional name for the item (e.g., "1/2 inch Copper Elbow", "PVC Pipe Cement")
2. quantity: Your best estimate of the quantity visible (be conservative)
3. unit: The most appropriate unit (each, box, case, ft, lb, gal)
4. category: One of: parts, consumables, materials, equipment, other
5. confidence: Your confidence level from 0-100
6. suggestedSKU: A potential SKU if recognizable brand/model
7. suggestedUnitCost: Estimated cost per unit in USD (optional)
8. suggestedUnitPrice: Suggested customer price per unit in USD (optional)
9. notes: Any relevant details about condition, brand, size, etc.

Return ONLY a valid JSON array of objects with these fields. No markdown formatting, no explanation, just the JSON array.

Example format:
[
  {
    "name": "1/2 inch Copper Elbow",
    "quantity": 4,
    "unit": "each",
    "category": "parts",
    "confidence": 95,
    "suggestedSKU": "CE-050",
    "suggestedUnitCost": 2.50,
    "suggestedUnitPrice": 5.00,
    "notes": "90-degree fitting, appears new"
  }
]`;
}

/**
 * Create prompt for tool identification
 */
function createToolsPrompt(): string {
    return `You are an expert AI tool identification assistant. You are utilizing a comprehensive "Tool Identification Playbook" to analyze an image carefully and identify all tools visible.

PLAYBOOK INSTRUCTIONS:
Step 1: Visual Scanning & Segmentation
- Scan the entire image for individual distinct items.
- Separate items based on clear visual boundaries.

Step 2: Attribute Identification (For each item identified)
- Brand/Color Matching: Identify brand signatures (e.g. DeWalt yellow, Milwaukee red, Makita teal, Bosch blue, Craftsman red/black).
- Shape Recognition: Identify the primary function based on the shape.
  - Drill/Driver shape -> Power tool category.
  - Wrenches, screwdrivers, hammers, pliers -> Hand tool category.
  - Meters, testers, gauges -> Diagnostic category.
  - Glasses, gloves, hard hats -> Safety category.
- Form/Model parsing: Look closely for any readable text, model numbers, or labels on the tools.

Step 3: Verification & Condition Assessment
- Determine condition based on visible wear, scratches, dirt, or pristine appearance. (excellent, good, fair, needs_replacement)
- Contextual Location: If the background shows a workbench, a toolbag, or a truck bed, note this as the location.

Return ONLY a valid JSON array of objects, one for each distinct tool or set of tools identified, with these exact fields:
1. name: A clear, professional name for the tool (e.g., "DeWalt 20V Max Cordless Drill")
2. category: MUST be exactly one of: hand_tool, power_tool, diagnostic, safety, specialized, other
3. condition: MUST be exactly one of: excellent, good, fair, needs_replacement
4. quantity: integer representing how many of this item are visible
5. location: string of the suggested location based on background, or empty string if unknown
6. confidence: integer 0-100 indicating your confidence in the identification
7. suggestedReplacementCost: float of the estimated replacement cost in USD based on brand/tool type (optional, reasonable AI guess)
8. notes: string detailing brand, model, size, or any condition details

Your response MUST be a pure JSON array of objects with the exact keys listed above. NO MARKDOWN. NO EXPLANATIONS.

Example format:
[
  {
    "name": "DeWalt 20V Cordless Drill",
    "category": "power_tool",
    "condition": "good",
    "quantity": 1,
    "location": "Truck Bed",
    "confidence": 95,
    "suggestedReplacementCost": 129.00,
    "notes": "Model DCD771, shows normal wear, yellow/black"
  }
]`;
}

/**
 * Parse AI response into structured items
 */
function parseAIResponse(
    text: string,
    type: 'materials' | 'tools'
): (AIIdentifiedMaterial | AIIdentifiedTool)[] {
    try {
        // Clean up the response - remove markdown code blocks if present
        let cleanText = text.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/```\n?/g, '');
        }

        const parsed = JSON.parse(cleanText);

        if (!Array.isArray(parsed)) {
            console.error('AI response is not an array:', cleanText);
            return [];
        }

        // Validate and clean each item
        return parsed.map((item: any) => {
            if (type === 'materials') {
                return {
                    name: item.name || 'Unknown Material',
                    quantity: Math.max(1, parseInt(item.quantity) || 1),
                    unit: item.unit || 'each',
                    category: validateCategory(item.category, ['parts', 'consumables', 'materials', 'equipment', 'other']),
                    confidence: Math.min(100, Math.max(0, parseInt(item.confidence) || 50)),
                    suggestedSKU: item.suggestedSKU,
                    suggestedUnitCost: item.suggestedUnitCost ? parseFloat(item.suggestedUnitCost) : undefined,
                    suggestedUnitPrice: item.suggestedUnitPrice ? parseFloat(item.suggestedUnitPrice) : undefined,
                    notes: item.notes
                } as AIIdentifiedMaterial;
            } else {
                return {
                    name: item.name || 'Unknown Tool',
                    category: validateCategory(item.category, ['hand_tool', 'power_tool', 'diagnostic', 'safety', 'specialized', 'other']),
                    condition: validateCategory(item.condition, ['excellent', 'good', 'fair', 'needs_replacement']),
                    quantity: item.quantity ? Math.max(1, parseInt(item.quantity) || 1) : 1,
                    location: item.location,
                    confidence: Math.min(100, Math.max(0, parseInt(item.confidence) || 50)),
                    suggestedReplacementCost: item.suggestedReplacementCost ? parseFloat(item.suggestedReplacementCost) : undefined,
                    notes: item.notes
                } as AIIdentifiedTool;
            }
        });

    } catch (error) {
        console.error('Error parsing AI response:', error);
        console.error('Raw response:', text);
        return [];
    }
}

/**
 * Validate category against allowed values
 */
function validateCategory<T extends string>(value: any, allowedValues: readonly T[]): T {
    if (allowedValues.includes(value)) {
        return value as T;
    }
    return allowedValues[allowedValues.length - 1] as T; // Return 'other' as default
}
