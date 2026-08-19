import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";
const twilio = require("twilio");
import { logTextingUsage } from "./textingService";
import { sendSMS } from "./twilio/sms";

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
            success = await sendQuestionEmail(customerEmail, customerName, question, jobId, orgId);
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

async function sendQuestionEmail(email: string, customerName: string, question: string, jobId: string, orgId?: string | null): Promise<boolean> {
    if (!SENDGRID_API_KEY) {
        console.warn("SendGrid API Key not set. Logging email instead.");
        return false;
    }

    // Fetch org branding for white-labeling
    const branding = orgId ? await getOrgBranding(orgId) : null;
    const companyName = branding?.companyName || APP_NAME;
    const primaryColor = branding?.primaryColor || "#4F46E5";
    const logoUrl = branding?.logoUrl || "";
    const fromEmail = branding?.fromEmail || FROM_EMAIL;
    const fromName = branding?.fromName || APP_NAME;

    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${companyName}" style="height:40px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;" />`
        : '';

    try {
        await sgMail.send({
            to: email,
            from: { email: fromEmail, name: fromName },
            subject: `Question about your service request #${jobId.substring(0, 8)}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, ${primaryColor}, #7C3AED); padding: 30px; text-align: center;">
                        ${logoHtml}
                        <h1 style="color: white; margin: 0;">${companyName}</h1>
                    </div>
                    <div style="padding: 30px; background: #f9fafb;">
                        <h2 style="color: #1f2937;">Hi ${customerName},</h2>
                        <p style="color: #4b5563; line-height: 1.6;">
                            We're reviewing your service request and have a quick question:
                        </p>
                        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid ${primaryColor};">
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
                            &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
                        </p>
                    </div>
                </div>
            `,
            text: `Hi ${customerName},\n\nWe're reviewing your service request and have a question:\n\n${question}\n\nPlease reply to this email with your answer.\n\nService Request #: ${jobId.substring(0, 8)}\nStatus: In Review\n\n- The ${companyName} Team`
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
        const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "MGd2bbaa7d8acb6e34baa6f5b63f63c49b";
        await twilioClient.messages.create({
            body: `We have a question about your service request #${jobId.substring(0, 8)}:\n\n${question}\n\nPlease reply to this message with your answer.`,
            messagingServiceSid: messagingServiceSid,
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
            success = await sendApprovalEmail(customerEmail, customerName, jobId, approvalNotes, orgId);
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

async function sendApprovalEmail(email: string, customerName: string, jobId: string, notes?: string, orgId?: string | null): Promise<boolean> {
    if (!SENDGRID_API_KEY) return false;

    // Fetch org branding for white-labeling
    const branding = orgId ? await getOrgBranding(orgId) : null;
    const companyName = branding?.companyName || APP_NAME;
    const logoUrl = branding?.logoUrl || "";
    const fromEmail = branding?.fromEmail || FROM_EMAIL;
    const fromName = branding?.fromName || APP_NAME;

    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${companyName}" style="height:40px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;" />`
        : '';

    try {
        await sgMail.send({
            to: email,
            from: { email: fromEmail, name: fromName },
            subject: `Service request approved - ${companyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
                        ${logoHtml}
                        <h1 style="color: white; margin: 0;">${companyName}</h1>
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
                            &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
                        </p>
                    </div>
                </div>
            `,
            text: `Good news, ${customerName}!\n\nYour service request has been approved and is now being scheduled.\n\n${notes ? `Notes: ${notes}\n\n` : ''}A technician will contact you shortly to confirm the appointment time.\n\n- The ${companyName} Team`
        });
        return true;
    } catch (error) {
        console.error("Error sending approval email:", error);
        return false;
    }
}

async function sendApprovalSMS(phone: string, jobId: string, orgId?: string | null): Promise<boolean> {
    try {
        const body = `Great news! Your service request #${jobId.substring(0, 8)} has been approved. A technician will contact you shortly to schedule the appointment.`;
        const result = await sendSMS(phone, body, {
            orgId: orgId || null,
            jobId
        });
        return result.success;
    } catch (error) {
        console.error("Error sending approval SMS:", error);
        return false;
    }
}

/**
 * Internal function to send automated follow up after AI calls.
 * Used by vapiService.ts
 */
export async function sendAutoFollowUpCommunication(
    orgId: string, 
    jobId: string,
    customerPhone: string, 
    customerEmail: string,
    method: 'sms' | 'email' | 'preferred', 
    messageContent: string
): Promise<boolean> {
    try {
        let actualMethod = method;
        
        // Determine the actual method if preferred is selected
        // In a real scenario, this would look at the customer record or parse the transcript.
        // For now, if we have an email and method is preferred, we default to SMS if we have phone, else email.
        if (method === 'preferred') {
            actualMethod = customerPhone ? 'sms' : 'email';
        }

        // Fetch org branding for white-labeling
        const branding = orgId ? await getOrgBranding(orgId) : null;
        const companyName = branding?.companyName || APP_NAME;
        const primaryColor = branding?.primaryColor || "#4F46E5";
        const logoUrl = branding?.logoUrl || "";
        const fromEmail = branding?.fromEmail || FROM_EMAIL;
        const fromName = branding?.fromName || APP_NAME;

        const logoHtml = logoUrl
            ? `<img src="${logoUrl}" alt="${companyName}" style="height:40px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;" />`
            : '';

        if (actualMethod === 'email' && customerEmail && SENDGRID_API_KEY) {
            await sgMail.send({
                to: customerEmail,
                from: { email: fromEmail, name: fromName },
                subject: `Follow-up regarding your recent call - ${companyName}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, ${primaryColor}, #7C3AED); padding: 30px; text-align: center;">
                            ${logoHtml}
                            <h1 style="color: white; margin: 0;">${companyName}</h1>
                        </div>
                        <div style="padding: 30px; background: #f9fafb;">
                            <p style="color: #4b5563; line-height: 1.6;">
                                Thank you for calling! We wanted to provide a quick follow-up:
                            </p>
                            <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid ${primaryColor};">
                                <p style="color: #1f2937; line-height: 1.6; margin: 0;">
                                    ${messageContent.replace(/\n/g, '<br>')}
                                </p>
                            </div>
                        </div>
                        <div style="padding: 20px; text-align: center; background: #1f2937;">
                            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                                &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
                            </p>
                        </div>
                    </div>
                `,
                text: `Thank you for calling! We wanted to provide a quick follow-up:\n\n${messageContent}\n\n- The ${companyName} Team`
            });
            console.log(`[CustomerComm] Auto follow-up email sent to ${customerEmail}`);
            return true;
        } else if (actualMethod === 'sms' && customerPhone) {
            const body = `${companyName}: Thank you for calling! Follow-up summary:\n\n${messageContent}`;
            await sendSMS(customerPhone, body, {
                orgId: orgId || null,
                jobId
            });
            console.log(`[CustomerComm] Auto follow-up SMS sent to ${customerPhone}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error("[CustomerComm] Error sending auto follow up:", error);
        return false;
    }
}

/**
 * Sends a notification to the customer when a job is scheduled or rescheduled.
 */
export async function sendJobScheduledCommunication(
    orgId: string, 
    jobId: string,
    customerName: string,
    customerPhone: string, 
    customerEmail: string,
    method: 'sms' | 'email' | 'phone_call' | 'all' | 'preferred', 
    scheduledTimeString: string
): Promise<boolean> {
    try {
        let actualMethod = method;
        
        // If preferred, fallback to SMS if available, else email
        if (method === 'preferred') {
            actualMethod = customerPhone ? 'sms' : (customerEmail ? 'email' : 'sms');
        }

        // Fetch org branding for white-labeling
        const branding = orgId ? await getOrgBranding(orgId) : null;
        const companyName = branding?.companyName || APP_NAME;
        const primaryColor = branding?.primaryColor || "#4F46E5";
        const logoUrl = branding?.logoUrl || "";
        const fromEmail = branding?.fromEmail || FROM_EMAIL;
        const fromName = branding?.fromName || APP_NAME;

        const logoHtml = logoUrl
            ? `<img src="${logoUrl}" alt="${companyName}" style="height:40px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;" />`
            : '';

        let emailSent = false;
        let smsSent = false;
        let callSent = false;

        // 1. Email Channel
        if ((actualMethod === 'email' || actualMethod === 'all') && customerEmail && SENDGRID_API_KEY) {
            try {
                await sgMail.send({
                    to: customerEmail,
                    from: { email: fromEmail, name: fromName },
                    subject: `Your job has been scheduled - ${companyName}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: linear-gradient(135deg, ${primaryColor}, #7C3AED); padding: 30px; text-align: center;">
                                ${logoHtml}
                                <h1 style="color: white; margin: 0;">${companyName}</h1>
                            </div>
                            <div style="padding: 30px; background: #f9fafb;">
                                <p style="color: #4b5563; line-height: 1.6;">
                                    Hi ${customerName},
                                </p>
                                <p style="color: #4b5563; line-height: 1.6;">
                                    Your service job has been scheduled for <strong>${scheduledTimeString}</strong>.
                                </p>
                                <p style="color: #4b5563; line-height: 1.6;">
                                    Please let us know if you need to reschedule or have any questions.
                                </p>
                            </div>
                            <div style="padding: 20px; text-align: center; background: #1f2937;">
                                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                                    &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
                                </p>
                            </div>
                        </div>
                    `,
                    text: `Hi ${customerName},\n\nYour job has been scheduled for ${scheduledTimeString}.\n\nPlease let us know if you need to reschedule or have any questions.\n\n- The ${companyName} Team`
                });
                console.log(`[CustomerComm] Job scheduled email sent to ${customerEmail}`);
                emailSent = true;
            } catch (err) {
                console.error(`[CustomerComm] Failed to send job scheduled email to ${customerEmail}:`, err);
            }
        }

        // 2. SMS Channel
        if ((actualMethod === 'sms' || actualMethod === 'all') && customerPhone) {
            try {
                const body = `${companyName}: Hi ${customerName}, your service appointment has been scheduled for ${scheduledTimeString}. Let us know if you need to reschedule.`;
                const result = await sendSMS(customerPhone, body, {
                    orgId: orgId || null,
                    jobId,
                    customerName
                });
                if (result.success) {
                    console.log(`[CustomerComm] Job scheduled SMS sent to ${customerPhone}`);
                    smsSent = true;
                }
            } catch (err) {
                console.error(`[CustomerComm] Failed to send job scheduled SMS to ${customerPhone}:`, err);
            }
        }

        // 3. Automated Voice Phone Call Channel
        if (actualMethod === 'phone_call' && customerPhone && twilioClient) {
            try {
                const normalizedPhone = normalizePhoneToE164(customerPhone);
                const twilioFrom = process.env.TWILIO_PHONE_NUMBER || "+18085550199";
                const twiml = `<Response><Pause length="1"/><Say voice="Polly.Joanna">Hello ${customerName}, this is an automated confirmation from ${companyName}. Your service appointment has been confirmed and scheduled for ${scheduledTimeString}. If you need to make any changes or have any questions, please give us a call. Thank you!</Say></Response>`;
                
                await twilioClient.calls.create({
                    twiml,
                    to: normalizedPhone,
                    from: twilioFrom
                });
                console.log(`[CustomerComm] Job scheduled automated voice call placed to ${normalizedPhone}`);
                callSent = true;
            } catch (err) {
                console.error(`[CustomerComm] Failed to place job scheduled voice call to ${customerPhone}:`, err);
            }
        }
        
        return emailSent || smsSent || callSent;
    } catch (error) {
        console.error("[CustomerComm] Error sending job scheduled communication:", error);
        return false;
    }
}
