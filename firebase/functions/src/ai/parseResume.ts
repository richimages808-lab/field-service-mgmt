import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getFlashModel, getLatestFlashModelName } from './aiConfig';
import { logGeminiUsage } from '../billing';

const storage = admin.storage();

export const parseResumeSkills = functions.https.onCall(async (data, context) => {
    // 1. Authenticate Request
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { storagePath, fileBase64, mimeType } = data;

    if (!storagePath && !fileBase64) {
        throw new functions.https.HttpsError('invalid-argument', 'Either storagePath or fileBase64 must be provided');
    }

    try {
        let base64Data = fileBase64;
        let actualMimeType = mimeType || 'application/pdf';

        if (storagePath) {
            const bucket = storage.bucket();
            const file = bucket.file(storagePath);
            
            const [exists] = await file.exists();
            if (!exists) {
                throw new functions.https.HttpsError('not-found', 'Resume file not found in storage');
            }

            const [fileBuffer] = await file.download();
            base64Data = fileBuffer.toString('base64');
            
            if (storagePath.toLowerCase().endsWith('.txt')) {
                actualMimeType = 'text/plain';
            }
        }

        const model = await getFlashModel();
        
        const prompt = `Analyze this resume and extract technical skills relevant to field service management, such as HVAC, plumbing, electrical, appliance repair, customer service, and specific software or diagnostic tools. 
Return the output ONLY as a valid JSON array of strings (the skill names). Keep them concise. Example: ["HVAC", "EPA Universal", "Multimeter Diagnostics", "Pipe Fitting"].`;

        const filePart = {
            inlineData: {
                data: base64Data,
                mimeType: actualMimeType,
            },
        };

        const result = await model.generateContent([prompt, filePart]);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'parseResumeSkills');
        }

        const text = response.text();

        // Parse response
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }

        const parsedSkills = JSON.parse(jsonText);
        
        if (!Array.isArray(parsedSkills)) {
            throw new Error('AI returned a non-array response');
        }

        return {
            success: true,
            skills: parsedSkills,
        };

    } catch (error: any) {
        console.error('Failed to parse resume:', error);
        throw new functions.https.HttpsError('internal', `Failed to parse resume: ${error.message}`);
    }
});
