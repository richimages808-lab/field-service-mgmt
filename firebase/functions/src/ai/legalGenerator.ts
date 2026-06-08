import * as functions from 'firebase-functions';
import { getFlashModel, getLatestFlashModelName } from './aiConfig';
import { logGeminiUsage } from '../billing';

export const generateLegalTermsWithAI = functions.https.onCall(async (data, context) => {
    // 1. Authenticate Request
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { location } = data;
    if (!location || typeof location !== 'string' || !location.trim()) {
        throw new functions.https.HttpsError('invalid-argument', 'Location is required');
    }

    try {
        const model = await getFlashModel();
        const prompt = `You are a legal expert specializing in field service, contracting, and consumer protection law for various countries and regions.
Your task is to draft a comprehensive, legally protective, and compliant set of standard Terms & Conditions (T&C) for a field service provider operating in the following location: "${location}".

Please generate standard protective terms appropriate for "${location}" across the following categories:
- payment (e.g. payment due on completion, deposits, late payment fees)
- scope (e.g. access to property, out-of-scope work requires approval, quote validity)
- warranty (e.g. professional workmanship warranty duration, manufacturer parts warranty pass-through, exclusions like misuse/neglect)
- liability (e.g. limitation of liability capped at price paid, waiver of consequential damages, pre-existing conditions exclusions)
- general (e.g. cancellation policy, force majeure, photo/video documentation consent, dispute resolution)
- jurisdiction (e.g. governing law, local consumer protection disclosures, cooling-off/right-to-cancel notices, contractor licensing or mechanics lien warnings mandatory in "${location}")

Write the terms in the primary official language of "${location}" (e.g., German for Germany, French for France, English for UK/Canada/USA). If the primary language is not English, you may provide bilingual clauses (local language and English).

You MUST return the output ONLY as a valid JSON object. Do not include markdown formatting except inside a single \`\`\`json block.
The JSON object MUST match the following structure:
{
  "countryCode": "Two-letter ISO country code, e.g. CA, GB, AU, DE, FR",
  "countryName": "English name of the country, e.g. Canada",
  "regionName": "Name of the state, province, or region if applicable, e.g. Ontario, otherwise empty string",
  "clauses": [
    {
      "category": "payment | scope | warranty | liability | general | jurisdiction",
      "text": "Clause text..."
    }
  ]
}
Ensure there are 2 to 4 clauses per category, focusing on maximum legal protection for the contractor and compliance with local consumer protection laws.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'generateLegalTermsWithAI');
        }

        const text = response.text();

        // Parse response
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }

        const parsed = JSON.parse(jsonText);
        if (!parsed.countryCode || !parsed.countryName || !Array.isArray(parsed.clauses)) {
            throw new Error('AI response is missing required fields');
        }

        return {
            success: true,
            countryCode: parsed.countryCode,
            countryName: parsed.countryName,
            regionName: parsed.regionName || '',
            clauses: parsed.clauses
        };
    } catch (error: any) {
        console.error('Failed to generate legal terms:', error);
        throw new functions.https.HttpsError('internal', `Failed to generate legal terms: ${error.message}`);
    }
});
