import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { genAI, getFlashModel, getLatestFlashModelName } from './ai/aiConfig';
import { logGeminiUsage } from './billing';
import { createAccessTokenBatch } from './accessTokens';
import { sanitizeForFirestore } from './utils/sanitize';

const db = admin.firestore();

/**
 * Extract the Storage file path from a Firebase Storage download URL.
 * Handles both firebasestorage.googleapis.com and storage.googleapis.com formats.
 */
function extractStoragePathFromUrl(url: string): string {
    if (url.includes('firebasestorage.googleapis.com')) {
        const match = url.match(/\/o\/(.+?)\?/);
        if (match) return decodeURIComponent(match[1]);
    } else if (url.includes('storage.googleapis.com')) {
        const parts = url.split('/');
        return parts.slice(4).join('/');
    }
    throw new Error(`Invalid storage URL format: ${url}`);
}

// ═══════════════════════════════════════════════════════════════
//  ADDRESS → JURISDICTION EXTRACTION
// ═══════════════════════════════════════════════════════════════

const US_STATE_ABBRS = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC','PR','GU','VI'
]);

const US_STATE_NAMES: Record<string, string> = {
    'ALABAMA':'AL','ALASKA':'AK','ARIZONA':'AZ','ARKANSAS':'AR','CALIFORNIA':'CA',
    'COLORADO':'CO','CONNECTICUT':'CT','DELAWARE':'DE','FLORIDA':'FL','GEORGIA':'GA',
    'HAWAII':'HI','IDAHO':'ID','ILLINOIS':'IL','INDIANA':'IN','IOWA':'IA',
    'KANSAS':'KS','KENTUCKY':'KY','LOUISIANA':'LA','MAINE':'ME','MARYLAND':'MD',
    'MASSACHUSETTS':'MA','MICHIGAN':'MI','MINNESOTA':'MN','MISSISSIPPI':'MS','MISSOURI':'MO',
    'MONTANA':'MT','NEBRASKA':'NE','NEVADA':'NV','NEW HAMPSHIRE':'NH','NEW JERSEY':'NJ',
    'NEW MEXICO':'NM','NEW YORK':'NY','NORTH CAROLINA':'NC','NORTH DAKOTA':'ND','OHIO':'OH',
    'OKLAHOMA':'OK','OREGON':'OR','PENNSYLVANIA':'PA','RHODE ISLAND':'RI','SOUTH CAROLINA':'SC',
    'SOUTH DAKOTA':'SD','TENNESSEE':'TN','TEXAS':'TX','UTAH':'UT','VERMONT':'VT',
    'VIRGINIA':'VA','WASHINGTON':'WA','WEST VIRGINIA':'WV','WISCONSIN':'WI','WYOMING':'WY',
    'DISTRICT OF COLUMBIA':'DC'
};

/**
 * Extract US state code from a free-text address string.
 * Used by server-side auto-quote to detect jurisdiction for T&C.
 */
function extractStateFromAddress(address: string): string | null {
    if (!address) return null;

    // 1. "City, ST 12345" pattern (most reliable)
    const stateZip = address.match(/\b([A-Z]{2})\b\s+\d{5}/);
    if (stateZip && US_STATE_ABBRS.has(stateZip[1])) return stateZip[1];

    // 2. Comma-separated: "City, ST" or "City, ST,"
    const comma = address.match(/,\s*([A-Z]{2})(?:\s|,|$)/i);
    if (comma) {
        const candidate = comma[1].toUpperCase();
        if (US_STATE_ABBRS.has(candidate)) return candidate;
    }

    // 3. Full state name
    const upper = address.toUpperCase();
    for (const [name, code] of Object.entries(US_STATE_NAMES)) {
        if (upper.includes(name)) return code;
    }

    return null;
}

/**
 * Generates AI copy for the public portal based on the organization's profile.
 */
export const generatePortalContent = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { orgId, businessName, industry, services } = data;

    if (!orgId) {
        throw new functions.https.HttpsError('invalid-argument', 'orgId is required');
    }

    try {
        const prompt = `You are an expert copywriter for home service and technical professionals.
Write compelling "About Us" and "Services" sections for a public customer portal.

Business Name: ${businessName || 'Our Business'}
Industry/Expertise: ${industry || 'Service Professional'}
Core Services: ${services ? JSON.stringify(services) : 'General services'}

Respond EXACTLY with valid JSON in this format, with no markdown formatting or backticks:
{
  "aboutUsTitle": "A catchy title for the About section",
  "aboutUsContent": "A compelling 2-3 paragraph professional bio highlighting expertise and reliability.",
  "servicesTitle": "A catchy title for the Services section",
  "servicesContent": "A 1-2 paragraph summary of the value provided by their services."
}
`;

        const model = await getFlashModel();
        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            const modelName = await getLatestFlashModelName();
            await logGeminiUsage(response.usageMetadata.totalTokenCount, modelName, 'generatePortalContent');
        }

        const text = response.text();

        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        else if (jsonText.startsWith('```')) jsonText = jsonText.replace(/```\n?/g, '');

        const parsed = JSON.parse(jsonText);

        return {
            success: true,
            content: parsed
        };
    } catch (error: any) {
        console.error('AI content generation failed:', error);
        throw new functions.https.HttpsError('internal', `Generation failed: ${error.message}`);
    }
});

/**
 * Designs the public portal (colors, content) based on a user's conversational prompt using AI.
 */
export const designPortalWithAI = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { orgId, prompt, businessName, industry } = data;

    if (!orgId || !prompt) {
        throw new functions.https.HttpsError('invalid-argument', 'orgId and prompt are required');
    }

    try {
        // Verify ownership/admin rights before doing expensive AI work
        const orgDoc = await db.collection('organizations').doc(orgId).get();
        if (!orgDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Organization not found');
        }

        const orgData = orgDoc.data()!;
        if (orgData.ownerId !== context.auth.uid) {
            const userDoc = await db.collection('users').doc(context.auth.uid).get();
            if (userDoc.data()?.org_id !== orgId || userDoc.data()?.role !== 'admin') {
                throw new functions.https.HttpsError('permission-denied', 'Only admins can design the portal');
            }
        }

        const systemPrompt = `You are an expert web designer and copywriter for home service and technical professionals.
The user wants to design their public customer portal. They will provide a request, and you must generate the landing page theme and content.

Business Name: ${businessName || 'Our Business'}
Industry/Expertise: ${industry || 'Service Professional'}
User Request: "${prompt}"

Respond EXACTLY with valid JSON in this format, with no markdown formatting or backticks. 
The themeColor should be a valid CSS hex code (e.g., #2563eb) that matches the user's requested vibe.
{
  "themeColor": "#HEXCODE",
  "hero": {
    "title": "A catchy, short hero headline matching their vibe",
    "content": "A 1-2 sentence hero subheadline."
  },
  "about": {
    "title": "A catchy title for the About section",
    "content": "A compelling 2-3 paragraph professional bio highlighting expertise, reliability, and their specific request."
  },
  "services": {
    "title": "A catchy title for the Services section",
    "content": "A 1-2 paragraph summary of the value provided by their services, tailored to their request."
  }
}
`;

        const model = await getFlashModel();
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            const modelName = await getLatestFlashModelName();
            await logGeminiUsage(response.usageMetadata.totalTokenCount, modelName, 'designPortalWithAI');
        }

        const text = response.text();

        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        else if (jsonText.startsWith('```')) jsonText = jsonText.replace(/```\n?/g, '');

        const parsed = JSON.parse(jsonText);

        return {
            success: true,
            design: parsed
        };
    } catch (error: any) {
        console.error('AI portal design failed:', error);
        throw new functions.https.HttpsError('internal', `Design failed: ${error.message}`);
    }
});

/**
 * Checks if a portal slug is available globally.
 */
export const checkSlugAvailability = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { slug } = data;

    if (!slug || typeof slug !== 'string' || slug.length < 3) {
        return { available: false, error: 'Slug must be at least 3 characters long' };
    }

    // Must be alphanumeric with hyphens
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
        return { available: false, error: 'Slug can only contain lowercase letters, numbers, and hyphens' };
    }

    try {
        const snapshot = await db.collection('organizations')
            .where('portalConfig.slug', '==', slug)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return { available: true };
        }

        // It might be the current org's slug
        const doc = snapshot.docs[0];
        const orgData = doc.data();
        if (orgData.ownerId === context.auth.uid) {
            return { available: true }; // They already own it
        }

        return { available: false, error: 'This URL is already taken' };
    } catch (error: any) {
        console.error('Slug check failed:', error);
        throw new functions.https.HttpsError('internal', 'Failed to check availability');
    }
});

/**
 * Saves the communication and portal settings for an organization.
 */
export const savePortalSettings = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { orgId, communicationChannels, portalConfig } = data;

    if (!orgId) {
        throw new functions.https.HttpsError('invalid-argument', 'orgId is required');
    }

    try {
        // Verify ownership
        const orgDoc = await db.collection('organizations').doc(orgId).get();
        if (!orgDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Organization not found');
        }

        const orgData = orgDoc.data()!;
        if (orgData.ownerId !== context.auth.uid) {
            // Check if user is an admin of the org
            const userDoc = await db.collection('users').doc(context.auth.uid).get();
            if (userDoc.data()?.org_id !== orgId || userDoc.data()?.role !== 'admin') {
                throw new functions.https.HttpsError('permission-denied', 'Only admins can modify settings');
            }
        }

        // If a new slug is provided, double check availability
        if (portalConfig?.slug && portalConfig.slug !== orgData.portalConfig?.slug) {
            const snapshot = await db.collection('organizations')
                .where('portalConfig.slug', '==', portalConfig.slug)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                throw new functions.https.HttpsError('already-exists', 'This URL is already taken');
            }
        }

        const updateData: any = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (communicationChannels) {
            updateData.communicationChannels = communicationChannels;
        }

        if (portalConfig) {
            updateData.portalConfig = portalConfig;
        }

        await db.collection('organizations').doc(orgId).update(updateData);

        return { success: true, message: 'Settings saved successfully' };
    } catch (error: any) {
        console.error('Save settings failed:', error);
        throw new functions.https.HttpsError('internal', `Failed to save settings: ${error.message}`);
    }
});

/**
 * Public endpoint to submit a booking from the portal.
 * DOES NOT require authentication.
 */
export const submitPortalBooking = functions.https.onCall(async (data, context) => {
    const { slug, customerName, customerPhone, customerEmail, address, description, urgency, intent, photoUrls } = data;
    // intent: 'service_request' (default) | 'quote_request'

    if (!slug || !customerName || !description) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    const isQuoteRequest = intent === 'quote_request';

    try {
        // Find the organization by slug (try unified slug first, then legacy portalConfig.slug)
        let orgSnapshot = await db.collection('organizations')
            .where('slug', '==', slug)
            .limit(1)
            .get();

        if (orgSnapshot.empty) {
            orgSnapshot = await db.collection('organizations')
                .where('portalConfig.slug', '==', slug)
                .limit(1)
                .get();
        }

        if (orgSnapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Organization not found');
        }

        const orgId = orgSnapshot.docs[0].id;

        // Try to match or create a customer via phone/email, if not just add info to ticket
        let customerRef = null;
        let matchedName = customerName;

        if (customerPhone) {
            const custSnap = await db.collection('customers')
                .where('phone', '==', customerPhone)
                .where('organizationId', '==', orgId)
                .limit(1)
                .get();

            if (!custSnap.empty) {
                customerRef = custSnap.docs[0].ref;
                matchedName = custSnap.docs[0].data().name || customerName;
            }
        } else if (customerEmail) {
            const custSnap = await db.collection('customers')
                .where('email', '==', customerEmail)
                .where('organizationId', '==', orgId)
                .limit(1)
                .get();

            if (!custSnap.empty) {
                customerRef = custSnap.docs[0].ref;
                matchedName = custSnap.docs[0].data().name || customerName;
            }
        }

        // Create the ticket
        const sourceLabel = isQuoteRequest ? 'WEBSITE_PORTAL_QUOTE' : 'WEBSITE_PORTAL';
        const descPrefix = isQuoteRequest ? '[Portal Quote Request]' : '[Public Portal Request]';
        const ticketData: any = {
            requestorName: customerName,
            requestorPhone: customerPhone || null,
            requestorEmail: customerEmail || null,
            address: address || null,
            description: `${descPrefix}\nUrgency: ${urgency || 'Normal'}\n\n${description}`,
            source: sourceLabel,
            intent: isQuoteRequest ? 'quote_request' : 'service_request',
            status: "PENDING",
            organizationId: orgId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {
                urgency: urgency || "normal",
                intent: isQuoteRequest ? 'quote_request' : 'service_request'
            }
        };

        if (customerRef) {
            ticketData.customerRef = customerRef;
            ticketData.customerName = matchedName;
        }

        // Store customer-uploaded photo URLs on the ticket
        if (photoUrls && Array.isArray(photoUrls) && photoUrls.length > 0) {
            ticketData.photoUrls = photoUrls;
        }

        const ticketRef = await db.collection('tickets').add(ticketData);

        // ═══════════════════════════════════════════════════════════════
        // FAST RETURN: Create only the lightweight records the customer
        // needs immediately.  AI analysis + quote generation is handled
        // asynchronously by the onNewTicketCreated Firestore trigger.
        // ═══════════════════════════════════════════════════════════════

        // ═══ Generate a ticket-only access token ═══
        let accessTokens: Record<string, string> = {};
        try {
            accessTokens = await createAccessTokenBatch({
                resources: [
                    { resourceType: 'ticket', resourceId: ticketRef.id, permissions: ['view'] }
                ],
                orgId,
                customerPhone: customerPhone || undefined,
                customerEmail: customerEmail || undefined,
                customerName: customerName || undefined,
                createdBy: 'portal',
                expiresInDays: 90,
            });
        } catch (tokenErr) {
            console.error('Access token generation failed (non-fatal):', tokenErr);
        }

        // ═══ Create job_photos records from customer-uploaded photos ═══
        if (photoUrls && Array.isArray(photoUrls) && photoUrls.length > 0) {
            try {
                const batch = db.batch();
                for (const url of photoUrls) {
                    const photoRef = db.collection('job_photos').doc();
                    batch.set(photoRef, {
                        job_id: ticketRef.id, // will be re-linked when the background job is created
                        ticket_id: ticketRef.id,
                        org_id: orgId,
                        type: 'customer',
                        url: url,
                        takenAt: admin.firestore.FieldValue.serverTimestamp(),
                        takenBy: 'portal_customer',
                        uploadedBy: customerName || 'Customer',
                        source: 'portal',
                    });
                }
                await batch.commit();
            } catch (photoErr) {
                console.error('Creating job_photos records failed (non-fatal):', photoErr);
            }
        }

        return {
            success: true,
            ticketId: ticketRef.id,
            message: isQuoteRequest
                ? 'Your quote request has been submitted. We\'ll prepare an estimate and get back to you shortly.'
                : 'Your request has been submitted successfully. We\'ll be in touch soon.',
            accessTokens,
        };
    } catch (error: any) {
        console.error('Portal booking failed:', error);
        throw new functions.https.HttpsError('internal', `Booking failed: ${error.message}`);
    }
});

/**
 * Auto-create a Job and AI Quote when a portal ticket is submitted.
 * This runs in the background so the customer gets an immediate response.
 */
export async function autoCreateJobAndQuote(
    orgId: string,
    ticketId: string,
    info: {
        customerName: string;
        customerPhone: string;
        customerEmail: string;
        address: string;
        description: string;
        urgency: string;
        customerId: string | null;
        photoUrls?: string[];
    },
    options?: { skipJobCreation?: boolean; existingJobId?: string | null }
): Promise<{ jobId?: string; quoteId?: string }> {
    try {
        let jobId = options?.existingJobId || '';
        let jobRef: FirebaseFirestore.DocumentReference | null = jobId ? db.collection('jobs').doc(jobId) : null;

        if (!options?.skipJobCreation && !jobId) {
            // 1. Create the Job
            const jobData: any = {
                org_id: orgId,
                status: 'quote_pending',
                priority: info.urgency === 'emergency' ? 'critical'
                    : info.urgency === 'urgent' ? 'high' : 'medium',
                customer: {
                    name: info.customerName,
                    address: info.address,
                    phone: info.customerPhone,
                    email: info.customerEmail
                },
                request: {
                    description: info.description,
                    photos: info.photoUrls || [],
                    availability: [],
                    source: 'web'
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                ticketId: ticketId
            };
            if (info.customerId) {
                jobData.customer_id = info.customerId;
            }

            jobRef = await db.collection('jobs').add(jobData);
            jobId = jobRef.id;

            // Link job back to ticket
            await db.collection('tickets').doc(ticketId).update({
                autoJobId: jobId
            });
        }

        // 2. Run AI analysis on the job (Gemini)
        let aiAnalysis: any = null;
        try {
            // Fetch past jobs context
            let pastContext = '';
            if (info.customerId) {
                try {
                    const pastJobsSnap = await db.collection('jobs')
                        .where('customer_id', '==', info.customerId)
                        .where('org_id', '==', orgId)
                        .orderBy('createdAt', 'desc')
                        .limit(3)
                        .get();
                    
                    const contextEntries: string[] = [];
                    pastJobsSnap.docs.forEach(doc => {
                        const data = doc.data();
                        if (data.aiRecommendation && data.request?.description) {
                            const ai = data.aiRecommendation;
                            let entry = `Past Request: ${data.request.description}\n`;
                            if (ai.partsNeeded && ai.partsNeeded.length > 0) {
                                entry += `Materials Actually Used: ${ai.partsNeeded.map((p: any) => `${p.name} (x${p.quantity})`).join(', ')}\n`;
                            }
                            if (ai.toolsRequired && ai.toolsRequired.length > 0) {
                                entry += `Tools Required: ${ai.toolsRequired.map((t: any) => t.name).join(', ')}\n`;
                            }
                            contextEntries.push(entry);
                        }
                    });
                    if (contextEntries.length > 0) {
                        pastContext = contextEntries.join('\n\n');
                    }
                } catch (e) {
                    console.error('Error fetching past context:', e);
                }
            }

            const model = await getFlashModel();

            // Fetch org profile for business-type-aware AI recommendations
            let orgProfile: { industry?: string; services?: string[]; businessName?: string } | undefined;
            try {
                const orgProfileDoc = await db.collection('organizations').doc(orgId).get();
                if (orgProfileDoc.exists) {
                    const orgProfileData = orgProfileDoc.data();
                    orgProfile = {
                        industry: orgProfileData?.industry || orgProfileData?.settings?.industry,
                        services: orgProfileData?.services || orgProfileData?.settings?.serviceTypes,
                        businessName: orgProfileData?.name || orgProfileData?.businessName,
                    };
                }
            } catch (e) {
                console.warn('Could not fetch org profile for AI context:', e);
            }

            // Fetch org-learned patterns from completed jobs and dispatcher corrections
            let orgPatterns = '';
            try {
                const { fetchOrgPatterns } = await import('./ai/aiLearning');
                orgPatterns = await fetchOrgPatterns(orgId, info.description);
            } catch (e) {
                console.warn('Could not fetch org AI patterns:', e);
            }

            const analysisPrompt = buildQuoteAnalysisPrompt(info.description, orgId, pastContext, (info.photoUrls || []).length, orgProfile, orgPatterns);

            // Build multimodal content parts: text prompt + customer photos
            const contentParts: any[] = [analysisPrompt];

            // Download and include customer-uploaded photos for vision analysis
            if (info.photoUrls && info.photoUrls.length > 0) {
                const bucket = admin.storage().bucket();
                for (const photoUrl of info.photoUrls.slice(0, 5)) { // Limit to 5 photos to control cost/latency
                    try {
                        const filePath = extractStoragePathFromUrl(photoUrl);
                        const file = bucket.file(filePath);
                        const [fileBuffer] = await file.download();
                        const base64Image = fileBuffer.toString('base64');
                        // Detect mime type from file extension
                        const ext = filePath.split('.').pop()?.toLowerCase() || 'jpeg';
                        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
                        contentParts.push({
                            inlineData: { data: base64Image, mimeType }
                        });
                        console.log(`[AutoQuote] Included photo for AI analysis: ${filePath}`);
                    } catch (photoErr) {
                        console.warn(`[AutoQuote] Failed to download photo (skipping): ${photoUrl}`, photoErr);
                    }
                }
            }

            const result = await model.generateContent(contentParts);
            const response = await result.response;

            if (response.usageMetadata?.totalTokenCount) {
                await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'autoQuoteGeneration');
            }

            const text = response.text();
            aiAnalysis = parseQuoteAnalysisResponse(text);

            // Save AI analysis to job if it exists, otherwise just to the ticket
            if (jobRef) {
                await jobRef.update({
                    aiRecommendation: aiAnalysis,
                    aiAnalyzedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await db.collection('tickets').doc(ticketId).update({
                    aiRecommendation: aiAnalysis,
                    aiAnalyzedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (aiErr) {
            console.error('AI analysis failed for auto-quote:', aiErr);
            // Continue without AI - will generate basic quote
        }

        // 3. Fetch org rate card
        const orgDoc = await db.collection('organizations').doc(orgId).get();
        const orgData = orgDoc.exists ? orgDoc.data() : {};
        const rateCard = orgData?.rateCard || { baseHourlyRate: 100, materialMarkup: 30, defaultTaxRate: orgData?.settings?.defaultTaxRate || 0 };

        // 4. Fetch org materials for real costs
        const materialsSnap = await db.collection('materials')
            .where('org_id', '==', orgId)
            .get();
        const orgMaterials = materialsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 4b. Fetch org vendors for live pricing lookup
        const vendorsSnap = await db.collection('vendors')
            .where('organizationId', '==', orgId)
            .where('active', '==', true)
            .get();
        const orgVendors = vendorsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 5. Generate the quote
        const quoteId = await generateServerSideQuote(
            jobId, orgId, info, rateCard, aiAnalysis, orgMaterials, orgVendors, orgData?.settings
        );

        // 6. Link quote back to ticket + job
        const quoteDoc = await db.collection('quotes').doc(quoteId).get();
        const quoteTotal = quoteDoc.exists ? quoteDoc.data()?.total || 0 : 0;

        await db.collection('tickets').doc(ticketId).update({
            autoQuoteId: quoteId,
            autoQuoteTotal: quoteTotal
        });

        if (jobRef) {
            await jobRef.update({
                latestQuoteId: quoteId,
                status: 'quote_pending'
            });
        }

        console.log(`Auto-quote ${quoteId} generated for ticket ${ticketId} / job ${jobId} — total $${quoteTotal}`);

        return { jobId, quoteId };

    } catch (error) {
        console.error('autoCreateJobAndQuote failed:', error);
        // Mark ticket so the UI knows auto-generation failed
        await db.collection('tickets').doc(ticketId).update({
            autoQuoteError: true
        }).catch(() => {});
        return {};
    }
}

/**
 * Build AI prompt for comprehensive quote analysis.
 *
 * Uses a structured chain-of-thought approach so the AI:
 *  1. Classifies the job type/category first.
 *  2. Walks through the procedure step-by-step.
 *  3. Derives materials FROM the procedure (not guessed generically).
 *  4. Separates tools (technician owns) from purchasable parts/materials.
 *  5. Self-validates the output before returning.
 */
function buildQuoteAnalysisPrompt(description: string, orgId: string, pastContext?: string, photoCount?: number, orgProfile?: { industry?: string; services?: string[]; businessName?: string }, orgPatterns?: string): string {
    let prompt = `You are a senior licensed tradesman with 20+ years of hands-on field experience in plumbing, HVAC, electrical, and general contracting. You are creating a **customer-facing quote estimate**.

══════════════════════════════════════════════
STEP 1 — UNDERSTAND THE REQUEST
══════════════════════════════════════════════
Read the customer description carefully. Determine:
  • What EXACTLY is the customer asking for? (e.g. "install a bidet" means installing a bidet attachment/seat onto an existing toilet)
  • Is this an installation, repair, replacement, inspection, or maintenance job?
  • What trade category applies? (plumbing, electrical, HVAC, general, etc.)

**Customer Description:** ${description}
`;

    if (orgProfile) {
        prompt += `
══════════════════════════════════════════════
BUSINESS CONTEXT
══════════════════════════════════════════════
- Company: ${orgProfile.businessName || 'Field Service Company'}
- Industry: ${orgProfile.industry || 'General Field Service'}
- Services Offered: ${orgProfile.services?.join(', ') || 'General maintenance and repair'}
Your recommendations should be appropriate for a ${orgProfile.industry || 'field service'} business.
The technicians will have standard ${orgProfile.industry || 'trade'} tools on hand — do not list basic trade tools as equipment purchases.
`;
    }

    if (photoCount && photoCount > 0) {
        prompt += `
══════════════════════════════════════════════
CUSTOMER PHOTOS (${photoCount} image${photoCount > 1 ? 's' : ''} attached)
══════════════════════════════════════════════
The customer has uploaded photos of the issue/area. CAREFULLY analyze each photo to:
  • Identify the specific equipment, fixture, or area involved (brand, model, material, size)
  • Assess visible damage, wear, corrosion, leaks, or other problems
  • Note the surrounding environment (accessibility, space constraints, existing plumbing/electrical)
  • Identify any parts or materials already visible that may need replacement
  • Factor your visual observations into the diagnosis, materials list, and time estimate
  • **CRITICALLY**: Determine if the fixture/equipment is REPAIRABLE or needs FULL REPLACEMENT based on what you see

IMPORTANT: Reference what you see in the photos in your "diagnosis" field. For example:
  "Based on the photos, the leak appears to originate from a corroded copper fitting near the shut-off valve..."
  Do NOT say "no photos were provided" — you have them right here.
`;
    }

    if (pastContext) {
        prompt += `
══════════════════════════════════════════════
CUSTOMER HISTORY (for context only)
══════════════════════════════════════════════
This customer has had previous service calls. Use this to anticipate recurring issues or property-specific needs:
${pastContext}
`;
    }

    // Inject org-learned patterns from completed jobs and dispatcher corrections
    if (orgPatterns) {
        prompt += orgPatterns;
    }

    prompt += `
══════════════════════════════════════════════
STEP 2 — PLAN THE PROCEDURE
══════════════════════════════════════════════
Write out the actual step-by-step procedure a technician would follow on-site. Think through this like you are physically doing the job. For example, a bidet installation would involve:
  1. Shut off water supply to toilet
  2. Disconnect existing supply line from toilet fill valve
  3. Install the T-adapter/splitter onto the fill valve
  4. Mount the bidet seat/attachment onto the toilet bowl
  5. Connect the bidet supply hose from T-adapter to the bidet
  6. Reconnect the toilet supply line to the T-adapter
  7. Turn water back on, check all connections for leaks
  8. Test bidet functions, adjust water pressure
  9. Clean up work area

══════════════════════════════════════════════
STEP 2.5 — REPAIR vs. REPLACEMENT DECISION
══════════════════════════════════════════════
**THIS IS CRITICAL. READ CAREFULLY.**

Before listing ANY materials, you MUST classify this job as REPAIR/SERVICE or REPLACEMENT:

**REPAIR/SERVICE indicators** (recommend repair parts and consumables ONLY — do NOT include a replacement fixture):
  • Customer says "fix", "repair", "not working", "broken" (but fixture is structurally intact)
  • Clogged drain/toilet → needs augering/snaking, drain cleaner, possibly wax ring — NOT a new toilet
  • Leaking faucet → needs cartridge, washer, O-ring, gasket — NOT a new faucet
  • Running toilet → needs flapper, fill valve, flush valve — NOT a new toilet
  • Noisy HVAC → needs diagnostics, cleaning, capacitor — NOT a new AC unit
  • Slow drain → needs drain cleaning — NOT new plumbing
  • Vague descriptions like "please fix this" or "fix this problem" → DEFAULT TO REPAIR

**REPLACEMENT indicators** (include the new fixture in materials):
  • Customer explicitly says "replace", "install new", "swap out", "upgrade", "want a new"
  • Photos show cracked/shattered porcelain, major structural damage beyond repair
  • Fixture is visibly obsolete or corroded through beyond economical repair
  • Customer explicitly wants to upgrade (e.g., "want a touchless faucet")

**DEFAULT RULE: When in doubt, ALWAYS classify as REPAIR.** The vast majority of service calls are repairs, not replacements. A clogged toilet is a repair. A leaking pipe is a repair. If the customer wanted a replacement, they would say so.

Set jobClassification.jobType accordingly. If REPAIR, do NOT include the fixture itself in partsNeeded — only include repair parts, consumables, and supplies needed for the fix.

**CRITICAL INDIVIDUAL MATERIAL MANDATE:**
NEVER group materials into generic terms like "Miscellaneous service consumables", "Consumables", "Hardware & Supplies", or "Tape & Fasteners". YOU MUST BREAK DOWN and list EVERY SINGLE material, part, supply, or consumable as an INDIVIDUAL SPECIFIC ITEM on its own line with its exact specific product name (e.g., "Pipe Sealant Tape", "Plumber's Putty 14oz", "Toilet Wax Ring with Closet Bolts").

══════════════════════════════════════════════
STEP 3 — DERIVE MATERIALS FROM THE PROCEDURE
══════════════════════════════════════════════
For EACH step above, determine what physical materials/parts the technician needs to PURCHASE or bring. Follow these critical rules:

**MATERIALS vs TOOLS — CRITICAL DISTINCTION:**
- MATERIALS/PARTS go in "partsNeeded": Things that get INSTALLED, CONSUMED, or LEFT at the job site. These are what the customer pays for.
  Examples: bidet seat, T-adapter, supply hose, pipe fittings, caulk, sealant tape, wax ring, faucet, toilet, water heater, thermostat, wire, drywall screws
- TOOLS go in "toolsRequired": Things the technician USES but takes home. The customer does NOT purchase these.
  Examples: wrench, screwdriver, drill, tape measure, level, multimeter, pipe cutter, plunger, inspection camera, drain snake/auger

**NEVER put tools in "partsNeeded".** A tape measure, wrench, drill, plunger, or screwdriver is NOT a material — it is a tool the tech owns.

**PRIMARY ITEM RULE (REPLACEMENT/INSTALLATION JOBS ONLY):** For installation or replacement jobs, the PRIMARY item being installed MUST be in "partsNeeded" as an essential item. Examples:
- "Install a bidet" → bidet seat/attachment MUST be listed
- "Install a water heater" → water heater MUST be listed
- "Replace a faucet" → new faucet MUST be listed
- "Install a ceiling fan" → ceiling fan MUST be listed
If the customer says they already have the item, mark it as essential but add a note "Customer may already have — confirm before purchasing" and set estimatedCost to a typical retail price.

**REPAIR JOBS:** Do NOT include the fixture being repaired as a material. Only include the specific repair parts needed (flappers, cartridges, gaskets, valves, seals, etc.).

**COST ACCURACY:** Use realistic 2025 US retail prices (Home Depot/Lowe's pricing):
- Bidet seat attachment: $30-80, bidet toilet seat: $200-500
- Toilet supply line (braided stainless): $8-15
- T-adapter / splitter valve: $10-20
- Pipe sealant tape (PTFE): $2-5
- Wax ring with bolts: $5-12
- Toilet flapper: $5-12
- Toilet fill valve: $8-20
- Faucet cartridge: $10-30
- Standard faucet: $80-250
- Water heater (tank, 50 gal): $400-800
- Thermostat: $25-250
- Do NOT guess — if you're unsure, use mid-range pricing and set confidence lower.

══════════════════════════════════════════════
STEP 4 — ESTIMATE TIME REALISTICALLY
══════════════════════════════════════════════
Think through how long each phase actually takes:
- Travel & initial assessment: typically 15-30 minutes
- Preparation (shutting off water/power, protecting surfaces): 10-20 minutes
- Core work: varies by job complexity
- Testing & verification: 10-20 minutes
- Cleanup & customer walkthrough: 10-15 minutes
Add these up for total estimatedDuration in MINUTES.

Common job duration benchmarks:
- Simple bidet seat install: 45-90 minutes
- Faucet replacement: 60-120 minutes
- Toilet replacement: 90-180 minutes
- Water heater replacement: 180-360 minutes
- Electrical outlet install: 30-60 minutes
- Drain clearing/unclogging: 30-90 minutes
- Toilet repair (flapper/fill valve): 30-60 minutes
- Faucet repair (cartridge/washer): 30-60 minutes

══════════════════════════════════════════════
STEP 5 — SELF-VALIDATION CHECKLIST
══════════════════════════════════════════════
Before outputting your JSON, verify:
✓ Did you correctly classify this as REPAIR or REPLACEMENT in Step 2.5?
✓ If REPAIR: Does "partsNeeded" contain ONLY repair parts/consumables (no replacement fixtures)?
✓ If REPLACEMENT: Does "partsNeeded" contain the PRIMARY item being replaced?
✓ Are ALL items in "partsNeeded" actual purchasable materials (not tools)?
✓ Are ALL tools in "toolsRequired" (not in partsNeeded)?
✓ Do the estimated costs reflect real retail pricing?
✓ Does the estimatedDuration match the complexity of the procedure?
✓ Does the solution describe the actual procedure step by step?
✓ Would a real tradesman look at this quote and say "yes, that's correct"?

══════════════════════════════════════════════
OUTPUT FORMAT
══════════════════════════════════════════════
Return ONLY valid JSON in this exact structure:
{
  "jobClassification": {
    "jobType": "installation|repair|replacement|inspection|maintenance|diagnostic",
    "tradeCategory": "plumbing|electrical|hvac|general|carpentry|appliance",
    "primaryItem": "The main item being installed/repaired/replaced, or null if not applicable"
  },
  "diagnosis": "Clear description of what this job involves and what the tech will do (2-3 sentences)",
  "solution": "Step 1: ..., Step 2: ..., Step 3: ... (write out the actual procedure, comma-separated steps)",
  "estimatedDuration": 90,
  "complexity": "simple|medium|complex",
  "confidence": 0.85,
  "partsNeeded": [
    {"name": "Exact product name", "quantity": 1, "estimatedCost": 45.00, "essential": true, "category": "primary_item|fitting|consumable|hardware|accessory"}
  ],
  "toolsRequired": [
    {"name": "Tool name", "essential": true, "owned": true}
  ],
  "safetyWarnings": ["Warning if applicable"],
  "priority": "low|medium|high|critical",
  "priorityReason": "Brief reason for priority level"
}

Respond ONLY with valid JSON, no markdown, no explanation.`;

    return prompt;
}

/**
 * Parse AI response for quote analysis.
 * Includes post-processing validation to catch common AI mistakes.
 */
function parseQuoteAnalysisResponse(text: string): any {
    try {
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }
        const parsed = JSON.parse(jsonText);

        // ── Post-processing validation ──

        // 1. Filter out tools that were mistakenly put in partsNeeded
        const toolKeywords = [
            'tape measure', 'measuring tape', 'wrench', 'screwdriver', 'drill',
            'pliers', 'level', 'hammer', 'saw', 'multimeter', 'voltmeter',
            'pipe cutter', 'tubing cutter', 'torch', 'soldering iron',
            'wire stripper', 'crimper', 'inspection camera', 'flashlight',
            'utility knife', 'box cutter', 'pry bar', 'crowbar', 'chisel',
            'channel locks', 'basin wrench', 'socket set', 'ratchet',
            'allen wrench', 'hex key', 'stud finder', 'fish tape',
            'snake', 'auger', 'plunger', 'shop vac', 'vacuum',
            'ladder', 'step ladder', 'extension cord', 'work light',
            'safety glasses', 'gloves', 'knee pads', 'dust mask',
            'drop cloth', 'tarp', 'bucket'
        ];

        if (parsed.partsNeeded && Array.isArray(parsed.partsNeeded)) {
            const movedToTools: any[] = [];
            parsed.partsNeeded = parsed.partsNeeded.filter((part: any) => {
                const nameLower = (part.name || '').toLowerCase();
                const isActuallyATool = toolKeywords.some(kw => nameLower.includes(kw));
                if (isActuallyATool) {
                    // Move it to toolsRequired instead
                    movedToTools.push({
                        name: part.name,
                        essential: part.essential ?? true,
                        owned: true  // assume technician owns basic tools
                    });
                    console.warn(`[QuoteAI Validation] Moved "${part.name}" from partsNeeded to toolsRequired (it's a tool, not a material)`);
                    return false;
                }
                return true;
            });

            // Merge moved tools into toolsRequired
            if (movedToTools.length > 0) {
                if (!parsed.toolsRequired) parsed.toolsRequired = [];
                parsed.toolsRequired.push(...movedToTools);
            }
        }

        // 2. Validate estimatedDuration is reasonable (minimum 30 min, max 480 min / 8 hours)
        if (parsed.estimatedDuration) {
            parsed.estimatedDuration = Math.max(30, Math.min(480, parsed.estimatedDuration));
        }

        // 3. Validate costs are reasonable (flag but don't remove)
        if (parsed.partsNeeded && Array.isArray(parsed.partsNeeded)) {
            for (const part of parsed.partsNeeded) {
                if (part.estimatedCost && part.estimatedCost > 5000) {
                    console.warn(`[QuoteAI Validation] Suspiciously high cost for "${part.name}": $${part.estimatedCost}`);
                }
                if (part.estimatedCost && part.estimatedCost <= 0) {
                    part.estimatedCost = 10; // minimum fallback
                }
            }
        }

        // 4. Repair-aware validation: if the AI classified this as a repair/service/maintenance/diagnostic
        // job but still recommended a major fixture as a purchasable part, flag it.
        // This catches the "clogged toilet → buy new toilet" type of error.
        const jobType = parsed.jobClassification?.jobType?.toLowerCase() || '';
        const isRepairJob = ['repair', 'maintenance', 'diagnostic', 'service'].some(t => jobType.includes(t));
        if (isRepairJob && parsed.partsNeeded && Array.isArray(parsed.partsNeeded)) {
            const majorFixtureKeywords = ['toilet', 'bidet', 'water heater', 'furnace', 'ac unit', 'air conditioner',
                'garbage disposal', 'dishwasher', 'washing machine', 'dryer', 'bathtub', 'shower',
                'sink', 'faucet', 'light fixture', 'ceiling fan', 'circuit breaker panel'];

            for (const part of parsed.partsNeeded) {
                const partNameLower = (part.name || '').toLowerCase();
                const isMajorFixture = majorFixtureKeywords.some(fixture => {
                    const fixtureWords = fixture.split(/\s+/);
                    const partWords = partNameLower.split(/\s+/);
                    // Distinguish "Toilet" (fixture replacement) from "Toilet flapper" (repair part)
                    const repairPartSuffixes = ['flapper', 'cartridge', 'valve', 'washer', 'gasket', 'seal',
                        'o-ring', 'ring', 'hose', 'line', 'connector', 'adapter', 'supply',
                        'drain', 'trap', 'handle', 'lever', 'bolt', 'nut', 'kit', 'element',
                        'filter', 'cap', 'cover', 'seat', 'spring', 'diaphragm', 'float',
                        'fill', 'flush', 'wax', 'sealant', 'tape', 'putty', 'cleaner'];
                    const hasRepairSuffix = repairPartSuffixes.some(suffix => partNameLower.includes(suffix));
                    if (hasRepairSuffix) return false; // It's a repair part, not a fixture replacement

                    return fixtureWords.every(fw => partWords.some((pw: string) => pw.includes(fw) || fw.includes(pw)));
                });

                if (isMajorFixture) {
                    part.essential = false;
                    part._repairOverride = true;
                    console.warn(`[RepairValidation] Repair job recommends fixture "${part.name}" — marking non-essential (job type: ${jobType})`);
                }
            }
        }

        // 5. Ensure essential fields exist
        if (!parsed.diagnosis) parsed.diagnosis = 'Service request — on-site assessment recommended';
        if (!parsed.solution) parsed.solution = 'Technician will assess and complete the requested work on-site';
        if (!parsed.estimatedDuration) parsed.estimatedDuration = 90;
        if (!parsed.complexity) parsed.complexity = 'medium';
        if (!parsed.confidence) parsed.confidence = 0.5;
        if (!parsed.partsNeeded) parsed.partsNeeded = [];
        if (!parsed.toolsRequired) parsed.toolsRequired = [];
        if (!parsed.safetyWarnings) parsed.safetyWarnings = [];
        if (!parsed.priority) parsed.priority = 'medium';
        if (!parsed.priorityReason) parsed.priorityReason = 'Standard service request';

        return parsed;
    } catch {
        return {
            diagnosis: 'Analysis pending — please review manually',
            solution: 'Review the customer request and provide assessment on-site',
            estimatedDuration: 120,
            complexity: 'medium',
            confidence: 0.3,
            partsNeeded: [],
            toolsRequired: [],
            safetyWarnings: [],
            priority: 'medium',
            priorityReason: 'Standard service request'
        };
    }
}

/**
 * Generate a quote server-side (within the cloud function)
 */
async function generateServerSideQuote(
    jobId: string,
    orgId: string,
    info: { customerName: string; customerPhone: string; customerEmail: string; address: string; description: string; urgency: string; customerId: string | null },
    rateCard: any,
    aiAnalysis: any,
    orgMaterials: any[],
    orgVendors: any[] = [],
    orgSettings?: any
): Promise<string> {
    const estimatedMinutes = aiAnalysis?.estimatedDuration || 120;
    // Use fractional hours with quarter-hour rounding for more accurate labor splits
    const totalHours = Math.max(1, Math.round((estimatedMinutes / 60) * 4) / 4); // rounds to nearest 0.25
    const complexity = aiAnalysis?.complexity || 'medium';
    const hourlyRate = rateCard?.baseHourlyRate || 100;
    const materialMarkup = rateCard?.materialMarkup ?? 30;
    const taxRate = rateCard?.defaultTaxRate || orgSettings?.defaultTaxRate || 0;
    const equipmentDayRate = rateCard?.equipmentDayRate || 35;

    // Use AI job classification for better descriptions if available
    const serviceVerb = getServiceVerbFromDesc(info.description);

    const lineItems: any[] = [];

    // ─── LABOR ───
    const diagnosticHours = complexity === 'complex' ? 1 : 0.5;
    lineItems.push({
        id: generateId(),
        type: 'labor',
        description: 'Initial Diagnostic & Assessment',
        quantity: diagnosticHours,
        unit: 'hours',
        unitPrice: hourlyRate,
        total: diagnosticHours * hourlyRate,
        taxable: false,
        isOptional: false,
        notes: 'On-site evaluation and diagnosis'
    });

    // Core work — ensure meaningful hours for actual work (minimum 0.5 hour)
    const testingHours = 0.25;
    const coreWorkHours = Math.max(0.5, Math.round((totalHours - diagnosticHours - testingHours) * 4) / 4);
    lineItems.push({
        id: generateId(),
        type: 'labor',
        description: `${serviceVerb} — Labor`,
        quantity: coreWorkHours,
        unit: 'hours',
        unitPrice: hourlyRate,
        total: coreWorkHours * hourlyRate,
        taxable: false,
        isOptional: false,
        notes: aiAnalysis?.solution || 'Repair and service work as described'
    });

    lineItems.push({
        id: generateId(),
        type: 'labor',
        description: 'Testing, Cleanup & Final Inspection',
        quantity: testingHours,
        unit: 'hours',
        unitPrice: hourlyRate,
        total: testingHours * hourlyRate,
        taxable: false,
        isOptional: false,
        notes: 'System verification, cleanup, and walkthrough with customer'
    });


    // ─── TRAVEL ───
    if (rateCard?.driveTimeCharge?.enabled) {
        lineItems.push({
            id: generateId(),
            type: 'travel',
            description: 'Service Call / Trip Charge',
            quantity: 1,
            unit: 'flat',
            unitPrice: rateCard.driveTimeCharge.rate || 50,
            total: rateCard.driveTimeCharge.rate || 50,
            taxable: false,
            isOptional: false,
            notes: 'Includes travel to and from job site'
        });
    }

    // ─── MATERIALS ───
    const rawParts = aiAnalysis?.partsNeeded || [];
    const partsMap = new Map<string, any>();
    for (const p of rawParts) {
        if (!p || !p.name) continue;
        const normKey = getCanonicalMaterialKey(p.name);
        if (!normKey) continue;

        if (partsMap.has(normKey)) {
            const existing = partsMap.get(normKey);
            existing.quantity = Math.max(Number(existing.quantity) || 1, Number(p.quantity) || 1);
            if (p.essential) existing.essential = true;
        } else {
            partsMap.set(normKey, { ...p });
        }
    }
    const parts = Array.from(partsMap.values());

    for (const part of parts) {
        const qty = Number(part.quantity) || 1;
        const matchingMaterials = findAllMaterialMatches(part.name, orgMaterials);
        const inventoryMatch = matchingMaterials[0] || findMaterialMatch(part.name, orgMaterials);

        let baseCost = 25; // fallback
        let priceSource: 'vendor' | 'inventory' | 'ai_estimate' | 'fallback' = 'fallback';
        let vendorName: string | undefined;
        let vendorProductUrl: string | undefined;
        let stockQuantity: number | undefined;
        let vendorPriceFound = false;

        const alternateVendorsMap = new Map<string, {
            vendorId: string;
            vendorName: string;
            unitCost: number;
            vendorProductUrl?: string;
            estimatedDeliveryDays?: number;
        }>();

        // 1. Collect all vendor options from all matching inventory records
        for (const matMatch of matchingMaterials) {
            stockQuantity = Math.max(stockQuantity ?? 0, matMatch.quantity ?? 0);
            const vendors = matMatch.vendors as any[] | undefined;
            if (vendors && vendors.length > 0) {
                for (const v of vendors) {
                    if (v.unitCost != null && v.unitCost > 0) {
                        const vKey = `${(v.vendorName || v.vendorId || 'vendor').toLowerCase()}_${v.unitCost.toFixed(2)}`;
                        alternateVendorsMap.set(vKey, {
                            vendorId: v.vendorId || v.vendorName || '',
                            vendorName: v.vendorName || 'Unknown Vendor',
                            unitCost: v.unitCost,
                            vendorProductUrl: v.vendorProductUrl || undefined,
                            estimatedDeliveryDays: v.estimatedDeliveryDays || undefined,
                        });
                    }
                }
            }
            if (matMatch.unitCost && matMatch.unitCost > 0) {
                const vName = matMatch.vendorName || 'Inventory';
                const vKey = `${vName.toLowerCase()}_${matMatch.unitCost.toFixed(2)}`;
                alternateVendorsMap.set(vKey, {
                    vendorId: matMatch.id || vName,
                    vendorName: vName,
                    unitCost: matMatch.unitCost,
                    vendorProductUrl: matMatch.vendorProductUrl || undefined,
                });
            }
        }

        // Set lowest cost or preferred vendor from inventory matches if present
        if (alternateVendorsMap.size > 0) {
            const allVendorsList = Array.from(alternateVendorsMap.values());
            allVendorsList.sort((a, b) => a.unitCost - b.unitCost);
            const lowest = allVendorsList[0];
            baseCost = lowest.unitCost;
            vendorName = lowest.vendorName;
            vendorProductUrl = lowest.vendorProductUrl;
            priceSource = 'vendor';
            vendorPriceFound = true;
        } else if (inventoryMatch?.unitCost && inventoryMatch.unitCost > 0) {
            baseCost = inventoryMatch.unitCost;
            priceSource = 'inventory';
        }

        // 2. Search org vendors for this product to get live catalog pricing & alternates for ALL vendors
        if (orgVendors.length > 0) {
            try {
                const searchRes = await searchVendorsForMaterial(part.name, orgVendors);
                if (searchRes) {
                    if (searchRes.bestVendor) {
                        const bestVKey = `${searchRes.bestVendor.vendorName.toLowerCase()}_${searchRes.bestVendor.price.toFixed(2)}`;
                        if (!alternateVendorsMap.has(bestVKey)) {
                            alternateVendorsMap.set(bestVKey, {
                                vendorId: searchRes.bestVendor.vendorName,
                                vendorName: searchRes.bestVendor.vendorName,
                                unitCost: searchRes.bestVendor.price,
                                vendorProductUrl: searchRes.bestVendor.productUrl,
                            });
                        }
                        if (!vendorPriceFound || searchRes.bestVendor.price < baseCost) {
                            baseCost = searchRes.bestVendor.price;
                            priceSource = 'vendor';
                            vendorName = searchRes.bestVendor.vendorName;
                            vendorProductUrl = searchRes.bestVendor.productUrl;
                            vendorPriceFound = true;
                        }
                    }
                    for (const alt of searchRes.alternateVendors) {
                        const vKey = `${alt.vendorName.toLowerCase()}_${alt.unitCost.toFixed(2)}`;
                        if (!alternateVendorsMap.has(vKey)) {
                            alternateVendorsMap.set(vKey, alt);
                        }
                    }
                }
            } catch (err) {
                console.warn(`Vendor search failed for "${part.name}":`, err);
            }
        }

        // Final fallback: AI estimate
        if (!vendorPriceFound && priceSource !== 'inventory') {
            if (part.estimatedCost && part.estimatedCost > 0) {
                baseCost = part.estimatedCost;
                priceSource = 'ai_estimate';
            }
        }

        const activeVendorKey = (vendorName || '').toLowerCase();
        const finalAlternateVendors = Array.from(alternateVendorsMap.values())
            .filter(v => (v.vendorName || '').toLowerCase() !== activeVendorKey);

        const name = inventoryMatch?.name || part.name;
        const markupMultiplier = 1 + (materialMarkup / 100);
        const customerPrice = Math.round(baseCost * markupMultiplier * 100) / 100;

        lineItems.push({
            id: generateId(),
            type: 'material',
            description: name,
            quantity: qty,
            unit: inventoryMatch?.unit || 'each',
            baseCost,
            markupPercentage: materialMarkup,
            unitPrice: customerPrice,
            total: qty * customerPrice,
            taxable: true,
            materialId: inventoryMatch?.id || null,
            isOptional: !part.essential,
            priceSource,
            vendorName: vendorName || undefined,
            vendorProductUrl: vendorProductUrl || undefined,
            alternateVendors: finalAlternateVendors.length > 0 ? finalAlternateVendors : undefined,
            stockQuantity: stockQuantity ?? undefined,
            notes: priceSource === 'vendor'
                ? `Vendor: ${vendorName || 'Preferred supplier'} (${stockQuantity ?? 0} in stock)`
                : priceSource === 'inventory'
                    ? `From inventory (${stockQuantity ?? 0} in stock)`
                    : priceSource === 'ai_estimate'
                        ? 'AI estimated cost — may need sourcing'
                        : 'Fallback pricing — verify before sending'
        });
    }

    // ─── EQUIPMENT / TOOLS ───
    const tools = (aiAnalysis?.toolsRequired || []).filter((t: any) => !t.owned);
    for (const tool of tools) {
        lineItems.push({
            id: generateId(),
            type: 'equipment',
            description: `${tool.name} — ${tool.essential ? 'Required' : 'Recommended'} Equipment`,
            quantity: 1,
            unit: 'day',
            unitPrice: equipmentDayRate,
            total: equipmentDayRate,
            taxable: true,
            isOptional: !tool.essential,
            notes: 'Specialty equipment — rental may apply'
        });
    }

    // ─── TOTALS ───
    const nonOptional = lineItems.filter((i: any) => !i.isOptional);
    const subtotal = lineItems.reduce((sum: number, i: any) => sum + i.total, 0);
    const taxableAmount = nonOptional.filter((i: any) => i.taxable).reduce((sum: number, i: any) => sum + i.total, 0);
    const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
    const total = Math.round((nonOptional.reduce((s: number, i: any) => s + i.total, 0) + taxAmount) * 100) / 100;

    const year = new Date().getFullYear();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const quoteNumber = `Q-${year}-${randomNum}`;

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    // Build scope of work
    const scopeParts: string[] = [];
    if (aiAnalysis?.diagnosis) scopeParts.push(`Assessment: ${aiAnalysis.diagnosis}`);
    if (aiAnalysis?.solution) scopeParts.push(`\nProposed Work:\n${aiAnalysis.solution}`);
    scopeParts.push(`\nCustomer Request: ${info.description}`);

    // Strip undefined fields to prevent Firestore errors
    const cleanLineItems = lineItems.map((item: any) => {
        const clean: any = {};
        for (const [k, v] of Object.entries(item)) {
            if (v !== undefined && v !== null) clean[k] = v;
        }
        return clean;
    });

    const quoteDoc: any = {
        org_id: orgId,
        job_id: jobId,
        customer_id: info.customerId || '',
        tech_id: '',  // No tech assigned yet
        customer: {
            name: info.customerName,
            email: info.customerEmail || undefined,
            phone: info.customerPhone || undefined,
            address: info.address || undefined
        },
        quoteNumber,
        version: 1,
        scopeOfWork: scopeParts.join('\n') || info.description,
        lineItems: cleanLineItems,
        subtotal,
        taxRate,
        taxAmount,
        discount: 0,
        total,
        overrunProtection: {
            enabled: true,
            maxOverrunPercent: 15,
            overrunApprovalRequired: true,
            customerAgreed: false
        },
        estimatedDuration: estimatedMinutes,
        validUntil: validUntil.toISOString(),
        agreement: {
            termsVersion: '1.0',
            jurisdictionState: rateCard?.jurisdictionState || extractStateFromAddress(info.address) || (() => {
                // Last resort: check org service locations
                const locs = orgSettings?.serviceLocations || [];
                if (locs.length > 0) return locs[0].state || 'HI';
                return 'HI';
            })(),
            requiresDeposit: total >= 500,
            signatureRequired: true
        },
        status: 'draft',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'AI Auto-Quote'
    };
    if (total >= 500) {
        quoteDoc.agreement.depositAmount = Math.round(total * 0.5 * 100) / 100;
    }

    const cleanDoc = sanitizeForFirestore(quoteDoc);
    const quoteRef = await db.collection('quotes').add(cleanDoc);
    return quoteRef.id;
}

export function getCanonicalMaterialKey(name: string): string {
    if (!name) return '';
    let lower = name
        .toLowerCase()
        .replace(/\(optional\)/gi, '')
        .replace(/\(required\)/gi, '')
        .replace(/\(essential\)/gi, '')
        .trim();

    const synonymGroups: string[][] = [
        ['teflon', 'ptfe', 'thread seal', 'pipe sealant', 'sealant tape', 'plumber tape', 'plumbers tape', 'pipe tape'],
        ['plumber putty', 'plumbers putty', 'pipe putty', 'plumbing putty', 'putty'],
        ['wax ring', 'wax seal', 'toilet seal', 'closet seal', 'toilet wax'],
        ['supply line', 'supply tube', 'supply hose', 'braided supply', 'toilet supply', 'faucet supply'],
        ['closet bolt', 'toilet bolt', 'flange bolt', 'brass bolt'],
        ['caulk', 'silicone', 'sealant', 'bathroom caulk', 'kitchen caulk'],
        ['mixing valve', 'shower valve', 'shower cartridge', 'mixing valve cartridge', 'valve cartridge'],
        ['diverter spout', 'tub spout', 'bath spout', 'tub diverter']
    ];

    for (const group of synonymGroups) {
        if (group.some(alias => lower.includes(alias))) {
            return group[0].replace(/[^a-z0-9]/g, '');
        }
    }

    return lower.replace(/[^a-z0-9]/g, '');
}

export function findAllMaterialMatches(partName: string, materials: any[]): any[] {
    if (!materials || !materials.length || !partName) return [];
    const partKey = getCanonicalMaterialKey(partName);

    return materials.filter(m => {
        if (!m || !m.name) return false;
        const mKey = getCanonicalMaterialKey(m.name);
        if (mKey === partKey) return true;
        const pClean = partName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const mClean = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return pClean.length > 3 && mClean.length > 3 && (pClean.includes(mClean) || mClean.includes(pClean));
    });
}

function findMaterialMatch(name: string, materials: any[]): any | null {
    const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!normalized) return null;

    // 1. Exact match
    let match = materials.find((m: any) => (m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim() === normalized);
    if (match) return match;

    const majorCategories = new Set(['toilet', 'sink', 'faucet', 'shower', 'tub', 'bathtub', 'ac', 'hvac', 'boiler', 'furnace', 'pipe', 'water heater', 'drain', 'pump', 'unit', 'fixture', 'appliance', 'disposal']);

    // 2. Inventory item name contains the recommended part name
    match = materials.find((m: any) => {
        const mName = (m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        return mName.length >= normalized.length && mName.includes(normalized);
    });
    if (match) return match;

    // 3. Recommended part name contains inventory item name (if not generic major category)
    match = materials.find((m: any) => {
        const mName = (m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        if (majorCategories.has(mName)) return false;
        return mName.length >= 4 && normalized.includes(mName);
    });
    if (match) return match;

    // 3. Word overlap match (at least 50% of significant words match)
    const stopWords = new Set(['a', 'an', 'the', 'for', 'and', 'or', 'of', 'in', 'to', 'with', 'x', 'inch', 'ft', 'set', 'kit', 'type', 'style', 'standard', 'premium', 'pro', 'heavy', 'duty']);
    const nameWords = normalized.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));

    if (nameWords.length > 0) {
        let bestMatch: any = null;
        let bestScore = 0;

        for (const m of materials) {
            const mName = (m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            const mWords = mName.split(/\s+/).filter((w: string) => w.length > 1 && !stopWords.has(w));
            if (mWords.length === 0) continue;

            // Count word matches (including partial/stem matches)
            let matches = 0;
            for (const nw of nameWords) {
                if (mWords.some((mw: string) => mw.includes(nw) || nw.includes(mw))) {
                    matches++;
                }
            }
            const score = matches / Math.max(nameWords.length, 1);
            if (score > bestScore && score >= 0.5) {
                bestScore = score;
                bestMatch = m;
            }
        }
        if (bestMatch) return bestMatch;
    }

    // 4. Synonym/alias matching — common trade product equivalencies
    const synonymGroups: string[][] = [
        ['teflon', 'ptfe', 'thread seal', 'pipe sealant', 'sealant tape', 'plumber tape', 'plumbers tape'],
        ['wax ring', 'wax seal', 'toilet seal', 'closet seal', 'toilet wax'],
        ['supply line', 'supply tube', 'supply hose', 'braided supply', 'toilet supply', 'faucet supply'],
        ['closet bolt', 'toilet bolt', 'flange bolt', 'brass bolt'],
        ['caulk', 'silicone', 'sealant', 'bathroom caulk', 'kitchen caulk'],
        ['showerhead', 'shower head', 'shower nozzle'],
        ['faucet', 'tap', 'spigot'],
        ['valve', 'shut off', 'shutoff', 'stop valve', 'gate valve', 'ball valve'],
        ['pipe', 'tubing', 'tube', 'copper pipe', 'pex pipe', 'pvc pipe'],
        ['toilet', 'commode', 'water closet'],
        ['bidet', 'bidet attachment', 'bidet seat'],
        ['drain', 'p trap', 'trap', 'drain assembly'],
        ['fitting', 'connector', 'coupling', 'adapter', 'elbow', 'tee'],
        ['nail', 'nails', 'brad', 'tack', 'fastener'],
        ['screw', 'screws', 'wood screw', 'drywall screw', 'machine screw'],
        ['drill bit', 'drill bits', 'bit set', 'twist drill'],
    ];

    for (const group of synonymGroups) {
        const queryMatchesSynonym = group.some(alias => normalized.includes(alias) || alias.includes(normalized));
        if (!queryMatchesSynonym) continue;

        // Find any inventory item that also matches this synonym group
        match = materials.find((m: any) => {
            const mName = (m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            const mDesc = (m.description || '').toLowerCase();
            return group.some(alias => mName.includes(alias) || alias.includes(mName) || mDesc.includes(alias));
        });
        if (match) return match;
    }

    return null;
}

/**
 * Search the org's configured vendors for a specific material product.
 * Uses Gemini with Google Search grounding + Firestore cache (30-day TTL).
 * Returns the best (lowest) price result across all vendors, or null.
 */
export async function searchVendorsForMaterial(
    materialName: string,
    orgVendors: any[]
): Promise<{
    bestVendor: { price: number; vendorName: string; productUrl: string; productTitle: string } | null;
    alternateVendors: Array<{ vendorId: string; vendorName: string; unitCost: number; vendorProductUrl?: string }>;
} | null> {
    if (!orgVendors.length || !materialName) return null;

    const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    interface VendorHit {
        price: number;
        vendorName: string;
        productUrl: string;
        productTitle: string;
    }
    const results: VendorHit[] = [];

    // Search each vendor (in parallel for speed)
    await Promise.all(orgVendors.map(async (vendor) => {
        const vName = vendor.name || '';
        const vWebsite = vendor.website || '';
        if (!vName) return;

        const cacheKey = `${normalizeName(vName)}_${normalizeName(materialName)}`;
        const cacheRef = db.collection('vendor_catalog_cache').doc(cacheKey);

        try {
            // Check cache first
            const cacheDoc = await cacheRef.get();
            if (cacheDoc.exists) {
                const cached = cacheDoc.data();
                const lastUpdatedMs = cached?.lastUpdated?.toMillis() || 0;
                if (cached?.products && Array.isArray(cached.products) && cached.products.length > 0 && (now - lastUpdatedMs < thirtyDaysMs)) {
                    // Parse cached prices
                    for (const p of cached.products) {
                        const price = parseVendorPrice(p.price);
                        if (price > 0) {
                            results.push({
                                price,
                                vendorName: vName,
                                productUrl: p.url || vWebsite,
                                productTitle: p.title || materialName,
                            });
                        }
                    }
                    return; // Cache hit, skip AI call
                }
            }

            // Cache miss — use Gemini + Google Search to find products
            const modelName = await getLatestFlashModelName();
            const model = genAI.getGenerativeModel({
                model: modelName,
                tools: [{ googleSearch: {} }] as any
            });

            const prompt = `You are a procurement search assistant. Find a product and its current price.

Vendor: ${vName}
Vendor Website: ${vWebsite || 'Not provided'}
Product to find: ${materialName}

INSTRUCTIONS:
1. Search for "${materialName}" sold by "${vName}".
2. Find 1-3 matching products with real prices.
3. If you cannot find the exact price from ${vName}, estimate a realistic retail price.
4. Paraphrase product titles (do not copy exactly).

Return ONLY a JSON array:
[{"title": "Product Name", "price": "$12.99", "url": "https://vendor.com/search", "description": "Brief description"}]

If no products found, return [].`;

            const result = await model.generateContent(prompt);
            const response = await result.response;

            if (response.usageMetadata?.totalTokenCount) {
                await logGeminiUsage(
                    response.usageMetadata.totalTokenCount,
                    modelName,
                    'quoteVendorSearch'
                ).catch(() => {});
            }

            let jsonText = response.text().trim();
            if (jsonText.startsWith('```json')) {
                jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            } else if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```\n?/g, '');
            }

            let products: any[] = [];
            try { products = JSON.parse(jsonText); } catch { products = []; }

            // Cache the result
            if (products && Array.isArray(products) && products.length > 0) {
                await cacheRef.set({
                    vendorName: vName,
                    searchTerm: materialName,
                    products,
                    lastUpdated: admin.firestore.Timestamp.now()
                }, { merge: true }).catch(() => {});
            }

            // Parse prices from response
            for (const p of products) {
                const price = parseVendorPrice(p.price);
                if (price > 0) {
                    results.push({
                        price,
                        vendorName: vName,
                        productUrl: p.url || vWebsite,
                        productTitle: p.title || materialName,
                    });
                }
            }
        } catch (err) {
            console.warn(`Vendor search for "${materialName}" at "${vName}" failed:`, err);
        }
    }));

    if (results.length === 0) return null;

    // Sort by price (lowest first)
    results.sort((a, b) => a.price - b.price);
    const bestVendor = results[0];

    const alternateVendors: Array<{ vendorId: string; vendorName: string; unitCost: number; vendorProductUrl?: string }> = [];
    const seenVendorNames = new Set<string>([bestVendor.vendorName.toLowerCase()]);

    for (let i = 1; i < results.length; i++) {
        const r = results[i];
        const vKey = r.vendorName.toLowerCase();
        if (!seenVendorNames.has(vKey)) {
            seenVendorNames.add(vKey);
            alternateVendors.push({
                vendorId: r.vendorName,
                vendorName: r.vendorName,
                unitCost: r.price,
                vendorProductUrl: r.productUrl,
            });
        }
    }

    return { bestVendor, alternateVendors };
}

/**
 * Parse a price string like "$12.99" or "12.99" into a number.
 */
function parseVendorPrice(priceStr: any): number {
    if (typeof priceStr === 'number') return priceStr;
    if (typeof priceStr !== 'string') return 0;
    const cleaned = priceStr.replace(/[^0-9.]/g, '');
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
}

function getServiceVerbFromDesc(desc: string): string {
    const d = (desc || '').toLowerCase();
    if (d.includes('install')) return 'Installation';
    if (d.includes('replac')) return 'Replacement';
    if (d.includes('repair')) return 'Repair';
    if (d.includes('inspect') || d.includes('check')) return 'Inspection & Service';
    if (d.includes('clean')) return 'Cleaning & Maintenance';
    if (d.includes('unclog') || d.includes('drain')) return 'Drain Service';
    if (d.includes('leak')) return 'Leak Repair';
    if (d.includes('water heater')) return 'Water Heater Service';
    if (d.includes('ac ') || d.includes('air condition') || d.includes('hvac')) return 'HVAC Service';
    if (d.includes('electric')) return 'Electrical Work';
    if (d.includes('plumb')) return 'Plumbing Service';
    return 'Service & Repair';
}

function generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Public endpoint to check technician availability for a given date.
 * DOES NOT require authentication — used by the public portal scheduler.
 */
export const checkPortalAvailability = functions.https.onCall(async (data) => {
    const { slug, date } = data; // date = 'YYYY-MM-DD'

    if (!slug || !date) {
        throw new functions.https.HttpsError('invalid-argument', 'slug and date are required');
    }

    try {
        // Find org by slug
        let orgSnapshot = await db.collection('organizations')
            .where('slug', '==', slug).limit(1).get();
        if (orgSnapshot.empty) {
            orgSnapshot = await db.collection('organizations')
                .where('portalConfig.slug', '==', slug).limit(1).get();
        }
        if (orgSnapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Organization not found');
        }

        const orgId = orgSnapshot.docs[0].id;
        const orgData = orgSnapshot.docs[0].data();

        // Get active technicians
        const techsSnap = await db.collection('technicians')
            .where('orgId', '==', orgId)
            .where('status', '==', 'active')
            .get();

        // For solo operators with no tech records, assume 1 tech
        const totalTechs = Math.max(1, techsSnap.size);

        // Query scheduled jobs for the requested date
        const startOfDay = new Date(`${date}T00:00:00`);
        const endOfDay = new Date(`${date}T23:59:59`);
        const startTs = admin.firestore.Timestamp.fromDate(startOfDay);
        const endTs = admin.firestore.Timestamp.fromDate(endOfDay);

        const jobsSnap = await db.collection('jobs')
            .where('org_id', '==', orgId)
            .where('status', '==', 'scheduled')
            .where('scheduled_at', '>=', startTs)
            .where('scheduled_at', '<=', endTs)
            .get();

        let morningJobs = 0;
        let afternoonJobs = 0;
        const bookedSlots: string[] = [];

        jobsSnap.forEach(doc => {
            const d = doc.data();
            const jobDate = d.scheduled_at.toDate();
            const hour = jobDate.getHours();
            if (hour < 12) {
                morningJobs++;
                bookedSlots.push('morning');
            } else {
                afternoonJobs++;
                bookedSlots.push('afternoon');
            }
        });

        // Capacity: each tech can handle ~2 morning + 2 afternoon jobs
        const maxMorning = totalTechs * 2;
        const maxAfternoon = totalTechs * 2;

        const morningAvailable = morningJobs < maxMorning;
        const afternoonAvailable = afternoonJobs < maxAfternoon;

        // Check if the date is a day off (weekend or org-specific)
        const dayOfWeek = startOfDay.getDay(); // 0=Sun, 6=Sat
        const businessHours = orgData?.businessHours || orgData?.portalConfig?.businessHours;
        let dayOff = false;

        if (businessHours) {
            // If org specifies business hours, check if this day is enabled
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayConfig = businessHours[dayNames[dayOfWeek]];
            if (dayConfig && dayConfig.closed === true) dayOff = true;
        } else {
            // Default: closed on Sundays
            dayOff = dayOfWeek === 0;
        }

        const slots = [];
        if (!dayOff) {
            if (morningAvailable) {
                slots.push({
                    id: 'morning',
                    label: 'Morning (8 AM – 12 PM)',
                    available: true,
                    remaining: maxMorning - morningJobs
                });
            } else {
                slots.push({
                    id: 'morning',
                    label: 'Morning (8 AM – 12 PM)',
                    available: false,
                    remaining: 0
                });
            }
            if (afternoonAvailable) {
                slots.push({
                    id: 'afternoon',
                    label: 'Afternoon (12 PM – 5 PM)',
                    available: true,
                    remaining: maxAfternoon - afternoonJobs
                });
            } else {
                slots.push({
                    id: 'afternoon',
                    label: 'Afternoon (12 PM – 5 PM)',
                    available: false,
                    remaining: 0
                });
            }
        }

        return {
            date,
            dayOff,
            slots,
            totalTechs,
            message: dayOff
                ? 'We are closed on this day. Please select another date.'
                : (!morningAvailable && !afternoonAvailable)
                    ? 'This day is fully booked. Please try another date.'
                    : 'Availability found!'
        };
    } catch (error: any) {
        console.error('checkPortalAvailability failed:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to check availability');
    }
});

/**
 * Public endpoint to submit a scheduled booking with prerequisites.
 * Accepts customer info + requested time slot + prerequisite acknowledgements.
 * DOES NOT require authentication.
 */
export const submitPortalScheduledBooking = functions.https.onCall(async (data) => {
    const {
        slug,
        customerName,
        customerPhone,
        customerEmail,
        address,
        description,
        urgency,
        requestedDate,   // 'YYYY-MM-DD'
        requestedSlot,   // 'morning' | 'afternoon'
        prerequisites,    // { waiverAgreed: boolean, ccOnFile?: boolean, termsAgreed: boolean }
        photoUrls         // string[] - customer-uploaded photo URLs
    } = data;

    if (!slug || !customerName || !description || !requestedDate || !requestedSlot) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    if (!prerequisites?.termsAgreed) {
        throw new functions.https.HttpsError('failed-precondition', 'You must agree to the terms before scheduling');
    }

    try {
        // Find org by slug
        let orgSnapshot = await db.collection('organizations')
            .where('slug', '==', slug).limit(1).get();
        if (orgSnapshot.empty) {
            orgSnapshot = await db.collection('organizations')
                .where('portalConfig.slug', '==', slug).limit(1).get();
        }
        if (orgSnapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Organization not found');
        }

        const orgId = orgSnapshot.docs[0].id;

        // Re-verify availability before committing
        const startOfDay = new Date(`${requestedDate}T00:00:00`);
        const endOfDay = new Date(`${requestedDate}T23:59:59`);
        const startTs = admin.firestore.Timestamp.fromDate(startOfDay);
        const endTs = admin.firestore.Timestamp.fromDate(endOfDay);

        const jobsSnap = await db.collection('jobs')
            .where('org_id', '==', orgId)
            .where('status', '==', 'scheduled')
            .where('scheduled_at', '>=', startTs)
            .where('scheduled_at', '<=', endTs)
            .get();

        let relevantJobs = 0;
        jobsSnap.forEach(doc => {
            const d = doc.data();
            const jobDate = d.scheduled_at.toDate();
            const hour = jobDate.getHours();
            if (requestedSlot === 'morning' && hour < 12) relevantJobs++;
            if (requestedSlot === 'afternoon' && hour >= 12) relevantJobs++;
        });

        const techsSnap = await db.collection('technicians')
            .where('orgId', '==', orgId)
            .where('status', '==', 'active')
            .get();
        const totalTechs = Math.max(1, techsSnap.size);
        const maxCapacity = totalTechs * 2;

        if (relevantJobs >= maxCapacity) {
            throw new functions.https.HttpsError(
                'resource-exhausted',
                `Sorry, the ${requestedSlot} on ${requestedDate} is no longer available. Please select a different time.`
            );
        }

        // Match or create customer
        let customerRef = null;
        let matchedName = customerName;

        if (customerPhone) {
            const custSnap = await db.collection('customers')
                .where('phone', '==', customerPhone)
                .where('organizationId', '==', orgId)
                .limit(1).get();
            if (!custSnap.empty) {
                customerRef = custSnap.docs[0].ref;
                matchedName = custSnap.docs[0].data().name || customerName;
            }
        } else if (customerEmail) {
            const custSnap = await db.collection('customers')
                .where('email', '==', customerEmail)
                .where('organizationId', '==', orgId)
                .limit(1).get();
            if (!custSnap.empty) {
                customerRef = custSnap.docs[0].ref;
                matchedName = custSnap.docs[0].data().name || customerName;
            }
        }

        // Set scheduled_at based on slot
        const scheduledHour = requestedSlot === 'morning' ? 9 : 13;
        const scheduledAt = new Date(`${requestedDate}T${scheduledHour.toString().padStart(2, '0')}:00:00`);

        // Create the ticket with scheduling info
        const ticketData: any = {
            requestorName: customerName,
            requestorPhone: customerPhone || null,
            requestorEmail: customerEmail || null,
            address: address || null,
            description: `[Scheduled Portal Booking]\nDate: ${requestedDate}\nSlot: ${requestedSlot === 'morning' ? 'Morning (8 AM – 12 PM)' : 'Afternoon (12 PM – 5 PM)'}\nUrgency: ${urgency || 'Normal'}\n\n${description}`,
            source: "WEBSITE_PORTAL_SCHEDULED",
            status: "PENDING",
            organizationId: orgId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {
                urgency: urgency || "normal",
                requestedDate,
                requestedSlot,
                scheduledAt: admin.firestore.Timestamp.fromDate(scheduledAt),
                prerequisites: {
                    waiverAgreed: prerequisites.waiverAgreed || false,
                    ccOnFile: prerequisites.ccOnFile || false,
                    termsAgreed: prerequisites.termsAgreed || false,
                    agreedAt: admin.firestore.FieldValue.serverTimestamp()
                }
            }
        };

        if (customerRef) {
            ticketData.customerRef = customerRef;
            ticketData.customerName = matchedName;
        }

        const ticketRef = await db.collection('tickets').add(ticketData);

        // Store customer-uploaded photo URLs on the ticket
        if (photoUrls && Array.isArray(photoUrls) && photoUrls.length > 0) {
            await ticketRef.update({ photoUrls });
        }

        // ═══════════════════════════════════════════════════════════════
        // FAST RETURN: AI analysis + quote generation is handled
        // asynchronously by the onNewTicketCreated Firestore trigger.
        // ═══════════════════════════════════════════════════════════════

        // ═══ Generate a ticket-only access token ═══
        let accessTokens: Record<string, string> = {};
        try {
            accessTokens = await createAccessTokenBatch({
                resources: [
                    { resourceType: 'ticket', resourceId: ticketRef.id, permissions: ['view', 'reschedule'] }
                ],
                orgId,
                customerPhone: customerPhone || undefined,
                customerEmail: customerEmail || undefined,
                customerName: customerName || undefined,
                createdBy: 'portal',
                expiresInDays: 90,
            });
        } catch (tokenErr) {
            console.error('Access token generation failed (non-fatal):', tokenErr);
        }

        // ═══ Create job_photos records from customer-uploaded photos ═══
        if (photoUrls && Array.isArray(photoUrls) && photoUrls.length > 0) {
            try {
                const batch = db.batch();
                for (const url of photoUrls) {
                    const photoRef = db.collection('job_photos').doc();
                    batch.set(photoRef, {
                        job_id: ticketRef.id, // will be re-linked when the background job is created
                        ticket_id: ticketRef.id,
                        org_id: orgId,
                        type: 'customer',
                        url: url,
                        takenAt: admin.firestore.FieldValue.serverTimestamp(),
                        takenBy: 'portal_customer',
                        uploadedBy: customerName || 'Customer',
                        source: 'portal',
                    });
                }
                await batch.commit();
            } catch (photoErr) {
                console.error('Creating job_photos records failed (non-fatal):', photoErr);
            }
        }

        return {
            success: true,
            ticketId: ticketRef.id,
            scheduledDate: requestedDate,
            scheduledSlot: requestedSlot,
            message: `Your appointment has been scheduled for ${requestedSlot === 'morning' ? 'morning (8 AM \u2013 12 PM)' : 'afternoon (12 PM \u2013 5 PM)'} on ${requestedDate}. We'll send you a confirmation email shortly.`,
            accessTokens,
        };
    } catch (error: any) {
        if (error instanceof functions.https.HttpsError) throw error;
        console.error('submitPortalScheduledBooking failed:', error);
        throw new functions.https.HttpsError('internal', `Scheduling failed: ${error.message}`);
    }
});
