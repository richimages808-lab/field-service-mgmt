/**
 * vapiService.ts — Vapi.ai integration for DispatchBox.
 * Wraps Vapi REST API to create/manage AI phone assistants per customer org.
 * All assistants live under the DispatchBox parent Vapi account.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Vapi config
const VAPI_API_KEY = process.env.VAPI_API_KEY || "";
const VAPI_BASE_URL = "https://api.vapi.ai";
const WEBHOOK_BASE_URL = "https://us-central1-maintenancemanager-c5533.cloudfunctions.net";

// ============================================================
// TYPES
// ============================================================

interface VapiServiceItem {
    name: string;
    description: string;
    priceRange?: string;
}

interface VapiFaqItem {
    question: string;
    answer: string;
}

interface VapiAgentConfig {
    businessName: string;
    businessDescription: string;
    greeting: string;
    services: VapiServiceItem[];
    faqs: VapiFaqItem[];
    businessHours: string;
    serviceArea: string;
    specialInstructions: string;
    voiceId: string;
}

// Available voices (using OpenAI HD voices as they are highly reliable in Vapi)
const VAPI_VOICES: Record<string, { provider: string; voiceId: string; label: string }> = {
    "alloy": { provider: "openai", voiceId: "alloy", label: "Alloy (Neutral, Balanced)" },
    "echo": { provider: "openai", voiceId: "echo", label: "Echo (Male, Warm)" },
    "fable": { provider: "openai", voiceId: "fable", label: "Fable (Male, British, Expressive)" },
    "onyx": { provider: "openai", voiceId: "onyx", label: "Onyx (Male, Deep)" },
    "nova": { provider: "openai", voiceId: "nova", label: "Nova (Female, Professional)" },
    "shimmer": { provider: "openai", voiceId: "shimmer", label: "Shimmer (Female, Clear)" }
};

// ============================================================
// HELPERS
// ============================================================

async function vapiRequest(method: string, path: string, body?: any): Promise<any> {
    if (!VAPI_API_KEY) {
        throw new functions.https.HttpsError("failed-precondition", "VAPI_API_KEY not configured");
    }

    const url = `${VAPI_BASE_URL}${path}`;
    const options: any = {
        method,
        headers: {
            "Authorization": `Bearer ${VAPI_API_KEY}`,
            "Content-Type": "application/json"
        }
    };

    if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Vapi] ${method} ${path} failed (${response.status}):`, errorText);
        throw new Error(`Vapi API error ${response.status}: ${errorText}`);
    }

    // DELETE returns 204 with no body
    if (response.status === 204) return null;

    return response.json();
}

/**
 * Build a highly detailed system prompt from the org's training data.
 * This instructs the Gemini 2.0 Flash model inside Vapi exactly how to behave.
 */
function buildSystemPrompt(config: VapiAgentConfig): string {
    let prompt = `You are a professional, helpful, and highly intelligent AI phone receptionist for a company called "${config.businessName}". 
Callers are speaking with you over the phone. You must sound natural, conversational, and human-like. Keep your responses concise (1-3 sentences maximum) because long monologues on the phone are frustrating for callers.

## Core Identity and Mission
- Your name is the AI Assistant for ${config.businessName}.
- Your primary goal is to provide excellent customer service, answer questions accurately based ONLY on the provided knowledge, and efficiently collect information to schedule services or take messages.
`;

    if (config.businessDescription) {
        prompt += `\n## About the Business\n${config.businessDescription}\n`;
    }

    prompt += `\n## How You Should Behave
1. **Tone:** Warm, professional, confident, and empathetic. 
2. **Conciseness:** Never output long lists or paragraphs. If listing options, only list 1 or 2 at a time and ask if they want to hear more.
3. **Knowledge Boundaries:** NEVER invent information, prices, policies, or services. If a caller asks something not covered in your knowledge base, confidently say: "I don't have that exact information in front of me, but I'd be happy to take down your details and have a specialist call you back to discuss that."
4. **Conversational Flow:** End your turns with a brief, relevant question to keep the conversation moving (e.g., "How can I help you with that today?", "What time works best for you?").

## Handling Service Requests and Messages
When a caller wants to book a service, request a quote, or needs a callback, you MUST collect the following information naturally over the course of the conversation:
- Their first and last name (ask for spelling if necessary)
- Their callback phone number
- The address where service is needed
- A detailed description of the problem or request
- Urgency (is it an emergency?)

Do not interrogate them like a robot. Ask one question at a time. Once you have the information, confirm it briefly and tell them you are creating a ticket for the team.
`;

    if (config.services && config.services.length > 0) {
        prompt += `\n## Services We Offer\n`;
        for (const svc of config.services) {
            prompt += `- **${svc.name}**: ${svc.description}`;
            if (svc.priceRange) {
                prompt += ` (Expected pricing: ${svc.priceRange})`;
            }
            prompt += `\n`;
        }
    }

    if (config.businessHours) {
        prompt += `\n## Business Hours\n${config.businessHours}\n`;
    }

    if (config.serviceArea) {
        prompt += `\n## Service Area\n${config.serviceArea}\n`;
    }

    if (config.faqs && config.faqs.length > 0) {
        prompt += `\n## Frequently Asked Questions (Your Knowledge Base)\nUse these to answer caller questions. Paraphrase naturally, do not read them like a script.\n`;
        for (const faq of config.faqs) {
            prompt += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
        }
    }

    if (config.specialInstructions) {
        prompt += `\n## Custom Business Rules & Special Instructions
Critical instructions from the business owner that you MUST follow:
${config.specialInstructions}
\n`;
    }

    return prompt;
}

// ============================================================
// CLOUD FUNCTIONS
// ============================================================

/**
 * Get available voice options for the agent.
 */
export const getVapiVoices = functions.https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    return {
        voices: Object.entries(VAPI_VOICES).map(([id, voice]) => ({
            id,
            label: voice.label,
            provider: voice.provider,
            voiceId: voice.voiceId
        }))
    };
});

/**
 * Create a new Vapi AI assistant for a customer org.
 */
export const createVapiAssistant = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, config } = data as { orgId: string; config: VapiAgentConfig };

    if (!orgId || !config?.businessName) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId or businessName");
    }

    // Check if org already has an assistant
    const existingDoc = await db.collection("org_vapi_config").doc(orgId).get();
    if (existingDoc.exists && existingDoc.data()?.vapiAssistantId) {
        throw new functions.https.HttpsError("already-exists", "Organization already has an AI phone agent");
    }

    const systemPrompt = buildSystemPrompt(config);
    const voiceConfig = VAPI_VOICES[config.voiceId || "elliot"] || VAPI_VOICES["elliot"];
    const greeting = config.greeting || `Thank you for calling ${config.businessName}. How can I help you today?`;

    try {
        // 1. Create the Vapi assistant
        const assistant = await vapiRequest("POST", "/assistant", {
            name: `DispatchBox - ${config.businessName}`,
            model: {
                provider: "google",
                model: "gemini-2.0-flash",
                messages: [{
                    role: "system",
                    content: systemPrompt
                }]
            },
            voice: {
                provider: voiceConfig.provider,
                voiceId: voiceConfig.voiceId
            },
            firstMessage: greeting,
            serverUrl: `${WEBHOOK_BASE_URL}/handleVapiWebhook`,
            maxDurationSeconds: 600, // 10 min max call
            silenceTimeoutSeconds: 30,
            endCallMessage: "Thank you for calling. Have a great day!",
            metadata: {
                orgId: orgId,
                platform: "dispatchbox"
            }
        });

        console.log(`[Vapi] Created assistant ${assistant.id} for org ${orgId}`);

        // 2. Save config to Firestore
        const now = admin.firestore.Timestamp.now();
        await db.collection("org_vapi_config").doc(orgId).set({
            vapiAssistantId: assistant.id,
            businessName: config.businessName,
            businessDescription: config.businessDescription || "",
            greeting,
            services: config.services || [],
            faqs: config.faqs || [],
            businessHours: config.businessHours || "",
            serviceArea: config.serviceArea || "",
            specialInstructions: config.specialInstructions || "",
            voiceId: config.voiceId || "elliot",
            status: "active",
            createdAt: now,
            updatedAt: now,
            createdBy: context.auth.uid
        });

        return {
            success: true,
            assistantId: assistant.id,
            message: `AI phone agent created for ${config.businessName}`
        };

    } catch (error) {
        console.error("[Vapi] Error creating assistant:", error);
        throw new functions.https.HttpsError(
            "internal",
            `Failed to create AI phone agent: ${(error as Error).message}`
        );
    }
});

/**
 * Update an existing Vapi assistant with new training data.
 */
export const updateAgentTraining = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, config } = data as { orgId: string; config: Partial<VapiAgentConfig> };

    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    // Get existing config
    const configDoc = await db.collection("org_vapi_config").doc(orgId).get();
    if (!configDoc.exists || !configDoc.data()?.vapiAssistantId) {
        throw new functions.https.HttpsError("not-found", "No AI phone agent found for this organization");
    }

    const existingConfig = configDoc.data()!;
    const assistantId = existingConfig.vapiAssistantId;

    // Merge new config with existing
    const mergedConfig: VapiAgentConfig = {
        businessName: config.businessName || existingConfig.businessName,
        businessDescription: config.businessDescription ?? existingConfig.businessDescription,
        greeting: config.greeting ?? existingConfig.greeting,
        services: config.services ?? existingConfig.services,
        faqs: config.faqs ?? existingConfig.faqs,
        businessHours: config.businessHours ?? existingConfig.businessHours,
        serviceArea: config.serviceArea ?? existingConfig.serviceArea,
        specialInstructions: config.specialInstructions ?? existingConfig.specialInstructions,
        voiceId: config.voiceId ?? existingConfig.voiceId
    };

    const systemPrompt = buildSystemPrompt(mergedConfig);
    const voiceConfig = VAPI_VOICES[mergedConfig.voiceId || "elliot"] || VAPI_VOICES["elliot"];

    try {
        // Update Vapi assistant
        const updatePayload: any = {
            model: {
                provider: "google",
                model: "gemini-2.0-flash",
                messages: [{
                    role: "system",
                    content: systemPrompt
                }]
            },
            voice: {
                provider: voiceConfig.provider,
                voiceId: voiceConfig.voiceId
            }
        };

        if (config.greeting) {
            updatePayload.firstMessage = config.greeting;
        }

        if (config.businessName) {
            updatePayload.name = `DispatchBox - ${config.businessName}`;
        }

        await vapiRequest("PATCH", `/assistant/${assistantId}`, updatePayload);
        console.log(`[Vapi] Updated assistant ${assistantId} for org ${orgId}`);

        // Update Firestore
        await db.collection("org_vapi_config").doc(orgId).update({
            ...mergedConfig,
            updatedAt: admin.firestore.Timestamp.now()
        });

        return { success: true, message: "AI phone agent updated successfully" };

    } catch (error) {
        console.error("[Vapi] Error updating assistant:", error);
        throw new functions.https.HttpsError(
            "internal",
            `Failed to update AI phone agent: ${(error as Error).message}`
        );
    }
});

/**
 * Get the Vapi agent config for an org.
 */
export const getVapiAgentConfig = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    const configDoc = await db.collection("org_vapi_config").doc(orgId).get();

    if (!configDoc.exists) {
        return { config: null };
    }

    return { config: configDoc.data() };
});

/**
 * Delete the Vapi assistant and clean up.
 */
export const deleteVapiAssistant = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    const configDoc = await db.collection("org_vapi_config").doc(orgId).get();
    if (!configDoc.exists || !configDoc.data()?.vapiAssistantId) {
        throw new functions.https.HttpsError("not-found", "No AI phone agent found");
    }

    const assistantId = configDoc.data()!.vapiAssistantId;

    try {
        await vapiRequest("DELETE", `/assistant/${assistantId}`);
        console.log(`[Vapi] Deleted assistant ${assistantId} for org ${orgId}`);

        await db.collection("org_vapi_config").doc(orgId).update({
            status: "inactive",
            vapiAssistantId: admin.firestore.FieldValue.delete(),
            deletedAt: admin.firestore.Timestamp.now(),
            deletedBy: context.auth.uid
        });

        return { success: true, message: "AI phone agent deleted" };

    } catch (error) {
        console.error("[Vapi] Error deleting assistant:", error);
        throw new functions.https.HttpsError(
            "internal",
            `Failed to delete AI phone agent: ${(error as Error).message}`
        );
    }
});

/**
 * Import an existing Twilio phone number into Vapi as BYO and assign the assistant.
 */
export const importPhoneToVapi = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, twilioCredentialId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    // Get org's Vapi config
    const configDoc = await db.collection("org_vapi_config").doc(orgId).get();
    if (!configDoc.exists || !configDoc.data()?.vapiAssistantId) {
        throw new functions.https.HttpsError("not-found", "Create an AI phone agent first");
    }

    // Get org's phone subscription
    const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
    if (!subDoc.exists || subDoc.data()?.status !== "active") {
        throw new functions.https.HttpsError("not-found", "No active phone subscription found");
    }

    const phoneNumber = subDoc.data()!.phoneNumber;
    const assistantId = configDoc.data()!.vapiAssistantId;

    try {
        // Import the Twilio number as BYO into Vapi
        const vapiPhone = await vapiRequest("POST", "/phone-number", {
            provider: "byo-phone-number",
            number: phoneNumber,
            numberE164CheckEnabled: true,
            credentialId: twilioCredentialId || undefined,
            assistantId: assistantId,
            name: `DispatchBox - ${configDoc.data()!.businessName}`,
            server: {
                url: `${WEBHOOK_BASE_URL}/handleVapiWebhook`
            }
        });

        console.log(`[Vapi] Imported phone ${phoneNumber} to Vapi, ID: ${vapiPhone.id}`);

        // Save the Vapi phone number ID
        await db.collection("org_vapi_config").doc(orgId).update({
            vapiPhoneNumberId: vapiPhone.id,
            updatedAt: admin.firestore.Timestamp.now()
        });

        return {
            success: true,
            vapiPhoneNumberId: vapiPhone.id,
            message: `Phone number ${phoneNumber} connected to AI agent`
        };

    } catch (error) {
        console.error("[Vapi] Error importing phone:", error);
        throw new functions.https.HttpsError(
            "internal",
            `Failed to import phone number: ${(error as Error).message}`
        );
    }
});

/**
 * Get call logs from Vapi for an org's assistant.
 */
export const getVapiCallLogs = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, limit = 20, page = 1 } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    const configDoc = await db.collection("org_vapi_config").doc(orgId).get();
    if (!configDoc.exists || !configDoc.data()?.vapiAssistantId) {
        return { calls: [], total: 0 };
    }

    const assistantId = configDoc.data()!.vapiAssistantId;

    try {
        const result = await vapiRequest(
            "GET",
            `/call?assistantId=${assistantId}&limit=${limit}&page=${page}&sortOrder=DESC`
        );

        const calls = (result || []).map((call: any) => ({
            id: call.id,
            type: call.type,
            status: call.status,
            startedAt: call.startedAt,
            endedAt: call.endedAt,
            duration: call.duration,
            callerNumber: call.customer?.number || "Unknown",
            transcript: call.transcript || "",
            summary: call.analysis?.summary || "",
            cost: call.cost || 0,
            endedReason: call.endedReason || ""
        }));

        return { calls, total: calls.length };

    } catch (error) {
        console.error("[Vapi] Error fetching call logs:", error);
        throw new functions.https.HttpsError(
            "internal",
            `Failed to fetch call logs: ${(error as Error).message}`
        );
    }
});

/**
 * Webhook handler for Vapi call events.
 * Creates tickets in Firestore when calls end.
 */
export const handleVapiWebhook = functions.https.onRequest(async (req: any, res: any) => {
    try {
        const event = req.body;
        const messageType = event.message?.type || event.type;

        console.log(`[Vapi Webhook] Received: ${messageType}`);

        if (messageType === "end-of-call-report") {
            const call = event.message || event;
            const orgId = call.assistant?.metadata?.orgId;
            const callerNumber = call.customer?.number || call.call?.customer?.number || "Unknown";
            const transcript = call.transcript || call.artifact?.transcript || "";
            const summary = call.analysis?.summary || "Voice call received";
            const duration = call.durationSeconds || call.call?.duration || 0;

            if (orgId) {
                // Create a ticket from the call
                const ticketData: any = {
                    requestorPhone: callerNumber,
                    description: `AI Phone Call Summary:\n${summary}\n\nDuration: ${Math.round(duration / 60)} min ${duration % 60} sec`,
                    source: "VAPI_VOICE",
                    status: "PENDING",
                    organizationId: orgId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        vapiCallId: call.call?.id || call.id,
                        duration,
                        transcript: transcript.substring(0, 5000) // Limit transcript size
                    }
                };

                // Try to find existing customer
                if (callerNumber && callerNumber !== "Unknown") {
                    const customerSnap = await db.collection("customers")
                        .where("phone", "==", callerNumber)
                        .limit(1)
                        .get();

                    if (!customerSnap.empty) {
                        ticketData.customerRef = customerSnap.docs[0].ref;
                        ticketData.customerName = customerSnap.docs[0].data().name;
                    }
                }

                const ticketRef = await db.collection("tickets").add(ticketData);
                console.log(`[Vapi Webhook] Created ticket ${ticketRef.id} from call by ${callerNumber}`);

                // Log usage for billing
                const monthKey = new Date().toISOString().substring(0, 7);
                const usageRef = db.collection("org_vapi_usage").doc(orgId)
                    .collection("months").doc(monthKey);

                await db.runTransaction(async (txn) => {
                    const doc = await txn.get(usageRef);
                    const usageData = doc.exists ? doc.data()! : {
                        totalCalls: 0,
                        totalMinutes: 0,
                        estimatedCost: 0
                    };

                    usageData.totalCalls = (usageData.totalCalls || 0) + 1;
                    usageData.totalMinutes = (usageData.totalMinutes || 0) + Math.ceil(duration / 60);
                    usageData.estimatedCost = (usageData.estimatedCost || 0) + (call.cost || 0);
                    usageData.updatedAt = admin.firestore.Timestamp.now();

                    txn.set(usageRef, usageData, { merge: true });
                });
            }
        }

        // Vapi expects a 200 response
        res.status(200).json({ ok: true });

    } catch (error) {
        console.error("[Vapi Webhook] Error:", error);
        // Still return 200 to avoid retries
        res.status(200).json({ ok: true, error: (error as Error).message });
    }
});
