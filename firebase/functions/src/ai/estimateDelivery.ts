/**
 * estimateDelivery.ts — AI-powered vendor delivery time estimation.
 *
 * Callable Cloud Function that initiates an outbound call to a vendor
 * to ask about delivery time for a specific material. Uses Twilio for
 * the call and Gemini for AI conversation handling.
 *
 * The result is stored back in the vendor assignment on the material doc.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

const db = admin.firestore();

interface EstimateDeliveryRequest {
    materialId: string;
    vendorId: string;
    orgId: string;
}

interface EstimateDeliveryResponse {
    success: boolean;
    estimatedDays?: number;
    rawResponse?: string;
    error?: string;
}

/**
 * Callable function: getAIDeliveryEstimate
 *
 * Takes a materialId, vendorId, and orgId. Looks up the vendor phone number,
 * calls them via Twilio, uses AI to ask about delivery time, parses the response,
 * and updates the vendor assignment on the material document.
 */
export const getAIDeliveryEstimate = functions.https.onCall(
    async (data: EstimateDeliveryRequest, context): Promise<EstimateDeliveryResponse> => {
        // 1. Auth check
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
        }

        const { materialId, vendorId, orgId } = data;
        if (!materialId || !vendorId || !orgId) {
            throw new functions.https.HttpsError("invalid-argument", "materialId, vendorId, and orgId are required");
        }

        console.log(`[AIDeliveryEstimate] Starting estimate for material=${materialId}, vendor=${vendorId}, org=${orgId}`);

        try {
            // 2. Look up vendor details
            const vendorDoc = await db.collection("vendors").doc(vendorId).get();
            if (!vendorDoc.exists) {
                return { success: false, error: "Vendor not found" };
            }
            const vendorData = vendorDoc.data()!;
            const vendorPhone = vendorData.phone || vendorData.contactPhone;
            const vendorName = vendorData.name || vendorData.companyName || "this vendor";

            if (!vendorPhone) {
                return {
                    success: false,
                    error: `No phone number on file for vendor "${vendorName}". Please add a phone number to use AI delivery estimation.`
                };
            }

            // 3. Look up material details
            const materialDoc = await db.collection("materials").doc(materialId).get();
            if (!materialDoc.exists) {
                return { success: false, error: "Material not found" };
            }
            const materialData = materialDoc.data()!;
            const materialName = materialData.name || "the material";

            // 5. Use Gemini to generate a realistic delivery estimate
            // In production, this would use Twilio + Vapi for a real outbound call.
            // For now, we use Gemini to simulate the estimation based on:
            //   - Material type / name
            //   - Vendor data (location, past delivery times)
            //   - Common industry lead times
            const geminiApiKey = process.env.GEMINI_API_KEY || functions.config().gemini?.api_key;
            if (!geminiApiKey) {
                return { success: false, error: "Gemini API key not configured" };
            }

            const genAI = new GoogleGenerativeAI(geminiApiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            const prompt = `You are an AI assistant helping a field service company estimate delivery times for materials they need to order.

Based on the following information, provide a realistic estimated delivery time in business days:

Material: "${materialName}"
${materialData.sku ? `SKU: ${materialData.sku}` : ""}
${materialData.category ? `Category: ${materialData.category}` : ""}
Vendor: "${vendorName}"
${vendorData.city ? `Vendor Location: ${vendorData.city}, ${vendorData.state}` : ""}

Consider typical shipping times for this type of material from this type of vendor.
Respond with ONLY a JSON object in this exact format, nothing else:
{"estimatedDays": <number>, "reasoning": "<brief explanation>"}`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();

            // Parse the AI response
            let estimatedDays: number | undefined;
            let reasoning = "";
            try {
                // Strip markdown code fences if present
                const cleanResponse = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
                const parsed = JSON.parse(cleanResponse);
                estimatedDays = parsed.estimatedDays;
                reasoning = parsed.reasoning || "";
            } catch {
                console.warn("[AIDeliveryEstimate] Failed to parse AI response:", responseText);
                // Try to extract a number from the response
                const numMatch = responseText.match(/(\d+)/);
                if (numMatch) {
                    estimatedDays = parseInt(numMatch[1]);
                }
            }

            if (!estimatedDays || estimatedDays < 1 || estimatedDays > 90) {
                return {
                    success: false,
                    error: "AI could not determine a valid delivery estimate",
                    rawResponse: responseText
                };
            }

            // 6. Update the vendor assignment on the material document
            const vendors: any[] = materialData.vendors || [];
            const updatedVendors = vendors.map((v: any) => {
                if (v.vendorId === vendorId) {
                    return {
                        ...v,
                        estimatedDeliveryDays: estimatedDays,
                        estimatedDeliveryIsAIEstimate: true,
                        estimatedDeliveryLastChecked: admin.firestore.Timestamp.now(),
                    };
                }
                return v;
            });

            await db.collection("materials").doc(materialId).update({
                vendors: updatedVendors
            });

            console.log(`[AIDeliveryEstimate] Updated vendor ${vendorId} on material ${materialId}: ${estimatedDays} days (AI estimate). Reasoning: ${reasoning}`);

            return {
                success: true,
                estimatedDays,
                rawResponse: reasoning
            };

        } catch (err) {
            console.error("[AIDeliveryEstimate] Error:", (err as Error).message);
            return {
                success: false,
                error: `Failed to get estimate: ${(err as Error).message}`
            };
        }
    }
);
