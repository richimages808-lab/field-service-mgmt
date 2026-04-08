import * as functions from "firebase-functions";
import { genAI, getLatestFlashModelName } from "./ai/aiConfig";
import { logGeminiUsage } from "./billing";

export const evaluateVendorPreference = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be logged in to evaluate vendors.'
        );
    }

    const { materialName, preference, vendors } = data;

    if (!materialName || !preference || !vendors || !Array.isArray(vendors) || vendors.length === 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Material name, preference, and vendors array are required.'
        );
    }

    try {
        const modelName = await getLatestFlashModelName();
        // Initialize model with Google Search grounding enabled
        const model = genAI.getGenerativeModel({ 
            model: modelName,
            tools: [{ googleSearch: {} }] as any
        });

        // Construct vendor comparison context
        const vendorListText = vendors.map((v: any, index: number) => 
            `[${index}] Vendor: ${v.vendorName} | Product: ${v.vendorProductTitle || 'Unknown'} | Price: $${v.unitCost || 'Unknown'} | URL: ${v.vendorProductUrl || 'None'}`
        ).join("\n");

        const prompt = `You are an expert procurement and evaluation assistant.
Your task is to review a list of matched vendor products for a material and select the BEST option based on the user's explicit preference.

Material Requested: ${materialName}
Preference Criteria: ${preference}

Available Vendor Options:
${vendorListText}

Evaluation Instructions:
1. If the criteria is "lowest_price", logically select the option with the absolute lowest numeric Price.
2. If the criteria is "best_value", read the Product Title carefully to determine the pack size, weight, or quantity included for the given Price. Calculate the cost per unit (e.g., price per nail, price per ounce) and select the option with the absolute lowest cost per unit, even if the total Price is higher.
3. If the criteria is "longest_lasting", use your Google Search capability to look up reviews, durability tests, and brand reputation for the specific products listed above. Pick the one that is objectively considered the most durable and longest-lasting.
4. If the criteria is "fastest_shipping" or "closest_location", without real-time API access to inventory, rely on general knowledge of those vendors or fallback to "lowest_price".
4. You MUST choose exactly ONE winner from the available options.
5. You MUST provide a clear, concise reason (1-3 sentences) why this option won based on the criteria.
6. CRITICAL TO AVOID RECITATION BLOCKS: You must completely paraphrase all reviews, test results, and information found online. Do not quote exact phrases from web results in your reason. Write the explanation entirely in your own synthesized terms.

Format your response strictly as a single JSON object with the following schema:
{
  "winningVendorIndex": 0,
  "reason": "Clear explanation of why this product won."
}

Do not include markdown blocks like \`\`\`json. Return only the raw JSON string.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(
                response.usageMetadata.totalTokenCount,
                modelName,
                "evaluateVendorPreference"
            );
        }

        let jsonText = response.text().trim();
        if (jsonText.startsWith("```json")) {
            jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
        } else if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/```\n?/g, "");
        }

        let evaluationResult;
        try {
            evaluationResult = JSON.parse(jsonText);
        } catch (e) {
            console.error("Failed to parse AI evaluation result:", jsonText);
            throw new functions.https.HttpsError("internal", "AI returned invalid JSON.");
        }
        
        const winningIndex = evaluationResult.winningVendorIndex;
        if (typeof winningIndex !== 'number' || winningIndex < 0 || winningIndex >= vendors.length) {
            throw new functions.https.HttpsError("internal", "AI returned an invalid vendor index.");
        }

        const winningVendorId = vendors[winningIndex].vendorId;

        return {
            success: true,
            winningVendorId,
            reason: evaluationResult.reason
        };

    } catch (error: any) {
        console.error("Vendor Evaluation failed:", error);
        throw new functions.https.HttpsError("internal", `Evaluation failed: ${error.message}`);
    }
});
