/**
 * AI-powered material and tool identification from images
 * Uses Vertex AI Vision API to identify materials and tools from photos
 */

import { VertexAI } from '@google-cloud/vertexai';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logGeminiUsage } from '../billing';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'field-service-mgmt-dev';
const LOCATION = 'us-central1';

// Initialize Vertex AI
const vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: LOCATION
});

const generativeVisionModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-pro-002' // using pro for better small-item vision accuracy
});

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

                // Call Vertex AI with vision
                const request = {
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    inlineData: {
                                        mimeType: 'image/jpeg',
                                        data: base64Image
                                    }
                                },
                                { text: prompt }
                            ]
                        }
                    ],
                    generationConfig: {
                        maxOutputTokens: 2048,
                        temperature: 0.2,
                    }
                };

                const result = await generativeVisionModel.generateContent(request);
                const response = result.response;

                if (response.usageMetadata?.totalTokenCount) {
                    await logGeminiUsage(response.usageMetadata.totalTokenCount, 'gemini-1.5-pro-002', 'identifyMaterials');
                }

                const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
    return `You are an expert at identifying tools from photos.

Analyze this image and identify all tools visible. For each tool, provide:

1. name: A clear, professional name for the tool (e.g., "DeWalt Cordless Drill", "Adjustable Wrench 12 inch")
2. category: One of: hand_tool, power_tool, diagnostic, safety, specialized, other
3. condition: One of: excellent, good, fair, needs_replacement
4. confidence: Your confidence level from 0-100
5. notes: Brand, model, size, any visible damage or wear

Return ONLY a valid JSON array of objects with these fields. No markdown formatting, no explanation, just the JSON array.

Example format:
[
  {
    "name": "DeWalt 20V Cordless Drill",
    "category": "power_tool",
    "condition": "good",
    "confidence": 90,
    "notes": "Model DCD771, shows normal wear"
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
                    confidence: Math.min(100, Math.max(0, parseInt(item.confidence) || 50)),
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
