import * as functions from "firebase-functions";
import { genAI, getFlashModel, getLatestFlashModelName } from "./ai/aiConfig";
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

/**
 * Searches the web and enriches comprehensive vendor contact details,
 * corporate headquarters billing address, contractor portal URLs, typical payment terms,
 * trade discount programs, order instructions, and API blueprints.
 */
export const lookupVendorDetails = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in to look up vendor details.");
    }

    const { vendorName, website } = data;

    if (!vendorName || !vendorName.trim()) {
        throw new functions.https.HttpsError("invalid-argument", "Vendor name is required.");
    }

    try {
        const modelName = await getLatestFlashModelName();
        // Initialize model with Google Search grounding enabled
        const model = genAI.getGenerativeModel({
            model: modelName,
            tools: [{ googleSearch: {} }] as any
        });

        const prompt = `You are an expert commercial procurement and B2B vendor database assistant.
Your job is to look up and extract full, accurate business and contact details for a supplier/vendor using Google Search.

Vendor Name: ${vendorName}
Website / Reference: ${website || "Not provided"}

INSTRUCTIONS:
1. Search for this company to identify their official B2B trade name, main website, contractor/pro portal login URL, customer service phone, ordering/dispatch email, support phone/email, and corporate headquarters address (Billing Address).
2. Determine typical contractor payment terms (e.g. "Net 30", "Due Upon Receipt", "Credit Card on File", "Prepaid").
3. Determine typical trade discount programs, promo codes, or loyalty programs (e.g., "ProXtra", "Ferguson Pro Discount", "Grainger Edge").
4. Determine standard delivery instructions or receiving dock notes (e.g., "Standard delivery to commercial loading dock; include PO number on packing slip").
5. Determine the best sourcing specialty category:
   - "local_pickup" (Supply houses / physical stores with local counter pickup)
   - "urgent_callout" (Emergency same-day parts supply)
   - "commodity_lowest" (Bulk wholesale commodity pricing)
   - "specialty_quality" (High quality OEM specialty manufacturer)
   - "general" (Balanced broad supplier)
6. Determine if they offer an automated ordering API or EDI webhook, and provide the blueprint if applicable.
7. CRITICAL: Identify what specific information and fields this vendor REQUIRES when a field technician or dispatcher places an order (e.g. Account Number, Job / PO Reference, Delivery Contact Phone, Gate Code / Dock Delivery Instructions, Branch / Supply House Store #, Tax Exemption ID, Authorized Purchaser Name). Return these in the "requiredOrderFields" array so our system can enforce that technicians and dispatchers fill them out before placing orders.

Return ONLY a single valid JSON object with the exact schema below, with no markdown code fences or backticks:
{
  "name": "Official Company Name",
  "website": "https://officialwebsite.com",
  "portalUrl": "https://pro.officialwebsite.com/login",
  "email": "orders@officialwebsite.com",
  "phone": "(800) 555-0199",
  "supportEmail": "support@officialwebsite.com",
  "supportPhone": "(800) 555-0199",
  "contactPerson": "Trade Account Representative",
  "paymentTerms": "Net 30",
  "discountCodes": "PRO10",
  "tradeDiscountPercent": 10,
  "orderInstructions": "Deliver to receiving dock during regular business hours. Reference PO on packing slip.",
  "sourcingStrength": "general",
  "billingAddress": {
    "street1": "123 Corporate Blvd",
    "street2": "Suite 400",
    "city": "CityName",
    "state": "StateCode",
    "zip": "12345",
    "country": "US",
    "formattedAddress": "123 Corporate Blvd, Suite 400, CityName, StateCode 12345, US"
  },
  "shippingAddress": {
    "street1": "",
    "street2": "",
    "city": "",
    "state": "",
    "zip": "",
    "country": "US",
    "formattedAddress": ""
  },
  "requiredOrderFields": [
    {
      "id": "field_acct_num",
      "key": "accountNumber",
      "label": "Trade Account Number",
      "description": "Mandatory contractor account number to link pricing and credit terms",
      "type": "text",
      "required": true,
      "defaultValue": ""
    },
    {
      "id": "field_job_ref",
      "key": "jobReference",
      "label": "Job / Work Order Reference",
      "description": "Job site or work order identifier for billing & receiving reconciliation",
      "type": "text",
      "required": true,
      "defaultValue": ""
    },
    {
      "id": "field_contact_phone",
      "key": "deliveryContactPhone",
      "label": "Receiving Contact Phone",
      "description": "Direct phone number for courier driver upon delivery arrival",
      "type": "phone",
      "required": true,
      "defaultValue": ""
    },
    {
      "id": "field_dock_notes",
      "key": "dockInstructions",
      "label": "Dock Delivery & Gate Instructions",
      "description": "Gate codes, dock doors, or counter pickup instructions",
      "type": "text",
      "required": false,
      "defaultValue": ""
    }
  ],
  "isApiCapable": false,
  "apiConfig": null
}

If any specific field (like street address, email, or phone) cannot be verified exactly, provide a realistic and standard format for that company rather than leaving it empty. Do not use markdown blocks.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(
                response.usageMetadata.totalTokenCount,
                modelName,
                "lookupVendorDetails"
            );
        }

        let jsonText = response.text().trim();
        if (jsonText.startsWith("```json")) {
            jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
        } else if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/```\n?/g, "");
        }

        const vendorDetails = JSON.parse(jsonText);

        return {
            success: true,
            vendor: vendorDetails
        };
    } catch (error: any) {
        console.error("Lookup Vendor Details failed:", error);
        throw new functions.https.HttpsError("internal", `Vendor lookup failed: ${error.message}`);
    }
});

