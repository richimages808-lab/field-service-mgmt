import * as functions from "firebase-functions";
import { onCall as onCallV2, HttpsError as HttpsErrorV2 } from "firebase-functions/v2/https";
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
        // Derive the org's primary dispatch-box address from inboundEmail prefix
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
            signatureEnabled: data.outboundEmail?.signatureEnabled ?? false,
            signature: data.outboundEmail?.signature || "",
            emailPrefix,
            aliases: data.inboundEmail?.aliases || [],
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
    replyTo?: string;        // Reply-to address for routing replies back through the system
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
            ...(context?.replyTo ? { replyTo: { email: context.replyTo, name: fromName } } : {}),
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
            {
                orgId: after.org_id,
                emailType: 'job_assignment',
                replyTo: branding?.emailPrefix ? `${branding.emailPrefix}@service.dispatch-box.com` : undefined
            }
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
            {
                orgId: after.org_id,
                emailType: 'job_status_update',
                customerEmail,
                replyTo: branding?.emailPrefix ? `${branding.emailPrefix}@service.dispatch-box.com` : undefined
            }
        );
        return null;
    });

/**
 * Callable function to send custom emails (for dispatchers).
 * Supports choosing a from address via fromAlias and stores sent mail in org inbox.
 * Uses v2 onCall with explicit CORS support for reliable preflight handling.
 */
export const sendCustomEmail = onCallV2(
    { cors: true, memory: "512MiB", timeoutSeconds: 120, invoker: "public" },
    async (request) => {
    if (!request.auth) {
        throw new HttpsErrorV2("unauthenticated", "Must be authenticated to send emails");
    }

    const data = request.data;
    // Support both old 'body' format and new textBody/htmlBody
    const { to, subject, body, textBody, htmlBody, fromAlias, attachments, replyToMessageId } = data;
    const finalHtml = htmlBody || `<p>${(body || '').replace(/\n/g, '<br/>')}</p>`;
    const finalText = textBody || body;

    if (!to || !subject || (!body && !htmlBody)) {
        throw new HttpsErrorV2("invalid-argument", "Missing required fields: to, subject, body");
    }

    // Resolve the caller's org for branding and from-address
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const orgId = userDoc.exists ? (userDoc.data()?.org_id || userDoc.data()?.orgId) : null;
    const branding = orgId ? await getOrgBranding(orgId) : null;
    const companyName = branding?.companyName || APP_NAME;
    const emailPrefix = branding?.emailPrefix || '';

    // Determine the from address: use the fromAlias if provided, otherwise org's prefix-based address
    let fromEmail = FROM_EMAIL;
    let fromName = companyName;
    let replyToAddress = '';
    if (orgId && fromAlias) {
        // Explicit alias selected (e.g., "support.hitopplumbers")
        fromEmail = `${fromAlias}@dispatch-box.com`;
        fromName = `${companyName}`;
        replyToAddress = fromEmail;
    } else if (branding?.fromEmail) {
        // Use the org's default from address (prefix-based or configured)
        fromEmail = branding.fromEmail;
        fromName = branding.fromName || companyName;
        // Set replyTo to the org's dispatch-box address so replies route back through the system
        replyToAddress = emailPrefix
            ? `${emailPrefix}@service.dispatch-box.com`
            : fromEmail;
    }

    const primaryColor = branding?.primaryColor || "#4F46E5";
    const logoUrl = branding?.logoUrl || "";
    
    // Process Signature — supports both raw HTML signatures and structured signature data
    let contentHtml = finalHtml;
    let contentText = finalText;
    
    if (branding?.signatureEnabled && branding.signature) {
        // Check if signature is a JSON structured signature (new format)
        let signatureHtml = "";
        let signatureText = "";
        try {
            const sigData = typeof branding.signature === "string" 
                ? JSON.parse(branding.signature) 
                : branding.signature;
            
            if (sigData && sigData.type === "structured") {
                // Build rich signature from structured data
                signatureHtml = buildStructuredSignatureHtml(sigData, branding);
                signatureText = buildStructuredSignatureText(sigData);
            } else {
                // Fallback to raw HTML signature
                signatureHtml = branding.signature.replace(/\n/g, '<br/>');
                signatureText = branding.signature.replace(/<[^>]+>/g, '');
            }
        } catch {
            // Not JSON — treat as raw HTML/text signature
            signatureHtml = branding.signature.replace(/\n/g, '<br/>');
            signatureText = branding.signature.replace(/<[^>]+>/g, '');
        }
        
        contentHtml += `<br/><br/><div class="email-signature" style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 16px;">${signatureHtml}</div>`;
        contentText += `\n\n-- \n${signatureText}`;
    }

    // Build the email header — use logo if available
    let headerHtml = "";
    if (logoUrl) {
        headerHtml = `
            <div style="background: linear-gradient(135deg, ${primaryColor}, #7C3AED); padding: 24px; text-align: center;">
                <img src="${logoUrl}" alt="${companyName}" style="max-height: 48px; max-width: 200px; margin-bottom: 8px;" />
                <h1 style="color: white; margin: 0; font-size: 20px;">${companyName}</h1>
            </div>`;
    } else {
        headerHtml = `
            <div style="background: linear-gradient(135deg, ${primaryColor}, #7C3AED); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0;">${companyName}</h1>
            </div>`;
    }

    const template: EmailTemplate = {
        subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                ${headerHtml}
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
        customerEmail: to,
        replyTo: replyToAddress || undefined
    });

    // Store outbound email in the org's inbox for tracking (with attachments)
    // Always save regardless of delivery success so user can see it in Sent Items
    if (orgId) {
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
                replyToMessageId: replyToMessageId || null,
                deliveryFailed: !success,
                receivedAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (storeErr) {
            console.error("Failed to store sent email (non-fatal):", storeErr);
        }
    }

    return { success, message: success ? "Email sent successfully" : "Failed to send email" };
});

// ============================================
// SIGNATURE BUILDER HELPERS
// ============================================

interface StructuredSignature {
    type: "structured";
    name: string;
    title: string;
    company: string;
    phone: string;
    email: string;
    website: string;
    logoUrl: string;
    socialLinks: { platform: string; url: string }[];
    tagline: string;
    primaryColor: string;
}

function buildStructuredSignatureHtml(sig: StructuredSignature, branding: any): string {
    const color = sig.primaryColor || branding?.primaryColor || "#4F46E5";
    const parts: string[] = [];

    parts.push(`<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 14px; color: #374151;">`);
    parts.push(`<tr>`);

    // Logo column
    if (sig.logoUrl) {
        parts.push(`<td style="padding-right: 16px; vertical-align: top;">`);
        parts.push(`<img src="${sig.logoUrl}" alt="${sig.company || ''}" style="max-width: 80px; max-height: 80px; border-radius: 8px;" />`);
        parts.push(`</td>`);
    }

    // Info column
    parts.push(`<td style="vertical-align: top;">`);
    if (sig.name) {
        parts.push(`<div style="font-weight: 700; font-size: 16px; color: #111827;">${sig.name}</div>`);
    }
    if (sig.title) {
        parts.push(`<div style="color: ${color}; font-size: 13px; margin-top: 2px;">${sig.title}</div>`);
    }
    if (sig.company) {
        parts.push(`<div style="font-weight: 600; font-size: 13px; margin-top: 2px; color: #4B5563;">${sig.company}</div>`);
    }

    // Contact details
    const contactLines: string[] = [];
    if (sig.phone) contactLines.push(`📞 ${sig.phone}`);
    if (sig.email) contactLines.push(`✉️ <a href="mailto:${sig.email}" style="color: ${color}; text-decoration: none;">${sig.email}</a>`);
    if (sig.website) contactLines.push(`🌐 <a href="${sig.website}" style="color: ${color}; text-decoration: none;">${sig.website}</a>`);

    if (contactLines.length > 0) {
        parts.push(`<div style="margin-top: 8px; font-size: 12px; color: #6B7280; line-height: 1.6;">`);
        parts.push(contactLines.join("<br/>"));
        parts.push(`</div>`);
    }

    // Tagline
    if (sig.tagline) {
        parts.push(`<div style="margin-top: 8px; font-style: italic; font-size: 12px; color: #9CA3AF;">"${sig.tagline}"</div>`);
    }

    // Social links
    if (sig.socialLinks && sig.socialLinks.length > 0) {
        parts.push(`<div style="margin-top: 8px;">`);
        sig.socialLinks.forEach(link => {
            parts.push(`<a href="${link.url}" style="color: ${color}; text-decoration: none; margin-right: 12px; font-size: 12px;">${link.platform}</a>`);
        });
        parts.push(`</div>`);
    }

    parts.push(`</td>`);
    parts.push(`</tr>`);
    parts.push(`</table>`);

    return parts.join("");
}

function buildStructuredSignatureText(sig: StructuredSignature): string {
    const lines: string[] = [];
    if (sig.name) lines.push(sig.name);
    if (sig.title) lines.push(sig.title);
    if (sig.company) lines.push(sig.company);
    if (sig.phone) lines.push(`Phone: ${sig.phone}`);
    if (sig.email) lines.push(`Email: ${sig.email}`);
    if (sig.website) lines.push(`Web: ${sig.website}`);
    if (sig.tagline) lines.push(`"${sig.tagline}"`);
    return lines.join("\n");
}
