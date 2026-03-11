import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";

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

const FROM_EMAIL = "service@dispatch-box.com";
const APP_NAME = "DispatchBox";

// ============================================
// EMAIL TEMPLATES
// ============================================

interface EmailTemplate {
    subject: string;
    html: string;
    text: string;
}

function getTechnicianWelcomeEmail(name: string, email: string, tempPassword?: string): EmailTemplate {
    return {
        subject: `Welcome to ${APP_NAME} - Verify Your Account`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">${APP_NAME}</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937;">Welcome, ${name}!</h2>
                    <p style="color: #4b5563; line-height: 1.6;">
                        Your technician account has been created. Please verify your email address to activate your account.
                    </p>
                    <p style="color: #4b5563; line-height: 1.6;">
                        <strong>Email:</strong> ${email}
                    </p>
                    <p style="color: #4b5563; line-height: 1.6;">
                        Click the verification link in the email from Firebase to complete your registration.
                    </p>
                    <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 8px; border-left: 4px solid #4F46E5;">
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">
                            <strong>Next Steps:</strong><br>
                            1. Verify your email address<br>
                            2. Download the DispatchBox mobile app<br>
                            3. Log in with your credentials<br>
                            4. Start receiving job assignments!
                        </p>
                    </div>
                </div>
                <div style="padding: 20px; text-align: center; background: #1f2937;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
                    </p>
                </div>
            </div>
        `,
        text: `Welcome to ${APP_NAME}, ${name}!\n\nYour technician account has been created.\nEmail: ${email}\n\nPlease verify your email address using the link from Firebase.\n\nNext Steps:\n1. Verify your email\n2. Download the DispatchBox mobile app\n3. Log in\n4. Start receiving jobs!\n\n- The ${APP_NAME} Team`
    };
}

function getJobAssignmentEmail(techName: string, jobDetails: any): EmailTemplate {
    const { siteName, address, description, priority, scheduledDate, scheduledTime } = jobDetails;
    return {
        subject: `New Job Assignment: ${siteName || address}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">${APP_NAME}</h1>
                    <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0 0;">New Job Assignment</p>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937;">Hi ${techName},</h2>
                    <p style="color: #4b5563; line-height: 1.6;">
                        You have been assigned a new job. Here are the details:
                    </p>
                    <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Location:</td>
                                <td style="padding: 10px 0; color: #1f2937; font-weight: 500;">${siteName || address}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Address:</td>
                                <td style="padding: 10px 0; color: #1f2937;">${address}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Priority:</td>
                                <td style="padding: 10px 0;">
                                    <span style="background: ${priority === 'high' || priority === 'critical' ? '#fef2f2' : priority === 'medium' ? '#fffbeb' : '#f0fdf4'}; 
                                                 color: ${priority === 'high' || priority === 'critical' ? '#dc2626' : priority === 'medium' ? '#d97706' : '#16a34a'}; 
                                                 padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500;">
                                        ${priority?.toUpperCase() || 'NORMAL'}
                                    </span>
                                </td>
                            </tr>
                            ${scheduledDate ? `
                            <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Scheduled:</td>
                                <td style="padding: 10px 0; color: #1f2937;">${scheduledDate} ${scheduledTime || ''}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Description:</td>
                                <td style="padding: 10px 0; color: #1f2937;">${description || 'No description provided'}</td>
                            </tr>
                        </table>
                    </div>
                    <p style="color: #4b5563; line-height: 1.6;">
                        Open the DispatchBox app to view full details and start navigating to the job site.
                    </p>
                </div>
                <div style="padding: 20px; text-align: center; background: #1f2937;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
                    </p>
                </div>
            </div>
        `,
        text: `New Job Assignment\n\nHi ${techName},\n\nYou have been assigned a new job:\n\nLocation: ${siteName || address}\nAddress: ${address}\nPriority: ${priority?.toUpperCase() || 'NORMAL'}\n${scheduledDate ? `Scheduled: ${scheduledDate} ${scheduledTime || ''}` : ''}\nDescription: ${description || 'No description provided'}\n\nOpen the DispatchBox app to view full details.\n\n- The ${APP_NAME} Team`
    };
}

function getJobStatusUpdateEmail(customerName: string, jobStatus: string, jobDetails: any): EmailTemplate {
    const statusMessages: Record<string, string> = {
        'scheduled': 'has been scheduled',
        'in_progress': 'is now in progress - a technician is on the way',
        'completed': 'has been completed',
        'cancelled': 'has been cancelled'
    };

    return {
        subject: `Job Update: Your service request ${statusMessages[jobStatus] || 'has been updated'}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">${APP_NAME}</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937;">Hi ${customerName},</h2>
                    <p style="color: #4b5563; line-height: 1.6;">
                        Great news! Your service request ${statusMessages[jobStatus] || 'has been updated'}.
                    </p>
                    <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; border: 1px solid #e5e7eb;">
                        <p style="color: #6b7280; margin: 0 0 10px 0;">Current Status:</p>
                        <span style="background: #4F46E5; color: white; padding: 8px 20px; border-radius: 9999px; font-weight: 500;">
                            ${jobStatus.toUpperCase().replace('_', ' ')}
                        </span>
                    </div>
                    <p style="color: #6b7280; line-height: 1.6; font-size: 14px;">
                        If you have any questions, please reply to this email or contact our support team.
                    </p>
                </div>
                <div style="padding: 20px; text-align: center; background: #1f2937;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
                    </p>
                </div>
            </div>
        `,
        text: `Hi ${customerName},\n\nYour service request ${statusMessages[jobStatus] || 'has been updated'}.\n\nCurrent Status: ${jobStatus.toUpperCase().replace('_', ' ')}\n\nIf you have any questions, please reply to this email.\n\n- The ${APP_NAME} Team`
    };
}

// ============================================
// CORE EMAIL SENDING FUNCTION
// ============================================

async function sendEmail(to: string, template: EmailTemplate): Promise<boolean> {
    if (!SENDGRID_API_KEY) {
        console.warn("SendGrid API Key not set. Logging email instead.");
        await db.collection("email_logs").add({
            to,
            subject: template.subject,
            status: "skipped_no_api_key",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return false;
    }

    try {
        await sgMail.send({
            to,
            from: FROM_EMAIL,
            subject: template.subject,
            html: template.html,
            text: template.text
        });

        // Log successful send
        await db.collection("email_logs").add({
            to,
            subject: template.subject,
            status: "sent",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Email sent successfully to ${to}`);
        return true;
    } catch (error) {
        console.error("Error sending email:", error);

        // Log failed send
        await db.collection("email_logs").add({
            to,
            subject: template.subject,
            status: "failed",
            error: (error as Error).message,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return false;
    }
}

// ============================================
// FIRESTORE TRIGGERS
// ============================================

/**
 * Trigger: When a new technician is created, send welcome email
 */
export const onTechnicianCreated = functions.firestore
    .document("users/{userId}")
    .onCreate(async (snap, context) => {
        const userData = snap.data();

        // Only send for technicians
        if (userData.role !== "technician") {
            return null;
        }

        const template = getTechnicianWelcomeEmail(
            userData.name || "Technician",
            userData.email
        );

        await sendEmail(userData.email, template);

        // Update user doc to show welcome email was sent
        await snap.ref.update({
            welcomeEmailSent: true,
            welcomeEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return null;
    });

/**
 * Trigger: When a job is assigned to a technician, notify them
 */
export const onJobAssigned = functions.firestore
    .document("jobs/{jobId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        // Check if technician was just assigned
        if (before.assigned_technician_id === after.assigned_technician_id) {
            return null; // No change in assignment
        }

        if (!after.assigned_technician_id) {
            return null; // Job was unassigned, don't send email
        }

        // Get technician details
        const techDoc = await db.collection("users").doc(after.assigned_technician_id).get();
        if (!techDoc.exists) {
            console.error(`Technician ${after.assigned_technician_id} not found`);
            return null;
        }

        const techData = techDoc.data()!;

        const template = getJobAssignmentEmail(techData.name || "Technician", {
            siteName: after.site_name,
            address: after.address,
            description: after.description,
            priority: after.priority,
            scheduledDate: after.scheduled_date,
            scheduledTime: after.scheduled_time
        });

        await sendEmail(techData.email, template);
        return null;
    });

/**
 * Trigger: When job status changes, notify customer
 */
export const onJobStatusChange = functions.firestore
    .document("jobs/{jobId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        // Check if status changed
        if (before.status === after.status) {
            return null;
        }

        // Only notify for specific status changes
        const notifyStatuses = ["scheduled", "in_progress", "completed"];
        if (!notifyStatuses.includes(after.status)) {
            return null;
        }

        // Get customer email
        const customerEmail = after.customer_email;
        if (!customerEmail) {
            console.log("No customer email found for job", context.params.jobId);
            return null;
        }

        const template = getJobStatusUpdateEmail(
            after.customer_name || "Customer",
            after.status,
            after
        );

        await sendEmail(customerEmail, template);
        return null;
    });

/**
 * Callable function to send custom emails (for dispatchers)
 */
export const sendCustomEmail = functions.https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Must be authenticated to send emails"
        );
    }

    const { to, subject, body } = data;

    if (!to || !subject || !body) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Missing required fields: to, subject, body"
        );
    }

    const template: EmailTemplate = {
        subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">${APP_NAME}</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <div style="color: #4b5563; line-height: 1.6; white-space: pre-wrap;">${body}</div>
                </div>
                <div style="padding: 20px; text-align: center; background: #1f2937;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
                    </p>
                </div>
            </div>
        `,
        text: body
    };

    const success = await sendEmail(to, template);

    return { success, message: success ? "Email sent successfully" : "Failed to send email" };
});
