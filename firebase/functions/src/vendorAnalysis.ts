import * as functions from "firebase-functions";
import { getFlashModel, getLatestFlashModelName } from "./ai/aiConfig";
import { logGeminiUsage } from "./billing";

export const analyzeVendorCapabilities = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    }

    const { vendorName, website } = data;

    if (!vendorName) {
        throw new functions.https.HttpsError("invalid-argument", "Vendor name is required");
    }

    try {
        const model = await getFlashModel();
        const prompt = `You are an expert procurement and API integration engineer.
Analyze the following vendor to determine if they typically offer a public B2B e-commerce or ordering API.
Vendor Name: ${vendorName}
Website: ${website || "Not provided"}

If they DO NOT have a known public API or standard EDI that can be accessed via simple HTTP POST logic, respond with exactly:
{"isApiCapable": false}

If they DO have a known API (like Grainger, Home Depot Pro, HD Supply, Ferguson, etc.), generate a JSON payload blueprint that could be used to place an order.
Use standard placeholders like {{customerApiId}}, {{orderId}}, etc., in the body.

Respond ONLY with valid JSON in this exact format, no markdown formatting or backticks:
{
  "isApiCapable": true,
  "apiConfig": {
    "endpointUrl": "https://api.vendor.com/v1/orders",
    "method": "POST",
    "headersTemplate": {
      "Authorization": "Bearer {{vaultedPaymentId}}",
      "Content-Type": "application/json"
    },
    "bodyTemplate": "{\\"accountId\\":\\"{{customerApiId}}\\",\\"shippingAddress\\":\\"{{shippingAddress}}\\",\\"billingAddress\\":\\"{{billingAddress}}\\",\\"items\\":{{itemsJson}}}"
  }
}

Do not use markdown blocks. Simply return the raw JSON object.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(
                response.usageMetadata.totalTokenCount,
                await getLatestFlashModelName(),
                "analyzeVendorCapabilities"
            );
        }

        let jsonText = response.text().trim();
        // Remove markdown formatting if the model still outputs it
        if (jsonText.startsWith("```json")) {
            jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
        } else if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/```\n?/g, "");
        }

        const parsed = JSON.parse(jsonText);
        
        return {
            success: true,
            capabilities: parsed
        };
    } catch (error: any) {
        console.error("Vendor AI Analysis failed:", error);
        throw new functions.https.HttpsError("internal", `AI Analysis failed: ${error.message}`);
    }
});
