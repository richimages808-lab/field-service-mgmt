import * as functions from 'firebase-functions';
import { getFlashModel, getLatestFlashModelName } from './aiConfig';
import { logGeminiUsage } from '../billing';

export interface ServiceItemOutput {
    id: string;
    name: string;
    description: string;
    category: 'repair' | 'installation' | 'maintenance' | 'diagnostic' | 'emergency' | 'inspection' | 'replacement';
    group?: string;
    unit_price: number;
    unit: 'flat_rate' | 'per_hour' | 'per_unit' | 'per_foot' | 'per_sqft' | 'diagnostic_fee';
    estimated_duration_minutes: number;
    tags: string[];
    isFlatFee?: boolean;
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
            ? `\nCURRENT SERVICES LISTED:\n${currentServices.map((s: any, idx: number) => `${idx + 1}. [${(s.category || 'General').toUpperCase()}${s.group ? ` / ${s.group}` : ''}] ${s.name} - ${s.description}`).join('\n')}`
            : '';

        const refinementInstruction = refinementPrompt
            ? `\n\nUSER REFINEMENT INSTRUCTIONS (Apply these adjustments precisely):\n"${refinementPrompt}"\nIf the user asks to remove, add, or alter categories/durations/scope/disciplines, follow their instructions faithfully.`
            : '';

        const prompt = `You are a master field service operations consultant and trade estimator.
Your task is to generate or refine a comprehensive, professional **Trade Capabilities & Services Hierarchy** for a licensed field service contractor.
This hierarchy is CRITICAL for positive AI grounding: it teaches the AI exactly what scope of work this company is authorized to perform for job analysis, estimates, quotes, and dispatching—strictly preventing the AI from assuming work outside this trade (e.g. guaranteeing a plumbing company is never assumed to do HVAC or roofing).

BUSINESS PROFILE:
- Trade Sector / Industry: "${industry || 'Field Services'}"
- Specific Business Type / Specialty: "${businessType || industry || 'General Contractor'}"
${currentServicesSummary}
${refinementInstruction}

REQUIREMENTS:
1. Provide between 16 and 24 comprehensive service offerings organized into a clear hierarchy across the core trade disciplines:
   - "diagnostic": Initial evaluations, leak tests, camera scoping, diagnostic dispatch fees
   - "repair": Component repairs, troubleshooting, part rebuilds (organized by sub-system)
   - "installation": New equipment supply, fresh line additions, and system upgrades
   - "replacement": Removal of failed units and retrofitting updated models
   - "maintenance": Preventive, routine, seasonal flushes, tune-ups, and cleanouts
   - "inspection": Code compliance, safety certifications, and real-estate audits
   - "emergency": Rapid after-hours response for catastrophic leaks, power outages, or hazardous failures
2. For each service, provide:
   - "id": A clean snake_case slug identifier
   - "name": Concise, professional trade service title (e.g. "Main Sewer Line Hydro-Jetting Scour", "Dual-Run AC Capacitor Replacement")
   - "description": 1-2 sentence detailed technical scope explaining diagnostic tasks, component disassembly, safety checks, or materials handled.
   - "category": One of "diagnostic", "repair", "installation", "replacement", "maintenance", "inspection", "emergency"
   - "group": The specific equipment area or subsystem within this trade (e.g. for Plumbing: "Drain & Sewer", "Fixtures & Valves", "Water Heaters", "Piping & Water Lines", "Water Treatment"; for HVAC: "Air Conditioning & Cooling", "Heating & Furnaces", "Thermostats & Controls", "Indoor Air Quality"; for Electrical: "Service Panels & Breakers", "Outlets & Switches", "Lighting & Fans", "EV & High Power"; for Landscaping: "Turf & Lawn Care", "Irrigation & Sprinklers", "Beds & Plantings").
   - "unit_price": Realistic standard market flat-rate / menu price in USD (integer)
   - "unit": One of "flat_rate", "diagnostic_fee", "per_hour", "per_unit", "per_foot"
   - "estimated_duration_minutes": Realistic time in minutes (30, 45, 60, 90, 120, 180, etc.)
   - "tags": Array of 3-5 technical search keywords and equipment terms
   - "isFlatFee": Boolean. Mark true ONLY for 2 to 4 standard common menu packages (e.g. diagnostic fee, seasonal tune-up, primary drain snaking); mark false for all other capability scopes so they remain in the unpriced scope hierarchy until promoted.
3. If refining existing services, preserve unchanged services, remove items the user asked to drop, and add or adjust items as requested.

RETURN FORMAT:
You MUST return ONLY a single valid JSON object formatted as follows:
\`\`\`json
{
  "services": [
    {
      "id": "main_sewer_snaking",
      "name": "Main Sewer Line Mechanical Auger Rooter Clearing",
      "description": "Heavy-duty power cable clearing through cleanout up to 75ft to clear roots and organic obstructions.",
      "category": "repair",
      "group": "Drain & Sewer",
      "unit_price": 189,
      "unit": "flat_rate",
      "estimated_duration_minutes": 60,
      "tags": ["drain", "snake", "rooter", "cleanout"],
      "isFlatFee": true
    }
  ],
  "recommendedIndustry": "Plumbing & Pipe Fitting",
  "recommendedSpecialty": "Residential Plumbing & Drain Service"
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
            group: s.group || 'Core Trade Scopes',
            unit_price: typeof s.unit_price === 'number' ? s.unit_price : (parseInt(s.unit_price) || 120),
            unit: s.unit || 'flat_rate',
            estimated_duration_minutes: typeof s.estimated_duration_minutes === 'number' ? s.estimated_duration_minutes : (parseInt(s.estimated_duration_minutes) || 60),
            tags: Array.isArray(s.tags) ? s.tags : [],
            isFlatFee: typeof s.isFlatFee === 'boolean' ? s.isFlatFee : (s.category === 'diagnostic')
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
