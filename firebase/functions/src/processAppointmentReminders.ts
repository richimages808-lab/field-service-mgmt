import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";
import { createAccessToken } from "./accessTokens";

const twilio = require("twilio");

const db = admin.firestore();

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "";
const FROM_EMAIL = "noreply@dispatch-box.com";

if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);

const twilioClient = (() => {
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
        && !TWILIO_ACCOUNT_SID.includes("your-")
        && TWILIO_ACCOUNT_SID.startsWith("AC")) {
        try {
            return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        } catch (e) {
            console.warn("[AppointmentReminders] Failed to initialize Twilio client:", (e as Error).message);
            return null;
        }
    }
    return null;
})();

/**
 * Runs every 5 minutes to process pending appointment reminders.
 * Queries appointment_reminders where status == "pending" and scheduledFor <= now,
 * then sends each via Twilio (SMS) or SendGrid (Email).
 */
export const processAppointmentReminders = functions.pubsub
    .schedule("every 5 minutes")
    .onRun(async () => {
        const now = admin.firestore.Timestamp.now();

        try {
            const snapshot = await db.collection("appointment_reminders")
                .where("status", "==", "pending")
                .where("scheduledFor", "<=", now)
                .limit(50) // Process up to 50 at a time
                .get();

            if (snapshot.empty) {
                console.log("No pending appointment reminders to process.");
                return;
            }

            console.log(`Processing ${snapshot.size} pending appointment reminders.`);

            const promises = snapshot.docs.map(async (doc) => {
                const reminder = doc.data();
                try {
                    // Generate/resolve a token link for the appointment
                    let trackingUrl = '';
                    if (reminder.ticketId || reminder.jobId) {
                        try {
                            const resourceType = reminder.jobId ? 'appointment' as const : 'ticket' as const;
                            const resourceId = reminder.jobId || reminder.ticketId;
                            const token = await createAccessToken({
                                resourceType,
                                resourceId,
                                orgId: reminder.orgId || '',
                                customerPhone: reminder.recipientPhone,
                                customerEmail: reminder.recipientEmail,
                                permissions: ['view', 'reschedule'],
                                createdBy: 'system',
                                expiresInDays: 30,
                            });
                            trackingUrl = `https://dispatch-box.com/t/${token}`;
                        } catch (e) {
                            console.warn(`[AppointmentReminders] Token gen failed for ${doc.id}:`, (e as Error).message);
                        }
                    }

                    const enrichedMessage = trackingUrl
                        ? `${reminder.message}\n\nView or manage your appointment: ${trackingUrl}`
                        : reminder.message;

                    if (reminder.type === "sms") {
                        await sendReminderSMS(reminder.recipientPhone, enrichedMessage);
                    } else if (reminder.type === "email") {
                        await sendReminderEmail(reminder.recipientEmail, enrichedMessage, trackingUrl);
                    } else if (reminder.type === "voice") {
                        await sendReminderCall(reminder.recipientPhone, reminder.message);
                    }

                    await doc.ref.update({
                        status: "sent",
                        sentAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`Reminder ${doc.id} sent successfully via ${reminder.type}.`);
                } catch (sendError) {
                    console.error(`Failed to send reminder ${doc.id}:`, sendError);
                    await doc.ref.update({
                        status: "failed",
                        error: (sendError as Error).message,
                        failedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            });

            await Promise.all(promises);
            console.log("Appointment reminder processing complete.");
        } catch (error) {
            console.error("Error processing appointment reminders:", error);
        }
    });

async function sendReminderSMS(phone: string, message: string): Promise<void> {
    if (!phone) throw new Error("No recipient phone number provided");

    if (twilioClient && TWILIO_PHONE_NUMBER) {
        await twilioClient.messages.create({
            body: message,
            to: phone,
            from: TWILIO_PHONE_NUMBER
        });
    } else {
        console.warn(`[Appointment Reminder] Twilio not configured. Cannot send SMS to ${phone}.`);
        throw new Error("Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.");
    }
}

async function sendReminderCall(phone: string, message: string): Promise<void> {
    if (!phone) throw new Error("No recipient phone number provided");

    if (twilioClient && TWILIO_PHONE_NUMBER) {
        // Escape XML special characters in the message
        const safeMessage = message
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

        await twilioClient.calls.create({
            twiml: `<Response><Say voice="Polly.Joanna">${safeMessage}</Say><Pause length="1"/><Say voice="Polly.Joanna">If you need to reschedule, please call us back at this number. Goodbye!</Say></Response>`,
            to: phone,
            from: TWILIO_PHONE_NUMBER,
            timeout: 30
        });
    } else {
        console.warn(`[Appointment Reminder] Twilio not configured. Cannot make call to ${phone}.`);
        throw new Error("Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.");
    }
}

async function sendReminderEmail(email: string, message: string, trackingUrl?: string): Promise<void> {
    if (!email) throw new Error("No recipient email address provided");

    if (!SENDGRID_API_KEY) {
        console.warn("[Appointment Reminder] SendGrid not configured. Cannot send email.");
        throw new Error("SendGrid is not configured. Set SENDGRID_API_KEY.");
    }

    await sgMail.send({
        to: email,
        from: FROM_EMAIL,
        subject: "Appointment Reminder",
        text: message,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2563eb;">Appointment Reminder</h2>
                <p style="color: #374151; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                ${trackingUrl ? `
                <div style="text-align: center; margin: 24px 0;">
                    <a href="${trackingUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">View Appointment Details &rarr;</a>
                </div>
                ` : ''}
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                <p style="color: #9ca3af; font-size: 12px;">This is an automated reminder from DispatchBox.</p>
            </div>
        `
    });
}
