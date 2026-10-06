import * as functions from "firebase-functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { genAI, getGeminiApiKey, getLatestFlashModelName } from "./ai/aiConfig";
import { logGeminiUsage } from "./billing";

/**
 * Searches and discovers contractor trade discount programs, wholesale supplier accounts,
 * and loyalty perks by Country, State/Province, Trade/Specialty, and custom search query.
 */
export const discoverTradePrograms = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in to discover trade programs.");
    }

    const { country = "US", state = "", tradeCategory = "all", searchQuery = "" } = data;

    try {
        const apiKey = getGeminiApiKey();
        const client = apiKey ? new GoogleGenerativeAI(apiKey) : genAI;
        const modelName = await getLatestFlashModelName();

        const prompt = `You are an expert commercial procurement consultant and B2B vendor database specialist.
Your task is to identify and return the TOP trade supplier discount programs, contractor loyalty programs, and wholesale accounts available for field service contractors.

Search Parameters:
- Country: ${country}
- State / Region: ${state || "National / All States"}
- Trade Category: ${tradeCategory}
- Specific Query / Focus: ${searchQuery || "Top suppliers offering contractor volume discounts, credit accounts, and trade programs"}

INSTRUCTIONS:
1. Search for real suppliers and supply houses operating in this region offering formal contractor accounts, trade programs (like Home Depot ProXtra, Lowe's MVP, Ferguson ProPlus, Johnstone Supply, Rexel, CED, Graybar, Sherwin-Williams Pro, Beacon, ABC Supply, Anixter, ADI Global, etc.).
2. Extract the program name, typical discount percentage (e.g. 10-25%), key contractor perks (volume pricing, Net 30 terms, jobsite delivery, after-hours pickup), enrollment/sign-up URL, and required fields when placing orders.
3. Return between 4 and 8 top relevant supplier programs.

Return ONLY a single valid JSON object with the schema below:
{
  "programs": [
    {
      "id": "unique_slug",
      "supplierName": "Official Supplier Name",
      "programName": "Official Trade Program Name",
      "tagline": "Short compelling summary of discount & perks",
      "tradeCategory": "${tradeCategory !== 'all' ? tradeCategory : 'general_hardware'}",
      "categoryLabel": "Trade Category Label",
      "country": "${country}",
      "countryLabel": "${country === 'US' ? 'United States' : country === 'CA' ? 'Canada' : country === 'GB' ? 'United Kingdom' : country === 'AU' ? 'Australia' : 'International'}",
      "stateScope": "${state || 'national'}",
      "stateScopeLabel": "${state ? state : 'National'}",
      "typicalDiscountPercent": 15,
      "discountDescription": "Detailed discount breakdown (e.g. 15% off bulk orders, 20% off paint)",
      "perks": [
        "Perk 1 (e.g. Volume pricing on large orders)",
        "Perk 2 (e.g. Dedicated contractor desk & parking)",
        "Perk 3 (e.g. Job site flatbed delivery)"
      ],
      "enrollmentUrl": "https://supplier.com/contractor-signup",
      "portalLoginUrl": "https://supplier.com/login",
      "defaultPaymentTerms": "Net 30",
      "discountCodeTemplate": "PRODISCOUNT",
      "sourcingStrength": "general",
      "integrationType": "email_pdf",
      "requiredOrderFields": [
        {
          "id": "acct_field",
          "key": "accountNumber",
          "label": "Trade Account Number",
          "description": "Contractor account ID to link wholesale pricing",
          "type": "text",
          "required": true,
          "defaultValue": ""
        }
      ],
      "notesForContractor": "Helpful tip for signing up or saving with this supplier"
    }
  ]
}

Respond strictly with valid JSON. Do not wrap in markdown or introductory text.`;

        let result;
        try {
            // Attempt with Google Search grounding tool
            const searchModel = client.getGenerativeModel({
                model: modelName,
                tools: [{ googleSearch: {} }] as any
            });
            result = await searchModel.generateContent(prompt);
        } catch (toolError) {
            console.warn("[TradePrograms] Google Search grounding failed, using standard Gemini model:", toolError);
            const standardModel = client.getGenerativeModel({ model: modelName });
            result = await standardModel.generateContent(prompt);
        }

        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            try {
                await logGeminiUsage(
                    response.usageMetadata.totalTokenCount,
                    modelName,
                    "discoverTradePrograms"
                );
            } catch (usageError) {
                console.warn("[TradePrograms] Could not log usage:", usageError);
            }
        }

        let jsonText = response.text().trim();
        const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1].trim();
        } else {
            const firstBrace = jsonText.indexOf('{');
            const lastBrace = jsonText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonText = jsonText.substring(firstBrace, lastBrace + 1);
            }
        }

        let parsed: any = {};
        try {
            parsed = JSON.parse(jsonText);
        } catch (jsonErr) {
            console.error("[TradePrograms] Failed to parse JSON response:", jsonText);
        }

        const rawList = Array.isArray(parsed?.programs)
            ? parsed.programs
            : (Array.isArray(parsed) ? parsed : []);

        const programs = rawList.map((p: any, idx: number) => {
            let stateScopeVal: 'national' | string[] = 'national';
            if (Array.isArray(p.stateScope)) {
                stateScopeVal = p.stateScope;
            } else if (typeof p.stateScope === 'string' && p.stateScope.toLowerCase() !== 'national') {
                stateScopeVal = [p.stateScope.toUpperCase()];
            } else if (state) {
                stateScopeVal = [state.toUpperCase()];
            }

            return {
                id: p.id || `ai_prog_${Date.now()}_${idx}`,
                supplierName: p.supplierName || 'Unknown Supplier',
                programName: p.programName || `${p.supplierName || 'Supplier'} Trade Program`,
                tagline: p.tagline || 'Contractor Trade Perks & Commercial Wholesale Pricing',
                tradeCategory: p.tradeCategory || (tradeCategory !== 'all' ? tradeCategory : 'general_hardware'),
                categoryLabel: p.categoryLabel || 'Trade Supplies & Materials',
                country: p.country || country,
                countryLabel: p.countryLabel || (country === 'US' ? 'United States' : country),
                stateScope: stateScopeVal,
                stateScopeLabel: p.stateScopeLabel || (state ? state : 'National'),
                typicalDiscountPercent: typeof p.typicalDiscountPercent === 'number'
                    ? p.typicalDiscountPercent
                    : (parseInt(p.typicalDiscountPercent) || 15),
                discountDescription: p.discountDescription || 'Wholesale contractor pricing and volume discounts.',
                perks: Array.isArray(p.perks) && p.perks.length > 0
                    ? p.perks
                    : ['Commercial credit & Net terms', 'Volume pricing', 'Dedicated contractor support'],
                enrollmentUrl: p.enrollmentUrl || `https://www.google.com/search?q=${encodeURIComponent((p.supplierName || 'supplier') + ' contractor trade program')}`,
                portalLoginUrl: p.portalLoginUrl || p.enrollmentUrl || '',
                defaultPaymentTerms: p.defaultPaymentTerms || 'Net 30',
                discountCodeTemplate: p.discountCodeTemplate || 'PROTRADE',
                sourcingStrength: p.sourcingStrength || 'general',
                integrationType: p.integrationType || 'email_pdf',
                requiredOrderFields: Array.isArray(p.requiredOrderFields) && p.requiredOrderFields.length > 0
                    ? p.requiredOrderFields
                    : [
                        {
                            id: 'acct_num',
                            key: 'accountNumber',
                            label: 'Trade Account Number',
                            description: 'Account ID or contractor phone registered with this supplier',
                            type: 'text',
                            required: true,
                            defaultValue: ''
                        }
                    ],
                notesForContractor: p.notesForContractor || 'Sign up via their pro contractor desk or website to unlock discounted pricing.'
            };
        });

        return {
            success: true,
            programs
        };
    } catch (error: any) {
        console.error("Discover Trade Programs failed:", error);
        throw new functions.https.HttpsError("internal", `Failed to search trade programs: ${error.message}`);
    }
});
