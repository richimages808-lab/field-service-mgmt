import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
const twilio = require("twilio");
import { getFlashModel, getLatestFlashModelName } from "../ai/aiConfig";
import { logGeminiUsage } from "../billing";

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
    intent: "NEW_TICKET" | "STATUS_CHECK" | "CANCELLATION" | "OTHER";
    issueDescription?: string;
    ticketId?: string;
}

// ---- Keyword patterns for deterministic intent matching ----
const CANCEL_KEYWORDS = ["cancel", "stop", "nevermind", "never mind", "don't come", "dont come", "not needed"];
const STATUS_KEYWORDS = ["status", "update", "where", "when", "eta", "tracking", "schedule", "appointment", "what time", "how long"];
const STOP_KEYWORDS = ["stop", "unsubscribe", "optout", "opt out"];

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
Determine the intent: NEW_TICKET, STATUS_CHECK, CANCELLATION, or OTHER.
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

    console.log(`[InboundSMS] Received from ${from}: ${body}`);

    try {
        // 1. Analyze Intent (keyword-based, with optional AI enhancement)
        const analysis = await analyzeSMSIntent(body);
        console.log(`[InboundSMS] Intent: ${analysis.intent}`);

        let replyText = "";

        if (analysis.intent === "NEW_TICKET") {
            const ticketRef = await createTicketFromSMS(from, analysis.issueDescription || body);
            replyText = `Thanks! We've created ticket #${ticketRef.id.substring(0, 8)} for your issue. A technician will be in touch shortly.`;
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
        } else {
            replyText = "Thanks for contacting DispatchBox. Reply with details about your service needs and we'll create a ticket, or call us directly for urgent issues.";
        }

        // 2. Send Reply
        await sendSMS(from, replyText);

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

async function createTicketFromSMS(phone: string, description: string) {
    const customersRef = db.collection("customers");
    const snapshot = await customersRef.where("phone", "==", phone).limit(1).get();

    let customerRef;
    if (!snapshot.empty) {
        customerRef = snapshot.docs[0].ref;
    } else {
        customerRef = await customersRef.add({
            phone,
            name: "Unknown SMS User",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            type: "LEAD"
        });
    }

    return await db.collection("tickets").add({
        requestorPhone: phone,
        customerRef,
        description,
        source: "SMS",
        status: "PENDING",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
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

async function sendSMS(to: string, body: string) {
    if (!twilioClient || !TWILIO_PHONE_NUMBER) {
        console.warn("[InboundSMS] Twilio not configured. Skipping SMS send.");
        return;
    }
    try {
        const normalizedTo = normalizePhoneToE164(to);
        const result = await twilioClient.messages.create({
            body,
            from: TWILIO_PHONE_NUMBER,
            to: normalizedTo
        });
        console.log(`[InboundSMS] SMS sent to ${normalizedTo}, SID: ${result.sid}`);
    } catch (e) {
        console.error(`[InboundSMS] Failed to send SMS to ${to}:`, (e as Error).message);
        throw e;
    }
}
