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
import { computeMaterialReadyDate } from "../materialAvailability";
import { evaluateDepositRequirement, sendDepositPaymentLink } from "../depositEvaluator";
import { getJobTimezone, getTimezoneAbbr } from "../timezoneUtils";

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
        geminiModel = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-3.5-flash" });
        return geminiModel;
    } catch (e) {
        console.error("[OutboundCall] Failed to init Gemini:", (e as Error).message);
        return null;
    }
}

// ============================================================
// TYPES
// ============================================================

export interface TimeSlot {
    id: string;       // e.g. "slot_1"
    date: string;     // e.g. "2026-04-28"
    dayLabel: string;  // e.g. "Monday"
    startTime: string; // e.g. "9:00 AM"
    endTime: string;   // e.g. "11:00 AM"
    spoken: string;    // e.g. "Monday morning between 9 and 11 AM"
}

export interface QuoteLineItemForSpeech {
    type: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
}

export type QuotePresentationMode = 'detailed' | 'category_rollup' | 'single_price';

// ============================================================
// TIME SLOT COMPUTATION
// ============================================================

/**
 * Compute available time slots for a job based on assigned tech's schedule.
 * Looks at the next 5 business days and finds 2-hour windows without conflicts.
 */
function guessOrgTimezone(orgData: any): string {
    if (orgData?.timezone) return orgData.timezone;
    if (orgData?.settings?.timezone) return orgData.settings.timezone;

    const phone = orgData?.communicationChannels?.contactPhone || orgData?.phone || "";
    const ac = phone.replace(/\D/g, "").slice(-10, -7);
    if (!ac) return "Pacific/Honolulu";

    const hst = ["808"];
    const akst = ["907"];
    const pst = ["206","208","209","213","253","310","323","360","408","415","425","503","509","510","530","541","559","562","619","626","650","661","707","714","760","805","818","831","858","909","916","925","949","951"];
    const mst = ["208","303","307","385","406","435","480","505","520","575","602","623","702","719","720","775","801","928","970"];
    const cst = ["205","210","214","217","218","224","225","228","251","254","256","262","281","308","309","312","314","316","318","319","320","334","337","361","402","405","409","414","417","430","432","469","479","501","504","507","512","515","534","539","573","580","601","605","608","612","615","618","620","630","636","651","660","682","701","708","712","713","715","731","763","773","806","815","816","830","832","847","870","901","903","913","915","918","920","931","936","940","952","956","972","979"];

    if (hst.includes(ac)) return "Pacific/Honolulu";
    if (akst.includes(ac)) return "America/Anchorage";
    if (pst.includes(ac)) return "America/Los_Angeles";
    if (mst.includes(ac)) return "America/Denver";
    if (cst.includes(ac)) return "America/Chicago";
    return "America/New_York";
}

function formatDateInTimezone(date: Date, tz: string): string {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
    const parts = formatter.formatToParts(date);
    const partValues: Record<string, string> = {};
    for (const p of parts) {
        partValues[p.type] = p.value;
    }
    return `${partValues.year}-${partValues.month}-${partValues.day}`;
}

export async function computeAvailableSlots(orgId: string, techId?: string, jobId?: string, jobTimezone?: string): Promise<TimeSlot[]> {
    const slots: TimeSlot[] = [];
    const workStart = 8; // 8 AM
    const workEnd = 17;  // 5 PM
    const slotDuration = 2; // 2-hour windows

    // Fetch org timezone and material scheduling mode
    let orgTz = "Pacific/Honolulu";
    let materialSchedulingMode: "allow_all" | "estimated_availability" | "in_stock_only" = "allow_all";
    try {
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (orgDoc.exists) {
            orgTz = guessOrgTimezone(orgDoc.data());
            materialSchedulingMode = orgDoc.data()?.materialSchedulingMode || "allow_all";
        }
    } catch (e) {
        console.warn("Failed to fetch org timezone:", e);
    }

    // Resolve the effective timezone: job address timezone → org timezone
    let tz = orgTz;
    if (jobTimezone) {
        tz = jobTimezone;
    } else if (jobId) {
        // Try to resolve from the job's address if no explicit timezone passed
        try {
            const jobDoc = await db.collection("jobs").doc(jobId).get();
            if (jobDoc.exists) {
                tz = getJobTimezone(jobDoc.data(), orgTz);
            }
        } catch (e) { /* use org timezone */ }
    }

    // Compute timezone abbreviation for spoken text (e.g., "Pacific Time")
    const jobTzAbbr = getTimezoneAbbr(tz);
    const orgTzAbbr = getTimezoneAbbr(orgTz);
    const tzDiffers = jobTzAbbr !== orgTzAbbr;
    const spokenTzSuffix = tzDiffers ? ` ${jobTzAbbr}` : "";

    console.log(`[computeAvailableSlots] Using timezone: ${tz} (${jobTzAbbr})${tzDiffers ? ` (differs from org: ${orgTzAbbr})` : ""}`);

    // ── Material Availability Check ──
    // Check job-level override first, then fall back to org-level default.
    let effectiveMode = materialSchedulingMode;
    let materialStartDate: Date | null = null;
    if (jobId) {
        try {
            const jobDoc = await db.collection("jobs").doc(jobId).get();
            if (jobDoc.exists) {
                const jobOverride = jobDoc.data()?.materialSchedulingOverride;
                if (jobOverride && ["allow_all", "estimated_availability", "in_stock_only"].includes(jobOverride)) {
                    effectiveMode = jobOverride;
                    console.log(`[computeAvailableSlots] Job ${jobId} has per-job override: ${effectiveMode}`);
                }
            }
        } catch (err) {
            console.warn("[computeAvailableSlots] Failed to check job override:", (err as Error).message);
        }
    }

    if (jobId) {
        try {
            const materialResult = await computeMaterialReadyDate(orgId, jobId, effectiveMode);

            if (materialResult.blockedReason && effectiveMode === "in_stock_only") {
                // in_stock_only mode and materials missing — return empty slots
                console.log(`[computeAvailableSlots] Materials blocked for job ${jobId}: ${materialResult.blockedReason}`);
                return [];
            }

            if (materialResult.readyDate) {
                materialStartDate = materialResult.readyDate;
                console.log(`[computeAvailableSlots] Materials for job ${jobId} estimated ready by ${materialStartDate.toISOString()}`);
            }
        } catch (err) {
            console.error("[computeAvailableSlots] Error checking material availability:", (err as Error).message);
            // On error, fall through to normal scheduling (don't block the customer)
        }
    }

    const nowLocalStr = new Date().toLocaleString("en-US", { timeZone: tz });
    const now = new Date(nowLocalStr);

    // Determine the start date for scanning slots
    const d = new Date(now);
    if (materialStartDate && materialStartDate > d) {
        // Shift the scan window to start from the material ready date
        d.setFullYear(materialStartDate.getFullYear());
        d.setMonth(materialStartDate.getMonth());
        d.setDate(materialStartDate.getDate());
    } else {
        d.setDate(d.getDate() + 1); // Default: start from tomorrow
    }

    // Scan more business days when materials push the window out
    const scanDays = materialStartDate ? 7 : 5;
    const businessDays: Date[] = [];
    while (businessDays.length < scanDays) {
        if (d.getDay() !== 0 && d.getDay() !== 6) { // Skip weekends
            businessDays.push(new Date(d));
        }
        d.setDate(d.getDate() + 1);
    }

    // Get existing jobs
    let existingJobsQuery = db.collection("jobs")
        .where("org_id", "==", orgId)
        .where("status", "in", ["scheduled", "in_progress"]);

    if (techId) {
        existingJobsQuery = db.collection("jobs")
            .where("org_id", "==", orgId)
            .where("assigned_to", "==", techId)
            .where("status", "in", ["scheduled", "in_progress"]);
    }

    // Get total active tech count
    let totalTechsCount = 1;
    if (!techId) {
        try {
            const techsSnap = await db.collection("technicians")
                .where("org_id", "==", orgId)
                .get();
            if (!techsSnap.empty) {
                totalTechsCount = techsSnap.size;
            } else {
                const usersSnap = await db.collection("users")
                    .where("org_id", "==", orgId)
                    .where("role", "==", "technician")
                    .get();
                if (!usersSnap.empty) {
                    totalTechsCount = usersSnap.size;
                }
            }
        } catch (err) {
            console.warn("Failed to fetch techs count:", (err as Error).message);
        }
    }

    const existingJobs = await existingJobsQuery.get();
    const busySlots: Record<string, number> = {};

    existingJobs.forEach(doc => {
        const data = doc.data();
        if (data.scheduledDate) {
            let schedDate = "";
            if (typeof data.scheduledDate === "string") {
                schedDate = data.scheduledDate;
            } else if (data.scheduledDate && typeof data.scheduledDate.toDate === "function") {
                schedDate = formatDateInTimezone(data.scheduledDate.toDate(), tz);
            }

            if (schedDate) {
                const schedHour = data.scheduledTime
                    ? parseInt(data.scheduledTime.split(":")[0])
                    : 9;
                const key1 = `${schedDate}_${schedHour}`;
                const key2 = `${schedDate}_${schedHour + 1}`;
                busySlots[key1] = (busySlots[key1] || 0) + 1;
                busySlots[key2] = (busySlots[key2] || 0) + 1;
            }
        }
    });

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const maxSlots = 6; // More slots to give the customer-driven scheduling enough options
    let slotCount = 0;

    for (const day of businessDays) {
        if (slotCount >= maxSlots) break;

        const year = day.getFullYear();
        const month = String(day.getMonth() + 1).padStart(2, "0");
        const dateVal = String(day.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${dateVal}`;
        const dayName = dayNames[day.getDay()];

        // Collect all open windows for the day
        const dayWindows: { hour: number }[] = [];
        for (let hour = workStart; hour <= workEnd - slotDuration; hour += slotDuration) {
            let isSlotBusy = false;
            for (let offset = 0; offset < slotDuration; offset++) {
                const key = `${dateStr}_${hour + offset}`;
                const activeJobsAtHour = busySlots[key] || 0;
                if (techId) {
                    if (activeJobsAtHour > 0) {
                        isSlotBusy = true;
                    }
                } else {
                    if (activeJobsAtHour >= totalTechsCount) {
                        isSlotBusy = true;
                    }
                }
            }
            if (!isSlotBusy) dayWindows.push({ hour });
        }

        // Split into morning (before noon) and afternoon (noon+) windows
        const morningWindows = dayWindows.filter(w => w.hour < 12);
        const afternoonWindows = dayWindows.filter(w => w.hour >= 12);

        // Pick 1 morning + 1 afternoon per day (balanced offering)
        const pickedWindows: { hour: number }[] = [];
        if (morningWindows.length > 0) pickedWindows.push(morningWindows[0]);
        if (afternoonWindows.length > 0) pickedWindows.push(afternoonWindows[0]);
        // If only one time-of-day has availability, take a second from it
        if (pickedWindows.length < 2) {
            const remaining = [...morningWindows, ...afternoonWindows].filter(w => !pickedWindows.includes(w));
            if (remaining.length > 0) pickedWindows.push(remaining[0]);
        }

        for (const win of pickedWindows) {
            if (slotCount >= maxSlots) break;
            const hour = win.hour;

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
                spoken: `${dayName} ${timeOfDay}, between ${startDisplay} and ${endDisplay} ${endAmPm}${spokenTzSuffix}`
            });
        }
    }

    // Fallback: if no slots found (unlikely), offer generic ones
    if (slots.length === 0) {
        const tomorrow = businessDays[0];
        const year = tomorrow.getFullYear();
        const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
        const dateVal = String(tomorrow.getDate()).padStart(2, "0");
        const tomorrowStr = `${year}-${month}-${dateVal}`;
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
    const slots = await computeAvailableSlots(orgId, job.assigned_to, jobId);

    // Get quote details if available and callbackMode allows it
    let quoteTotal = "";
    let quotePresentationMode: QuotePresentationMode = "single_price";
    let quoteLineItems: QuoteLineItemForSpeech[] = [];
    let quoteDiscount: { amount: number; reason?: string } | undefined;
    if (callbackMode === "with_quote" && job.quoteId) {
        const quoteDoc = await db.collection("quotes").doc(job.quoteId).get();
        if (quoteDoc.exists) {
            const quoteData = quoteDoc.data()!;
            quoteTotal = `$${(quoteData.total || 0).toFixed(2)}`;
            quotePresentationMode = quoteData.presentationMode || "single_price";
            quoteLineItems = (quoteData.lineItems || []).map((item: any) => ({
                type: item.type || "labor",
                description: item.description || "",
                quantity: item.quantity || 1,
                unitPrice: item.unitPrice || 0,
                total: item.total || 0
            }));
            if (quoteData.discount && quoteData.discount > 0) {
                quoteDiscount = { amount: quoteData.discount, reason: quoteData.discountReason || undefined };
            }
        }
    }

    // Prevent duplicate callbacks
    if (job.callbackInitiated) {
        throw new functions.https.HttpsError("already-exists", "Callback already initiated for this job");
    }

    // Create a callback session in Firestore
    const callbackSession: any = {
        jobId,
        orgId,
        orgName,
        customerPhone,
        customerName: job.customer?.name || "there",
        description: job.request?.description || "your service request",
        quoteTotal,
        quotePresentationMode,
        quoteLineItems,
        callbackMode,
        slots,
        status: "initiated",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth.uid
    };

    if (quoteDiscount !== undefined) {
        callbackSession.quoteDiscount = quoteDiscount;
    }

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
// Now a SHORT intro only — no quote details, no scheduling slots.
// The customer is given a chance to respond before we proceed.

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

        await sessionDoc.ref.update({
            status: "greeting_delivered",
            callbackStep: "greeting"
        });

        // SHORT greeting — just introduce + ask. No quote. No slots.
        const respondUrl = `${WEBHOOK_BASE_URL}/handleOutboundRespond?sessionId=${sessionId}&amp;step=greeting`;
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${respondUrl}" timeout="6" speechTimeout="auto" language="en-US" enhanced="true" speechModel="phone_call">
        <Say voice="Google.en-US-Neural2-F">Hi ${name}, this is Amy from ${company} calling about your ${desc}. Great news, your quote has been approved! Would you like me to go over the details?</Say>
    </Gather>
    <Say voice="Google.en-US-Neural2-F">I didn't hear a response. We'll send you a text message with the details instead. Have a great day!</Say>
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
// WEBHOOK: Multi-step Outbound Respond (replaces single-shot gather)
// ============================================================
// Each step does ONE thing, listens, classifies the response via Gemini,
// then routes to the appropriate next step. Steps:
//   greeting        → ask if they want details
//   quote_details   → read the quote, ask how it sounds
//   offer_schedule  → ask if they're ready to schedule
//   present_slots   → offer time slots, wait for choice
//   confirm_slot    → confirm the chosen slot
//   handle_question → answer a question, then re-route

type OutboundStep = "greeting" | "quote_details" | "offer_schedule" | "present_slots" | "confirm_slot" | "handle_question";
type CustomerIntent = "wants_details" | "ready_to_schedule" | "chose_slot" | "has_question" | "wants_email" | "wants_changes" | "wants_human" | "declined" | "positive" | "negative" | "unclear";

export const handleOutboundRespond = functions.https.onRequest(async (req: any, res: any) => {
    const sessionId = req.query?.sessionId || "";
    const step = (req.query?.step || "greeting") as OutboundStep;
    const speechResult = req.body?.SpeechResult || "";

    console.log(`[OutboundCall] Step "${step}" — Customer said: "${speechResult}" (session: ${sessionId})`);

    try {
        const sessionDoc = await db.collection("callback_sessions").doc(sessionId).get();
        if (!sessionDoc.exists) {
            res.set("Content-Type", "text/xml");
            return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
        }

        const session = sessionDoc.data()!;
        const slots: TimeSlot[] = session.slots || [];

        // No speech — gentle re-prompt for the current step
        if (!speechResult.trim()) {
            const reprompt = step === "greeting"
                ? "I'm still here! Would you like to hear the details of your approved quote?"
                : step === "present_slots"
                ? "Take your time! Which option works best for you?"
                : "I'm sorry, I didn't catch that. Could you say that again?";

            const respondUrl = `${WEBHOOK_BASE_URL}/handleOutboundRespond?sessionId=${sessionId}&amp;step=${step}`;
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${respondUrl}" timeout="8" speechTimeout="auto" language="en-US" enhanced="true" speechModel="phone_call">
        <Say voice="Google.en-US-Neural2-F">${escapeXml(reprompt)}</Say>
    </Gather>
    <Say voice="Google.en-US-Neural2-F">No worries, we'll send you a text with the details so you can respond at your convenience. Have a great day!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);
        }

        // Log the speech in the session transcript
        const transcript = session.transcript || [];
        transcript.push(`Customer (${step}): ${speechResult}`);

        // Classify the customer's intent based on the current step
        const intent = await classifyCustomerIntent(speechResult, step, slots);
        console.log(`[OutboundCall] Classified intent: ${intent}`);

        // Update session with current step and transcript
        await sessionDoc.ref.update({
            callbackStep: step,
            lastCustomerResponse: speechResult,
            lastClassifiedIntent: intent,
            transcript
        });

        // ── Route based on step + intent ──
        let twiml: string;

        switch (step) {
            case "greeting": {
                twiml = handleGreetingResponse(sessionId, session, intent, speechResult);
                break;
            }
            case "quote_details": {
                twiml = handleQuoteDetailsResponse(sessionId, session, intent, speechResult);
                break;
            }
            case "offer_schedule": {
                twiml = handleOfferScheduleResponse(sessionId, session, intent, slots);
                break;
            }
            case "present_slots": {
                twiml = await handlePresentSlotsResponse(sessionId, session, intent, speechResult, slots, sessionDoc.ref, transcript);
                break;
            }
            case "confirm_slot": {
                twiml = await handleConfirmSlotResponse(sessionId, session, intent, sessionDoc.ref, transcript);
                break;
            }
            default: {
                // Fallback — re-prompt
                twiml = buildStepTwiml(
                    sessionId, "greeting",
                    "I'm sorry, could you say that one more time?"
                );
            }
        }

        res.set("Content-Type", "text/xml");
        return res.status(200).send(twiml);

    } catch (error) {
        console.error("[OutboundCall] Error in respond:", error);
        res.set("Content-Type", "text/xml");
        return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">I'm sorry, there was a technical issue. We'll follow up by text. Goodbye.</Say><Hangup/></Response>`);
    }
});

// ── Step Handlers ──────────────────────────────────────────────

function handleGreetingResponse(sessionId: string, session: any, intent: CustomerIntent, speech: string): string {
    const mode = session.callbackMode || "with_quote";

    switch (intent) {
        case "wants_details":
        case "positive": {
            // Customer wants to hear the quote details
            if (mode === "with_quote" && session.quoteTotal) {
                const quoteInfo = buildQuoteSpeech(
                    session.quotePresentationMode || "single_price",
                    session.quoteTotal,
                    session.quoteLineItems || [],
                    session.quoteDiscount || undefined
                );
                return buildStepTwiml(
                    sessionId, "quote_details",
                    `${escapeXml(quoteInfo)} How does that sound?`
                );
            }
            // No quote to share — skip to scheduling
            return buildStepTwiml(
                sessionId, "offer_schedule",
                "Would you like to schedule your appointment now?"
            );
        }
        case "ready_to_schedule": {
            return buildStepTwiml(
                sessionId, "offer_schedule",
                "Would you like to schedule your appointment now?"
            );
        }
        case "wants_email": {
            return buildEndTwiml(
                `Of course! I'll email you the quote details right now so you can look them over. Have a great day!`,
                sessionId, "completed_text_sent"
            );
        }
        case "declined": {
            return buildEndTwiml(
                `No problem at all. If you change your mind, feel free to give us a call. Have a wonderful day!`,
                sessionId, "completed_declined"
            );
        }
        case "wants_human": {
            return buildEndTwiml(
                `Absolutely, I'll have someone from our team give you a call shortly. Have a great day!`,
                sessionId, "completed_human_requested"
            );
        }
        case "has_question": {
            // Can't answer arbitrary questions in TwiML mode — offer email or human
            return buildStepTwiml(
                sessionId, "greeting",
                `That's a great question. I'd love to help, but I may not have all the details on that. Would you like me to email you the quote so you can review it, or would you prefer someone from our team to call you back?`
            );
        }
        default: {
            // Unclear — gently re-ask
            return buildStepTwiml(
                sessionId, "greeting",
                "I'm sorry, I didn't quite catch that. Would you like me to share the details of your approved quote?"
            );
        }
    }
}

function handleQuoteDetailsResponse(sessionId: string, session: any, intent: CustomerIntent, speech: string): string {
    switch (intent) {
        case "positive":
        case "ready_to_schedule": {
            return buildStepTwiml(
                sessionId, "offer_schedule",
                "Great! Would you like to schedule your appointment now?"
            );
        }
        case "wants_changes": {
            return buildEndTwiml(
                `I completely understand. I'll let the technician know you'd like to discuss the pricing. They'll follow up with an updated quote. We're also emailing you a copy for your records. Have a great day!`,
                sessionId, "completed_change_requested"
            );
        }
        case "wants_email": {
            return buildEndTwiml(
                `Of course! I'll email that over right now so you can review it at your convenience. Take your time, and give us a call when you're ready. Have a great day!`,
                sessionId, "completed_text_sent"
            );
        }
        case "declined":
        case "negative": {
            // Price concern — empathize and offer options
            return buildStepTwiml(
                sessionId, "quote_details",
                `I understand. Would you like me to have the technician review the pricing? Or I can email you the full details to look over.`
            );
        }
        case "wants_human": {
            return buildEndTwiml(
                `Absolutely. I'll have someone from our team reach out to you shortly. Have a great day!`,
                sessionId, "completed_human_requested"
            );
        }
        default: {
            return buildStepTwiml(
                sessionId, "offer_schedule",
                "Would you like to go ahead and schedule your appointment?"
            );
        }
    }
}

function handleOfferScheduleResponse(sessionId: string, session: any, intent: CustomerIntent, slots: TimeSlot[]): string {
    switch (intent) {
        case "positive":
        case "ready_to_schedule": {
            // Present the time slots
            let slotSpeech = "";
            if (slots.length === 1) {
                slotSpeech = `I have an opening ${slots[0].spoken}. Does that work for you?`;
            } else if (slots.length === 2) {
                slotSpeech = `I have two options. Option 1, ${slots[0].spoken}. Or option 2, ${slots[1].spoken}. Which works best for you?`;
            } else if (slots.length >= 3) {
                slotSpeech = `I have a few options. Option 1, ${slots[0].spoken}. Option 2, ${slots[1].spoken}. Or option 3, ${slots[2].spoken}. Which one works best?`;
            } else {
                return buildEndTwiml(
                    `I'm sorry, it looks like we're fully booked right now. I'll have someone from our team reach out with more options. Have a great day!`,
                    sessionId, "completed_human_requested"
                );
            }
            return buildStepTwiml(sessionId, "present_slots", escapeXml(slotSpeech));
        }
        case "negative":
        case "declined": {
            return buildEndTwiml(
                `No problem! I'll email you the quote details so you can schedule whenever you're ready. Have a great day!`,
                sessionId, "completed_text_sent"
            );
        }
        case "wants_email": {
            return buildEndTwiml(
                `Sure thing! I'll email you the details and you can let us know when you'd like to schedule. Have a great day!`,
                sessionId, "completed_text_sent"
            );
        }
        case "wants_human": {
            return buildEndTwiml(
                `Absolutely, I'll have someone give you a call. Have a great day!`,
                sessionId, "completed_human_requested"
            );
        }
        default: {
            return buildStepTwiml(
                sessionId, "offer_schedule",
                "I'm sorry, I didn't quite catch that. Would you like to schedule your appointment now, or would you prefer I email you the details?"
            );
        }
    }
}

async function handlePresentSlotsResponse(
    sessionId: string, session: any, intent: CustomerIntent,
    speech: string, slots: TimeSlot[],
    sessionRef: FirebaseFirestore.DocumentReference, transcript: string[]
): Promise<string> {
    if (intent === "chose_slot") {
        // Determine which slot they chose
        const chosenSlot = await interpretSlotChoice(speech, slots);
        if (chosenSlot) {
            // Store the pending slot and ask for confirmation
            await sessionRef.update({
                pendingSlot: chosenSlot,
                callbackStep: "confirm_slot"
            });
            return buildStepTwiml(
                sessionId, "confirm_slot",
                `Just to confirm, ${escapeXml(chosenSlot.spoken)}. Is that right?`
            );
        }
        // Couldn't determine — re-ask
        return buildStepTwiml(
            sessionId, "present_slots",
            "I'm sorry, I didn't catch which option you prefer. Could you say option 1, 2, or 3?"
        );
    }

    if (intent === "negative" || intent === "declined") {
        return buildEndTwiml(
            `No worries! I'll have someone from our team reach out with more available times. Have a great day!`,
            sessionId, "completed_human_requested"
        );
    }

    if (intent === "wants_email") {
        return buildEndTwiml(
            `Sure! I'll send you a text with all the available times so you can pick one at your convenience. Have a great day!`,
            sessionId, "completed_text_sent"
        );
    }

    // Unclear — re-present
    return buildStepTwiml(
        sessionId, "present_slots",
        "Could you tell me which option you'd prefer? You can say option 1, option 2, or option 3."
    );
}

async function handleConfirmSlotResponse(
    sessionId: string, session: any, intent: CustomerIntent,
    sessionRef: FirebaseFirestore.DocumentReference, transcript: string[]
): Promise<string> {
    const chosenSlot = session.pendingSlot;

    if (!chosenSlot) {
        // No pending slot — go back to slot presentation
        const slots: TimeSlot[] = session.slots || [];
        let slotSpeech = slots.length >= 3
            ? `Let me offer those times again. Option 1, ${slots[0].spoken}. Option 2, ${slots[1].spoken}. Or option 3, ${slots[2].spoken}. Which works best?`
            : slots.length === 2
            ? `Option 1, ${slots[0].spoken}. Or option 2, ${slots[1].spoken}. Which works best?`
            : slots.length === 1
            ? `I have ${slots[0].spoken}. Does that work?`
            : "I'm sorry, we don't have any slots available right now.";
        return buildStepTwiml(sessionId, "present_slots", escapeXml(slotSpeech));
    }

    if (intent === "positive") {
        // Confirmed — schedule the appointment
        const appointmentDate = parseSlotToDate(chosenSlot.date, chosenSlot.startTime);

        if (session.jobId) {
            await db.collection("jobs").doc(session.jobId).update({
                status: "scheduled",
                scheduledDate: chosenSlot.date,
                scheduledTime: chosenSlot.startTime,
                scheduledWindow: `${chosenSlot.startTime} - ${chosenSlot.endTime}`,
                scheduledDay: chosenSlot.dayLabel,
                scheduled_at: admin.firestore.Timestamp.fromDate(appointmentDate),
                scheduledAt: admin.firestore.Timestamp.now(),
                scheduledVia: "ai_callback"
            });
        }

        await sessionRef.update({
            status: "scheduled",
            chosenSlot,
            callbackStep: "completed"
        });

        // Evaluate deposit requirement
        let depositSpeech = "";
        try {
            if (session.orgId && session.quoteId) {
                const depositEval = await evaluateDepositRequirement(
                    session.orgId, session.quoteId, session.customerId
                );
                if (depositEval.required && depositEval.amount > 0) {
                    depositSpeech = ` One last thing. To finalize your appointment, a deposit of $${depositEval.amount.toFixed(2)} is required. We're sending you a secure payment link by text right now.`;
                    sendDepositPaymentLink({
                        orgId: session.orgId, jobId: session.jobId,
                        quoteId: session.quoteId, customerPhone: session.customerPhone,
                        customerEmail: session.customerEmail, customerName: session.customerName,
                        depositAmount: depositEval.amount, depositReason: depositEval.reason
                    }).catch(err => console.error("[OutboundCall] Deposit link send failed:", err));
                }
            }
        } catch (depErr) {
            console.warn("[OutboundCall] Deposit evaluation failed:", depErr);
        }

        // Send confirmation SMS
        await sendConfirmationSMS(session.customerPhone, session.orgName, chosenSlot, session.orgId);

        const company = escapeXml(session.orgName || "Our company");
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">Perfect! You're all set for ${escapeXml(chosenSlot.spoken)}. A technician will arrive during that window.${escapeXml(depositSpeech)} We've also sent you a confirmation text. Thank you for choosing ${company}. Have a great day!</Say>
    <Hangup/>
</Response>`;
    }

    if (intent === "negative") {
        // They didn't confirm — go back to slots
        await sessionRef.update({ pendingSlot: null, callbackStep: "present_slots" });
        const slots: TimeSlot[] = session.slots || [];
        let slotSpeech = "No problem. ";
        if (slots.length >= 3) {
            slotSpeech += `Your options are: option 1, ${slots[0].spoken}. Option 2, ${slots[1].spoken}. Or option 3, ${slots[2].spoken}. Which works best?`;
        } else if (slots.length === 2) {
            slotSpeech += `Option 1, ${slots[0].spoken}. Or option 2, ${slots[1].spoken}. Which do you prefer?`;
        }
        return buildStepTwiml(sessionId, "present_slots", escapeXml(slotSpeech));
    }

    // Unclear confirmation
    return buildStepTwiml(
        sessionId, "confirm_slot",
        `I just want to make sure I have it right. ${escapeXml(chosenSlot.spoken)}, does that work for you?`
    );
}

// ── TwiML Builders ─────────────────────────────────────────────

function buildStepTwiml(sessionId: string, nextStep: OutboundStep, speech: string): string {
    const respondUrl = `${WEBHOOK_BASE_URL}/handleOutboundRespond?sessionId=${sessionId}&amp;step=${nextStep}`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${respondUrl}" timeout="8" speechTimeout="auto" language="en-US" enhanced="true" speechModel="phone_call">
        <Say voice="Google.en-US-Neural2-F">${speech}</Say>
    </Gather>
    <Say voice="Google.en-US-Neural2-F">I didn't hear a response. No worries, we'll send you a text with the details. Have a great day!</Say>
    <Hangup/>
</Response>`;
}

function buildEndTwiml(speech: string, sessionId: string, status: string): string {
    // Fire-and-forget: update session status and send email/SMS as appropriate
    const sessionRef = db.collection("callback_sessions").doc(sessionId);
    sessionRef.update({ status, callbackStep: "completed" }).catch(() => {});

    // Send quote email for text_sent and change_requested statuses
    if (status === "completed_text_sent" || status === "completed_change_requested") {
        sessionRef.get().then(doc => {
            if (doc.exists) {
                const s = doc.data()!;
                if (s.customerPhone && s.orgName) {
                    sendSlotOptionsSMS(s.customerPhone, s.orgName, s.slots || [], s.orgId);
                }
            }
        }).catch(() => {});
    }

    if (status === "completed_human_requested") {
        sessionRef.get().then(doc => {
            if (doc.exists) {
                const s = doc.data()!;
                db.collection("pending_callbacks").add({
                    orgId: s.orgId, customerPhone: s.customerPhone,
                    customerName: s.customerName, quoteId: s.quoteId,
                    jobId: s.jobId, type: "human_followup",
                    status: "needs_human_callback",
                    reason: "Customer requested human callback during outbound quote call",
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                }).catch(() => {});
            }
        }).catch(() => {});
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">${escapeXml(speech)}</Say>
    <Hangup/>
</Response>`;
}

// ── Intent Classification via Gemini ────────────────────────────

async function classifyCustomerIntent(speech: string, step: OutboundStep, slots: TimeSlot[]): Promise<CustomerIntent> {
    if (!speech.trim()) return "unclear";

    // Quick keyword matching for common responses (avoid Gemini latency)
    const lower = speech.toLowerCase().trim();

    // Positive
    if (/^(yes|yeah|yep|sure|okay|ok|go ahead|sounds good|that works|that's right|correct|absolutely|please|uh huh)$/i.test(lower) ||
        /^(yes please|yeah sure|sounds great|that's fine|let's do it|perfect)$/i.test(lower)) {
        if (step === "present_slots" || step === "confirm_slot") {
            // In slot context, "yes" to the first option or a confirmation
            return step === "confirm_slot" ? "positive" : "chose_slot";
        }
        return step === "offer_schedule" ? "ready_to_schedule" : "positive";
    }

    // Negative
    if (/^(no|nope|not right now|not interested|no thanks|nah|i don't think so|not today)$/i.test(lower)) {
        return "negative";
    }

    // Email
    if (lower.includes("email") || lower.includes("text") || lower.includes("send") ||
        lower.includes("mail it") || lower.includes("send it")) {
        return "wants_email";
    }

    // Human
    if (lower.includes("talk to") || lower.includes("speak") || lower.includes("real person") ||
        lower.includes("someone") || lower.includes("manager") || lower.includes("call me back")) {
        return "wants_human";
    }

    // Declined
    if (lower.includes("not interested") || lower.includes("cancel") || lower.includes("don't want") ||
        lower.includes("no longer") || lower.includes("changed my mind")) {
        return "declined";
    }

    // Changes
    if (lower.includes("too much") || lower.includes("too expensive") || lower.includes("change") ||
        lower.includes("adjust") || lower.includes("modify") || lower.includes("discount") ||
        lower.includes("lower") || lower.includes("reduce")) {
        return "wants_changes";
    }

    // Schedule
    if (lower.includes("schedule") || lower.includes("appointment") || lower.includes("book") ||
        lower.includes("when") || lower.includes("time") || lower.includes("available")) {
        return "ready_to_schedule";
    }

    // Slot choice — number-based
    if (step === "present_slots") {
        if (lower.includes("one") || lower.includes("1") || lower.includes("first") ||
            lower.includes("two") || lower.includes("2") || lower.includes("second") ||
            lower.includes("three") || lower.includes("3") || lower.includes("third") ||
            lower.includes("morning") || lower.includes("afternoon") || lower.includes("monday") ||
            lower.includes("tuesday") || lower.includes("wednesday") || lower.includes("thursday") ||
            lower.includes("friday")) {
            return "chose_slot";
        }
    }

    // Details
    if (lower.includes("detail") || lower.includes("how much") || lower.includes("price") ||
        lower.includes("cost") || lower.includes("what is") || lower.includes("tell me") ||
        lower.includes("go over") || lower.includes("hear")) {
        return "wants_details";
    }

    // Fall back to Gemini for more nuanced responses
    const model = getGeminiModel();
    if (!model) return "unclear";

    try {
        const stepContext: Record<string, string> = {
            greeting: "The customer was asked if they want to hear their approved quote details.",
            quote_details: "The customer just heard their quote price and was asked 'How does that sound?'",
            offer_schedule: "The customer was asked if they'd like to schedule their appointment.",
            present_slots: `The customer was offered scheduling options: ${slots.map((s, i) => `Option ${i + 1}: ${s.spoken}`).join(". ")}`,
            confirm_slot: "The customer was asked to confirm their chosen time slot.",
            handle_question: "The customer asked a question."
        };

        const prompt = `You are classifying a phone customer's response.
Context: ${stepContext[step] || "General conversation about a service quote."}
Customer said: "${speech}"

Classify as exactly ONE of these intents:
- positive (yes, agreed, sounds good, confirmed)
- negative (no, declined, not now)
- wants_details (wants to hear quote details/price)
- ready_to_schedule (wants to book an appointment)
- chose_slot (picked a specific time from the options)
- wants_email (wants info emailed/texted)
- wants_changes (wants quote modified, price concern)
- wants_human (wants to talk to a real person)
- declined (not interested, cancel)
- unclear (can't determine intent)

Respond with ONLY the intent word, nothing else.`;

        const result = await Promise.race([
            model.generateContent(prompt),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
        ]) as any;

        const intentStr = result.response.text().trim().toLowerCase().replace(/[^a-z_]/g, "");
        const validIntents: CustomerIntent[] = [
            "wants_details", "ready_to_schedule", "chose_slot", "has_question",
            "wants_email", "wants_changes", "wants_human", "declined", "positive", "negative", "unclear"
        ];
        if (validIntents.includes(intentStr as CustomerIntent)) {
            return intentStr as CustomerIntent;
        }
        return "unclear";
    } catch (e) {
        console.warn("[OutboundCall] Gemini classification failed:", (e as Error).message);
        return "unclear";
    }
}

// ============================================================
// LEGACY WEBHOOK: Outbound Gather (kept for backward compatibility)
// ============================================================
// Old sessions that were initiated before this deploy will still
// hit handleOutboundGather. Route them through the slot logic.

export const handleOutboundGather = functions.https.onRequest(async (req: any, res: any) => {
    const sessionId = req.query?.sessionId || "";
    const speechResult = req.body?.SpeechResult || "";

    console.log(`[OutboundCall] Legacy gather: "${speechResult}" for session ${sessionId}`);

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
            const appointmentDate = parseSlotToDate(chosenSlot.date, chosenSlot.startTime);

            await db.collection("jobs").doc(session.jobId).update({
                status: "scheduled",
                scheduledDate: chosenSlot.date,
                scheduledTime: chosenSlot.startTime,
                scheduledWindow: `${chosenSlot.startTime} - ${chosenSlot.endTime}`,
                scheduledDay: chosenSlot.dayLabel,
                scheduled_at: admin.firestore.Timestamp.fromDate(appointmentDate),
                scheduledAt: admin.firestore.Timestamp.now(),
                scheduledVia: "ai_callback"
            });

            await sessionDoc.ref.update({
                status: "scheduled",
                chosenSlot,
                customerResponse: speechResult
            });

            let depositEval = { required: false, amount: 0, reason: "" };
            try {
                if (session.orgId && session.quoteId) {
                    depositEval = await evaluateDepositRequirement(session.orgId, session.quoteId, session.customerId);
                }
            } catch (depErr) {
                console.warn("[OutboundCall] Deposit evaluation failed (non-blocking):", depErr);
            }

            let confirmSpeech = `Perfect! You're all set for ${escapeXml(chosenSlot.spoken)}. A technician will arrive during that window.`;
            if (depositEval.required && depositEval.amount > 0) {
                confirmSpeech += ` One last thing. To finalize your appointment, a deposit of $${depositEval.amount.toFixed(2)} is required. We're sending you a secure payment link by text right now.`;
            } else {
                confirmSpeech += ` We've also sent you a confirmation text.`;
            }
            confirmSpeech += ` Thank you for choosing ${escapeXml(session.orgName)}. Have a great day!`;

            await sendConfirmationSMS(session.customerPhone, session.orgName, chosenSlot, session.orgId);

            if (depositEval.required && depositEval.amount > 0) {
                sendDepositPaymentLink({
                    orgId: session.orgId, jobId: session.jobId, quoteId: session.quoteId,
                    customerPhone: session.customerPhone, customerEmail: session.customerEmail,
                    customerName: session.customerName, depositAmount: depositEval.amount,
                    depositReason: depositEval.reason
                }).catch(err => console.error("[OutboundCall] Deposit link send failed:", err));
            }

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">${confirmSpeech}</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else {
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

        // Trigger when quote is approved — require quoteStatus to transition to "approved":
        // 1. quoteStatus field flips to "approved" (set by approveQuote or onQuoteStatusChange)
        // 2. Or status transitions from quote_pending → pending AND quoteStatus === "approved"
        // 3. Or legacy: status flips to "quoted" AND quoteStatus === "approved"
        const quoteJustApproved = (
            before.quoteStatus !== "approved" && after.quoteStatus === "approved"
        );

        const depositJustPaid = (before.deposit_paid !== true && after.deposit_paid === true);

        // We trigger scheduling IF:
        // A. The quote was just approved and no deposit is required (or deposit was already paid)
        // B. OR the deposit was just paid and the quote is approved
        const isApproved = after.quoteStatus === "approved";
        const needsDeposit = after.deposit_required === true;
        const isDepositPaid = after.deposit_paid === true;

        let shouldTrigger = false;
        if (quoteJustApproved) {
            if (!needsDeposit || isDepositPaid) {
                shouldTrigger = true;
            }
        } else if (depositJustPaid && isApproved) {
            shouldTrigger = true;
        }

        if (!shouldTrigger) return null;

        // Guard: don't double-callback/double-schedule
        if (after.callbackInitiated) {
            console.log(`[OutboundCall] Job ${jobId} already has a callback or schedule request initiated. Skipping.`);
            return null;
        }

        const orgId = after.org_id;
        if (!orgId) return null;

        // Check if org has auto-callback enabled
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        const orgData = orgDoc.exists ? orgDoc.data() : null;
        if (!orgData || orgData.autoCallbackEnabled !== true) {
            return null;
        }

        const schedulingPref = after.schedulingPreference || 'email';
        console.log(`[OutboundCall] Auto-triggering scheduling for job ${jobId} via preference: ${schedulingPref}`);

        // ── Material Availability Pre-Check ──
        // Compute slots with material awareness. If slots come back empty,
        // materials are blocking scheduling — flag the job and notify customer.
        const materialAwareSlots = await computeAvailableSlots(orgId, after.assigned_to, jobId);
        if (materialAwareSlots.length === 0) {
            // Check effective mode (job override > org default)
            const jobOverride = after.materialSchedulingOverride;
            const orgMode = orgData?.materialSchedulingMode || "allow_all";
            const effectiveMode = (jobOverride && ["allow_all", "estimated_availability", "in_stock_only"].includes(jobOverride))
                ? jobOverride : orgMode;

            if (effectiveMode !== "allow_all") {
                console.log(`[OutboundCall] Materials not ready for job ${jobId}. Scheduling deferred.`);
                await change.after.ref.update({
                    materialSchedulingBlocked: true,
                    materialBlockedAt: admin.firestore.Timestamp.now(),
                    materialBlockedReason: "Required materials are not yet available. Scheduling will be offered once materials are in stock or estimated to arrive."
                });

                // Notify the customer that we'll reach out when materials arrive
                const orgName = orgData?.name || "Our company";
                const customerPhone = after.customer?.phone;
                const customerEmail = after.customer?.email;

                if (customerPhone) {
                    try {
                        const { sendSMS } = require("./sms");
                        const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
                        const fromNumber = subDoc.exists ? subDoc.data()?.phoneNumber : undefined;
                        await sendSMS(
                            customerPhone,
                            `${orgName}: Thank you for approving your service quote! We're currently waiting on parts to arrive for your job. We'll reach out to schedule your appointment as soon as everything is ready. Thank you for your patience!`,
                            orgId,
                            fromNumber
                        );
                        console.log(`[OutboundCall] Sent "awaiting materials" SMS to ${customerPhone} for job ${jobId}`);
                    } catch (smsErr) {
                        console.warn("[OutboundCall] Failed to send awaiting-materials SMS:", (smsErr as Error).message);
                    }
                }

                if (customerEmail) {
                    try {
                        // TODO: Implement email notification for "awaiting materials" case
                        console.log(`[OutboundCall] Customer ${customerEmail} will be notified via SMS. Email notification for awaiting-materials not yet implemented.`);
                    } catch (emailErr) {
                        console.warn("[OutboundCall] Failed to send awaiting-materials email:", (emailErr as Error).message);
                    }
                }

                return null;
            }
            // If allow_all and still empty, fall through (edge case: all tech slots full)
        }

        try {
            if (schedulingPref === 'email') {
                const customerEmail = after.customer?.email;
                if (customerEmail) {
                    const slots = materialAwareSlots;
                    const { sendScheduleSelectionEmail } = require("../email/quoteNotifications");
                    await sendScheduleSelectionEmail({
                        customerEmail,
                        customerName: after.customer?.name || "Customer",
                        orgId,
                        quoteId: after.active_quote_id || after.quoteId || '',
                        slots
                    });
                    await change.after.ref.update({
                        callbackInitiated: admin.firestore.Timestamp.now(),
                        callbackMethod: "email"
                    });
                    console.log(`[OutboundCall] Sent automated scheduling email to ${customerEmail} for job ${jobId}`);
                } else {
                    console.warn(`[OutboundCall] Job ${jobId} has no customer email for email scheduling.`);
                }
            } 
            else if (schedulingPref === 'text') {
                const customerPhone = after.customer?.phone;
                if (customerPhone) {
                    const orgName = orgData?.name || "Our company";
                    const slots = materialAwareSlots;
                    await sendSlotOptionsSMS(customerPhone, orgName, slots, orgId);
                    await change.after.ref.update({
                        callbackInitiated: admin.firestore.Timestamp.now(),
                        callbackMethod: "sms"
                    });
                    console.log(`[OutboundCall] Sent automated scheduling SMS to ${customerPhone} for job ${jobId}`);
                } else {
                    console.warn(`[OutboundCall] Job ${jobId} has no customer phone for SMS scheduling.`);
                }
            } 
            else { // 'phone' (Call)
                const customerPhone = after.customer?.phone;
                if (!customerPhone) {
                    console.warn(`[OutboundCall] Job ${jobId} has no customer phone. Skipping voice callback.`);
                    return null;
                }

                // Check business hours before calling
                const now = new Date();
                const hour = now.getHours();
                const isTestCell = customerPhone && (customerPhone.replace(/\D/g, '').endsWith("8082829726") || customerPhone.includes("282-9726"));
                if (!isTestCell && (hour < 9 || hour >= 18)) {
                    console.log(`[OutboundCall] Outside business hours (${hour}:00). Scheduling SMS instead.`);
                    const orgName = orgData?.name || "Our company";
                    const slots = materialAwareSlots;
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
                const callbackMode = orgData?.callbackMode || "with_quote";

                const slots = materialAwareSlots;

                let quoteTotal = "";
                let quotePresentationMode: QuotePresentationMode = "single_price";
                let quoteLineItems: QuoteLineItemForSpeech[] = [];
                let quoteDiscount: { amount: number; reason?: string } | undefined;
                const quoteId = after.active_quote_id || after.quoteId;
                if (callbackMode === "with_quote" && quoteId) {
                    const quoteDoc = await db.collection("quotes").doc(quoteId).get();
                    if (quoteDoc.exists) {
                        const quoteData = quoteDoc.data()!;
                        quoteTotal = `$${(quoteData.total || 0).toFixed(2)}`;
                        quotePresentationMode = quoteData.presentationMode || "single_price";
                        quoteLineItems = (quoteData.lineItems || []).map((item: any) => ({
                            type: item.type || "labor",
                            description: item.description || "",
                            quantity: item.quantity || 1,
                            unitPrice: item.unitPrice || 0,
                            total: item.total || 0
                        }));
                        if (quoteData.discount && quoteData.discount > 0) {
                            quoteDiscount = { amount: quoteData.discount, reason: quoteData.discountReason || undefined };
                        }
                    }
                }

                const callbackSession: any = {
                    jobId,
                    orgId,
                    orgName,
                    customerPhone,
                    customerName: after.customer?.name || "there",
                    description: (after.request?.description || "").substring(0, 100),
                    quoteTotal,
                    quotePresentationMode,
                    quoteLineItems,
                    callbackMode,
                    slots,
                    status: "auto_initiated",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdBy: "system"
                };

                if (quoteDiscount !== undefined) {
                    callbackSession.quoteDiscount = quoteDiscount;
                }

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
            }
        } catch (error) {
            console.error(`[OutboundCall] Auto-scheduling failed for job ${jobId}:`, error);
        }

        return null;
    });

// ============================================================
// HELPERS
// ============================================================

/**
 * Parse a slot's date string ("YYYY-MM-DD") and time string ("9:00 AM")
 * into a JavaScript Date object representing the appointment start time.
 */
function parseSlotToDate(dateStr: string, timeStr: string): Date {
    // Parse time like "9:00 AM", "12:00 PM", "2:00 PM"
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    let hours = 0;
    let minutes = 0;

    if (timeMatch) {
        hours = parseInt(timeMatch[1], 10);
        minutes = parseInt(timeMatch[2], 10);
        const meridiem = timeMatch[3].toUpperCase();

        if (meridiem === "PM" && hours !== 12) {
            hours += 12;
        } else if (meridiem === "AM" && hours === 12) {
            hours = 0;
        }
    }

    // dateStr is "YYYY-MM-DD"
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0);
}

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

/**
 * Build the spoken quote presentation based on the tech's preferred mode.
 *
 * - single_price:    "Your quote total is $950."
 * - category_rollup: "Your quote includes $300 for labor and $650 for materials, for a total of $950."
 * - detailed:        "Your quote includes 2 items: first, faucet replacement labor at $150 each,
 *                     and second, Delta faucet parts at $325 each, for a total of $950."
 */
export function buildQuoteSpeech(
    mode: QuotePresentationMode,
    total: string,
    lineItems: QuoteLineItemForSpeech[],
    discountInfo?: { amount: number; reason?: string }
): string {
    // Build discount speech if applicable
    let discountSpeech = "";
    if (discountInfo && discountInfo.amount > 0) {
        const discAmt = `$${discountInfo.amount.toFixed(2)}`;
        if (discountInfo.reason) {
            discountSpeech = ` That includes a ${discAmt} discount for ${discountInfo.reason}.`;
        } else {
            discountSpeech = ` That includes a ${discAmt} discount.`;
        }
    }

    // Fallback: if no line items or mode is single_price, just read the total
    if (mode === "single_price" || !lineItems || lineItems.length === 0) {
        return `Your approved quote total is ${total}.${discountSpeech}`;
    }

    if (mode === "category_rollup") {
        // Group items by type and sum their totals
        const categories: Record<string, number> = {};
        for (const item of lineItems) {
            const cat = formatCategoryLabel(item.type);
            categories[cat] = (categories[cat] || 0) + item.total;
        }

        const parts = Object.entries(categories)
            .filter(([, amt]) => amt > 0)
            .map(([cat, amt]) => `$${amt.toFixed(2)} for ${cat}`);

        if (parts.length === 0) {
            return `Your approved quote total is ${total}.${discountSpeech}`;
        }
        if (parts.length === 1) {
            return `Your quote includes ${parts[0]}, for a total of ${total}.${discountSpeech}`;
        }
        const last = parts.pop()!;
        return `Your quote includes ${parts.join(", ")} and ${last}, for a total of ${total}.${discountSpeech}`;
    }

    // detailed mode — read individual line items
    // Cap at 5 items to avoid overwhelming the caller on the phone
    const itemsToRead = lineItems.slice(0, 5);
    const itemSpeeches = itemsToRead.map((item, i) => {
        const desc = item.description || formatCategoryLabel(item.type);
        if (item.quantity > 1) {
            return `${desc}, ${item.quantity} at $${item.unitPrice.toFixed(2)} each`;
        }
        return `${desc} at $${item.total.toFixed(2)}`;
    });

    let speech = "";
    if (itemSpeeches.length === 1) {
        speech = `Your quote includes ${itemSpeeches[0]}`;
    } else {
        const last = itemSpeeches.pop()!;
        speech = `Your quote includes ${itemSpeeches.join(", ")}, and ${last}`;
    }

    if (lineItems.length > 5) {
        speech += `, plus ${lineItems.length - 5} additional items`;
    }

    speech += `, for a total of ${total}.${discountSpeech}`;
    return speech;
}

/**
 * Convert a line item type code to a human-friendly spoken label.
 */
function formatCategoryLabel(type: string): string {
    const labels: Record<string, string> = {
        labor: "labor",
        material: "materials",
        equipment: "equipment",
        travel: "travel",
        fee: "fees",
        discount: "discounts"
    };
    return labels[type] || type;
}
