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

export async function computeAvailableSlots(orgId: string, techId?: string, jobId?: string): Promise<TimeSlot[]> {
    const slots: TimeSlot[] = [];
    const workStart = 8; // 8 AM
    const workEnd = 17;  // 5 PM
    const slotDuration = 2; // 2-hour windows

    // Fetch org timezone and material scheduling mode
    let tz = "Pacific/Honolulu";
    let materialSchedulingMode: "allow_all" | "estimated_availability" | "in_stock_only" = "allow_all";
    try {
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (orgDoc.exists) {
            tz = guessOrgTimezone(orgDoc.data());
            materialSchedulingMode = orgDoc.data()?.materialSchedulingMode || "allow_all";
        }
    } catch (e) {
        console.warn("Failed to fetch org timezone:", e);
    }

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

    if (effectiveMode !== "allow_all" && jobId) {
        try {
            const materialResult = await computeMaterialReadyDate(orgId, jobId, effectiveMode);

            if (materialResult.blockedReason) {
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
                spoken: `${dayName} ${timeOfDay}, between ${startDisplay} and ${endDisplay} ${endAmPm}`
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
    const callbackSession = {
        jobId,
        orgId,
        orgName,
        customerPhone,
        customerName: job.customer?.name || "there",
        description: job.request?.description || "your service request",
        quoteTotal,
        quotePresentationMode,
        quoteLineItems,
        quoteDiscount,
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

        // Build quote speech based on the tech's preferred presentation mode
        const quoteInfo = (mode === "with_quote" && session.quoteTotal)
            ? " " + buildQuoteSpeech(
                session.quotePresentationMode || "single_price",
                session.quoteTotal,
                session.quoteLineItems || [],
                session.quoteDiscount || undefined
            )
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
            // Parse the chosen slot into a proper Firestore Timestamp for the
            // appointment date/time.  The `scheduled_at` field is what the
            // frontend calendar, tech dashboards, and the onJobStatusChanged
            // notification trigger all depend on.
            const appointmentDate = parseSlotToDate(chosenSlot.date, chosenSlot.startTime);

            // Update the job with the scheduled date/time
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

        // Trigger when quote is approved — detect via any of these transitions:
        // 1. quoteStatus field flips to "approved" (set by approveQuote in quoteService.ts)
        // 2. status transitions from quote_pending → pending with an active_quote_id (customer approved via portal)
        // 3. Legacy: status flips to "quoted" with quoteApproved flag
        const quoteJustApproved = (
            (before.quoteStatus !== "approved" && after.quoteStatus === "approved") ||
            (before.status === "quote_pending" && after.status === "pending" && after.active_quote_id) ||
            (before.status !== "quoted" && after.status === "quoted" && after.quoteApproved === true)
        );

        const depositJustPaid = (before.deposit_paid !== true && after.deposit_paid === true);

        // We trigger scheduling IF:
        // A. The quote was just approved and no deposit is required (or deposit was already paid)
        // B. OR the deposit was just paid and the quote is approved
        const isApproved = after.quoteStatus === "approved" || after.status === "pending" || after.status === "quoted";
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
                if (hour < 9 || hour >= 18) {
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

                const callbackSession = {
                    jobId,
                    orgId,
                    orgName,
                    customerPhone,
                    customerName: after.customer?.name || "there",
                    description: (after.request?.description || "").substring(0, 100),
                    quoteTotal,
                    quotePresentationMode,
                    quoteLineItems,
                    quoteDiscount,
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
