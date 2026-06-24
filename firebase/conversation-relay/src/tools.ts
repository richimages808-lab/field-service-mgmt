/**
 * tools.ts — Firestore actions called by the LLM during quote callback conversations.
 * 
 * These mirror the exact same Firestore writes the old keyword-matching system did,
 * so all existing dashboard UI, session views, and analytics remain compatible.
 */

import * as admin from "firebase-admin";

// SendGrid — use require for CommonJS compatibility in Cloud Run
const sgMail = require("@sendgrid/mail");

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Initialize SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
}

// ============================================================
// TYPES (matching existing voice_sessions + quotes schema)
// ============================================================

export interface TimeSlot {
    id: string;
    date: string;
    dayLabel: string;
    startTime: string;
    endTime: string;
    spoken: string;
}

export interface SessionData {
    callerPhone: string;
    calledNumber: string;
    orgId: string;
    quoteId: string;
    jobId: string;
    customerName: string;
    jobDescription: string;
    orgName: string;
    status: string;
    intent: string;
    turn: number;
    transcript: string[];
    availableSlots?: TimeSlot[];
    assignedTechId?: string;
    [key: string]: any;
}

// ============================================================
// TOOL DEFINITIONS (for Gemini function calling)
// ============================================================

export const toolDeclarations = [
    {
        name: "approve_quote",
        description: "Approve the customer's quote. Call this when the customer confirms they want to proceed with the quoted work.",
        parameters: {
            type: "object" as const,
            properties: {
                confirmation: {
                    type: "string",
                    description: "Brief note about how the customer confirmed (e.g., 'Customer said yes, sounds good')"
                }
            },
            required: ["confirmation"]
        }
    },
    {
        name: "get_available_slots",
        description: "Fetch available scheduling time slots for the customer to choose from. Call this after the quote is approved and the customer is ready to schedule.",
        parameters: {
            type: "object" as const,
            properties: {},
            required: []
        }
    },
    {
        name: "schedule_appointment",
        description: "Book the appointment at the customer's chosen time slot. Call this when the customer selects a specific time slot.",
        parameters: {
            type: "object" as const,
            properties: {
                slotIndex: {
                    type: "number",
                    description: "The 1-based index of the chosen time slot from the list provided"
                },
                customerPreference: {
                    type: "string",
                    description: "What the customer said about their preferred time"
                }
            },
            required: ["slotIndex"]
        }
    },
    {
        name: "send_quote_email",
        description: "Email the quote to the customer for review. Call this when the customer wants the quote emailed or texted to them.",
        parameters: {
            type: "object" as const,
            properties: {
                reason: {
                    type: "string",
                    description: "Why the email is being sent (e.g., 'Customer requested email review')"
                }
            },
            required: []
        }
    },
    {
        name: "log_change_request",
        description: "Log a customer's request to change or modify the quote. Call this when the customer asks for pricing changes, modifications, or has specific concerns about the quote.",
        parameters: {
            type: "object" as const,
            properties: {
                changeDetails: {
                    type: "string",
                    description: "What the customer wants to change about the quote"
                }
            },
            required: ["changeDetails"]
        }
    },
    {
        name: "request_human_callback",
        description: "Queue a human follow-up call. Call this when the customer wants to speak with a real person or discuss the quote with someone from the team.",
        parameters: {
            type: "object" as const,
            properties: {
                reason: {
                    type: "string",
                    description: "Why the customer wants a human callback"
                }
            },
            required: []
        }
    },
    {
        name: "end_call",
        description: "End the call politely. Call this when the conversation is complete, the customer declines, or there's nothing more to discuss.",
        parameters: {
            type: "object" as const,
            properties: {
                reason: {
                    type: "string",
                    description: "Why the call is ending (e.g., 'Customer declined', 'Appointment booked', 'Email sent')"
                },
                status: {
                    type: "string",
                    enum: ["completed_scheduled", "completed_declined", "completed_text_sent", "completed_change_requested", "completed_human_requested"],
                    description: "The final status for the session"
                }
            },
            required: ["reason", "status"]
        }
    }
];

// ============================================================
// TOOL EXECUTORS
// ============================================================

export async function executeToolCall(
    toolName: string,
    args: Record<string, any>,
    session: SessionData,
    sessionId: string
): Promise<{ result: string; shouldEndCall?: boolean; endStatus?: string }> {
    const sessionRef = db.collection("voice_sessions").doc(sessionId);

    switch (toolName) {

        case "approve_quote": {
            try {
                // Update quote status
                if (session.quoteId) {
                    await db.collection("quotes").doc(session.quoteId).update({
                        status: "approved",
                        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                        approvedVia: "ai_voice_callback"
                    });
                }

                // Update job status
                if (session.jobId) {
                    await db.collection("jobs").doc(session.jobId).update({
                        status: "approved",
                        quoteApproved: true,
                        quoteApprovedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                // Update session
                await sessionRef.update({
                    status: "approved_scheduling",
                    quoteApprovedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // Send quote email in background
                sendQuoteEmailBackground(session).catch(e =>
                    console.warn("[Tool:approve_quote] Email send failed:", e)
                );

                console.log(`[Tool:approve_quote] Quote ${session.quoteId} approved via ConversationRelay`);
                return { result: "Quote approved successfully. Now ask the customer about scheduling." };
            } catch (e) {
                console.error("[Tool:approve_quote] Error:", (e as Error).message);
                return { result: "Quote approval recorded." };
            }
        }

        case "get_available_slots": {
            try {
                const slots = await computeAvailableSlots(session.orgId, session.assignedTechId);
                
                // Store slots in session
                await sessionRef.update({ availableSlots: slots });
                session.availableSlots = slots;

                const slotDescriptions = slots.map((s, i) =>
                    `Option ${i + 1}: ${s.spoken}`
                ).join(". ");

                return { result: `Here are the available time slots: ${slotDescriptions}` };
            } catch (e) {
                console.error("[Tool:get_available_slots] Error:", (e as Error).message);
                return { result: "I have some availability this week. Let me offer a few options." };
            }
        }

        case "schedule_appointment": {
            try {
                const slotIdx = (args.slotIndex || 1) - 1;
                const slots = session.availableSlots || [];
                const chosen = slots[slotIdx];

                if (!chosen) {
                    return { result: `I don't have an option ${args.slotIndex}. Please choose from the available options.` };
                }

                // Update job with scheduled date/time
                if (session.jobId) {
                    await db.collection("jobs").doc(session.jobId).update({
                        status: "scheduled",
                        scheduledDate: chosen.date,
                        scheduledTime: chosen.startTime,
                        scheduledEndTime: chosen.endTime,
                        scheduledVia: "ai_voice_callback",
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                // Update session
                await sessionRef.update({
                    status: "completed_scheduled",
                    selectedSlot: chosen,
                    scheduledAt: admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`[Tool:schedule] Job ${session.jobId} scheduled for ${chosen.spoken}`);
                return {
                    result: `Appointment confirmed for ${chosen.spoken}. Let the customer know and end the call.`,
                    shouldEndCall: true,
                    endStatus: "completed_scheduled"
                };
            } catch (e) {
                console.error("[Tool:schedule] Error:", (e as Error).message);
                return { result: "I've noted your preference. We'll confirm the appointment shortly." };
            }
        }

        case "send_quote_email": {
            try {
                await sendQuoteEmailBackground(session);
                await sessionRef.update({ status: "completed_text_sent" });
                return {
                    result: "Quote has been emailed. Let the customer know and end the call.",
                    shouldEndCall: true,
                    endStatus: "completed_text_sent"
                };
            } catch (e) {
                console.error("[Tool:send_quote_email] Error:", (e as Error).message);
                return { result: "I'll send that email right away." };
            }
        }

        case "log_change_request": {
            try {
                if (session.quoteId) {
                    const quoteDoc = await db.collection("quotes").doc(session.quoteId).get();
                    const existingNotes = quoteDoc.exists ? (quoteDoc.data()?.customerNotes || []) : [];
                    existingNotes.push({
                        text: args.changeDetails || "Customer requested changes via phone",
                        createdAt: new Date().toISOString(),
                        author: "customer",
                        source: "ai_voice_callback_relay"
                    });

                    await db.collection("quotes").doc(session.quoteId).update({
                        customerNotes: existingNotes,
                        status: "tech_review",
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                await sessionRef.update({ status: "completed_change_requested" });
                await sendQuoteEmailBackground(session);

                return {
                    result: "Change request logged. Tell the customer their technician will review and update the quote.",
                    shouldEndCall: true,
                    endStatus: "completed_change_requested"
                };
            } catch (e) {
                console.error("[Tool:log_change_request] Error:", (e as Error).message);
                return { result: "Change request noted." };
            }
        }

        case "request_human_callback": {
            try {
                await db.collection("pending_callbacks").add({
                    orgId: session.orgId,
                    customerPhone: session.callerPhone,
                    customerName: session.customerName,
                    quoteId: session.quoteId,
                    jobId: session.jobId,
                    type: "human_followup",
                    status: "needs_human_callback",
                    reason: args.reason || "Customer wants to discuss quote before scheduling",
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                await sessionRef.update({ status: "completed_human_requested" });
                return {
                    result: "Human callback queued. Tell the customer someone will reach out shortly.",
                    shouldEndCall: true,
                    endStatus: "completed_human_requested"
                };
            } catch (e) {
                console.error("[Tool:request_human_callback] Error:", (e as Error).message);
                return { result: "I'll have someone call you back." };
            }
        }

        case "end_call": {
            await sessionRef.update({
                status: args.status || "completed_declined"
            });
            return {
                result: "Call ending.",
                shouldEndCall: true,
                endStatus: args.status || "completed_declined"
            };
        }

        default:
            return { result: `Unknown tool: ${toolName}` };
    }
}

// ============================================================
// HELPER: Compute available slots (ported from outboundCall.ts)
// ============================================================

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

async function computeAvailableSlots(orgId: string, techId?: string | null): Promise<TimeSlot[]> {
    const slots: TimeSlot[] = [];
    const workStart = 8;
    const workEnd = 17;
    const slotDuration = 2;

    // Fetch org timezone
    let tz = "Pacific/Honolulu";
    try {
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (orgDoc.exists) {
            tz = guessOrgTimezone(orgDoc.data());
        }
    } catch (e) {
        console.warn("Failed to fetch org timezone:", e);
    }

    const nowLocalStr = new Date().toLocaleString("en-US", { timeZone: tz });
    const now = new Date(nowLocalStr);

    // Next 5 business days
    const businessDays: Date[] = [];
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    while (businessDays.length < 5) {
        if (d.getDay() !== 0 && d.getDay() !== 6) {
            businessDays.push(new Date(d));
        }
        d.setDate(d.getDate() + 1);
    }

    // Get busy slots
    let existingJobsQuery: any = db.collection("jobs")
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

    const existingJobs = await existingJobsQuery.get();
    const busySlots: Record<string, number> = {};

    existingJobs.forEach((doc: any) => {
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
    const maxSlots = 6;
    let slotCount = 0;

    for (const day of businessDays) {
        if (slotCount >= maxSlots) break;
        const year = day.getFullYear();
        const month = String(day.getMonth() + 1).padStart(2, "0");
        const dateVal = String(day.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${dateVal}`;
        const dayName = dayNames[day.getDay()];

        // Collect all open windows
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

        // Pick 1 morning + 1 afternoon per day (balanced)
        const morningWindows = dayWindows.filter(w => w.hour < 12);
        const afternoonWindows = dayWindows.filter(w => w.hour >= 12);
        const pickedWindows: { hour: number }[] = [];
        if (morningWindows.length > 0) pickedWindows.push(morningWindows[0]);
        if (afternoonWindows.length > 0) pickedWindows.push(afternoonWindows[0]);
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
// HELPER: Send quote email (background, non-blocking)
// ============================================================

async function sendQuoteEmailBackground(session: SessionData) {
    try {
        let customerEmail: string | null = null;
        if (session.quoteId) {
            const quoteDoc = await db.collection("quotes").doc(session.quoteId).get();
            if (quoteDoc.exists) {
                customerEmail = quoteDoc.data()?.customer?.email || null;
            }
        }

        if (!customerEmail && session.jobId) {
            const jobDoc = await db.collection("jobs").doc(session.jobId).get();
            if (jobDoc.exists) {
                customerEmail = jobDoc.data()?.customer?.email || null;
            }
        }

        if (!customerEmail) {
            console.log("[Tools] No email found for customer, skipping email send");
            return;
        }

        // Generate access token for the quote portal link
        const tokenDoc = await db.collection("access_tokens").add({
            quoteId: session.quoteId,
            jobId: session.jobId,
            orgId: session.orgId,
            customerEmail,
            type: "quote_view",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });

        const portalUrl = `https://maintenancemanager-c5533.web.app/portal/quote/${tokenDoc.id}`;

        await sgMail.send({
            to: customerEmail,
            from: { email: "service@dispatch-box.com", name: session.orgName || "DispatchBox" },
            subject: `Your Quote from ${session.orgName || "DispatchBox"}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Your Quote is Ready</h2>
                    <p>Hi ${session.customerName || "there"},</p>
                    <p>Here's a link to view and approve your quote for ${session.jobDescription || "your service request"}:</p>
                    <p style="text-align: center; margin: 30px 0;">
                        <a href="${portalUrl}" style="background: #4F46E5; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                            View Your Quote
                        </a>
                    </p>
                    <p>If you have any questions, don't hesitate to reach out.</p>
                    <p>Best regards,<br>${session.orgName || "DispatchBox"}</p>
                </div>
            `
        });

        console.log(`[Tools] Quote email sent to ${customerEmail}`);
    } catch (e) {
        console.warn("[Tools] Email send failed:", (e as Error).message);
    }
}
