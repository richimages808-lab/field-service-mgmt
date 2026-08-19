import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";
import { createAccessToken } from "./accessTokens";
import { sendJobScheduledCommunication } from "./customerCommunication";
import { sendSMS } from "./twilio/sms";

const twilio = require("twilio");

const db = admin.firestore();

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "";
const FROM_EMAIL = "noreply@dispatch-box.com";
const APP_NAME = "DispatchBox";

// ============================================
// HELPER: GET ORG BRANDING
// ============================================

async function getOrgBranding(orgId: string) {
    try {
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (!orgDoc.exists) return null;
        const data = orgDoc.data()!;
        const emailPrefix = data.inboundEmail?.prefix || '';
        const orgFromEmail = emailPrefix
            ? `${emailPrefix}@dispatch-box.com`
            : (data.outboundEmail?.fromEmail || FROM_EMAIL);
        return {
            companyName: data.branding?.companyName || data.name || APP_NAME,
            primaryColor: data.branding?.primaryColor || "#4F46E5",
            logoUrl: data.branding?.logoUrl || "",
            fromEmail: orgFromEmail,
            fromName: data.outboundEmail?.fromName || data.name || APP_NAME,
            emailPrefix,
        };
    } catch {
        return null;
    }
}

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
 * Runs every 5 minutes to process:
 * 1. Pending appointment reminders (appointment_reminders)
 * 2. Pending delayed job scheduled notifications (scheduled_job_notifications)
 */
export const processAppointmentReminders = functions.pubsub
    .schedule("every 5 minutes")
    .onRun(async () => {
        const now = admin.firestore.Timestamp.now();

        // ----------------------------------------------------
        // Part 1: Process Appointment Reminders (24h/2h before)
        // ----------------------------------------------------
        try {
            const snapshot = await db.collection("appointment_reminders")
                .where("status", "==", "pending")
                .where("scheduledFor", "<=", now)
                .limit(50) // Process up to 50 at a time
                .get();

            if (!snapshot.empty) {
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
                            await sendReminderEmail(reminder.recipientEmail, enrichedMessage, trackingUrl, reminder.orgId);
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
            }
        } catch (error) {
            console.error("Error processing appointment reminders:", error);
        }

        // ----------------------------------------------------
        // Part 2: Process Delayed Job Scheduled Notifications
        // ----------------------------------------------------
        try {
            const jobNotifsSnapshot = await db.collection("scheduled_job_notifications")
                .where("status", "==", "pending")
                .where("executeAt", "<=", now)
                .limit(50)
                .get();

            if (!jobNotifsSnapshot.empty) {
                console.log(`Processing ${jobNotifsSnapshot.size} pending delayed job scheduling notifications.`);
                const notifPromises = jobNotifsSnapshot.docs.map(async (doc) => {
                    const item = doc.data();
                    try {
                        // Verify job is still scheduled
                        const jobDoc = await db.collection("jobs").doc(item.jobId).get();
                        if (!jobDoc.exists || jobDoc.data()?.status !== "scheduled") {
                            console.log(`Job ${item.jobId} is no longer scheduled. Marking notification as cancelled.`);
                            await doc.ref.update({
                                status: "cancelled",
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            return;
                        }

                        const success = await sendJobScheduledCommunication(
                            item.orgId,
                            item.jobId,
                            item.customerName || "Customer",
                            item.customerPhone,
                            item.customerEmail,
                            item.channel || "preferred",
                            item.scheduledTimeString
                        );

                        await doc.ref.update({
                            status: success ? "sent" : "failed",
                            sentAt: admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`Delayed job notification ${doc.id} processed: ${success ? 'sent' : 'failed'}`);
                    } catch (err) {
                        console.error(`Error processing delayed job notification ${doc.id}:`, err);
                        await doc.ref.update({
                            status: "failed",
                            error: (err as Error).message,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                });
                await Promise.all(notifPromises);
            }
        } catch (error) {
            console.error("Error processing delayed job scheduling notifications:", error);
        }
    });



/**
 * Callable function to immediately send an SMS or email notification.
 * Called by the frontend "Quick Notify" buttons (e.g., "SMS: On The Way").
 */
export const sendQuickNotification = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { type, recipientPhone, recipientEmail, message, jobId, orgId } = data;

    if (!type || !message) {
        throw new functions.https.HttpsError("invalid-argument", "Missing type or message");
    }

    console.log(`[QuickNotify] Sending ${type} to ${type === 'sms' ? recipientPhone : recipientEmail}`);

    try {
        if (type === 'sms') {
            if (!recipientPhone) {
                throw new functions.https.HttpsError("invalid-argument", "No recipient phone number");
            }
            await sendReminderSMS(recipientPhone, message, orgId);
        } else if (type === 'email') {
            if (!recipientEmail) {
                throw new functions.https.HttpsError("invalid-argument", "No recipient email");
            }
            await sendReminderEmail(recipientEmail, message);
        } else {
            throw new functions.https.HttpsError("invalid-argument", `Unknown notification type: ${type}`);
        }

        // Record the sent notification in Firestore
        await db.collection("appointment_reminders").add({
            job_id: jobId || '',
            org_id: orgId || '',
            type,
            scheduledFor: admin.firestore.FieldValue.serverTimestamp(),
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'sent',
            message,
            ...(type === 'sms' ? { recipientPhone } : { recipientEmail }),
            sentBy: context.auth.uid,
        });

        console.log(`[QuickNotify] ${type.toUpperCase()} sent successfully to ${type === 'sms' ? recipientPhone : recipientEmail}`);
        return { success: true, message: `${type.toUpperCase()} notification sent successfully` };
    } catch (error) {
        console.error(`[QuickNotify] Error sending ${type}:`, error);

        // Record the failure
        await db.collection("appointment_reminders").add({
            job_id: jobId || '',
            org_id: orgId || '',
            type,
            scheduledFor: admin.firestore.FieldValue.serverTimestamp(),
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'failed',
            message,
            error: (error as Error).message,
            ...(type === 'sms' ? { recipientPhone } : { recipientEmail }),
            sentBy: context.auth.uid,
        });

        throw new functions.https.HttpsError(
            "internal",
            `Failed to send ${type}: ${(error as Error).message}`
        );
    }
});

export async function sendReminderSMS(phone: string, message: string, orgId?: string): Promise<void> {
    if (!phone) throw new Error("No recipient phone number provided");

    const result = await sendSMS(phone, message, {
        orgId: orgId || null
    });

    if (!result.success) {
        throw new Error(`Failed to send appointment reminder SMS to ${phone}`);
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

export async function sendReminderEmail(email: string, message: string, trackingUrl?: string, orgId?: string): Promise<void> {
    if (!email) throw new Error("No recipient email address provided");

    if (!SENDGRID_API_KEY) {
        console.warn("[Appointment Reminder] SendGrid not configured. Cannot send email.");
        throw new Error("SendGrid is not configured. Set SENDGRID_API_KEY.");
    }

    // Fetch org branding for white-labeling
    const branding = orgId ? await getOrgBranding(orgId) : null;
    const companyName = branding?.companyName || APP_NAME;
    const primaryColor = branding?.primaryColor || "#2563eb";
    const logoUrl = branding?.logoUrl || "";
    const fromEmail = branding?.fromEmail || FROM_EMAIL;
    const fromName = branding?.fromName || APP_NAME;

    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${companyName}" style="height:40px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;" />`
        : '';

    await sgMail.send({
        to: email,
        from: { email: fromEmail, name: fromName },
        subject: `Appointment Reminder - ${companyName}`,
        text: message,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 24px;">
                    ${logoHtml}
                    <h2 style="color: ${primaryColor};">${companyName} — Appointment Reminder</h2>
                </div>
                <p style="color: #374151; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                ${trackingUrl ? `
                <div style="text-align: center; margin: 24px 0;">
                    <a href="${trackingUrl}" style="display:inline-block;background:linear-gradient(135deg,${primaryColor},#3b82f6);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">View Appointment Details &rarr;</a>
                </div>
                ` : ''}
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                <p style="color: #9ca3af; font-size: 12px;">This is an automated reminder from ${companyName}.</p>
            </div>
        `
    });
}
