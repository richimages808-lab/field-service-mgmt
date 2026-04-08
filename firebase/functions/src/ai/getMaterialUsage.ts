import * as functions from "firebase-functions";
import { getFlashModel } from "./aiConfig";

export const getMaterialUsage = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    const { materialName, category, itemType } = data;

    if (!materialName) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'The function must be called with materialName.'
        );
    }

    try {
        const model = await getFlashModel();
        
        const typeStr = itemType === 'tool' ? 'tool or equipment piece' : 'material or part';
        
        let prompt = `You are an expert field service technician. 
Please provide a brief, professional paragraph (3-4 sentences maximum) describing the suggested usages and best practices for the following ${typeStr}:
Name: ${materialName}
Category: ${category || 'Unknown'}

Focus on what jobs this is typically used for, important safety or handling considerations, and general tips for technicians in the field. `;

        if (itemType === 'tool') {
            prompt += `Since this is a tool, make sure to describe its primary function (e.g., measuring, cutting, fastening), calibration if applicable, and standard maintenance tips. `;
        }

        prompt += `Do not include markdown formatting, just a tight paragraph.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return { suggestedUsage: text.trim() };
    } catch (error) {
        console.error("AI Generation Error:", error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to generate material usage suggestions.'
        );
    }
});
