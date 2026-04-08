import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { genAI, getLatestFlashModelName } from "./ai/aiConfig";
import { logGeminiUsage } from "./billing";

if (!admin.apps.length) {
    admin.initializeApp();
}

/**
 * Normalizes a string for safe cache keys
 */
function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

export const searchVendorCatalog = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be logged in to search vendor catalogs.'
        );
    }

    const { vendorName, website, searchTerm } = data;

    if (!vendorName || !searchTerm) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Vendor name and search term are required.'
        );
    }

    const normalizedVendor = normalizeName(vendorName);
    const normalizedTerm = normalizeName(searchTerm);
    if (!normalizedVendor || !normalizedTerm) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid search parameters.');
    }

    const cacheKey = `${normalizedVendor}_${normalizedTerm}`;
    const db = admin.firestore();
    const cacheRef = db.collection('vendor_catalog_cache').doc(cacheKey);

    try {
        // 2. Check Cache
        const cacheDoc = await cacheRef.get();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        if (cacheDoc.exists) {
            const data = cacheDoc.data();
            const lastUpdatedMs = data?.lastUpdated?.toMillis() || 0;
            if (data?.products && Array.isArray(data.products) && (now - lastUpdatedMs < thirtyDaysMs)) {
                console.log(`[Cache Hit] Vendor Search: ${cacheKey}`);
                return {
                    success: true,
                    products: data.products,
                    fromCache: true
                };
            }
        }

        console.log(`[Cache Miss] Vendor Search: ${cacheKey}. Pulling from AI...`);

        const modelName = await getLatestFlashModelName();
        // Initialize model with Google Search grounding enabled
        const model = genAI.getGenerativeModel({ 
            model: modelName,
            tools: [{ googleSearch: {} }] as any // Bypass TS typing if not fully up to date
        });

        const prompt = `You are an expert procurement search assistant. 
Your absolute priority is to find real-time pricing and product links for a specific item from a specific vendor's website.

Vendor Name: ${vendorName}
Vendor Website: ${website || 'Not provided'}
Search Term: ${searchTerm}

INSTRUCTIONS:
1. Use your Google Search capability to find 3 to 5 distinct products matching "${searchTerm}" that are currently sold by "${vendorName}".
2. You MUST extract a numeric price for each product. Hardware catalogs sometimes hide prices behind javascript; if the URL doesn't show a price, search specifically for "price of [Product Name] at ${vendorName}" or check retail aggregators like Google Shopping.
3. If you absolutely cannot find the exact price from ${vendorName}, you MUST estimate a realistic retail price for that specific product based on other hardware stores. Do not leave the price blank.
4. CRITICAL TO AVOID RECITATION BLOCKS: You must NEVER copy product descriptions exactly from the web. You must completely paraphrase and rewrite any descriptions or specs in your own words.
5. If providing an exact URL causes a recitation block, you may return a generic URL to the vendor's main search page (e.g. "https://www.homedepot.com/s/drill").
6. For each product found, provide:
   - The paraphrased product name/title.
   - The current numeric price (e.g., "$12.99"). Even if estimated, return a dollar amount.
   - A generic or direct URL.
   - A completely synthesized and rewritten short description.

Format your response strictly as a JSON array of objects with the following schema:
[
  {
    "title": "Product Title",
    "price": "$12.99",
    "url": "https://vendor.com/search",
    "description": "Synthesized description"
  }
]

Do not include markdown blocks like \`\`\`json. Return only the raw JSON array.
If you cannot find any matching products on this vendor's site, return an empty array [].`;

        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(
                response.usageMetadata.totalTokenCount,
                modelName,
                "searchVendorCatalog"
            );
        }

        let jsonText = response.text().trim();
        if (jsonText.startsWith("```json")) {
            jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
        } else if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/```\n?/g, "");
        }

        let products = [];
        try {
            products = JSON.parse(jsonText);
        } catch (e) {
            console.error("Failed to parse AI search results:", jsonText);
            products = [];
        }

        // Write to global cache
        if (products && Array.isArray(products) && products.length > 0) {
            await cacheRef.set({
                vendorName,
                searchTerm,
                products,
                lastUpdated: admin.firestore.Timestamp.now()
            }, { merge: true });
        }

        return {
            success: true,
            products,
            fromCache: false
        };

    } catch (error: any) {
        console.error("Vendor Catalog Search failed:", error);
        throw new functions.https.HttpsError("internal", `Search failed: ${error.message}`);
    }
});
