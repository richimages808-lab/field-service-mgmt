import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getFlashModel, getLatestFlashModelName } from './ai/aiConfig';
import { logGeminiUsage } from './billing';

const db = admin.firestore();

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
    const { slug, customerName, customerPhone, customerEmail, address, description, urgency } = data;

    if (!slug || !customerName || !description) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
        // Find the organization by slug
        const orgSnapshot = await db.collection('organizations')
            .where('portalConfig.slug', '==', slug)
            .limit(1)
            .get();

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
        const ticketData: any = {
            requestorName: customerName,
            requestorPhone: customerPhone || null,
            requestorEmail: customerEmail || null,
            address: address || null,
            description: `[Public Portal Request]\nUrgency: ${urgency || 'Normal'}\n\n${description}`,
            source: "WEBSITE_PORTAL",
            status: "PENDING",
            organizationId: orgId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {
                urgency: urgency || "normal"
            }
        };

        if (customerRef) {
            ticketData.customerRef = customerRef;
            ticketData.customerName = matchedName;
        }

        const ticketRef = await db.collection('tickets').add(ticketData);

        return {
            success: true,
            ticketId: ticketRef.id,
            message: 'Your request has been submitted successfully'
        };
    } catch (error: any) {
        console.error('Portal booking failed:', error);
        throw new functions.https.HttpsError('internal', `Booking failed: ${error.message}`);
    }
});
