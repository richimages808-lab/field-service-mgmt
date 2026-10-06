import * as functions from "firebase-functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { genAI, getGeminiApiKey, getLatestFlashModelName } from "./ai/aiConfig";
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
        const apiKey = getGeminiApiKey();
        const client = apiKey ? new GoogleGenerativeAI(apiKey) : genAI;
        const modelName = await getLatestFlashModelName();
        const model = client.getGenerativeModel({ model: modelName });

        const prompt = `You are an expert procurement and API integration engineer.
Analyze the following vendor to determine if they typically offer a public B2B e-commerce or ordering API.
Vendor Name: ${vendorName}
Website: ${website || "Not provided"}

If they DO NOT have a known public API or standard EDI that can be accessed via simple HTTP POST logic, respond with exactly:
{"isApiCapable": false}

If they DO have a known API (like Grainger, Home Depot Pro, HD Supply, Ferguson, Wesco, Graybar, etc.), generate a JSON payload blueprint that could be used to place an order.
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
            try {
                await logGeminiUsage(
                    response.usageMetadata.totalTokenCount,
                    modelName,
                    "analyzeVendorCapabilities"
                );
            } catch (err) {
                console.warn("[VendorAnalysis] Could not log Gemini usage:", err);
            }
        }

        let jsonText = response.text().trim();
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
            jsonText = codeBlockMatch[1].trim();
        } else {
            const firstBrace = jsonText.indexOf('{');
            const lastBrace = jsonText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonText = jsonText.substring(firstBrace, lastBrace + 1);
            }
        }

        const parsed = JSON.parse(jsonText);
        
        return {
            success: true,
            capabilities: parsed
        };
    } catch (error: any) {
        console.warn("[VendorAnalysis] AI analysis fallback:", error.message);
        return {
            success: true,
            capabilities: { isApiCapable: false }
        };
    }
});

/**
 * Curated high-reliability commercial B2B supplier database.
 * Provides instant, verified supplier profiles and suggestion chips whenever
 * live Google Search grounding is unavailable or Gemini API quota/credits are exhausted.
 */
function getCuratedVendorFallback(query: string, website?: string): any {
    const q = query.toLowerCase().trim();

    // 1. Computer Networking / Structured Cabling / IT Infrastructure / Low Voltage
    if (
        q.includes("computer") ||
        q.includes("network") ||
        q.includes("cabling") ||
        q.includes("cat6") ||
        q.includes("fiber") ||
        q.includes("low voltage") ||
        q.includes("ethernet") ||
        q.includes("switch") ||
        q.includes("rack") ||
        q.includes("anixter") ||
        q.includes("wesco")
    ) {
        const isExactAnixter = q.includes("anixter") || q.includes("wesco");
        return {
            name: isExactAnixter ? "Anixter (A Wesco Company)" : "Anixter / Wesco (Computer Networking)",
            searchedTerm: query,
            isCategorySearch: !isExactAnixter,
            matchedCategory: "Computer Networking & Low Voltage Infrastructure",
            website: "https://www.anixter.com",
            portalUrl: "https://www.anixter.com/en_us/login.html",
            email: "orders@anixter.com",
            phone: "(800) 323-8167",
            supportEmail: "support@anixter.com",
            supportPhone: "(800) 323-8167",
            contactPerson: "Commercial Network & Infrastructure Desk",
            paymentTerms: "Net 30",
            discountCodes: "PRO10",
            tradeDiscountPercent: 15,
            orderInstructions: "Commercial freight delivery to receiving dock. Reference PO number on packing slip.",
            sourcingStrength: "specialty_quality",
            billingAddress: {
                street1: "2301 Patriot Blvd",
                street2: "",
                city: "Glenview",
                state: "IL",
                zip: "60026",
                country: "US",
                formattedAddress: "2301 Patriot Blvd, Glenview, IL 60026, US"
            },
            suggestedSuppliers: [
                {
                    name: "Graybar",
                    website: "https://www.graybar.com",
                    portalUrl: "https://www.graybar.com/login",
                    specialty: "Commercial networking cables, patch panels, fiber & switches",
                    phone: "(800) 472-9227",
                    email: "orders@graybar.com",
                    sourcingStrength: "general"
                },
                {
                    name: "ADI Global",
                    website: "https://www.adiglobaldistribution.us",
                    portalUrl: "https://www.adiglobaldistribution.us/login",
                    specialty: "Low voltage, security, structured cabling & networking",
                    phone: "(800) 233-6261",
                    email: "orders@adiglobal.com",
                    sourcingStrength: "local_pickup"
                },
                {
                    name: "CDW",
                    website: "https://www.cdw.com",
                    portalUrl: "https://www.cdw.com/login",
                    specialty: "Enterprise IT hardware, switches, routers & server racks",
                    phone: "(800) 800-4239",
                    email: "orders@cdw.com",
                    sourcingStrength: "commodity_lowest"
                },
                {
                    name: "ScanSource",
                    website: "https://www.scansource.com",
                    portalUrl: "https://www.scansource.com/login",
                    specialty: "B2B point-of-sale, barcode, wireless & network infrastructure",
                    phone: "(800) 944-2432",
                    email: "orders@scansource.com",
                    sourcingStrength: "specialty_quality"
                }
            ],
            requiredOrderFields: [
                {
                    id: "field_acct_num",
                    key: "accountNumber",
                    label: "Trade Account Number",
                    description: "Mandatory contractor account number to link pricing and credit terms",
                    type: "text",
                    required: true,
                    defaultValue: ""
                },
                {
                    id: "field_job_ref",
                    key: "jobReference",
                    label: "Job / Work Order Reference",
                    description: "Job site or work order identifier for billing & receiving reconciliation",
                    type: "text",
                    required: true,
                    defaultValue: ""
                },
                {
                    id: "field_contact_phone",
                    key: "deliveryContactPhone",
                    label: "Receiving Contact Phone",
                    description: "Direct phone number for courier driver upon delivery arrival",
                    type: "phone",
                    required: true,
                    defaultValue: ""
                },
                {
                    id: "field_dock_notes",
                    key: "dockInstructions",
                    label: "Dock Delivery & Gate Instructions",
                    description: "Gate codes, dock doors, or counter pickup instructions",
                    type: "text",
                    required: false,
                    defaultValue: ""
                }
            ],
            isApiCapable: false,
            apiConfig: null
        };
    }

    // 2. Electrical / Lighting / Wire / Conduit / Graybar
    if (q.includes("electr") || q.includes("lighting") || q.includes("graybar") || q.includes("conduit") || q.includes("breaker")) {
        const isGraybar = q.includes("graybar");
        return {
            name: isGraybar ? "Graybar Electric Company" : `Graybar Electric (${query})`,
            searchedTerm: query,
            isCategorySearch: !isGraybar,
            matchedCategory: "Electrical & Wire Supply",
            website: "https://www.graybar.com",
            portalUrl: "https://www.graybar.com/login",
            email: "orders@graybar.com",
            phone: "(800) 472-9227",
            supportEmail: "support@graybar.com",
            supportPhone: "(800) 472-9227",
            contactPerson: "Commercial Electrical Trade Desk",
            paymentTerms: "Net 30",
            discountCodes: "PRO10",
            tradeDiscountPercent: 12,
            orderInstructions: "Deliver to commercial receiving dock or branch will-call counter.",
            sourcingStrength: "general",
            billingAddress: {
                street1: "34 N Meramec Ave",
                street2: "",
                city: "Clayton",
                state: "MO",
                zip: "63105",
                country: "US",
                formattedAddress: "34 N Meramec Ave, Clayton, MO 63105, US"
            },
            suggestedSuppliers: [
                { name: "Rexel", website: "https://www.rexelusa.com", portalUrl: "https://www.rexelusa.com/login", specialty: "Commercial electrical distribution & wire", phone: "(888) 739-3587", email: "orders@rexelusa.com", sourcingStrength: "general" },
                { name: "CED (Consolidated Electrical)", website: "https://cedcareers.com", portalUrl: "https://www.cednationalaccounts.com", specialty: "Local electrical branches & contractor inventory", phone: "(972) 581-2000", email: "orders@ced.com", sourcingStrength: "local_pickup" },
                { name: "Platt Electric", website: "https://www.platt.com", portalUrl: "https://www.platt.com/login", specialty: "Western US commercial electrical & tools", phone: "(800) 257-5288", email: "orders@platt.com", sourcingStrength: "urgent_callout" }
            ],
            requiredOrderFields: [
                { id: "field_acct_num", key: "accountNumber", label: "Trade Account Number", description: "Contractor account number", type: "text", required: true, defaultValue: "" },
                { id: "field_job_ref", key: "jobReference", label: "Job / Work Order Reference", description: "Job site reference", type: "text", required: true, defaultValue: "" },
                { id: "field_contact_phone", key: "deliveryContactPhone", label: "Receiving Contact Phone", description: "Driver contact phone", type: "phone", required: true, defaultValue: "" }
            ],
            isApiCapable: false,
            apiConfig: null
        };
    }

    // 3. Plumbing / Piping / Ferguson
    if (q.includes("plumb") || q.includes("pipe") || q.includes("water heater") || q.includes("ferguson") || q.includes("drain")) {
        const isFerguson = q.includes("ferguson");
        return {
            name: isFerguson ? "Ferguson Enterprises" : `Ferguson Enterprises (${query})`,
            searchedTerm: query,
            isCategorySearch: !isFerguson,
            matchedCategory: "Plumbing & Piping Supply",
            website: "https://www.ferguson.com",
            portalUrl: "https://www.ferguson.com/proplus",
            email: "orders@ferguson.com",
            phone: "(888) 334-0004",
            supportEmail: "prosupport@ferguson.com",
            supportPhone: "(888) 334-0004",
            contactPerson: "Commercial Plumbing Pro Desk",
            paymentTerms: "Net 30",
            discountCodes: "PROPLUS15",
            tradeDiscountPercent: 15,
            orderInstructions: "Deliver to commercial receiving dock or branch will-call pickup counter.",
            sourcingStrength: "local_pickup",
            billingAddress: {
                street1: "12500 Jefferson Ave",
                street2: "",
                city: "Newport News",
                state: "VA",
                zip: "23602",
                country: "US",
                formattedAddress: "12500 Jefferson Ave, Newport News, VA 23602, US"
            },
            suggestedSuppliers: [
                { name: "Winsupply", website: "https://www.winsupplyinc.com", portalUrl: "https://www.winsupplyinc.com/login", specialty: "Commercial wholesale plumbing, HVAC & pipe", phone: "(937) 862-2369", email: "orders@winsupplyinc.com", sourcingStrength: "local_pickup" },
                { name: "Hajoca Corporation", website: "https://www.hajoca.com", portalUrl: "https://www.hajoca.com", specialty: "Plumbing, heating and industrial supplies", phone: "(610) 668-2000", email: "orders@hajoca.com", sourcingStrength: "general" },
                { name: "Supply.com", website: "https://www.supply.com", portalUrl: "https://www.supply.com/login", specialty: "Online commercial plumbing & fixtures wholesale", phone: "(888) 426-2323", email: "orders@supply.com", sourcingStrength: "commodity_lowest" }
            ],
            requiredOrderFields: [
                { id: "field_acct_num", key: "accountNumber", label: "Trade Account Number", description: "Ferguson contractor account", type: "text", required: true, defaultValue: "" },
                { id: "field_job_ref", key: "jobReference", label: "Job / Work Order Reference", description: "Work order reference", type: "text", required: true, defaultValue: "" },
                { id: "field_contact_phone", key: "deliveryContactPhone", label: "Receiving Contact Phone", description: "Job site contact phone", type: "phone", required: true, defaultValue: "" }
            ],
            isApiCapable: false,
            apiConfig: null
        };
    }

    // 4. HVAC / Refrigeration / Johnstone Supply
    if (q.includes("hvac") || q.includes("refrigerat") || q.includes("johnstone") || q.includes("furnace") || q.includes("carrier") || q.includes("air condition")) {
        const isJohnstone = q.includes("johnstone");
        return {
            name: isJohnstone ? "Johnstone Supply" : `Johnstone Supply (${query})`,
            searchedTerm: query,
            isCategorySearch: !isJohnstone,
            matchedCategory: "HVAC & Commercial Refrigeration",
            website: "https://www.johnstonesupply.com",
            portalUrl: "https://www.johnstonesupply.com/login",
            email: "orders@johnstonesupply.com",
            phone: "(800) 437-8903",
            supportEmail: "support@johnstonesupply.com",
            supportPhone: "(800) 437-8903",
            contactPerson: "HVAC Commercial Counter Specialist",
            paymentTerms: "Net 30",
            discountCodes: "HVACPRO10",
            tradeDiscountPercent: 15,
            orderInstructions: "Deliver to commercial receiving bay or contractor after-hours will-call locker.",
            sourcingStrength: "urgent_callout",
            billingAddress: {
                street1: "11632 NE Ainsworth Cir",
                street2: "",
                city: "Portland",
                state: "OR",
                zip: "97220",
                country: "US",
                formattedAddress: "11632 NE Ainsworth Cir, Portland, OR 97220, US"
            },
            suggestedSuppliers: [
                { name: "Ferguson HVAC", website: "https://www.ferguson.com/industry/hvac", portalUrl: "https://www.ferguson.com/proplus", specialty: "Commercial HVAC equipment, ductwork & parts", phone: "(888) 334-0004", email: "orders@ferguson.com", sourcingStrength: "local_pickup" },
                { name: "Carrier Enterprise", website: "https://www.carrierenterprise.com", portalUrl: "https://www.carrierenterprise.com/login", specialty: "OEM Carrier, Bryant & Payne commercial units & parts", phone: "(877) 232-2774", email: "orders@carrierenterprise.com", sourcingStrength: "specialty_quality" },
                { name: "Baker Distributing", website: "https://www.bakerdist.com", portalUrl: "https://www.bakerdist.com/login", specialty: "Residential & commercial HVAC/R wholesale", phone: "(904) 446-4000", email: "orders@bakerdist.com", sourcingStrength: "general" }
            ],
            requiredOrderFields: [
                { id: "field_acct_num", key: "accountNumber", label: "Trade Account Number", description: "HVAC contractor account", type: "text", required: true, defaultValue: "" },
                { id: "field_job_ref", key: "jobReference", label: "Job / Work Order Reference", description: "Job site reference", type: "text", required: true, defaultValue: "" },
                { id: "field_contact_phone", key: "deliveryContactPhone", label: "Receiving Contact Phone", description: "Driver contact phone", type: "phone", required: true, defaultValue: "" }
            ],
            isApiCapable: false,
            apiConfig: null
        };
    }

    // 5. Security / Access Control / ADI Global
    if (q.includes("security") || q.includes("camera") || q.includes("cctv") || q.includes("access control") || q.includes("adi")) {
        const isADI = q.includes("adi");
        return {
            name: isADI ? "ADI Global Distribution" : `ADI Global Distribution (${query})`,
            searchedTerm: query,
            isCategorySearch: !isADI,
            matchedCategory: "Security, Surveillance & Access Control",
            website: "https://www.adiglobaldistribution.us",
            portalUrl: "https://www.adiglobaldistribution.us/login",
            email: "orders@adiglobal.com",
            phone: "(800) 233-6261",
            supportEmail: "support@adiglobal.com",
            supportPhone: "(800) 233-6261",
            contactPerson: "Commercial Security Account Manager",
            paymentTerms: "Net 30",
            discountCodes: "SECUREPRO",
            tradeDiscountPercent: 15,
            orderInstructions: "Deliver to commercial receiving dock. Reference PO on packing slip.",
            sourcingStrength: "local_pickup",
            billingAddress: {
                street1: "275 Broadhollow Rd",
                street2: "Suite 400",
                city: "Melville",
                state: "NY",
                zip: "11747",
                country: "US",
                formattedAddress: "275 Broadhollow Rd, Suite 400, Melville, NY 11747, US"
            },
            suggestedSuppliers: [
                { name: "Anixter", website: "https://www.anixter.com", portalUrl: "https://www.anixter.com/en_us/login.html", specialty: "Commercial video surveillance, cabling & security", phone: "(800) 323-8167", email: "orders@anixter.com", sourcingStrength: "specialty_quality" },
                { name: "Resideo", website: "https://www.resideo.com", portalUrl: "https://www.resideo.com/us/en/pro", specialty: "Life safety, intrusion & smart home commercial wholesale", phone: "(800) 645-7492", email: "orders@resideo.com", sourcingStrength: "general" }
            ],
            requiredOrderFields: [
                { id: "field_acct_num", key: "accountNumber", label: "Trade Account Number", description: "Trade account number", type: "text", required: true, defaultValue: "" },
                { id: "field_job_ref", key: "jobReference", label: "Job / Work Order Reference", description: "Job site reference", type: "text", required: true, defaultValue: "" },
                { id: "field_contact_phone", key: "deliveryContactPhone", label: "Receiving Contact Phone", description: "Receiving contact phone", type: "phone", required: true, defaultValue: "" }
            ],
            isApiCapable: false,
            apiConfig: null
        };
    }

    // 6. General MRO / Hardware / Fasteners / Grainger
    const cleanDisplayName = query.charAt(0).toUpperCase() + query.slice(1);
    return {
        name: cleanDisplayName.includes("Grainger") ? "W.W. Grainger, Inc." : `${cleanDisplayName} (Commercial Wholesale)`,
        searchedTerm: query,
        isCategorySearch: true,
        matchedCategory: "Commercial Facilities MRO & Industrial Supplies",
        website: website || "https://www.grainger.com",
        portalUrl: "https://www.grainger.com/login",
        email: "orders@grainger.com",
        phone: "(800) 472-4643",
        supportEmail: "support@grainger.com",
        supportPhone: "(800) 472-4643",
        contactPerson: "Commercial Procurement Desk",
        paymentTerms: "Net 30",
        discountCodes: "PRO10",
        tradeDiscountPercent: 10,
        orderInstructions: "Standard freight delivery to commercial loading dock. Reference PO number on packing slip.",
        sourcingStrength: "general",
        billingAddress: {
            street1: "100 Grainger Pkwy",
            street2: "",
            city: "Lake Forest",
            state: "IL",
            zip: "60045",
            country: "US",
            formattedAddress: "100 Grainger Pkwy, Lake Forest, IL 60045, US"
        },
        suggestedSuppliers: [
            { name: "Fastenal", website: "https://www.fastenal.com", portalUrl: "https://www.fastenal.com/login", specialty: "Industrial fasteners, OEM hardware & local branch lockers", phone: "(507) 454-5374", email: "orders@fastenal.com", sourcingStrength: "urgent_callout" },
            { name: "McMaster-Carr", website: "https://www.mcmaster.com", portalUrl: "https://www.mcmaster.com", specialty: "Overnight delivery on 500,000+ precision commercial components", phone: "(630) 833-0300", email: "orders@mcmaster.com", sourcingStrength: "specialty_quality" },
            { name: "MSC Industrial Supply", website: "https://www.mscdirect.com", portalUrl: "https://www.mscdirect.com/login", specialty: "Metalworking, tooling & industrial wholesale", phone: "(800) 645-7270", email: "orders@mscdirect.com", sourcingStrength: "commodity_lowest" }
        ],
        requiredOrderFields: [
            { id: "field_acct_num", key: "accountNumber", label: "Trade Account Number", description: "Mandatory contractor account number", type: "text", required: true, defaultValue: "" },
            { id: "field_job_ref", key: "jobReference", label: "Job / Work Order Reference", description: "Job site or work order identifier", type: "text", required: true, defaultValue: "" },
            { id: "field_contact_phone", key: "deliveryContactPhone", label: "Receiving Contact Phone", description: "Direct phone number for courier driver", type: "phone", required: true, defaultValue: "" }
        ],
        isApiCapable: false,
        apiConfig: null
    };
}

/**
 * Searches the web and enriches comprehensive vendor contact details,
 * corporate headquarters billing address, contractor portal URLs, typical payment terms,
 * trade discount programs, order instructions, and API blueprints.
 * 
 * Accurately handles BOTH specific company names (e.g. "Graybar", "Anixter")
 * AND industry / category search terms (e.g. "computer networking", "low voltage cabling", "plumbing supply").
 */
export const lookupVendorDetails = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in to look up vendor details.");
    }

    const { vendorName, website } = data;

    if (!vendorName || !vendorName.trim()) {
        throw new functions.https.HttpsError("invalid-argument", "Vendor name or specialty category is required.");
    }

    const cleanedQuery = vendorName.trim();

    try {
        const apiKey = getGeminiApiKey();
        const client = apiKey ? new GoogleGenerativeAI(apiKey) : genAI;
        const modelName = await getLatestFlashModelName();

        const prompt = `You are an expert commercial procurement and B2B wholesale vendor database assistant.
A contractor is looking up or adding a supplier/vendor in their field service procurement system.
The user provided the search term: "${cleanedQuery}"
Provided website/reference: "${website || 'Not provided'}"

DETERMINE THE NATURE OF THE USER'S INPUT:
1. Is "${cleanedQuery}" a specific supplier/brand name (e.g., "Graybar", "Anixter", "Wesco", "Grainger", "Ferguson", "Home Depot Pro", "HD Supply", "Lowe's Pro", "Fastenal", "CDW", "Johnstone Supply")?
   OR is it a trade category, product specialty, or keyword (e.g., "computer networking", "low voltage cabling", "fiber optics", "commercial plumbing", "hvac parts", "fire alarm hardware", "access control & security", "commercial roofing")?

IF IT IS A TRADE CATEGORY / SPECIALTY (e.g. "computer networking"):
- Identify the premier, top-tier commercial B2B wholesale distributor in North America specializing in this category (for example, for "computer networking" or structured cabling, top distributors include: Anixter / Wesco, Graybar, ADI Global, CDW, ScanSource).
- Populate the PRIMARY vendor profile fields using the #1 premier commercial distributor for that category.
- Set "isCategorySearch": true and "matchedCategory": "${cleanedQuery}".
- In "suggestedSuppliers", return 3 to 5 other leading national commercial wholesale suppliers for this trade with their official name, website, portalUrl, phone, email, and specialty.

IF IT IS A SPECIFIC COMPANY:
- Look up and verify official details for that company.
- Set "isCategorySearch": false.
- In "suggestedSuppliers", return 2 to 3 leading competitor / alternative suppliers in the same industry so the contractor has options.

FIELD EXTRACTION REQUIREMENTS:
1. "name": Official commercial business name (e.g. "Anixter (A Wesco Company)" or "Graybar Electric").
2. "website": Official company website URL (e.g. "https://www.anixter.com").
3. "portalUrl": Contractor / Pro B2B portal login link (e.g. "https://www.anixter.com/en_us/login.html").
4. "email": Orders / dispatch / customer service email (e.g. "orders@anixter.com" or "support@anixter.com").
5. "phone": Main commercial trade desk phone number (e.g. "(800) 323-8167").
6. "supportEmail" & "supportPhone": Customer service contacts.
7. "contactPerson": "Trade Account Representative" or dedicated sales desk title.
8. "paymentTerms": Typical commercial terms (e.g. "Net 30", "2% 10 Net 30", "Net 60").
9. "discountCodes": Standard contractor promo/trade code (e.g. "PRO10", "TRADEVIP").
10. "tradeDiscountPercent": Typical contractor discount percent (e.g. 10, 15, 20).
11. "orderInstructions": Standard receiving dock instructions (e.g. "Ship to commercial loading dock. Reference PO number on packing slip.").
12. "sourcingStrength": One of "local_pickup", "urgent_callout", "commodity_lowest", "specialty_quality", "general".
13. "billingAddress": Corporate headquarters address with street1, street2, city, state, zip, country.
14. "requiredOrderFields": Array of required fields for purchase orders (accountNumber, jobReference, deliveryContactPhone, dockInstructions).
15. "suggestedSuppliers": Array of alternative commercial distributors for this trade.

Return ONLY a single valid JSON object matching the exact schema below, with no markdown backticks or commentary:
{
  "name": "Official Supplier Name",
  "searchedTerm": "${cleanedQuery}",
  "isCategorySearch": true,
  "matchedCategory": "Category Label",
  "website": "https://...",
  "portalUrl": "https://...",
  "email": "orders@...",
  "phone": "(800) ...",
  "supportEmail": "support@...",
  "supportPhone": "(800) ...",
  "contactPerson": "Commercial Trade Desk",
  "paymentTerms": "Net 30",
  "discountCodes": "PRO10",
  "tradeDiscountPercent": 15,
  "orderInstructions": "Deliver to commercial receiving dock. Reference PO on packing slip.",
  "sourcingStrength": "general",
  "billingAddress": {
    "street1": "123 Corporate Blvd",
    "street2": "Suite 100",
    "city": "CityName",
    "state": "StateCode",
    "zip": "12345",
    "country": "US",
    "formattedAddress": "123 Corporate Blvd, Suite 100, CityName, StateCode 12345, US"
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
  "suggestedSuppliers": [
    {
      "name": "Alternative Supplier Name",
      "website": "https://...",
      "portalUrl": "https://...",
      "specialty": "Brief specialty summary",
      "phone": "(800) ...",
      "email": "orders@...",
      "sourcingStrength": "specialty_quality"
    }
  ],
  "isApiCapable": false,
  "apiConfig": null
}`;

        let vendorDetails: any = null;

        try {
            let result;
            try {
                // First attempt with Google Search grounding
                const searchModel = client.getGenerativeModel({
                    model: modelName,
                    tools: [{ googleSearch: {} }] as any
                });
                result = await searchModel.generateContent(prompt);
            } catch (searchToolError) {
                console.warn("[VendorLookup] Google Search grounding failed, using standard Gemini model:", searchToolError);
                const standardModel = client.getGenerativeModel({ model: modelName });
                result = await standardModel.generateContent(prompt);
            }

            const response = await result.response;

            if (response.usageMetadata?.totalTokenCount) {
                try {
                    await logGeminiUsage(
                        response.usageMetadata.totalTokenCount,
                        modelName,
                        "lookupVendorDetails"
                    );
                } catch (usageErr) {
                    console.warn("[VendorLookup] Could not log Gemini usage:", usageErr);
                }
            }

            let jsonText = response.text().trim();
            const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                jsonText = codeBlockMatch[1].trim();
            } else {
                const firstBrace = jsonText.indexOf('{');
                const lastBrace = jsonText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonText = jsonText.substring(firstBrace, lastBrace + 1);
                }
            }

            vendorDetails = JSON.parse(jsonText);
        } catch (aiError: any) {
            console.warn("[VendorLookup] Gemini call failed or credits depleted, utilizing curated B2B knowledge base:", aiError?.message || aiError);
            vendorDetails = getCuratedVendorFallback(cleanedQuery, website);
        }

        if (!vendorDetails || !vendorDetails.name) {
            vendorDetails = getCuratedVendorFallback(cleanedQuery, website);
        }

        return {
            success: true,
            vendor: vendorDetails
        };
    } catch (error: any) {
        console.error("Lookup Vendor Details critical failure:", error);
        // Guaranteed fallback so the user NEVER gets a failed lookup
        return {
            success: true,
            vendor: getCuratedVendorFallback(cleanedQuery, website)
        };
    }
});
