import * as functions from "firebase-functions";
import { genAI, getLatestFlashModelName } from "./ai/aiConfig";
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
        const modelName = await getLatestFlashModelName();
        // Initialize Gemini with Google Search grounding enabled
        const model = genAI.getGenerativeModel({
            model: modelName,
            tools: [{ googleSearch: {} }] as any
        });

        const prompt = `You are an expert commercial procurement consultant and B2B vendor database specialist.
Your task is to identify and return the TOP trade supplier discount programs, contractor loyalty programs, and wholesale accounts available for field service contractors.

Search Parameters:
- Country: ${country}
- State / Region: ${state || "National / All States"}
- Trade Category: ${tradeCategory}
- Specific Query / Focus: ${searchQuery || "Top suppliers offering contractor volume discounts, credit accounts, and trade programs"}

INSTRUCTIONS:
1. Search for real suppliers and supply houses operating in this region offering formal contractor accounts, trade programs (like Home Depot ProXtra, Lowe's MVP, Ferguson ProPlus, Johnstone Supply, Rexel, CED, Graybar, Sherwin-Williams Pro, Beacon, ABC Supply, etc.).
2. Extract the program name, typical discount percentage (e.g. 10-25%), key contractor perks (volume pricing, Net 30 terms, jobsite delivery, after-hours pickup), enrollment/sign-up URL, and required fields when placing orders.
3. Return between 4 and 8 top relevant supplier programs.

Return ONLY a single valid JSON object with the schema below, without markdown code fences or backticks:
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

Respond ONLY with valid JSON. Do not use markdown blocks.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(
                response.usageMetadata.totalTokenCount,
                modelName,
                "discoverTradePrograms"
            );
        }

        let jsonText = response.text().trim();
        if (jsonText.startsWith("```json")) {
            jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
        } else if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/```\n?/g, "");
        }

        const parsed = JSON.parse(jsonText);

        return {
            success: true,
            programs: parsed.programs || []
        };
    } catch (error: any) {
        console.error("Discover Trade Programs failed:", error);
        throw new functions.https.HttpsError("internal", `Failed to search trade programs: ${error.message}`);
    }
});
