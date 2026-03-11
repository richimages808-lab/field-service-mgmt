import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Gemini AI for voice conversation (lazy init)
let genAI: any = null;
let geminiModel: any = null;

function getGeminiModel() {
    if (geminiModel) return geminiModel;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("[Voice] GEMINI_API_KEY not set.");
        return null;
    }
    try {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        genAI = new GoogleGenerativeAI(apiKey);
        geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        return geminiModel;
    } catch (e) {
        console.error("[Voice] Failed to initialize Gemini:", (e as Error).message);
        return null;
    }
}

/**
 * Look up which organization owns the called phone number.
 * Returns org data or null if using the platform default number.
 */
async function getOrgForNumber(calledNumber: string): Promise<{ orgId: string; orgName: string } | null> {
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
                // Found the org — get the org name
                const orgDoc = await db.collection("organizations").doc(doc.id).get();
                const orgName = orgDoc.exists ? (orgDoc.data()?.name || "our company") : "our company";
                return { orgId: doc.id, orgName };
            }
        }
    } catch (e) {
        console.warn("[Voice] Error looking up org for number:", (e as Error).message);
    }
    return null;
}

/**
 * Handles inbound Voice calls from Twilio.
 * Provides an AI-powered greeting with speech recognition for multi-turn conversation.
 */
export const handleInboundCall = functions.https.onRequest(async (req: any, res: any) => {
    const from = req.body?.From || "";
    const to = req.body?.To || "";

    console.log(`[Voice] Inbound call from ${from} to ${to}`);

    // Look up the organization that owns this phone number
    const org = await getOrgForNumber(to);
    const companyName = org?.orgName || "DispatchBox";

    // Store conversation context for follow-up
    const sessionId = `voice_${from}_${Date.now()}`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="/handleVoiceGather?session=${sessionId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&turn=1" timeout="5" speechTimeout="auto" language="en-US">
        <Say voice="Polly.Joanna">Thank you for calling ${escapeXml(companyName)}. I'm an AI assistant and I can help you with scheduling a service appointment, checking on an existing job, getting a quote, or leaving a message. How can I help you today?</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't hear anything. Let me transfer you to voicemail.</Say>
    <Record action="/handleVoicemailRecording" maxLength="120" playBeep="true" />
</Response>`;

    res.set("Content-Type", "text/xml");
    res.status(200).send(twiml);
});

/**
 * Handles speech input from the caller, processes it with AI, and responds.
 */
export const handleVoiceGather = functions.https.onRequest(async (req: any, res: any) => {
    const speechResult = req.body?.SpeechResult || "";
    const confidence = parseFloat(req.body?.Confidence || "0");
    const from = req.query?.from || req.body?.From || "";
    const to = req.query?.to || req.body?.To || "";
    const sessionId = req.query?.session || "";
    const turn = parseInt(req.query?.turn || "1");

    console.log(`[Voice] Gather result (turn ${turn}): "${speechResult}" (confidence: ${confidence})`);

    if (!speechResult) {
        // No speech detected — go to voicemail
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I didn't catch that. Let me take a message for you.</Say>
    <Record action="/handleVoicemailRecording" maxLength="120" playBeep="true" />
</Response>`;
        res.set("Content-Type", "text/xml");
        return res.status(200).send(twiml);
    }

    try {
        // Look up org and caller context
        const org = await getOrgForNumber(to);
        const callerInfo = await getCallerContext(from);

        // Process with AI
        const aiResponse = await processVoiceWithAI(speechResult, callerInfo, org, turn);

        if (aiResponse.action === "create_ticket") {
            // Create a service ticket
            await createTicketFromVoice(from, speechResult, org?.orgId);

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="/handleVoiceGather?session=${sessionId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&turn=${turn + 1}" timeout="5" speechTimeout="auto" language="en-US">
        <Say voice="Polly.Joanna">${escapeXml(aiResponse.message)} Is there anything else I can help you with?</Say>
    </Gather>
    <Say voice="Polly.Joanna">Thank you for calling. Have a great day!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else if (aiResponse.action === "check_status") {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="/handleVoiceGather?session=${sessionId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&turn=${turn + 1}" timeout="5" speechTimeout="auto" language="en-US">
        <Say voice="Polly.Joanna">${escapeXml(aiResponse.message)} Is there anything else I can help you with?</Say>
    </Gather>
    <Say voice="Polly.Joanna">Thank you for calling. Goodbye!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else if (aiResponse.action === "end_call") {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">${escapeXml(aiResponse.message)}</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else if (aiResponse.action === "voicemail") {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">${escapeXml(aiResponse.message)}</Say>
    <Record action="/handleVoicemailRecording" maxLength="120" playBeep="true" />
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else {
            // Continue conversation (ask follow-up question)
            const maxTurns = 5;
            if (turn >= maxTurns) {
                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">${escapeXml(aiResponse.message)} I'll create a ticket with everything you've shared, and someone from our team will follow up shortly.</Say>
    <Hangup/>
</Response>`;
                await createTicketFromVoice(from, speechResult, org?.orgId);
                res.set("Content-Type", "text/xml");
                return res.status(200).send(twiml);
            }

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="/handleVoiceGather?session=${sessionId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&turn=${turn + 1}" timeout="5" speechTimeout="auto" language="en-US">
        <Say voice="Polly.Joanna">${escapeXml(aiResponse.message)}</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't hear a response. Thank you for calling!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);
        }

    } catch (error) {
        console.error("[Voice] Error processing speech:", error);
        // Fallback to voicemail on any error
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, I'm having trouble understanding right now. Let me take a message for you. Please leave a detailed message after the beep.</Say>
    <Record action="/handleVoicemailRecording" maxLength="120" playBeep="true" />
</Response>`;
        res.set("Content-Type", "text/xml");
        return res.status(200).send(twiml);
    }
});

/**
 * Webhook for when recording is complete.
 * Twilio sends RecordingUrl in the body.
 */
export const handleVoicemailRecording = functions.https.onRequest(async (req: any, res: any) => {
    const recordingUrl = req.body.RecordingUrl;
    const from = req.body.From;
    const to = req.body.To || "";

    console.log(`Received voicemail from ${from}: ${recordingUrl}`);

    try {
        const org = await getOrgForNumber(to);
        await createTicketFromVoice(from, `Voicemail received. Recording: ${recordingUrl}`, org?.orgId);

        res.set("Content-Type", "text/xml");
        res.status(200).send("<Response><Say voice='Polly.Joanna'>Thank you. Your message has been received and a ticket has been created. We'll get back to you soon. Goodbye!</Say><Hangup/></Response>");
    } catch (error) {
        console.error("Error processing voicemail:", error);
        res.set("Content-Type", "text/xml");
        res.status(200).send("<Response><Hangup/></Response>");
    }
});

// ============================================================================
// AI Processing
// ============================================================================

interface AIVoiceResponse {
    message: string;
    action: 'continue' | 'create_ticket' | 'check_status' | 'end_call' | 'voicemail';
}

async function processVoiceWithAI(
    speechInput: string,
    callerInfo: CallerContext | null,
    org: { orgId: string; orgName: string } | null,
    turn: number
): Promise<AIVoiceResponse> {
    const model = getGeminiModel();

    if (!model) {
        // Fallback without AI — use keyword matching
        return processVoiceWithKeywords(speechInput, callerInfo);
    }

    try {
        const companyName = org?.orgName || "DispatchBox";
        const callerContext = callerInfo
            ? `The caller is ${callerInfo.name} (phone: ${callerInfo.phone}). They have ${callerInfo.recentJobs.length} recent jobs.${callerInfo.recentJobs.length > 0 ? ` Their most recent job is: "${callerInfo.recentJobs[0].description}" with status "${callerInfo.recentJobs[0].status}".` : ''}`
            : "The caller is unknown (not in our system).";

        const prompt = `You are an AI phone receptionist for ${companyName}, a field service company. You handle calls professionally.

Caller context: ${callerContext}

The caller said (turn ${turn}): "${speechInput}"

Respond with a JSON object:
{
  "message": "Your spoken response to the caller (keep it concise, under 40 words, natural speaking tone)",
  "action": "one of: continue, create_ticket, check_status, end_call, voicemail"
}

Action guidelines:
- "create_ticket": Caller wants to schedule service, report an issue, or request a quote. Confirm you're creating a ticket.
- "check_status": Caller wants to check on an existing job. Provide status from their recent jobs if available.
- "continue": Need more info from caller (what's the issue? what's their address? etc.)
- "end_call": Caller says goodbye, thanks, no/nothing else.
- "voicemail": Caller explicitly asks to leave a message or speak to someone.

Respond ONLY with valid JSON, no markdown.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        // Parse JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                message: parsed.message || "I'd be happy to help. Could you tell me more?",
                action: ['continue', 'create_ticket', 'check_status', 'end_call', 'voicemail'].includes(parsed.action) ? parsed.action : 'continue'
            };
        }

        return { message: "I'd be happy to help with that. Let me create a service request for you.", action: "create_ticket" };

    } catch (error) {
        console.error("[Voice] AI processing error:", (error as Error).message);
        return processVoiceWithKeywords(speechInput, callerInfo);
    }
}

function processVoiceWithKeywords(speechInput: string, callerInfo: CallerContext | null): AIVoiceResponse {
    const lower = speechInput.toLowerCase();

    // Status check keywords
    if (lower.includes("status") || lower.includes("update") || lower.includes("check on") || lower.includes("where is") || lower.includes("my job")) {
        if (callerInfo && callerInfo.recentJobs.length > 0) {
            const job = callerInfo.recentJobs[0];
            return {
                message: `I found your most recent service request. The status is currently ${job.status}. ${job.status === 'scheduled' ? 'A technician has been assigned.' : job.status === 'completed' ? 'The job has been completed.' : 'Our team is working on it.'}`,
                action: 'check_status'
            };
        }
        return {
            message: "I don't see any recent service requests associated with your phone number. Would you like to create a new service request?",
            action: 'continue'
        };
    }

    // Schedule / service request keywords
    if (lower.includes("schedule") || lower.includes("appointment") || lower.includes("service") || lower.includes("fix") || lower.includes("repair") || lower.includes("broken") || lower.includes("issue") || lower.includes("problem") || lower.includes("quote")) {
        return {
            message: "I'd be happy to help with that. I'm creating a service request for you now. Someone from our team will call you back to schedule an appointment.",
            action: 'create_ticket'
        };
    }

    // End call keywords
    if (lower.includes("goodbye") || lower.includes("bye") || lower.includes("thank") || lower.includes("that's all") || lower.includes("no") || lower.includes("nothing")) {
        return {
            message: "Thank you for calling. Have a great day!",
            action: 'end_call'
        };
    }

    // Voicemail keywords
    if (lower.includes("leave a message") || lower.includes("voicemail") || lower.includes("talk to someone") || lower.includes("speak to") || lower.includes("real person") || lower.includes("human")) {
        return {
            message: "Of course. Please leave a detailed message after the beep, and someone will get back to you shortly.",
            action: 'voicemail'
        };
    }

    // Default: try to create a ticket from whatever they said
    return {
        message: "Thanks for that information. I'm creating a service request with the details you provided. A member of our team will follow up with you shortly.",
        action: 'create_ticket'
    };
}

// ============================================================================
// Context Helpers
// ============================================================================

interface CallerContext {
    name: string;
    phone: string;
    customerId?: string;
    recentJobs: { id: string; description: string; status: string }[];
}

async function getCallerContext(phone: string): Promise<CallerContext | null> {
    if (!phone) return null;

    try {
        // Search customers by phone
        const customersSnap = await db.collection("customers")
            .where("phone", "==", phone)
            .limit(1)
            .get();

        let customerName = "Unknown Caller";
        let customerId = "";

        if (!customersSnap.empty) {
            const customerData = customersSnap.docs[0].data();
            customerName = customerData.name || "Unknown Caller";
            customerId = customersSnap.docs[0].id;
        }

        // Search for recent jobs
        const jobsSnap = await db.collection("jobs")
            .where("customer.phone", "==", phone)
            .orderBy("created_at", "desc")
            .limit(3)
            .get();

        const recentJobs = jobsSnap.docs.map(doc => ({
            id: doc.id,
            description: doc.data().request?.description || doc.data().description || "Service request",
            status: doc.data().status || "pending"
        }));

        return { name: customerName, phone, customerId, recentJobs };
    } catch (error) {
        console.warn("[Voice] Error getting caller context:", (error as Error).message);
        return null;
    }
}

async function createTicketFromVoice(phone: string, description: string, orgId?: string) {
    // Find or create customer
    const customersRef = db.collection("customers");
    const snapshot = await customersRef.where("phone", "==", phone).limit(1).get();

    let customerRef;
    if (!snapshot.empty) {
        customerRef = snapshot.docs[0].ref;
    } else {
        customerRef = await customersRef.add({
            phone,
            name: "Unknown Caller",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            type: "LEAD"
        });
    }

    const ticketData: any = {
        requestorPhone: phone,
        customerRef,
        description,
        source: "VOICE",
        status: "PENDING",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (orgId) {
        ticketData.organizationId = orgId;
    }

    const ticketRef = await db.collection("tickets").add(ticketData);
    console.log(`[Voice] Created ticket ${ticketRef.id} from call by ${phone}`);
    return ticketRef;
}

/**
 * Escape XML special characters for TwiML.
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
