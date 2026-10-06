import * as functions from 'firebase-functions';
import { getFlashModel, getLatestFlashModelName } from './aiConfig';
import { logGeminiUsage } from '../billing';

export interface ServiceItemOutput {
    id: string;
    name: string;
    description: string;
    category: 'repair' | 'installation' | 'maintenance' | 'diagnostic' | 'emergency' | 'inspection' | 'replacement';
    unit_price: number;
    unit: 'flat_rate' | 'per_hour' | 'per_unit' | 'per_foot' | 'per_sqft' | 'diagnostic_fee';
    estimated_duration_minutes: number;
    tags: string[];
}

/**
 * Cloud Function to generate or refine service catalog items using Gemini AI
 * based on the company's business type, trade sector, and conversational refinement instructions.
 */
export const generateCompanyServicesWithAI = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { businessType, industry, refinementPrompt, currentServices } = data;
    if (!businessType && !industry && !refinementPrompt) {
        throw new functions.https.HttpsError('invalid-argument', 'Either businessType, industry, or refinementPrompt must be provided.');
    }

    try {
        const model = await getFlashModel();

        const currentServicesSummary = Array.isArray(currentServices) && currentServices.length > 0
            ? `\nCURRENT SERVICES LISTED:\n${currentServices.map((s: any, idx: number) => `${idx + 1}. ${s.name} ($${s.unit_price} ${s.unit}) - ${s.description}`).join('\n')}`
            : '';

        const refinementInstruction = refinementPrompt
            ? `\n\nUSER REFINEMENT INSTRUCTIONS (Apply these adjustments precisely):\n"${refinementPrompt}"\nIf the user asks to remove, add, or alter prices/durations/scope, follow their instructions faithfully.`
            : '';

        const prompt = `You are an expert field service operations consultant and estimator.
Your task is to generate or refine a realistic, market-accurate standard services catalog for a field service business.

BUSINESS DETAILS:
- Trade Sector / Industry: "${industry || 'Field Services'}"
- Specific Business Type / Specialty: "${businessType || industry || 'General Contractor'}"
${currentServicesSummary}
${refinementInstruction}

REQUIREMENTS:
1. Provide between 8 and 14 standard billable service offerings tailored specifically for this trade.
2. For each service, provide:
   - "name": Concise, professional consumer-facing service name (e.g., "Main Sewer Line Hydro-Jetting", "21-Point AC Seasonal Tune-Up")
   - "description": 1-2 sentence description explaining what is included (scope, diagnostic, safety checks, or materials).
   - "category": One of "repair", "installation", "maintenance", "diagnostic", "emergency", "inspection", "replacement"
   - "unit_price": Realistic standard market pricing in USD (integer number, e.g. 89, 149, 295, 850)
   - "unit": One of "flat_rate", "per_hour", "per_unit", "per_foot", "diagnostic_fee"
   - "estimated_duration_minutes": Realistic time in minutes (e.g. 45, 60, 90, 120, 180)
   - "tags": Array of 3-5 lowercase search keywords
3. Always include at least one diagnostic/service call fee and one emergency or maintenance service if appropriate.
4. If refining existing services, preserve unchanged services, remove items the user asked to drop, and add or adjust items as requested.

RETURN FORMAT:
You MUST return ONLY a single valid JSON object formatted as follows:
\`\`\`json
{
  "services": [
    {
      "id": "slug_identifier",
      "name": "Service Title",
      "description": "Clear service description.",
      "category": "repair",
      "unit_price": 195,
      "unit": "flat_rate",
      "estimated_duration_minutes": 60,
      "tags": ["tag1", "tag2"]
    }
  ],
  "recommendedIndustry": "Plumbing",
  "recommendedSpecialty": "Residential Plumbing & Drain Cleaning"
}
\`\`\``;

        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(
                response.usageMetadata.totalTokenCount,
                await getLatestFlashModelName(),
                'generateCompanyServicesWithAI'
            );
        }

        const text = response.text();
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        const parsed = JSON.parse(jsonText);
        const services = Array.isArray(parsed?.services) ? parsed.services : [];

        // Normalize ids and types
        const sanitizedServices = services.map((s: any, idx: number) => ({
            id: s.id || `srv_${Date.now()}_${idx}`,
            name: s.name || `Service ${idx + 1}`,
            description: s.description || '',
            category: s.category || 'repair',
            unit_price: typeof s.unit_price === 'number' ? s.unit_price : (parseInt(s.unit_price) || 120),
            unit: s.unit || 'flat_rate',
            estimated_duration_minutes: typeof s.estimated_duration_minutes === 'number' ? s.estimated_duration_minutes : (parseInt(s.estimated_duration_minutes) || 60),
            tags: Array.isArray(s.tags) ? s.tags : []
        }));

        return {
            success: true,
            services: sanitizedServices,
            recommendedIndustry: parsed?.recommendedIndustry || industry,
            recommendedSpecialty: parsed?.recommendedSpecialty || businessType
        };
    } catch (error: any) {
        console.error('[generateCompanyServicesWithAI] Error:', error);
        throw new functions.https.HttpsError('internal', `Failed to generate services: ${error.message}`);
    }
});
