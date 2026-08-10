import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
const twilio = require("twilio");
import { getFlashModel, getLatestFlashModelName } from "../ai/aiConfig";
import { logGeminiUsage } from "../billing";
import { createAccessToken } from "../accessTokens";

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Initialize Twilio
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

const twilioClient = (() => {
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
        && !TWILIO_ACCOUNT_SID.includes("your-")
        && TWILIO_ACCOUNT_SID.startsWith("AC")) {
        try {
            return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        } catch (e) {
            console.warn("[InboundSMS] Failed to initialize Twilio client:", (e as Error).message);
            return null;
        }
    }
    return null;
})();

// Lazy-init Gemini AI is now handled by getFlashModel

interface ParsedSMSData {
    intent: "NEW_TICKET" | "STATUS_CHECK" | "CANCELLATION" | "QUOTE_APPROVAL" | "OTHER";
    issueDescription?: string;
    ticketId?: string;
}

// ---- Keyword patterns for deterministic intent matching ----
const CANCEL_KEYWORDS = ["cancel", "stop", "nevermind", "never mind", "don't come", "dont come", "not needed"];
const STATUS_KEYWORDS = ["status", "update", "where", "when", "eta", "tracking", "schedule", "appointment", "what time", "how long"];
const STOP_KEYWORDS = ["stop", "unsubscribe", "optout", "opt out"];
const APPROVAL_KEYWORDS = ["approved", "approve", "yes, approve", "yes approve", "i approve", "looks good", "go ahead", "sounds good", "do it", "let's do it", "lets do it"];

/**
 * Deterministic keyword-based intent analysis (primary — always reliable)
 */
function analyzeIntentByKeywords(text: string): ParsedSMSData {
    const lower = text.toLowerCase().trim();

    // Check for opt-out first (Twilio compliance)
    if (STOP_KEYWORDS.some(k => lower === k)) {
        return { intent: "OTHER", issueDescription: "Opt-out request" };
    }

    // Check for cancellation
    if (CANCEL_KEYWORDS.some(k => lower.includes(k))) {
        return { intent: "CANCELLATION", issueDescription: text };
    }

    // Check for quote approval
    if (APPROVAL_KEYWORDS.some(k => lower === k || lower.startsWith(k) || lower.includes("approve") || lower.includes("approved"))) {
        return { intent: "QUOTE_APPROVAL", issueDescription: text };
    }

    // Check for status inquiry
    if (STATUS_KEYWORDS.some(k => lower.includes(k))) {
        return { intent: "STATUS_CHECK", issueDescription: text };
    }

    // Default: treat as a new service request
    return { intent: "NEW_TICKET", issueDescription: text };
}

/**
 * AI-enhanced intent analysis (optional fallback — wrapped in try/catch)
 */
async function analyzeIntentWithAI(text: string): Promise<ParsedSMSData | null> {
    try {
        const model = await getFlashModel();
        
        const prompt = `Analyze this SMS for a Field Service company: "${text}"
Determine the intent: NEW_TICKET, STATUS_CHECK, CANCELLATION, QUOTE_APPROVAL, or OTHER.
If NEW_TICKET, summarize the issue concisely.
Return ONLY valid JSON: { "intent": "...", "issueDescription": "..." }`;

        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            const modelName = await getLatestFlashModelName();
            await logGeminiUsage(response.usageMetadata.totalTokenCount, modelName, "analyzeSMSIntent");
        }

        const textResponse = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const jsonString = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(jsonString) as ParsedSMSData;
    } catch (e) {
        console.warn("[InboundSMS] AI analysis failed, using keyword fallback:", (e as Error).message);
        return null;
    }
}

/**
 * Analyze SMS intent — keyword-based primary, AI optional enhancement
 */
async function analyzeSMSIntent(text: string): Promise<ParsedSMSData> {
    // 1. Fast, reliable keyword analysis
    const keywordResult = analyzeIntentByKeywords(text);

    // 2. Try AI for better issue descriptions on new tickets (non-blocking)
    if (keywordResult.intent === "NEW_TICKET" && text.length > 20) {
        const aiResult = await analyzeIntentWithAI(text);
        if (aiResult) {
            return aiResult;
        }
    }

    return keywordResult;
}

/**
 * Handles inbound SMS from Twilio.
 */
export const handleInboundSMS = functions.https.onRequest(async (req, res) => {
    const from = req.body.From;
    const body = req.body.Body;
    const to = req.body.To || "";

    console.log(`[InboundSMS] Received from ${from} to ${to}: ${body}`);

    try {
        // Look up which organization owns the receiving number
        const org = await getOrgForSMSNumber(to);

        let replyText = "";
        let processedAsQuote = false;

        // Check if this customer has a pending quote
        if (org?.orgId) {
            const pendingQuote = await getPendingQuoteForPhone(from, org.orgId);
            if (pendingQuote) {
                console.log(`[InboundSMS] Pending quote found: ${pendingQuote.id} for phone ${from}`);
                const { handleQuoteCustomerResponse } = require("../email/quoteNotifications");
                const result = await handleQuoteCustomerResponse({
                    quoteId: pendingQuote.id,
                    customerEmailOrPhone: from,
                    senderName: pendingQuote.customer?.name || "Customer",
                    messageText: body,
                    channel: 'sms',
                    orgId: org.orgId
                });
                
                if (result.intent === "APPROVE" || result.intent === "CHANGE_REQUEST" || result.intent === "DECLINE") {
                    replyText = result.message;
                    processedAsQuote = true;
                    console.log(`[InboundSMS] Processed SMS as quote response: ${result.intent}`);
                }
            }
        }

        if (!processedAsQuote) {
            // 1. Analyze Intent (keyword-based, with optional AI enhancement)
            const analysis = await analyzeSMSIntent(body);
            console.log(`[InboundSMS] Intent: ${analysis.intent}, Org: ${org?.orgId || 'platform'}`);

            if (analysis.intent === "NEW_TICKET") {
                const ticketRef = await createTicketFromSMS(from, analysis.issueDescription || body, org?.orgId);
                // Generate token for SMS-created ticket
                let trackingInfo = '';
                try {
                    const token = await createAccessToken({
                        resourceType: 'ticket',
                        resourceId: ticketRef.id,
                        orgId: org?.orgId || '',
                        customerPhone: from,
                        permissions: ['view', 'reschedule'],
                        createdBy: 'system',
                        expiresInDays: 90,
                    });
                    trackingInfo = ` Your tracking code: ${token}. View status: https://dispatch-box.com/t/${token}`;
                } catch (e) {
                    console.warn('[InboundSMS] Token generation failed:', (e as Error).message);
                }
                replyText = `Thanks! We've created ticket #${ticketRef.id.substring(0, 8)} for your issue. A technician will be in touch shortly.${trackingInfo}`;
            } else if (analysis.intent === "STATUS_CHECK") {
                // Look up most recent ticket for this phone number
                const recentTicket = await findRecentTicket(from);
                if (recentTicket) {
                    replyText = `Your most recent ticket (#${recentTicket.id.substring(0, 8)}) is currently: ${recentTicket.data()?.status || 'PENDING'}. We'll update you when there's a change.`;
                } else {
                    replyText = "We couldn't find a recent ticket for your number. Please reply with details about your issue and we'll create one for you.";
                }
            } else if (analysis.intent === "CANCELLATION") {
                replyText = "We've received your cancellation request. A team member will review and confirm shortly.";
            } else if (analysis.intent === "QUOTE_APPROVAL") {
                const approvalResult = await handleQuoteApprovalViaSMS(from, org?.orgId);
                replyText = approvalResult.message;
            } else {
                const bizName = org?.orgName || "DispatchBox";
                replyText = `Thanks for contacting ${bizName}. Reply with details about your service needs and we'll create a ticket, or call us directly for urgent issues.`;
            }
        }

        // 2. Send Reply (use org's number if available, otherwise global default)
        const replyFrom = org?.phoneNumber || TWILIO_PHONE_NUMBER;
        await sendSMS(from, replyText, replyFrom);

        // Return empty TwiML (we handle the reply ourselves)
        res.set("Content-Type", "text/xml");
        res.status(200).send("<Response></Response>");
    } catch (error) {
        console.error("[InboundSMS] Error processing SMS:", error);
        // Still return 200 with TwiML to prevent Twilio retry storms
        res.set("Content-Type", "text/xml");
        res.status(200).send("<Response><Message>Sorry, we encountered an error processing your message. Please try again or call us directly.</Message></Response>");
    }
});

async function findRecentTicket(phone: string) {
    const snapshot = await db.collection("tickets")
        .where("requestorPhone", "==", phone)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
    return snapshot.empty ? null : snapshot.docs[0];
}

/**
 * Look up which organization owns a phone number used for SMS.
 */
async function getOrgForSMSNumber(calledNumber: string): Promise<{ orgId: string; orgName: string; phoneNumber: string } | null> {
    if (!calledNumber) return null;
    try {
        const digits = calledNumber.replace(/\D/g, '');
        const snapshot = await db.collection("org_texting_subscriptions")
            .where("status", "==", "active")
            .get();

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const subDigits = (data.phoneNumber || '').replace(/\D/g, '');
            if (subDigits && digits.endsWith(subDigits.slice(-10))) {
                const orgDoc = await db.collection("organizations").doc(doc.id).get();
                const orgName = orgDoc.exists ? (orgDoc.data()?.name || "our company") : "our company";
                return { orgId: doc.id, orgName, phoneNumber: data.phoneNumber };
            }
        }
    } catch (e) {
        console.warn("[InboundSMS] Error looking up org for number:", (e as Error).message);
    }
    return null;
}

async function getPendingQuoteForPhone(phone: string, orgId?: string): Promise<any | null> {
    const customersRef = db.collection("customers");
    let customerQuery = customersRef.where("phone", "==", phone);
    if (orgId) {
        customerQuery = customerQuery.where("org_id", "==", orgId);
    }
    const snap = await customerQuery.get();
    if (snap.empty) {
        // Fallback to legacy organizationId field
        let legacyQuery = customersRef.where("phone", "==", phone);
        if (orgId) {
            legacyQuery = legacyQuery.where("organizationId", "==", orgId);
        }
        const legacySnap = await legacyQuery.get();
        if (legacySnap.empty) return null;
        return getPendingQuoteForCustomer(legacySnap.docs[0].id);
    }
    return getPendingQuoteForCustomer(snap.docs[0].id);
}

async function getPendingQuoteForCustomer(customerId: string): Promise<any | null> {
    const quotesSnap = await db.collection("quotes")
        .where("customer_id", "==", customerId)
        .get();
        
    if (quotesSnap.empty) return null;
    
    // Sort quotes to find the latest sent/viewed/tech_review quote
    const pendingQuotes = quotesSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(q => q.status === "sent" || q.status === "viewed" || q.status === "tech_review")
        .sort((a, b) => {
            const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tB - tA; // latest first
        });
        
    return pendingQuotes.length > 0 ? pendingQuotes[0] : null;
}

/**
 * Handle quote approval from an inbound SMS
 */
async function handleQuoteApprovalViaSMS(phone: string, orgId?: string): Promise<{ success: boolean; message: string }> {
    const customersRef = db.collection("customers");
    let customerQuery = customersRef.where("phone", "==", phone);
    if (orgId) {
        customerQuery = customerQuery.where("organizationId", "==", orgId);
    }
    const snapshot = await customerQuery.get();

    if (snapshot.empty) {
        return { success: false, message: "We couldn't find a matching customer account to approve a quote. Please contact support." };
    }

    const customerDoc = snapshot.docs[0];
    const customerId = customerDoc.id;

    // Find quotes for this customer
    const quotesSnapshot = await db.collection("quotes")
        .where("customer_id", "==", customerId)
        .get();

    if (quotesSnapshot.empty) {
        return { success: false, message: "We couldn't find any pending quotes to approve." };
    }

    // Filter in memory to avoid needing a complex composite index on the fly
    const pendingQuotes = quotesSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(q => q.status === "sent" || q.status === "viewed" || q.status === "quote_pending")
        .sort((a, b) => {
            const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tB - tA; // descending
        });

    if (pendingQuotes.length === 0) {
        return { success: false, message: "We couldn't find any pending quotes to approve." };
    }

    const quoteToApprove = pendingQuotes[0];

    try {
        const quoteRef = db.collection("quotes").doc(quoteToApprove.id);
        
        await quoteRef.update({
            status: 'approved',
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            'agreement.customerSignature': {
                dataUrl: 'sms_approval',
                signedAt: admin.firestore.FieldValue.serverTimestamp(),
                signerName: customerDoc.data().name || 'SMS User',
                ipAddress: 'SMS Approval'
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update the associated job to unscheduled
        if (quoteToApprove.job_id) {
            await db.collection("jobs").doc(quoteToApprove.job_id).update({
                status: 'pending',
                active_quote_id: quoteToApprove.id,
                deposit_required: quoteToApprove.agreement?.requiresDeposit || false,
                deposit_amount: quoteToApprove.agreement?.depositAmount || 0,
                deposit_paid: quoteToApprove.agreement?.depositPaid || false
            });

            // Log communication
            await db.collection("communications").add({
                org_id: quoteToApprove.org_id || orgId || 'unknown',
                customer_id: customerId,
                job_id: quoteToApprove.job_id,
                quote_id: quoteToApprove.id,
                type: "internal_note",
                content: `Quote ${quoteToApprove.quoteNumber || quoteToApprove.id} approved via SMS response from customer.`,
                status: "sent",
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: "system"
            });
        }

        return { 
            success: true, 
            message: `Thank you! Your quote ${quoteToApprove.quoteNumber ? '#' + quoteToApprove.quoteNumber : ''} has been approved. We'll be in touch to schedule your service.` 
        };
    } catch (e) {
        console.error("[InboundSMS] Error approving quote:", e);
        return { success: false, message: "There was an error approving your quote. Please call us to confirm." };
    }
}

async function createTicketFromSMS(phone: string, description: string, orgId?: string) {
    const customersRef = db.collection("customers");
    let customerQuery = customersRef.where("phone", "==", phone);
    if (orgId) {
        customerQuery = customerQuery.where("organizationId", "==", orgId);
    }
    const snapshot = await customerQuery.limit(1).get();

    let customerRef;
    let customerName = "Unknown SMS User";
    let customerId: string | null = null;
    let customerAddress = "";

    if (!snapshot.empty) {
        customerRef = snapshot.docs[0].ref;
        const custData = snapshot.docs[0].data();
        customerName = custData.name || "Unknown SMS User";
        customerAddress = custData.address || "";
        customerId = snapshot.docs[0].id;
    } else {
        const newCustData: any = {
            phone,
            name: "Unknown SMS User",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            type: "LEAD"
        };
        if (orgId) {
            newCustData.organizationId = orgId;
        }
        customerRef = await customersRef.add(newCustData);
        customerId = customerRef.id;
    }

    // 1. Create the ticket (audit trail)
    const ticketData: any = {
        requestorPhone: phone,
        customerRef,
        description,
        source: "SMS",
        status: "PENDING",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (orgId) {
        ticketData.organizationId = orgId;
    }

    const ticketRef = await db.collection("tickets").add(ticketData);
    console.log(`[InboundSMS] Created ticket ${ticketRef.id} from SMS by ${phone}`);

    // 2. Create a job so dispatchers see it in the Job Intake Dashboard
    const jobData: any = {
        status: "pending",
        priority: "medium",
        customer: {
            name: customerName,
            phone: phone,
            address: customerAddress
        },
        request: {
            description: description,
            photos: [],
            availability: [],
            source: "sms"
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        ticketId: ticketRef.id
    };

    if (orgId) {
        jobData.org_id = orgId;
    }
    if (customerId) {
        jobData.customer_id = customerId;
    }

    const jobRef = await db.collection("jobs").add(jobData);
    console.log(`[InboundSMS] Created job ${jobRef.id} linked to ticket ${ticketRef.id}`);

    // Link the job back to the ticket
    await ticketRef.update({ autoJobId: jobRef.id });

    // 3. If org has autoQuoteEnabled, trigger AI quote generation
    if (orgId) {
        try {
            const orgDoc = await db.collection("organizations").doc(orgId).get();
            if (orgDoc.exists && orgDoc.data()?.autoQuoteEnabled === true) {
                const { autoCreateJobAndQuote } = require("../portal");
                const result = await autoCreateJobAndQuote(orgId, ticketRef.id, {
                    customerName,
                    customerPhone: phone,
                    customerEmail: "",
                    address: customerAddress,
                    description,
                    urgency: "normal",
                    customerId,
                    photoUrls: [],
                });
                console.log(`[InboundSMS] Auto-quote triggered for ticket ${ticketRef.id}, quoteId: ${result.quoteId}`);

                // Send quote link back to the customer via SMS (with token)
                if (result.quoteId) {
                    try {
                        let quoteUrl = `https://portal.dispatchbox.com/quote/${result.quoteId}`;
                        let orgName = "Our team";
                        const orgData = orgDoc.data();
                        if (orgData?.name) orgName = orgData.name;

                        // Generate token for the quote
                        try {
                            const quoteToken = await createAccessToken({
                                resourceType: 'quote',
                                resourceId: result.quoteId,
                                orgId,
                                customerPhone: phone,
                                customerName,
                                permissions: ['view', 'approve', 'decline'],
                                createdBy: 'system',
                                expiresInDays: 90,
                            });
                            quoteUrl = `https://dispatch-box.com/t/${quoteToken}`;
                        } catch (e) {
                            console.warn('[InboundSMS] Quote token gen failed:', (e as Error).message);
                        }

                        await sendSMS(phone, `${orgName}: Your quote is ready! View and approve it here: ${quoteUrl}  Reply STOP to opt out.`, orgId);
                        console.log(`[InboundSMS] Quote SMS sent to ${phone} for quote ${result.quoteId}`);
                    } catch (smsErr) {
                        console.warn("[InboundSMS] Quote SMS failed:", (smsErr as Error).message);
                    }
                }
            }
        } catch (quoteErr) {
            console.warn("[InboundSMS] Auto-quote failed (non-fatal):", (quoteErr as Error).message);
        }
    }

    return ticketRef;
}

/**
 * Normalize a phone number to E.164 format for Twilio.
 */
function normalizePhoneToE164(phone: string): string {
    const hasPlus = phone.startsWith('+');
    const digits = phone.replace(/\D/g, '');
    if (hasPlus && digits.length >= 11) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return hasPlus ? `+${digits}` : `+${digits}`;
}

export async function sendSMS(to: string, body: string, orgIdOrFromNumber?: string | null, fromNumberOverride?: string | null) {
    // Support both 3-param (to, body, fromNumber) and 4-param (to, body, orgId, fromNumber) calls
    const fromNumber = fromNumberOverride !== undefined ? fromNumberOverride : orgIdOrFromNumber;
    const senderNumber = fromNumber || TWILIO_PHONE_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "MGd2bbaa7d8acb6e34baa6f5b63f63c49b";
    
    if (!twilioClient) {
        console.warn("[InboundSMS] Twilio not configured. Skipping SMS send.");
        return;
    }
    try {
        const normalizedTo = normalizePhoneToE164(to);
        const messagePayload: any = {
            body,
            to: normalizedTo
        };

        if (messagingServiceSid) {
            messagePayload.messagingServiceSid = messagingServiceSid;
        } else if (senderNumber) {
            messagePayload.from = normalizePhoneToE164(senderNumber);
        }

        const result = await twilioClient.messages.create(messagePayload);
        console.log(`[InboundSMS] SMS sent to ${normalizedTo} via MessagingService ${messagingServiceSid || senderNumber}, SID: ${result.sid}`);
    } catch (e) {
        console.error(`[InboundSMS] Failed to send SMS to ${to}:`, (e as Error).message);
        throw e;
    }
}
