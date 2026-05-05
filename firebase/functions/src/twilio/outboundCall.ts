/**
 * outboundCall.ts — AI-powered outbound callback for appointment scheduling.
 *
 * After a job/quote is approved, this module calls the customer back to
 * present available time slots and confirm the appointment.
 *
 * Flow:
 *   1. Dispatcher approves quote (or auto-trigger fires)
 *   2. initiateCustomerCallback → computes time slots → Twilio outbound call
 *   3. handleOutboundGreeting → TwiML greeting + presents slots
 *   4. handleOutboundGather → Gemini interprets choice → updates job status
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const twilio = require("twilio");

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WEBHOOK_BASE_URL = "https://us-central1-maintenancemanager-c5533.cloudfunctions.net";

const twilioClient = (() => {
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
        && !TWILIO_ACCOUNT_SID.includes("your-")
        && TWILIO_ACCOUNT_SID.startsWith("AC")) {
        try {
            return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        } catch (e) {
            console.warn("[OutboundCall] Failed to init Twilio:", (e as Error).message);
            return null;
        }
    }
    return null;
})();

// Gemini for slot interpretation
let geminiModel: any = null;
function getGeminiModel() {
    if (geminiModel) return geminiModel;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    try {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        geminiModel = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-2.5-flash" });
        return geminiModel;
    } catch (e) {
        console.error("[OutboundCall] Failed to init Gemini:", (e as Error).message);
        return null;
    }
}

// ============================================================
// TYPES
// ============================================================

interface TimeSlot {
    id: string;       // e.g. "slot_1"
    date: string;     // e.g. "2026-04-28"
    dayLabel: string;  // e.g. "Monday"
    startTime: string; // e.g. "9:00 AM"
    endTime: string;   // e.g. "11:00 AM"
    spoken: string;    // e.g. "Monday morning between 9 and 11 AM"
}

// ============================================================
// TIME SLOT COMPUTATION
// ============================================================

/**
 * Compute available time slots for a job based on assigned tech's schedule.
 * Looks at the next 5 business days and finds 2-hour windows without conflicts.
 */
async function computeAvailableSlots(orgId: string, techId?: string): Promise<TimeSlot[]> {
    const slots: TimeSlot[] = [];
    const now = new Date();

    // Default working hours
    const workStart = 8; // 8 AM
    const workEnd = 17;  // 5 PM
    const slotDuration = 2; // 2-hour windows

    // Get the next 5 business days
    const businessDays: Date[] = [];
    const d = new Date(now);
    d.setDate(d.getDate() + 1); // Start from tomorrow
    while (businessDays.length < 5) {
        if (d.getDay() !== 0 && d.getDay() !== 6) { // Skip weekends
            businessDays.push(new Date(d));
        }
        d.setDate(d.getDate() + 1);
    }

    // Get existing jobs for the tech (or all org jobs if no tech assigned)
    let existingJobsQuery = db.collection("jobs")
        .where("org_id", "==", orgId)
        .where("status", "in", ["scheduled", "in_progress"]);

    if (techId) {
        existingJobsQuery = db.collection("jobs")
            .where("org_id", "==", orgId)
            .where("assigned_to", "==", techId)
            .where("status", "in", ["scheduled", "in_progress"]);
    }

    const existingJobs = await existingJobsQuery.get();
    const busySlots: { date: string; hour: number }[] = [];

    existingJobs.forEach(doc => {
        const data = doc.data();
        if (data.scheduledDate) {
            const schedDate = typeof data.scheduledDate === "string"
                ? data.scheduledDate
                : data.scheduledDate.toDate?.().toISOString().split("T")[0];

            const schedHour = data.scheduledTime
                ? parseInt(data.scheduledTime.split(":")[0])
                : 9;

            // Block 2-hour window for each existing job
            busySlots.push({ date: schedDate, hour: schedHour });
            busySlots.push({ date: schedDate, hour: schedHour + 1 });
        }
    });

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let slotCount = 0;

    for (const day of businessDays) {
        if (slotCount >= 3) break; // Max 3 slots

        const dateStr = day.toISOString().split("T")[0];
        const dayName = dayNames[day.getDay()];

        for (let hour = workStart; hour <= workEnd - slotDuration; hour += slotDuration) {
            if (slotCount >= 3) break;

            // Check if this window conflicts with existing jobs
            const isBusy = busySlots.some(bs => bs.date === dateStr && bs.hour >= hour && bs.hour < hour + slotDuration);
            if (isBusy) continue;

            const startAmPm = hour < 12 ? "AM" : "PM";
            const endHour = hour + slotDuration;
            const endAmPm = endHour < 12 ? "AM" : "PM";
            const startDisplay = hour <= 12 ? hour : hour - 12;
            const endDisplay = endHour <= 12 ? endHour : endHour - 12;

            const timeOfDay = hour < 12 ? "morning" : hour < 15 ? "afternoon" : "evening";

            slotCount++;
            slots.push({
                id: `slot_${slotCount}`,
                date: dateStr,
                dayLabel: dayName,
                startTime: `${startDisplay}:00 ${startAmPm}`,
                endTime: `${endDisplay}:00 ${endAmPm}`,
                spoken: `${dayName} ${timeOfDay}, between ${startDisplay} and ${endDisplay} ${endAmPm}`
            });
        }
    }

    // Fallback: if no slots found (unlikely), offer generic ones
    if (slots.length === 0) {
        const tomorrow = businessDays[0];
        const tomorrowStr = tomorrow.toISOString().split("T")[0];
        const dayName = dayNames[tomorrow.getDay()];
        slots.push({
            id: "slot_1", date: tomorrowStr, dayLabel: dayName,
            startTime: "9:00 AM", endTime: "11:00 AM",
            spoken: `${dayName} morning, between 9 and 11 AM`
        });
    }

    return slots;
}

// ============================================================
// CALLABLE: Initiate Customer Callback
// ============================================================

/**
 * initiateCustomerCallback — Callable Cloud Function
 * Called from dispatcher UI or auto-triggered when quote is approved.
 */
export const initiateCustomerCallback = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { jobId, orgId } = data;
    if (!jobId || !orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing jobId or orgId");
    }

    if (!twilioClient) {
        throw new functions.https.HttpsError("failed-precondition", "Twilio not configured");
    }

    // Get job details
    const jobDoc = await db.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Job not found");
    }
    const job = jobDoc.data()!;

    const customerPhone = job.customer?.phone;
    if (!customerPhone) {
        throw new functions.https.HttpsError("failed-precondition", "No customer phone number on this job");
    }

    // Get org's phone number
    const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
    if (!subDoc.exists || subDoc.data()?.status !== "active") {
        throw new functions.https.HttpsError("failed-precondition", "No active phone subscription");
    }
    const orgPhone = subDoc.data()!.phoneNumber;

    // Get org name + callback settings
    const orgDoc = await db.collection("organizations").doc(orgId).get();
    const orgData = orgDoc.exists ? orgDoc.data() : null;
    const orgName = orgData?.name || "Our company";
    const callbackMode = orgData?.callbackMode || "with_quote"; // none | schedule_only | with_quote

    // Respect callbackMode
    if (callbackMode === "none") {
        throw new functions.https.HttpsError("failed-precondition", "Outbound callbacks are disabled for this organization. Enable them in Organization Settings.");
    }

    // Compute available time slots
    const slots = await computeAvailableSlots(orgId, job.assigned_to);

    // Get quote total if available and callbackMode allows it
    let quoteTotal = "";
    if (callbackMode === "with_quote" && job.quoteId) {
        const quoteDoc = await db.collection("quotes").doc(job.quoteId).get();
        if (quoteDoc.exists) {
            quoteTotal = `$${(quoteDoc.data()?.total || 0).toFixed(2)}`;
        }
    }

    // Prevent duplicate callbacks
    if (job.callbackInitiated) {
        throw new functions.https.HttpsError("already-exists", "Callback already initiated for this job");
    }

    // Create a callback session in Firestore
    const callbackSession = {
        jobId,
        orgId,
        orgName,
        customerPhone,
        customerName: job.customer?.name || "there",
        description: job.request?.description || "your service request",
        quoteTotal,
        callbackMode,
        slots,
        status: "initiated",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth.uid
    };

    const sessionRef = await db.collection("callback_sessions").add(callbackSession);
    console.log(`[OutboundCall] Created callback session ${sessionRef.id} for job ${jobId}`);

    try {
        // Initiate the Twilio outbound call
        const call = await twilioClient.calls.create({
            to: customerPhone,
            from: orgPhone,
            url: `${WEBHOOK_BASE_URL}/handleOutboundGreeting?sessionId=${sessionRef.id}`,
            method: "POST",
            statusCallback: `${WEBHOOK_BASE_URL}/handleOutboundStatus?sessionId=${sessionRef.id}`,
            statusCallbackEvent: ["completed", "busy", "no-answer", "failed"],
            timeout: 30 // Ring for 30 seconds
        });

        console.log(`[OutboundCall] Initiated call ${call.sid} to ${customerPhone}`);

        // Mark job as callback initiated
        await db.collection("jobs").doc(jobId).update({
            callbackInitiated: admin.firestore.Timestamp.now(),
            callbackSessionId: sessionRef.id
        });

        await sessionRef.update({ twilioCallSid: call.sid });

        return {
            success: true,
            callSid: call.sid,
            sessionId: sessionRef.id,
            message: `Calling ${job.customer?.name || "customer"} at ${customerPhone}...`
        };
    } catch (error) {
        console.error("[OutboundCall] Error initiating call:", error);
        await sessionRef.update({ status: "failed", error: (error as Error).message });
        throw new functions.https.HttpsError("internal", `Failed to initiate call: ${(error as Error).message}`);
    }
});

// ============================================================
// WEBHOOK: Outbound Greeting (Twilio calls this when customer picks up)
// ============================================================

export const handleOutboundGreeting = functions.https.onRequest(async (req: any, res: any) => {
    const sessionId = req.query?.sessionId || "";

    console.log(`[OutboundCall] Customer answered callback, session: ${sessionId}`);

    try {
        const sessionDoc = await db.collection("callback_sessions").doc(sessionId).get();
        if (!sessionDoc.exists) {
            res.set("Content-Type", "text/xml");
            return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">Sorry, there was an error with this call. Goodbye.</Say><Hangup/></Response>`);
        }

        const session = sessionDoc.data()!;
        const name = escapeXml(session.customerName || "there");
        const company = escapeXml(session.orgName || "Our company");
        const desc = escapeXml((session.description || "").substring(0, 80));
        const mode = session.callbackMode || "with_quote";

        // Only include quote info if callbackMode is "with_quote"
        const quoteInfo = (mode === "with_quote" && session.quoteTotal)
            ? ` Your approved quote is ${escapeXml(session.quoteTotal)}.`
            : "";

        // Build the slot options for speech
        const slots: TimeSlot[] = session.slots || [];
        let slotSpeech = "";
        if (slots.length === 1) {
            slotSpeech = `We have an opening ${slots[0].spoken}. Does that work for you?`;
        } else if (slots.length === 2) {
            slotSpeech = `We have two options: Option 1, ${slots[0].spoken}. Or option 2, ${slots[1].spoken}. Which works best for you?`;
        } else if (slots.length >= 3) {
            slotSpeech = `We have three options: Option 1, ${slots[0].spoken}. Option 2, ${slots[1].spoken}. Or option 3, ${slots[2].spoken}. Which works best?`;
        }

        await sessionDoc.ref.update({ status: "greeting_delivered" });

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${WEBHOOK_BASE_URL}/handleOutboundGather?sessionId=${sessionId}" timeout="8" speechTimeout="auto" language="en-US">
        <Say voice="Google.en-US-Neural2-F">Hi ${name}, this is ${company} calling about ${desc}.${quoteInfo} Great news, your service request has been approved and we'd like to schedule your appointment. ${escapeXml(slotSpeech)}</Say>
    </Gather>
    <Say voice="Google.en-US-Neural2-F">I didn't hear a response. We'll send you a text message with the available time slots instead. Have a great day!</Say>
    <Hangup/>
</Response>`;

        res.set("Content-Type", "text/xml");
        return res.status(200).send(twiml);

    } catch (error) {
        console.error("[OutboundCall] Error in greeting:", error);
        res.set("Content-Type", "text/xml");
        return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">Sorry, we experienced a technical issue. We'll follow up with a text message. Goodbye.</Say><Hangup/></Response>`);
    }
});

// ============================================================
// WEBHOOK: Outbound Gather (processes customer's slot choice)
// ============================================================

export const handleOutboundGather = functions.https.onRequest(async (req: any, res: any) => {
    const sessionId = req.query?.sessionId || "";
    const speechResult = req.body?.SpeechResult || "";

    console.log(`[OutboundCall] Customer response: "${speechResult}" for session ${sessionId}`);

    try {
        const sessionDoc = await db.collection("callback_sessions").doc(sessionId).get();
        if (!sessionDoc.exists) {
            res.set("Content-Type", "text/xml");
            return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
        }

        const session = sessionDoc.data()!;
        const slots: TimeSlot[] = session.slots || [];

        // Use Gemini to interpret which slot the customer chose
        const chosenSlot = await interpretSlotChoice(speechResult, slots);

        if (chosenSlot) {
            // Update the job with the scheduled date/time
            await db.collection("jobs").doc(session.jobId).update({
                status: "scheduled",
                scheduledDate: chosenSlot.date,
                scheduledTime: chosenSlot.startTime,
                scheduledWindow: `${chosenSlot.startTime} - ${chosenSlot.endTime}`,
                scheduledDay: chosenSlot.dayLabel,
                scheduledAt: admin.firestore.Timestamp.now(),
                scheduledVia: "ai_callback"
            });

            await sessionDoc.ref.update({
                status: "scheduled",
                chosenSlot,
                customerResponse: speechResult
            });

            // Send confirmation SMS
            await sendConfirmationSMS(
                session.customerPhone,
                session.orgName,
                chosenSlot,
                session.orgId
            );

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">Perfect! You're all set for ${escapeXml(chosenSlot.spoken)}. A technician will arrive during that window. We've also sent you a confirmation text. Thank you for choosing ${escapeXml(session.orgName)}. Have a great day!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else {
            // Couldn't determine choice — try again or fallback
            await sessionDoc.ref.update({ status: "unclear_response", customerResponse: speechResult });

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${WEBHOOK_BASE_URL}/handleOutboundGather?sessionId=${sessionId}" timeout="8" speechTimeout="auto" language="en-US">
        <Say voice="Google.en-US-Neural2-F">I'm sorry, I didn't quite catch that. Could you tell me which option you prefer? You can say option 1, option 2, or option 3.</Say>
    </Gather>
    <Say voice="Google.en-US-Neural2-F">No worries. We'll send you a text with the options so you can reply at your convenience. Have a great day!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);
        }

    } catch (error) {
        console.error("[OutboundCall] Error in gather:", error);
        res.set("Content-Type", "text/xml");
        return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">I'm sorry, there was a technical issue. We'll follow up by text. Goodbye.</Say><Hangup/></Response>`);
    }
});

// ============================================================
// WEBHOOK: Outbound Call Status (handles no-answer, busy, etc.)
// ============================================================

export const handleOutboundStatus = functions.https.onRequest(async (req: any, res: any) => {
    const sessionId = req.query?.sessionId || "";
    const callStatus = req.body?.CallStatus || "";

    console.log(`[OutboundCall] Call status: ${callStatus} for session ${sessionId}`);

    if (["busy", "no-answer", "failed", "canceled"].includes(callStatus)) {
        try {
            const sessionDoc = await db.collection("callback_sessions").doc(sessionId).get();
            if (sessionDoc.exists) {
                const session = sessionDoc.data()!;
                await sessionDoc.ref.update({ status: `call_${callStatus}` });

                // Fallback: send SMS with time slot options
                await sendSlotOptionsSMS(
                    session.customerPhone,
                    session.orgName,
                    session.slots || [],
                    session.orgId
                );
                console.log(`[OutboundCall] Customer didn't answer. Sent SMS fallback.`);
            }
        } catch (err) {
            console.error("[OutboundCall] Error handling status:", err);
        }
    }

    res.status(200).send("OK");
});

// ============================================================
// FIRESTORE TRIGGER: Auto-callback on quote approval
// ============================================================

/**
 * When a job's status changes to "quoted" and the quote is approved,
 * or when callbackRequested is set, auto-initiate a callback.
 * The org must have autoCallbackEnabled set to true.
 */
export const onJobQuoteApproved = functions.firestore
    .document("jobs/{jobId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const jobId = context.params.jobId;

        // Only trigger when quote status transitions to approved
        const quoteJustApproved = (
            before.quoteStatus !== "approved" && after.quoteStatus === "approved"
        ) || (
            before.status !== "quoted" && after.status === "quoted" && after.quoteApproved === true
        );

        if (!quoteJustApproved) return null;

        // Guard: don't double-callback
        if (after.callbackInitiated) {
            console.log(`[OutboundCall] Job ${jobId} already has a callback. Skipping.`);
            return null;
        }

        const orgId = after.org_id;
        if (!orgId) return null;

        // Check if org has auto-callback enabled AND callbackMode allows it
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        const orgData = orgDoc.exists ? orgDoc.data() : null;
        if (!orgData || orgData.autoCallbackEnabled !== true) {
            return null;
        }
        const callbackMode = orgData.callbackMode || "with_quote";
        if (callbackMode === "none") {
            console.log(`[OutboundCall] Callback mode is 'none' for org ${orgId}. Skipping.`);
            return null;
        }

        const customerPhone = after.customer?.phone;
        if (!customerPhone) {
            console.warn(`[OutboundCall] Job ${jobId} has no customer phone. Skipping callback.`);
            return null;
        }

        console.log(`[OutboundCall] Auto-triggering callback for job ${jobId}`);

        try {
            // Check business hours before calling
            const now = new Date();
            const hour = now.getHours();
            if (hour < 9 || hour >= 18) {
                console.log(`[OutboundCall] Outside business hours (${hour}:00). Scheduling SMS instead.`);
                const orgName = orgDoc.data()?.name || "Our company";
                const slots = await computeAvailableSlots(orgId, after.assigned_to);
                await sendSlotOptionsSMS(customerPhone, orgName, slots, orgId);
                await change.after.ref.update({
                    callbackInitiated: admin.firestore.Timestamp.now(),
                    callbackMethod: "sms_after_hours"
                });
                return null;
            }

            // Get org's phone number
            const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
            if (!subDoc.exists || subDoc.data()?.status !== "active") {
                console.warn(`[OutboundCall] No active phone subscription for org ${orgId}`);
                return null;
            }
            const orgPhone = subDoc.data()!.phoneNumber;
            const orgName = orgData?.name || "Our company";

            const slots = await computeAvailableSlots(orgId, after.assigned_to);

            // Only include quote total if callbackMode allows it
            let quoteTotal = "";
            if (callbackMode === "with_quote" && after.quoteId) {
                const quoteDoc = await db.collection("quotes").doc(after.quoteId).get();
                if (quoteDoc.exists) {
                    quoteTotal = `$${(quoteDoc.data()?.total || 0).toFixed(2)}`;
                }
            }

            const callbackSession = {
                jobId,
                orgId,
                orgName,
                customerPhone,
                customerName: after.customer?.name || "there",
                description: (after.request?.description || "").substring(0, 100),
                quoteTotal,
                callbackMode,
                slots,
                status: "auto_initiated",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: "system"
            };

            const sessionRef = await db.collection("callback_sessions").add(callbackSession);

            const call = await twilioClient!.calls.create({
                to: customerPhone,
                from: orgPhone,
                url: `${WEBHOOK_BASE_URL}/handleOutboundGreeting?sessionId=${sessionRef.id}`,
                method: "POST",
                statusCallback: `${WEBHOOK_BASE_URL}/handleOutboundStatus?sessionId=${sessionRef.id}`,
                statusCallbackEvent: ["completed", "busy", "no-answer", "failed"],
                timeout: 30
            });

            await sessionRef.update({ twilioCallSid: call.sid });
            await change.after.ref.update({
                callbackInitiated: admin.firestore.Timestamp.now(),
                callbackSessionId: sessionRef.id,
                callbackMethod: "ai_voice"
            });

            console.log(`[OutboundCall] Auto-callback call ${call.sid} initiated for job ${jobId}`);
        } catch (error) {
            console.error(`[OutboundCall] Auto-callback failed for job ${jobId}:`, error);
        }

        return null;
    });

// ============================================================
// HELPERS
// ============================================================

/**
 * Use Gemini to interpret which slot the customer chose from speech.
 */
async function interpretSlotChoice(speech: string, slots: TimeSlot[]): Promise<TimeSlot | null> {
    if (!speech || slots.length === 0) return null;

    // Quick match: if they say a number
    const lower = speech.toLowerCase();
    if ((lower.includes("one") || lower.includes("1") || lower.includes("first")) && slots[0]) return slots[0];
    if ((lower.includes("two") || lower.includes("2") || lower.includes("second")) && slots[1]) return slots[1];
    if ((lower.includes("three") || lower.includes("3") || lower.includes("third")) && slots[2]) return slots[2];

    // Use AI for fuzzy matching
    const model = getGeminiModel();
    if (!model) return slots[0]; // Fallback to first slot if no AI

    try {
        const slotDescriptions = slots.map((s, i) => `Option ${i + 1}: ${s.spoken}`).join("\n");
        const prompt = `The customer was presented these appointment options:\n${slotDescriptions}\n\nThe customer responded: "${speech}"\n\nWhich option did they choose? Respond with ONLY the option number (1, 2, or 3). If they said "yes" or agreed, assume option 1. If you can't determine, respond "unclear".`;

        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();

        if (response.includes("1") && slots[0]) return slots[0];
        if (response.includes("2") && slots[1]) return slots[1];
        if (response.includes("3") && slots[2]) return slots[2];

        return null;
    } catch {
        return null;
    }
}

/**
 * Send confirmation SMS after appointment is scheduled.
 */
async function sendConfirmationSMS(phone: string, orgName: string, slot: TimeSlot, orgId: string) {
    try {
        const { sendSMS } = require("./sms");
        const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
        const fromNumber = subDoc.exists ? subDoc.data()?.phoneNumber : undefined;

        await sendSMS(
            phone,
            `✅ ${orgName}: Your appointment is confirmed for ${slot.dayLabel}, ${slot.date} from ${slot.startTime} to ${slot.endTime}. A technician will arrive during this window. Reply STOP to opt out.`,
            orgId,
            fromNumber
        );
    } catch (err) {
        console.warn("[OutboundCall] Failed to send confirmation SMS:", (err as Error).message);
    }
}

/**
 * Send SMS with time slot options when the call wasn't answered.
 */
async function sendSlotOptionsSMS(phone: string, orgName: string, slots: TimeSlot[], orgId: string) {
    try {
        const { sendSMS } = require("./sms");
        const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
        const fromNumber = subDoc.exists ? subDoc.data()?.phoneNumber : undefined;

        const slotList = slots.map((s, i) => `${i + 1}. ${s.dayLabel} ${s.startTime}-${s.endTime}`).join("\n");

        await sendSMS(
            phone,
            `${orgName}: Your service request has been approved! 🎉 Here are our available times:\n${slotList}\n\nReply with the number of your preferred time (1, 2, or 3). Reply STOP to opt out.`,
            orgId,
            fromNumber
        );
    } catch (err) {
        console.warn("[OutboundCall] Failed to send slot options SMS:", (err as Error).message);
    }
}

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
