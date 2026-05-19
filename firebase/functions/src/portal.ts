import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getFlashModel, getLatestFlashModelName } from './ai/aiConfig';
import { logGeminiUsage } from './billing';
import { createAccessTokenBatch } from './accessTokens';

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
    const { slug, customerName, customerPhone, customerEmail, address, description, urgency, intent } = data;
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

        const ticketRef = await db.collection('tickets').add(ticketData);

        // ═══════════════════════════════════════════════════════════════
        // AUTO-CREATE JOB + AI QUOTE (awaited to prevent early termination)
        // Cloud Functions terminate async work when response is sent,
        // so we must await this before returning.
        // ═══════════════════════════════════════════════════════════════
        const orgDoc = await db.collection('organizations').doc(orgId).get();
        // For quote requests, always auto-generate a quote regardless of org setting
        const autoQuoteEnabled = isQuoteRequest || (orgDoc.exists ? orgDoc.data()?.autoQuoteEnabled === true : false);

        let autoQuoteResult: { jobId?: string; quoteId?: string } = {};

        if (autoQuoteEnabled) {
            try {
                autoQuoteResult = await autoCreateJobAndQuote(orgId, ticketRef.id, {
                    customerName: matchedName,
                    customerPhone: customerPhone || '',
                    customerEmail: customerEmail || '',
                    address: address || '',
                    description,
                    urgency: urgency || 'normal',
                    customerId: customerRef ? customerRef.id : null
                });
            } catch (err) {
                console.error('Auto-quote generation failed (non-fatal):', err);
                // Non-fatal — ticket was still created, just no auto-quote
            }
        }

        // ═══ Generate access tokens for all created resources ═══
        let accessTokens: Record<string, string> = {};
        try {
            const tokenResources: Array<{ resourceType: any; resourceId: string; permissions: any[] }> = [
                { resourceType: 'ticket', resourceId: ticketRef.id, permissions: ['view'] }
            ];
            if (autoQuoteResult.jobId) {
                tokenResources.push({ resourceType: 'job', resourceId: autoQuoteResult.jobId, permissions: ['view', 'reschedule'] });
            }
            if (autoQuoteResult.quoteId) {
                tokenResources.push({ resourceType: 'quote', resourceId: autoQuoteResult.quoteId, permissions: ['view', 'approve', 'decline'] });
            }
            accessTokens = await createAccessTokenBatch({
                resources: tokenResources,
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

        return {
            success: true,
            ticketId: ticketRef.id,
            message: isQuoteRequest
                ? 'Your quote request has been submitted. We\'ll prepare an estimate for you shortly.'
                : 'Your request has been submitted successfully',
            ...(autoQuoteResult.jobId && { autoJobId: autoQuoteResult.jobId }),
            ...(autoQuoteResult.quoteId && { autoQuoteId: autoQuoteResult.quoteId }),
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
                status: 'pending',
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
                    photos: [],
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
            const analysisPrompt = buildQuoteAnalysisPrompt(info.description, orgId, pastContext);
            const result = await model.generateContent(analysisPrompt);
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
        const rateCard = orgData?.rateCard || { baseHourlyRate: 100, materialMarkup: 30, defaultTaxRate: 0 };

        // 4. Fetch org materials for real costs
        const materialsSnap = await db.collection('materials')
            .where('org_id', '==', orgId)
            .get();
        const orgMaterials = materialsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 5. Generate the quote
        const quoteId = await generateServerSideQuote(
            jobId, orgId, info, rateCard, aiAnalysis, orgMaterials
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
 * Build AI prompt for comprehensive quote analysis
 */
function buildQuoteAnalysisPrompt(description: string, orgId: string, pastContext?: string): string {
    let prompt = `You are an expert tradesman estimator. A customer submitted a service request.

**Customer Description:** ${description}
`;

    if (pastContext) {
        prompt += `
**Past Service History for this Customer:**
This customer has had previous jobs. Please review what materials and tools were actually required for their past jobs to make more accurate and personalized recommendations for this new request:
${pastContext}
`;
    }

    prompt += `
Analyze this request and provide a comprehensive job estimate in JSON format:
{
  "diagnosis": "Brief diagnosis of the likely issue (2-3 sentences)",
  "solution": "Step-by-step recommended solution (3-5 steps)",
  "estimatedDuration": 120,
  "complexity": "simple|medium|complex",
  "confidence": 0.8,
  "partsNeeded": [
    {"name": "Part name", "quantity": 1, "estimatedCost": 25.00, "essential": true}
  ],
  "toolsRequired": [
    {"name": "Tool name", "essential": true, "owned": true}
  ],
  "safetyWarnings": ["Warning 1"],
  "priority": "low|medium|high|critical",
  "priorityReason": "Brief reason for priority level"
}

**Guidelines:**
1. Be thorough with materials — list ALL parts likely needed, including small items (fittings, tape, connectors)
2. Estimate realistic costs based on retail pricing
3. Duration should be in minutes and include diagnostic time
4. Mark essential vs optional items
5. Tools should include both common and specialty tools needed
6. Confidence 0-1 based on how clear the description is
7. If past history is provided, try to anticipate similar or recurring needs for this customer.

Respond ONLY with valid JSON.`;

    return prompt;
}

/**
 * Parse AI response for quote analysis
 */
function parseQuoteAnalysisResponse(text: string): any {
    try {
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }
        return JSON.parse(jsonText);
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
    orgMaterials: any[]
): Promise<string> {
    const estimatedMinutes = aiAnalysis?.estimatedDuration || 120;
    const estimatedHours = Math.max(1, Math.ceil(estimatedMinutes / 60));
    const complexity = aiAnalysis?.complexity || 'medium';
    const hourlyRate = rateCard?.baseHourlyRate || 100;
    const materialMarkup = rateCard?.materialMarkup ?? 30;
    const taxRate = rateCard?.defaultTaxRate || 0;
    const equipmentDayRate = rateCard?.equipmentDayRate || 35;

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

    const repairHours = Math.max(0.5, estimatedHours - diagnosticHours - 0.25);
    lineItems.push({
        id: generateId(),
        type: 'labor',
        description: `${getServiceVerbFromDesc(info.description)} — Labor`,
        quantity: repairHours,
        unit: 'hours',
        unitPrice: hourlyRate,
        total: repairHours * hourlyRate,
        taxable: false,
        isOptional: false,
        notes: aiAnalysis?.solution || 'Repair and service work as described'
    });

    lineItems.push({
        id: generateId(),
        type: 'labor',
        description: 'Testing, Cleanup & Final Inspection',
        quantity: 0.25,
        unit: 'hours',
        unitPrice: hourlyRate,
        total: 0.25 * hourlyRate,
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
    const parts = aiAnalysis?.partsNeeded || [];
    for (const part of parts) {
        const qty = Number(part.quantity) || 1;
        const inventoryMatch = findMaterialMatch(part.name, orgMaterials);
        const baseCost = inventoryMatch?.unitCost || inventoryMatch?.unitPrice || part.estimatedCost || 25;
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
            notes: inventoryMatch
                ? `From inventory (${inventoryMatch.quantity || 0} in stock)`
                : 'Estimated cost — may need sourcing'
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
            jurisdictionState: rateCard?.jurisdictionState || 'CA',
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

    // Strip undefined from customer
    const cleanCustomer: any = {};
    for (const [k, v] of Object.entries(quoteDoc.customer)) {
        if (v !== undefined && v !== null) cleanCustomer[k] = v;
    }
    quoteDoc.customer = cleanCustomer;

    const quoteRef = await db.collection('quotes').add(quoteDoc);
    return quoteRef.id;
}

function findMaterialMatch(name: string, materials: any[]): any | null {
    const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    let match = materials.find((m: any) => m.name?.toLowerCase() === normalized);
    if (match) return match;
    match = materials.find((m: any) => {
        const mName = (m.name || '').toLowerCase();
        return mName.includes(normalized) || normalized.includes(mName);
    });
    return match || null;
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
        prerequisites     // { waiverAgreed: boolean, ccOnFile?: boolean, termsAgreed: boolean }
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
        const orgData = orgSnapshot.docs[0].data();

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

        // Auto-create job + quote if enabled
        const autoQuoteEnabled = orgData?.autoQuoteEnabled === true;
        let autoQuoteResult: { jobId?: string; quoteId?: string } = {};

        if (autoQuoteEnabled) {
            try {
                autoQuoteResult = await autoCreateJobAndQuote(orgId, ticketRef.id, {
                    customerName: matchedName,
                    customerPhone: customerPhone || '',
                    customerEmail: customerEmail || '',
                    address: address || '',
                    description,
                    urgency: urgency || 'normal',
                    customerId: customerRef ? customerRef.id : null
                });

                // Also set the scheduled_at on the auto-created job
                if (autoQuoteResult.jobId) {
                    await db.collection('jobs').doc(autoQuoteResult.jobId).update({
                        scheduled_at: admin.firestore.Timestamp.fromDate(scheduledAt),
                        status: 'scheduled',
                        scheduledSlot: requestedSlot,
                        scheduledByCustomer: true
                    });
                }
            } catch (err) {
                console.error('Auto-quote generation failed (non-fatal):', err);
            }
        }

        // ═══ Generate access tokens for all created resources ═══
        let accessTokens: Record<string, string> = {};
        try {
            const tokenResources: Array<{ resourceType: any; resourceId: string; permissions: any[] }> = [
                { resourceType: 'ticket', resourceId: ticketRef.id, permissions: ['view', 'reschedule'] }
            ];
            if (autoQuoteResult.jobId) {
                tokenResources.push({ resourceType: 'appointment', resourceId: autoQuoteResult.jobId, permissions: ['view', 'reschedule'] });
            }
            if (autoQuoteResult.quoteId) {
                tokenResources.push({ resourceType: 'quote', resourceId: autoQuoteResult.quoteId, permissions: ['view', 'approve', 'decline'] });
            }
            accessTokens = await createAccessTokenBatch({
                resources: tokenResources,
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

        return {
            success: true,
            ticketId: ticketRef.id,
            scheduledDate: requestedDate,
            scheduledSlot: requestedSlot,
            message: `Your appointment has been scheduled for ${requestedSlot === 'morning' ? 'morning (8 AM \u2013 12 PM)' : 'afternoon (12 PM \u2013 5 PM)'} on ${requestedDate}.`,
            ...(autoQuoteResult.jobId && { autoJobId: autoQuoteResult.jobId }),
            ...(autoQuoteResult.quoteId && { autoQuoteId: autoQuoteResult.quoteId }),
            accessTokens,
        };
    } catch (error: any) {
        if (error instanceof functions.https.HttpsError) throw error;
        console.error('submitPortalScheduledBooking failed:', error);
        throw new functions.https.HttpsError('internal', `Scheduling failed: ${error.message}`);
    }
});
