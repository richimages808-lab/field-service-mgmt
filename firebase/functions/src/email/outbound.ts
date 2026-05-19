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
// HELPER: GET ORG BRANDING
// ============================================

async function getOrgBranding(orgId: string) {
    try {
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (!orgDoc.exists) return null;
        const data = orgDoc.data()!;
        return {
            companyName: data.branding?.companyName || data.name || APP_NAME,
            primaryColor: data.branding?.primaryColor || "#4F46E5",
            logoUrl: data.branding?.logoUrl || "",
            fromEmail: data.outboundEmail?.fromEmail || FROM_EMAIL,
            fromName: data.outboundEmail?.fromName || data.name || APP_NAME,
            signatureEnabled: data.outboundEmail?.signatureEnabled ?? false,
            signature: data.outboundEmail?.signature || "",
        };
    } catch {
        return null;
    }
}

// ============================================
// EMAIL TEMPLATES
// ============================================

interface EmailAttachment {
    content: string; // base64 string
    filename: string;
    type: string;
    disposition?: string;
    contentId?: string;
}

interface EmailTemplate {
    subject: string;
    html: string;
    text: string;
    attachments?: EmailAttachment[];
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

interface SendEmailContext {
    orgId?: string;          // If provided, email is stored in org inbox
    emailType?: string;      // e.g., "job_status", "job_assignment", "welcome", "custom"
    customerEmail?: string;  // Used for customer history matching (defaults to 'to')
}

async function sendEmail(
    to: string,
    template: EmailTemplate,
    fromEmail: string = FROM_EMAIL,
    fromName: string = APP_NAME,
    context?: SendEmailContext
): Promise<boolean> {
    if (!SENDGRID_API_KEY) {
        console.warn("SendGrid API Key not set. Logging email instead.");
        await db.collection("email_logs").add({
            to,
            from: fromEmail,
            fromName,
            subject: template.subject,
            status: "skipped_no_api_key",
            type: context?.emailType || null,
            orgId: context?.orgId || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return false;
    }

    // Check suppression list — skip addresses that previously bounced, complained, or unsubscribed
    try {
        const { isEmailSuppressed } = require("./webhooks");
        if (await isEmailSuppressed(to)) {
            console.warn(`[Email] Skipping suppressed address: ${to}`);
            await db.collection("email_logs").add({
                to,
                from: fromEmail,
                fromName,
                subject: template.subject,
                status: "skipped_suppressed",
                type: context?.emailType || null,
                orgId: context?.orgId || null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return false;
        }
    } catch (e) {
        // If suppression check fails, proceed with send — better to attempt delivery
        console.warn("[Email] Suppression check failed (non-fatal):", (e as Error).message);
    }

    try {
        await sgMail.send({
            to,
            from: { email: fromEmail, name: fromName },
            subject: template.subject,
            html: template.html,
            text: template.text,
            attachments: template.attachments
        });

        // Log successful send (enriched for customer history)
        await db.collection("email_logs").add({
            to,
            from: fromEmail,
            fromName,
            subject: template.subject,
            htmlBody: (template.html || '').substring(0, 50000),
            status: "sent",
            type: context?.emailType || null,
            orgId: context?.orgId || null,
            direction: "outbound",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Store in org inbox for the Email page
        if (context?.orgId) {
            try {
                await db.collection(`organizations/${context.orgId}/emails`).add({
                    from: fromEmail,
                    fromName: fromName,
                    to,
                    subject: template.subject,
                    textBody: (template.text || '').substring(0, 50000),
                    htmlBody: (template.html || '').substring(0, 100000),
                    mailbox: 'primary',
                    sourceAlias: null,
                    ticketId: null,
                    read: true,
                    starred: false,
                    archived: false,
                    direction: 'outbound',
                    intent: null,
                    emailType: context.emailType || 'automated',
                    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            } catch (storeErr) {
                console.error("Failed to store auto-email in org inbox (non-fatal):", storeErr);
            }
        }

        console.log(`Email sent successfully to ${to}`);
        return true;
    } catch (error) {
        console.error("Error sending email:", error);

        // Log failed send
        await db.collection("email_logs").add({
            to,
            from: fromEmail,
            fromName,
            subject: template.subject,
            status: "failed",
            type: context?.emailType || null,
            orgId: context?.orgId || null,
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

        // Use org branding for consistent sender identity
        const branding = after.org_id ? await getOrgBranding(after.org_id) : null;

        const template = getJobAssignmentEmail(techData.name || "Technician", {
            siteName: after.site_name,
            address: after.address,
            description: after.description,
            priority: after.priority,
            scheduledDate: after.scheduled_date,
            scheduledTime: after.scheduled_time
        });

        await sendEmail(
            techData.email,
            template,
            branding?.fromEmail || FROM_EMAIL,
            branding?.fromName || APP_NAME,
            { orgId: after.org_id, emailType: 'job_assignment' }
        );
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

        // Use org branding for consistent sender identity
        const branding = after.org_id ? await getOrgBranding(after.org_id) : null;
        await sendEmail(
            customerEmail,
            template,
            branding?.fromEmail || FROM_EMAIL,
            branding?.fromName || APP_NAME,
            { orgId: after.org_id, emailType: 'job_status_update', customerEmail }
        );
        return null;
    });

/**
 * Callable function to send custom emails (for dispatchers).
 * Supports choosing a from address via fromAlias and stores sent mail in org inbox.
 */
export const sendCustomEmail = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated to send emails");
    }

    // Support both old 'body' format and new textBody/htmlBody
    const { to, subject, body, textBody, htmlBody, fromAlias, attachments } = data;
    const finalHtml = htmlBody || `<p>${(body || '').replace(/\n/g, '<br/>')}</p>`;
    const finalText = textBody || body;

    if (!to || !subject || (!body && !htmlBody)) {
        throw new functions.https.HttpsError("invalid-argument", "Missing required fields: to, subject, body");
    }

    // Resolve the caller's org for branding and from-address
    const uid = context.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const orgId = userDoc.exists ? userDoc.data()?.orgId : null;
    const branding = orgId ? await getOrgBranding(orgId) : null;
    const companyName = branding?.companyName || APP_NAME;

    // Determine the from address: use the fromAlias if provided, otherwise org default
    let fromEmail = FROM_EMAIL;
    let fromName = companyName;
    if (orgId && fromAlias) {
        fromEmail = `${fromAlias}@dispatch-box.com`;
        fromName = `${companyName}`;
    } else if (branding?.fromEmail) {
        fromEmail = branding.fromEmail;
        fromName = branding.fromName || companyName;
    }

    const primaryColor = branding?.primaryColor || "#4F46E5";
    
    // Process Signature
    let contentHtml = finalHtml;
    let contentText = finalText;
    
    if (branding?.signatureEnabled && branding.signature) {
        contentHtml += `<br/><br/><div class="email-signature">${branding.signature.replace(/\n/g, '<br/>')}</div>`;
        contentText += `\n\n-- \n${branding.signature.replace(/<[^>]+>/g, '')}`; // strip html for text fallback
    }

    const template: EmailTemplate = {
        subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, ${primaryColor}, #7C3AED); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">${companyName}</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <div style="color: #4b5563; line-height: 1.6;">${contentHtml}</div>
                </div>
                <div style="padding: 20px; text-align: center; background: #1f2937;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} ${companyName}. All rights reserved.
                    </p>
                </div>
            </div>
        `,
        text: contentText,
        attachments: []
    };

    // If attachments are provided as Storage paths or objects, fetch their content
    const sgAttachments: EmailAttachment[] = [];
    const savedAttachments: any[] = [];
    if (attachments && Array.isArray(attachments)) {
        for (const att of attachments) {
            if (att.path) {
                try {
                    const file = admin.storage().bucket().file(att.path);
                    const [exists] = await file.exists();
                    if (exists) {
                        const [buffer] = await file.download();
                        sgAttachments.push({
                            content: buffer.toString('base64'),
                            filename: att.name || 'attachment',
                            type: att.type || 'application/octet-stream',
                            disposition: 'attachment'
                        });
                        savedAttachments.push({
                            name: att.name,
                            url: att.url,
                            path: att.path,
                            type: att.type,
                            size: att.size
                        });
                    }
                } catch (e) {
                    console.error("Failed to process attachment:", e);
                }
            }
        }
    }
    if (sgAttachments.length > 0) {
        template.attachments = sgAttachments;
    }

    // Note: We pass emailType but NOT orgId to sendEmail here because sendCustomEmail
    // manages its own org inbox storage below (with attachment metadata).
    // This avoids duplicate entries in the org inbox while still enriching email_logs.
    const success = await sendEmail(to, template, fromEmail, fromName, {
        emailType: 'custom',
        customerEmail: to
    });

    // Store outbound email in the org's inbox for tracking (with attachments)
    if (orgId && success) {
        try {
            const aliasLabel = fromAlias ? fromAlias.split('.')[0] : 'primary';
            await db.collection(`organizations/${orgId}/emails`).add({
                from: fromEmail,
                fromName: fromName,
                to,
                subject,
                textBody: (contentText || '').substring(0, 50000),
                htmlBody: (template.html || '').substring(0, 100000),
                mailbox: aliasLabel,
                sourceAlias: fromAlias || null,
                ticketId: null,
                read: true,
                starred: false,
                archived: false,
                direction: 'outbound',
                intent: null,
                attachments: savedAttachments,
                receivedAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (storeErr) {
            console.error("Failed to store sent email (non-fatal):", storeErr);
        }
    }

    return { success, message: success ? "Email sent successfully" : "Failed to send email" };
});
