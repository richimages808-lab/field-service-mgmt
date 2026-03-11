import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";
const twilio = require("twilio");
import { logTextingUsage } from "./textingService";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Initialize SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
}

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
            console.warn("[CustomerCommunication] Failed to initialize Twilio client:", (e as Error).message);
            return null;
        }
    }
    return null;
})();

const FROM_EMAIL = "service@dispatch-box.com";
const APP_NAME = "DispatchBox";

/**
 * Normalize a phone number to E.164 format for Twilio.
 * Converts formats like "808-282-9726", "(808) 282-9726", "8082829726" to "+18082829726".
 */
function normalizePhoneToE164(phone: string): string {
    // Strip all non-digit characters except leading +
    const hasPlus = phone.startsWith('+');
    const digits = phone.replace(/\D/g, '');

    if (hasPlus && digits.length >= 11) {
        // Already has + and enough digits (e.g. +18082829726)
        return `+${digits}`;
    }
    if (digits.length === 10) {
        // US number without country code (e.g. 8082829726)
        return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
        // US number with country code but no + (e.g. 18082829726)
        return `+${digits}`;
    }
    // Return with + if not already present
    return hasPlus ? `+${digits}` : `+${digits}`;
}

interface CustomerQuestionData {
    jobId: string;
    customerEmail: string;
    customerPhone: string;
    customerName: string;
    question: string;
    communicationMethod: 'email' | 'text' | 'phone';
}

/**
 * Callable function to send questions to customers via their preferred method
 */
export const sendCustomerQuestion = functions.https.onCall(async (data: CustomerQuestionData, context) => {
    // Auth check
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Must be authenticated to send customer questions"
        );
    }

    const { jobId, customerEmail, customerPhone, customerName, question, communicationMethod } = data;

    if (!jobId || !question) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Missing required fields: jobId, question"
        );
    }

    // Look up org ID from the job to check for dedicated phone number
    let orgId: string | null = null;
    try {
        const jobDoc = await db.collection("jobs").doc(jobId).get();
        orgId = jobDoc.data()?.orgId || jobDoc.data()?.organizationId || null;
    } catch (e) {
        console.warn("[CustomerComm] Could not look up job org:", (e as Error).message);
    }

    try {
        let success = false;

        if (communicationMethod === 'email' && customerEmail) {
            success = await sendQuestionEmail(customerEmail, customerName, question, jobId);
        } else if (communicationMethod === 'text' && customerPhone) {
            success = await sendQuestionSMS(customerPhone, question, jobId, orgId);
        } else if (communicationMethod === 'phone') {
            // For phone, we just log the request - tech needs to call manually
            await logPhoneCallRequest(jobId, customerPhone, question);
            success = true;
        } else {
            throw new functions.https.HttpsError(
                "invalid-argument",
                `Invalid communication method or missing contact info: ${communicationMethod}`
            );
        }

        // Log the communication
        await db.collection("customer_communications").add({
            jobId,
            type: "question",
            method: communicationMethod,
            question,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            sentBy: context.auth.uid,
            success
        });

        return {
            success,
            message: success
                ? `Question sent via ${communicationMethod}`
                : `Failed to send question via ${communicationMethod}`
        };
    } catch (error) {
        console.error("Error sending customer question:", error);
        throw new functions.https.HttpsError(
            "internal",
            `Failed to send question: ${(error as Error).message}`
        );
    }
});

async function sendQuestionEmail(email: string, customerName: string, question: string, jobId: string): Promise<boolean> {
    if (!SENDGRID_API_KEY) {
        console.warn("SendGrid API Key not set. Logging email instead.");
        return false;
    }

    try {
        await sgMail.send({
            to: email,
            from: FROM_EMAIL,
            subject: `Question about your service request #${jobId.substring(0, 8)}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">${APP_NAME}</h1>
                    </div>
                    <div style="padding: 30px; background: #f9fafb;">
                        <h2 style="color: #1f2937;">Hi ${customerName},</h2>
                        <p style="color: #4b5563; line-height: 1.6;">
                            We're reviewing your service request and have a quick question:
                        </p>
                        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #4F46E5;">
                            <p style="color: #1f2937; line-height: 1.6; margin: 0;">
                                ${question}
                            </p>
                        </div>
                        <p style="color: #4b5563; line-height: 1.6;">
                            Please reply to this email with your answer, and we'll process your request right away.
                        </p>
                        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                            <strong>Service Request #:</strong> ${jobId.substring(0, 8)}<br>
                            <strong>Status:</strong> In Review
                        </p>
                    </div>
                    <div style="padding: 20px; text-align: center; background: #1f2937;">
                        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                            © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
                        </p>
                    </div>
                </div>
            `,
            text: `Hi ${customerName},\n\nWe're reviewing your service request and have a question:\n\n${question}\n\nPlease reply to this email with your answer.\n\nService Request #: ${jobId.substring(0, 8)}\nStatus: In Review\n\n- The ${APP_NAME} Team`
        });

        console.log(`Question email sent to ${email}`);
        return true;
    } catch (error) {
        console.error("Error sending question email:", error);
        return false;
    }
}

async function sendQuestionSMS(phone: string, question: string, jobId: string, orgId?: string | null): Promise<boolean> {
    // Determine which phone number to send from
    let fromNumber = TWILIO_PHONE_NUMBER;
    let subPerMessageRate = 0;

    if (orgId) {
        try {
            const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
            if (subDoc.exists && subDoc.data()?.status === "active") {
                fromNumber = subDoc.data()?.phoneNumber || TWILIO_PHONE_NUMBER;
                subPerMessageRate = subDoc.data()?.perMessageOverageRate || 0.05;
                console.log(`[CustomerComm] Using org dedicated number: ${fromNumber}`);
            }
        } catch (e) {
            console.warn("[CustomerComm] Could not check org subscription:", (e as Error).message);
        }
    }

    if (!twilioClient || !fromNumber) {
        console.warn("Twilio not configured. Skipping SMS send.");
        return false;
    }

    try {
        const normalizedPhone = normalizePhoneToE164(phone);
        await twilioClient.messages.create({
            body: `${APP_NAME}: We have a question about your service request #${jobId.substring(0, 8)}:\n\n${question}\n\nPlease reply to this message with your answer.`,
            from: fromNumber,
            to: normalizedPhone
        });

        // Log usage for billing if org has a subscription
        if (orgId && subPerMessageRate > 0) {
            try {
                await logTextingUsage(orgId, "sent", subPerMessageRate);
            } catch (e) {
                console.warn("[CustomerComm] Failed to log texting usage:", (e as Error).message);
            }
        }

        console.log(`Question SMS sent to ${normalizedPhone} from ${fromNumber}`);
        return true;
    } catch (error) {
        console.error("Error sending question SMS:", error);
        return false;
    }
}

async function logPhoneCallRequest(jobId: string, phone: string, question: string): Promise<void> {
    await db.collection("phone_call_queue").add({
        jobId,
        customerPhone: phone,
        question,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Phone call request logged for ${phone}`);
}

/**
 * Callable function to send approval notification to customer
 */
export const sendJobApprovalNotification = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { jobId, customerEmail, customerPhone, customerName, communicationMethod, approvalNotes } = data;

    // Look up org ID from the job
    let orgId: string | null = null;
    try {
        const jobDoc = await db.collection("jobs").doc(jobId).get();
        orgId = jobDoc.data()?.orgId || jobDoc.data()?.organizationId || null;
    } catch (e) {
        console.warn("[CustomerComm] Could not look up job org for approval:", (e as Error).message);
    }

    try {
        let success = false;

        if (communicationMethod === 'email' && customerEmail) {
            success = await sendApprovalEmail(customerEmail, customerName, jobId, approvalNotes);
        } else if (communicationMethod === 'text' && customerPhone) {
            success = await sendApprovalSMS(customerPhone, jobId, orgId);
        }

        await db.collection("customer_communications").add({
            jobId,
            type: "approval",
            method: communicationMethod,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            sentBy: context.auth.uid,
            success
        });

        return { success, message: success ? "Approval notification sent" : "Failed to send notification" };
    } catch (error) {
        console.error("Error sending approval notification:", error);
        throw new functions.https.HttpsError("internal", (error as Error).message);
    }
});

async function sendApprovalEmail(email: string, customerName: string, jobId: string, notes?: string): Promise<boolean> {
    if (!SENDGRID_API_KEY) return false;

    try {
        await sgMail.send({
            to: email,
            from: FROM_EMAIL,
            subject: `Service request approved - We'll be in touch soon!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">${APP_NAME}</h1>
                    </div>
                    <div style="padding: 30px; background: #f9fafb;">
                        <h2 style="color: #1f2937;">Good news, ${customerName}!</h2>
                        <p style="color: #4b5563; line-height: 1.6;">
                            Your service request has been approved and is now being scheduled.
                        </p>
                        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; border: 1px solid #e5e7eb;">
                            <p style="color: #6b7280; margin: 0 0 10px 0;">Status:</p>
                            <span style="background: #10b981; color: white; padding: 8px 20px; border-radius: 9999px; font-weight: 500;">
                                APPROVED
                            </span>
                        </div>
                        ${notes ? `
                        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #10b981;">
                            <p style="color: #6b7280; margin: 0 0 10px 0; font-size: 14px;">Notes:</p>
                            <p style="color: #1f2937; margin: 0;">${notes}</p>
                        </div>
                        ` : ''}
                        <p style="color: #4b5563; line-height: 1.6;">
                            A technician will contact you shortly to confirm the appointment time.
                        </p>
                    </div>
                    <div style="padding: 20px; text-align: center; background: #1f2937;">
                        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                            © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
                        </p>
                    </div>
                </div>
            `,
            text: `Good news, ${customerName}!\n\nYour service request has been approved and is now being scheduled.\n\n${notes ? `Notes: ${notes}\n\n` : ''}A technician will contact you shortly to confirm the appointment time.\n\n- The ${APP_NAME} Team`
        });
        return true;
    } catch (error) {
        console.error("Error sending approval email:", error);
        return false;
    }
}

async function sendApprovalSMS(phone: string, jobId: string, orgId?: string | null): Promise<boolean> {
    // Determine which phone number to send from
    let fromNumber = TWILIO_PHONE_NUMBER;
    let subPerMessageRate = 0;

    if (orgId) {
        try {
            const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
            if (subDoc.exists && subDoc.data()?.status === "active") {
                fromNumber = subDoc.data()?.phoneNumber || TWILIO_PHONE_NUMBER;
                subPerMessageRate = subDoc.data()?.perMessageOverageRate || 0.05;
            }
        } catch (e) {
            console.warn("[CustomerComm] Could not check org subscription:", (e as Error).message);
        }
    }

    if (!twilioClient || !fromNumber) return false;

    try {
        const normalizedPhone = normalizePhoneToE164(phone);
        await twilioClient.messages.create({
            body: `${APP_NAME}: Great news! Your service request #${jobId.substring(0, 8)} has been approved. A technician will contact you shortly to schedule the appointment.`,
            from: fromNumber,
            to: normalizedPhone
        });

        // Log usage for billing
        if (orgId && subPerMessageRate > 0) {
            try {
                await logTextingUsage(orgId, "sent", subPerMessageRate);
            } catch (e) {
                console.warn("[CustomerComm] Failed to log texting usage:", (e as Error).message);
            }
        }

        return true;
    } catch (error) {
        console.error("Error sending approval SMS:", error);
        return false;
    }
}
