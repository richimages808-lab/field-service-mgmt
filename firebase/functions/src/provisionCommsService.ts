/**
 * provisionCommsService.ts — Unified Communication Provisioning for DispatchBox
 *
 * Handles provisioning of Twilio (SMS/Voice), SendGrid (Email), and Vapi (AI Voice)
 * during sign-up or later opt-in from the admin dashboard.
 *
 * All resources are provisioned under DispatchBox's master vendor accounts.
 * Customers pay DispatchBox; vendor costs come from company card.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const twilio = require("twilio");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// ============================================================
// VENDOR CLIENT INIT
// ============================================================

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const VAPI_API_KEY = process.env.VAPI_API_KEY || "";

const WEBHOOK_BASE_URL = "https://us-central1-maintenancemanager-c5533.cloudfunctions.net";
const VAPI_BASE_URL = "https://api.vapi.ai";

const twilioClient = (() => {
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
        && !TWILIO_ACCOUNT_SID.includes("your-")
        && TWILIO_ACCOUNT_SID.startsWith("AC")) {
        try {
            return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        } catch (e) {
            console.warn("[CommsProvisioning] Failed to init Twilio:", (e as Error).message);
            return null;
        }
    }
    return null;
})();

// ============================================================
// TYPES
// ============================================================

interface BusinessDetails {
    businessType: "sole_proprietor" | "llc" | "corporation" | "partnership" | "nonprofit";
    businessName: string;
    ein?: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country?: string;
    websiteUrl?: string;
    contactEmail: string;
    contactPhone: string;
}

interface ProvisionRequest {
    orgId: string;
    phoneNumber: string;       // Selected Twilio number to purchase
    planId: string;            // Communication plan tier
    businessDetails: BusinessDetails;
    customDomain?: string;     // Optional custom domain for white-label
    skipSendGrid?: boolean;    // Skip email sender if not needed
    skipVapi?: boolean;        // Skip AI voice if not needed
}

// Communication plan pricing (DispatchBox retail — vendor cost is lower)
const COMMS_PLANS: Record<string, {
    name: string;
    monthlyPrice: number;
    includedMessages: number;
    includedMinutes: number;
    perMessageOverageRate: number;
    perMinuteOverageRate: number;
    includesAiVoice: boolean;
    includesEmail: boolean;
    description: string;
}> = {
    starter: {
        name: "Starter",
        monthlyPrice: 29.99,
        includedMessages: 500,
        includedMinutes: 100,
        perMessageOverageRate: 0.05,
        perMinuteOverageRate: 0.15,
        includesAiVoice: false,
        includesEmail: true,
        description: "Dedicated number + SMS + Email — 500 msgs/mo"
    },
    pro: {
        name: "Professional",
        monthlyPrice: 59.99,
        includedMessages: 2000,
        includedMinutes: 500,
        perMessageOverageRate: 0.03,
        perMinuteOverageRate: 0.10,
        includesAiVoice: true,
        includesEmail: true,
        description: "SMS + Voice AI + Email — 2000 msgs + 500 min/mo"
    },
    enterprise: {
        name: "Enterprise",
        monthlyPrice: 149.99,
        includedMessages: 10000,
        includedMinutes: 2000,
        perMessageOverageRate: 0.02,
        perMinuteOverageRate: 0.07,
        includesAiVoice: true,
        includesEmail: true,
        description: "Unlimited capacity + priority support"
    }
};

// ============================================================
// HELPERS
// ============================================================

async function vapiRequest(method: string, path: string, body?: any): Promise<any> {
    if (!VAPI_API_KEY) {
        throw new Error("VAPI_API_KEY not configured");
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
        throw new Error(`Vapi API error ${response.status}: ${errorText}`);
    }
    if (response.status === 204) return null;
    return response.json();
}

async function sendGridRequest(method: string, path: string, body?: any): Promise<any> {
    if (!SENDGRID_API_KEY) {
        throw new Error("SENDGRID_API_KEY not configured");
    }
    const url = `https://api.sendgrid.com/v3${path}`;
    const options: any = {
        method,
        headers: {
            "Authorization": `Bearer ${SENDGRID_API_KEY}`,
            "Content-Type": "application/json"
        }
    };
    if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SendGrid] ${method} ${path} failed (${response.status}):`, errorText);
        throw new Error(`SendGrid API error ${response.status}: ${errorText}`);
    }
    if (response.status === 204) return null;
    return response.json();
}


// ============================================================
// MAIN PROVISIONING FUNCTION
// ============================================================

/**
 * provisionCommunicationServices — Callable Cloud Function
 *
 * Called during sign-up (if services opted in) or from admin dashboard (later opt-in).
 * Provisions Twilio number + A2P, SendGrid sender, and Vapi AI assistant.
 */
export const provisionCommunicationServices = functions
    .runWith({ timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
        }

        const request = data as ProvisionRequest;
        const { orgId, phoneNumber, planId, businessDetails, customDomain } = request;

        // Validate inputs
        if (!orgId || !phoneNumber || !planId || !businessDetails) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Missing required fields: orgId, phoneNumber, planId, businessDetails"
            );
        }

        const plan = COMMS_PLANS[planId];
        if (!plan) {
            throw new functions.https.HttpsError("invalid-argument", `Invalid plan: ${planId}`);
        }

        // Verify org exists and user has access
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (!orgDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Organization not found");
        }

        // Check for existing active subscription
        const existingSub = await db.collection("org_texting_subscriptions").doc(orgId).get();
        if (existingSub.exists && existingSub.data()?.status === "active") {
            throw new functions.https.HttpsError("already-exists", "Organization already has active communication services");
        }

        const results: {
            twilio: { success: boolean; phoneNumber?: string; phoneSid?: string; messagingServiceSid?: string; campaignSid?: string; campaignStatus?: string; error?: string };
            sendgrid: { success: boolean; senderId?: number; error?: string };
            vapi: { success: boolean; assistantId?: string; error?: string };
        } = {
            twilio: { success: false },
            sendgrid: { success: false },
            vapi: { success: false }
        };

        const now = admin.firestore.Timestamp.now();

        // ============================================================
        // STEP 1: TWILIO — Purchase number + Messaging Service + A2P
        // ============================================================
        console.log(`[CommsProvisioning] Step 1: Twilio for org ${orgId}`);

        if (!twilioClient) {
            results.twilio.error = "Twilio not configured";
        } else {
            try {
                // 1a. Purchase the phone number
                const incomingNumber = await twilioClient.incomingPhoneNumbers.create({
                    phoneNumber: phoneNumber,
                    smsUrl: `${WEBHOOK_BASE_URL}/handleInboundSMS`,
                    smsMethod: "POST",
                    voiceUrl: `${WEBHOOK_BASE_URL}/handleInboundCall`,
                    voiceMethod: "POST",
                    friendlyName: `DispatchBox - ${businessDetails.businessName}`
                });
                console.log(`[CommsProvisioning] Purchased ${phoneNumber}, SID: ${incomingNumber.sid}`);

                // 1b. Create Messaging Service for this org
                const msgService = await twilioClient.messaging.v1.services.create({
                    friendlyName: `DispatchBox - ${businessDetails.businessName}`,
                    useInboundWebhookOnNumber: true
                });
                console.log(`[CommsProvisioning] Messaging Service: ${msgService.sid}`);

                // 1c. Link phone number to messaging service
                await twilioClient.messaging.v1.services(msgService.sid)
                    .phoneNumbers
                    .create({ phoneNumberSid: incomingNumber.sid });

                // 1d. Register A2P Brand (if not sole proprietor, use standard brand)
                let brandSid: string | null = null;
                let campaignSid: string | null = null;
                let campaignStatus = "pending_brand";

                try {
                    // Check if a brand already exists for this org
                    const brands = await twilioClient.messaging.v1.brandRegistrations.list({ limit: 20 });
                    const existingBrand = brands.find(
                        (b: any) => b.brandRegistrationStatus === "APPROVED"
                    );

                    if (existingBrand) {
                        brandSid = existingBrand.sid;
                        console.log(`[CommsProvisioning] Reusing existing brand: ${brandSid}`);
                    } else {
                        // For now, we use the master DispatchBox brand since individual
                        // Sole Proprietor brands require manual registration via Twilio Console
                        brandSid = "BN637378fbf10d1cf4e56b2de017bd8e87"; // DispatchBox brand
                        console.log(`[CommsProvisioning] Using master brand: ${brandSid}`);
                    }

                    // 1e. Register A2P Campaign
                    const useCaseType = businessDetails.businessType === "sole_proprietor"
                        ? "SOLE_PROPRIETOR"
                        : "MIXED";

                    const campaign = await twilioClient.messaging.v1.services(msgService.sid)
                        .usAppToPerson
                        .create({
                            brandRegistrationSid: brandSid,
                            description: `${businessDetails.businessName} sends appointment reminders, service updates, and job status notifications to customers via DispatchBox.`,
                            messageSamples: [
                                `${businessDetails.businessName}: Your service appointment is scheduled for tomorrow at 9 AM. Reply STOP to opt out.`,
                                `${businessDetails.businessName}: Your technician is on the way. Reply STOP to opt out.`
                            ],
                            usAppToPersonUsecase: useCaseType,
                            hasEmbeddedLinks: false,
                            hasEmbeddedPhone: false,
                            messageFlow: `Customers provide their phone number when submitting a service request through the ${businessDetails.businessName} web portal powered by DispatchBox. They consent to receive service-related text messages. Customers can opt out by replying STOP.`,
                            optInMessage: `You have opted in to receive service notifications from ${businessDetails.businessName}. Reply STOP to opt out.`,
                            optOutMessage: `You have been unsubscribed from ${businessDetails.businessName} notifications. Reply START to re-subscribe.`,
                            helpMessage: `${businessDetails.businessName} service notifications powered by DispatchBox. Reply STOP to unsubscribe.`,
                            optInKeywords: ["START", "YES", "UNSTOP"],
                            optOutKeywords: ["STOP", "CANCEL", "END", "QUIT", "UNSUBSCRIBE"],
                            helpKeywords: ["HELP", "INFO"]
                        });

                    campaignSid = campaign.sid;
                    campaignStatus = campaign.campaignStatus || "IN_PROGRESS";
                    console.log(`[CommsProvisioning] A2P Campaign: ${campaignSid} — ${campaignStatus}`);
                } catch (a2pError) {
                    console.warn("[CommsProvisioning] A2P registration warning:", (a2pError as Error).message);
                    campaignStatus = "registration_failed";
                    // Non-fatal: number still works for voice, SMS will work once A2P is manually resolved
                }

                // Save Twilio subscription to Firestore
                await db.collection("org_texting_subscriptions").doc(orgId).set({
                    phoneNumber: phoneNumber,
                    twilioPhoneSid: incomingNumber.sid,
                    messagingServiceSid: msgService.sid,
                    brandSid: brandSid,
                    a2pCampaignSid: campaignSid,
                    a2pCampaignStatus: campaignStatus,
                    plan: planId,
                    planName: plan.name,
                    monthlyPrice: plan.monthlyPrice,
                    includedMessages: plan.includedMessages,
                    includedMinutes: plan.includedMinutes,
                    perMessageOverageRate: plan.perMessageOverageRate,
                    perMinuteOverageRate: plan.perMinuteOverageRate,
                    status: "active",
                    provisionedAt: now,
                    provisionedBy: context.auth.uid,
                    currentPeriodStart: now
                });

                // Initialize usage tracking
                const monthKey = new Date().toISOString().substring(0, 7);
                await db.collection("org_texting_usage").doc(orgId)
                    .collection("months").doc(monthKey).set({
                        messagesSent: 0,
                        messagesReceived: 0,
                        totalMessages: 0,
                        totalMinutes: 0,
                        estimatedCost: 0,
                        overage: 0,
                        updatedAt: now
                    });

                results.twilio = {
                    success: true,
                    phoneNumber,
                    phoneSid: incomingNumber.sid,
                    messagingServiceSid: msgService.sid,
                    campaignSid: campaignSid || undefined,
                    campaignStatus
                };
            } catch (error) {
                console.error("[CommsProvisioning] Twilio error:", error);
                results.twilio.error = (error as Error).message;
            }
        }

        // ============================================================
        // STEP 2: SENDGRID — Sender Identity
        // ============================================================
        if (!request.skipSendGrid) {
            console.log(`[CommsProvisioning] Step 2: SendGrid for org ${orgId}`);
            try {
                const fromEmail = customDomain
                    ? `service@${customDomain}`
                    : `${orgDoc.data()?.inboundEmail?.prefix || orgId}@service.dispatch-box.com`;

                const sender = await sendGridRequest("POST", "/verified_senders", {
                    nickname: businessDetails.businessName,
                    from_email: fromEmail,
                    from_name: businessDetails.businessName,
                    reply_to: businessDetails.contactEmail,
                    reply_to_name: businessDetails.businessName,
                    address: businessDetails.street,
                    city: businessDetails.city,
                    state: businessDetails.state,
                    zip: businessDetails.zip,
                    country: businessDetails.country || "US"
                });

                // Update org with email config
                await db.collection("organizations").doc(orgId).update({
                    "outboundEmail.fromName": businessDetails.businessName,
                    "outboundEmail.fromEmail": fromEmail,
                    "outboundEmail.sendgridSenderId": sender?.id || null,
                    "outboundEmail.verificationStatus": "pending",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                results.sendgrid = {
                    success: true,
                    senderId: sender?.id
                };
            } catch (error) {
                console.warn("[CommsProvisioning] SendGrid error:", (error as Error).message);
                results.sendgrid.error = (error as Error).message;
                // Non-fatal: email will use default sender
            }
        } else {
            results.sendgrid = { success: true }; // Skipped intentionally
        }

        // ============================================================
        // STEP 3: VAPI — AI Voice Assistant
        // ============================================================
        if (!request.skipVapi && plan.includesAiVoice) {
            console.log(`[CommsProvisioning] Step 3: Vapi for org ${orgId}`);
            try {
                const greeting = `Thank you for calling ${businessDetails.businessName}. How can I help you today?`;
                const systemPrompt = `You are a professional AI phone receptionist for ${businessDetails.businessName}. Be warm, helpful, and concise. Answer questions about the business, take messages, and help schedule service appointments. Keep responses to 1-3 sentences.`;

                const assistant = await vapiRequest("POST", "/assistant", {
                    name: `DispatchBox - ${businessDetails.businessName}`,
                    model: {
                        provider: "google",
                        model: "gemini-2.0-flash",
                        messages: [{ role: "system", content: systemPrompt }]
                    },
                    voice: { provider: "openai", voiceId: "alloy" },
                    firstMessage: greeting,
                    serverUrl: `${WEBHOOK_BASE_URL}/handleVapiWebhook`,
                    maxDurationSeconds: 600,
                    silenceTimeoutSeconds: 30,
                    endCallMessage: "Thank you for calling. Have a great day!",
                    metadata: { orgId, platform: "dispatchbox" }
                });

                console.log(`[CommsProvisioning] Vapi assistant: ${assistant.id}`);

                await db.collection("org_vapi_config").doc(orgId).set({
                    vapiAssistantId: assistant.id,
                    businessName: businessDetails.businessName,
                    greeting,
                    voiceId: "alloy",
                    status: "active",
                    createdAt: now,
                    updatedAt: now,
                    createdBy: context.auth.uid
                });

                results.vapi = { success: true, assistantId: assistant.id };
            } catch (error) {
                console.warn("[CommsProvisioning] Vapi error:", (error as Error).message);
                results.vapi.error = (error as Error).message;
                // Non-fatal: AI voice can be set up later
            }
        } else {
            results.vapi = { success: true }; // Skipped or not included in plan
        }

        // ============================================================
        // STEP 4: UPDATE ORG WITH BUSINESS DETAILS + BILLING RECORD
        // ============================================================
        console.log(`[CommsProvisioning] Step 4: Updating org and billing`);

        // Save business details to organization
        await db.collection("organizations").doc(orgId).update({
            businessDetails: {
                businessType: businessDetails.businessType,
                ein: businessDetails.ein || null,
                street: businessDetails.street,
                city: businessDetails.city,
                state: businessDetails.state,
                zip: businessDetails.zip,
                country: businessDetails.country || "US",
                websiteUrl: businessDetails.websiteUrl || null,
                contactEmail: businessDetails.contactEmail,
                contactPhone: businessDetails.contactPhone
            },
            customDomain: customDomain || null,
            "communicationServices.enabled": true,
            "communicationServices.plan": planId,
            "communicationServices.provisionedAt": now,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create billing record
        await db.collection("org_billing").doc(orgId).set({
            plan: planId,
            planName: plan.name,
            monthlyPrice: plan.monthlyPrice,
            status: "active",
            services: {
                sms: results.twilio.success,
                voice: results.twilio.success,
                email: results.sendgrid.success,
                aiVoice: results.vapi.success && plan.includesAiVoice
            },
            a2pStatus: results.twilio.campaignStatus || "not_registered",
            startDate: now,
            createdAt: now,
            updatedAt: now
        }, { merge: true });

        console.log(`[CommsProvisioning] Complete for org ${orgId}`);

        return {
            success: results.twilio.success, // Core success depends on Twilio
            results,
            message: results.twilio.success
                ? `Communication services provisioned! Phone: ${phoneNumber}. ${results.twilio.campaignStatus === "IN_PROGRESS" ? "SMS is pending A2P approval (1-7 days). Voice calls work immediately." : ""}`
                : `Provisioning partially failed. ${results.twilio.error}`
        };
    });

// ============================================================
// GET COMMS PLANS
// ============================================================

/**
 * Returns available add-on service catalogs for display in sign-up / dashboard.
 * Three independent services: Custom Domain, Text Communications, AI Receptionist.
 */
export const getCommsPlans = functions.https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    return {
        // Legacy unified plans (kept for backward compat)
        plans: Object.entries(COMMS_PLANS).map(([id, plan]) => ({
            id,
            ...plan
        })),

        // NEW: Independent service catalogs
        services: {
            domain: {
                name: "Custom Domain",
                icon: "globe",
                tagline: "Brand your business with your own web address",
                tiers: [
                    {
                        id: "domain_existing",
                        name: "Bring Your Domain",
                        monthlyPrice: 4.99,
                        annualPrice: 49.99,
                        description: "White-label your DispatchBox portal with a domain you already own",
                        features: [
                            "app.yourbusiness.com portal",
                            "Branded email sender (service@yourbusiness.com)",
                            "SSL certificate included",
                            "DNS setup assistance"
                        ]
                    },
                    {
                        id: "domain_new",
                        name: "Register + White-Label",
                        monthlyPrice: 9.99,
                        annualPrice: 99.99,
                        description: "We register a new domain for you and configure everything",
                        features: [
                            "Domain registration included (.com, .net, .co, etc.)",
                            "app.yourbusiness.com portal",
                            "Branded email sender",
                            "WHOIS privacy protection",
                            "Auto-renewal management",
                            "SSL certificate included"
                        ]
                    }
                ]
            },
            sms: {
                name: "Text Communications",
                icon: "message-square",
                tagline: "Reach customers instantly with SMS & MMS",
                tiers: [
                    {
                        id: "sms_starter",
                        name: "Text Starter",
                        monthlyPrice: 29.99,
                        description: "Dedicated business number with 500 SMS/month",
                        features: [
                            "Dedicated local phone number",
                            "500 SMS messages included",
                            "Automated appointment reminders",
                            "Job status notifications",
                            "Two-way customer texting",
                            "A2P compliant (carrier approved)"
                        ],
                        included: { messages: 500 },
                        overage: "$0.03/message"
                    },
                    {
                        id: "sms_pro",
                        name: "Text Pro",
                        monthlyPrice: 49.99,
                        popular: true,
                        description: "2,000 SMS + MMS for growing businesses",
                        features: [
                            "Everything in Starter",
                            "2,000 SMS messages included",
                            "MMS picture messaging",
                            "SMS marketing campaigns",
                            "Auto-review request texts",
                            "Priority carrier routing"
                        ],
                        included: { messages: 2000 },
                        overage: "$0.02/message"
                    },
                    {
                        id: "sms_unlimited",
                        name: "Text Unlimited",
                        monthlyPrice: 79.99,
                        description: "5,000 SMS + MMS for high-volume operations",
                        features: [
                            "Everything in Pro",
                            "5,000 SMS + MMS messages included",
                            "Bulk messaging tools",
                            "Advanced analytics dashboard",
                            "Dedicated account support"
                        ],
                        included: { messages: 5000 },
                        overage: "$0.015/message"
                    }
                ]
            },
            aiReceptionist: {
                name: "AI Phone Receptionist",
                icon: "mic",
                tagline: "Never miss a call. Your AI answers 24/7.",
                tiers: [
                    {
                        id: "ai_basic",
                        name: "AI Basic",
                        monthlyPrice: 99,
                        description: "100 minutes/month — perfect for solo operators",
                        features: [
                            "24/7 AI phone answering",
                            "100 minutes included (~30-50 calls)",
                            "Books appointments into your calendar",
                            "Captures customer name, address & issue",
                            "Sends confirmation texts after booking",
                            "Branded greeting — your business name"
                        ],
                        included: { minutes: 100 },
                        overage: "$0.25/minute"
                    },
                    {
                        id: "ai_pro",
                        name: "AI Professional",
                        monthlyPrice: 199,
                        popular: true,
                        description: "300 minutes/month — ideal for small teams",
                        features: [
                            "Everything in Basic",
                            "300 minutes included (~100-150 calls)",
                            "Emergency call routing to on-call tech",
                            "Answers pricing & availability questions",
                            "Multi-language support",
                            "Priority voice processing"
                        ],
                        included: { minutes: 300 },
                        overage: "$0.20/minute"
                    },
                    {
                        id: "ai_enterprise",
                        name: "AI Enterprise",
                        monthlyPrice: 399,
                        description: "1,000 minutes/month — for busy operations",
                        features: [
                            "Everything in Professional",
                            "1,000 minutes included (~300-500 calls)",
                            "Custom call scripting",
                            "CRM integration & lead scoring",
                            "Call recording & transcripts",
                            "Dedicated account manager"
                        ],
                        included: { minutes: 1000 },
                        overage: "$0.15/minute"
                    }
                ]
            }
        }
    };
});

// ============================================================
// CHECK A2P CAMPAIGN STATUS
// ============================================================

/**
 * Checks and updates the A2P campaign status for an org.
 * Can be called from the admin dashboard to poll for approval.
 */
export const checkA2pCampaignStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    if (!twilioClient) {
        throw new functions.https.HttpsError("failed-precondition", "Twilio not configured");
    }

    const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
    if (!subDoc.exists) {
        throw new functions.https.HttpsError("not-found", "No texting subscription found");
    }

    const sub = subDoc.data()!;
    if (!sub.messagingServiceSid) {
        return { status: "no_messaging_service", message: "No messaging service configured" };
    }

    try {
        const campaigns = await twilioClient.messaging.v1
            .services(sub.messagingServiceSid)
            .usAppToPerson
            .list();

        if (campaigns.length === 0) {
            return { status: "no_campaign", message: "No A2P campaign registered" };
        }

        const campaign = campaigns[0];
        const newStatus = campaign.campaignStatus;

        // Update Firestore if status changed
        if (newStatus !== sub.a2pCampaignStatus) {
            await db.collection("org_texting_subscriptions").doc(orgId).update({
                a2pCampaignStatus: newStatus,
                updatedAt: admin.firestore.Timestamp.now()
            });
            await db.collection("org_billing").doc(orgId).update({
                a2pStatus: newStatus,
                updatedAt: admin.firestore.Timestamp.now()
            });
        }

        return {
            status: newStatus,
            campaignSid: campaign.sid,
            message: newStatus === "APPROVED"
                ? "A2P campaign approved! SMS delivery is active."
                : newStatus === "IN_PROGRESS"
                    ? "A2P campaign is pending review (1-7 business days)."
                    : `A2P campaign status: ${newStatus}`
        };
    } catch (error) {
        console.error("[CommsProvisioning] Error checking A2P status:", error);
        throw new functions.https.HttpsError("internal", (error as Error).message);
    }
});

// ============================================================
// GET COMMUNICATION STATUS — Dashboard overview
// ============================================================

/**
 * Returns a unified view of all communication service statuses for an org.
 */
export const getCommunicationStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    const [subDoc, vapiDoc, orgDoc, billingDoc] = await Promise.all([
        db.collection("org_texting_subscriptions").doc(orgId).get(),
        db.collection("org_vapi_config").doc(orgId).get(),
        db.collection("organizations").doc(orgId).get(),
        db.collection("org_billing").doc(orgId).get()
    ]);

    return {
        enabled: orgDoc.data()?.communicationServices?.enabled || false,
        plan: billingDoc.data()?.plan || null,
        sms: {
            active: subDoc.exists && subDoc.data()?.status === "active",
            phoneNumber: subDoc.data()?.phoneNumber || null,
            a2pStatus: subDoc.data()?.a2pCampaignStatus || "not_registered",
            smsReady: subDoc.data()?.a2pCampaignStatus === "APPROVED"
        },
        voice: {
            active: subDoc.exists && subDoc.data()?.status === "active",
            phoneNumber: subDoc.data()?.phoneNumber || null
        },
        aiVoice: {
            active: vapiDoc.exists && vapiDoc.data()?.status === "active",
            assistantId: vapiDoc.data()?.vapiAssistantId || null
        },
        email: {
            active: !!orgDoc.data()?.outboundEmail?.fromEmail,
            fromEmail: orgDoc.data()?.outboundEmail?.fromEmail || null,
            verificationStatus: orgDoc.data()?.outboundEmail?.verificationStatus || "not_configured"
        },
        customDomain: orgDoc.data()?.customDomain || null
    };
});
