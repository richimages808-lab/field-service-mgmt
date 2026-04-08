import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getFlashModel } from "./aiConfig";

if (!admin.apps.length) {
    admin.initializeApp();
}

/**
 * Normalizes an item name for catalog matching (lowercase, trims whitespace)
 */
function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export const resolveCatalogItem = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Authentication is required.'
        );
    }

    const { itemName, itemType } = data; // itemType is 'material' or 'tool'

    if (!itemName) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'itemName is required.'
        );
    }

    const normalized = normalizeName(itemName);
    const db = admin.firestore();
    const catalogRef = db.collection('global_catalog').doc(normalized.replace(/\s+/g, '_'));

    try {
        const doc = await catalogRef.get();
        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

        if (doc.exists) {
            const catalogData = doc.data();
            const lastPricedMs = catalogData?.lastPricedAt?.toMillis() || 0;

            // If it has usage and a recently updated cost, return it immediately!
            if (catalogData?.suggestedUsage && catalogData?.imageUrl && (now - lastPricedMs < thirtyDaysMs)) {
                console.log(`[Catalog] Found fresh cached version for: ${normalized}`);
                return catalogData;
            }
        }

        console.log(`[Catalog] Generating/updating catalog data for: ${normalized}`);

        // 1. Generate Usage & Estimated Cost with Gemini
        const model = await getFlashModel();
        
        const typeStr = itemType === 'tool' ? 'tool or equipment piece' : 'material or part';
        
        let prompt = `You are an expert field service technician and supply chain estimator.
Please analyze the following generic ${typeStr}:
Name: ${itemName}

Provide the response in exact JSON format with three keys:
{"suggestedUsage": "...", "estimatedCost": 0.00, "wikipediaTitle": "..."}

For "suggestedUsage": Provide a brief, professional paragraph (3-4 sentences maximum) describing its suggested field uses and best practices, keeping handling considerations and safety in mind. ${itemType === 'tool' ? 'Since this is a tool, describe its primary operation, calibration, and standard maintenance.' : ''}

For "estimatedCost": Provide a reasonable, average USD market price estimate (just the number) based on current standard hardware store pricing.

For "wikipediaTitle": Provide the exact English Wikipedia article title (e.g., "Claw hammer", "Drywall", "Copper tubing") that best visually represents this item, so we can fetch its thumbnail. If no exact match exists, provide the closest broad category.

Return ONLY the raw JSON object, without any markdown formatting like \`\`\`json.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim().replace(/^```json/i, '').replace(/```$/g, '').trim();
        
        let aiData;
        try {
            aiData = JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse AI JSON:", responseText);
            throw new Error("AI returned invalid JSON.");
        }

        if (!aiData.suggestedUsage || typeof aiData.estimatedCost !== 'number') {
            throw new Error("AI returned missing fields.");
        }

        // 2. Fetch Image from Wikimedia Commons
        let wikiImageUrl = null;
        try {
            if (aiData.wikipediaTitle) {
                const wikiApiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=${encodeURIComponent(aiData.wikipediaTitle)}`;
                const wikiReq = await fetch(wikiApiUrl, {
                    headers: {
                        'User-Agent': 'MaintenanceManagerBot/1.0 (Integration)'
                    }
                });
                
                if (wikiReq.ok) {
                    const wikiJson = await wikiReq.json();
                    const pages = wikiJson.query?.pages;
                    if (pages) {
                        const pageId = Object.keys(pages)[0];
                        if (pageId !== "-1" && pages[pageId]?.original?.source) {
                            wikiImageUrl = pages[pageId].original.source;
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch image from Wikipedia:", e);
        }

        const finalImageUrl = wikiImageUrl || (doc.exists ? doc.data()?.imageUrl : null);

        const newCatalogData = {
            name: itemName,
            normalizedName: normalized,
            type: itemType || 'material',
            suggestedUsage: aiData.suggestedUsage,
            estimatedCost: aiData.estimatedCost,
            imageUrl: finalImageUrl,
            lastPricedAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now()
        };

        // Save to Firestore
        await catalogRef.set(newCatalogData, { merge: true });

        return newCatalogData;

    } catch (error) {
        console.error("[Catalog] Error resolving item:", error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to resolve catalog item.'
        );
    }
});
