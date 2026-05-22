import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";
import { createAccessToken } from "../accessTokens";

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
const APP_BASE_URL = "https://dispatchbox.app";

// ============================================
// HELPER: SEND EMAIL WITH LOGGING
// ============================================

interface EmailLogContext {
    orgId?: string;          // If provided, email is stored in org inbox
    emailType?: string;      // e.g., "quote_notification", "ticket_confirmation"
    replyTo?: string;        // Reply-to address for routing replies back through the system
}

async function sendEmailWithLog(
    to: string,
    subject: string,
    html: string,
    text: string,
    fromEmail: string = FROM_EMAIL,
    fromName: string = "DispatchBox",
    context?: EmailLogContext
): Promise<boolean> {
    if (!SENDGRID_API_KEY) {
        console.warn("SendGrid API Key not set. Logging email instead.");
        await db.collection("email_logs").add({
            to,
            from: fromEmail,
            fromName,
            subject,
            status: "skipped_no_api_key",
            type: context?.emailType || "quote_notification",
            orgId: context?.orgId || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return false;
    }

    // Check suppression list
    try {
        const { isEmailSuppressed } = require("./webhooks");
        if (await isEmailSuppressed(to)) {
            console.warn(`[QuoteEmail] Skipping suppressed address: ${to}`);
            await db.collection("email_logs").add({
                to,
                from: fromEmail,
                fromName,
                subject,
                status: "skipped_suppressed",
                type: context?.emailType || "quote_notification",
                orgId: context?.orgId || null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return false;
        }
    } catch (e) {
        console.warn("[QuoteEmail] Suppression check failed (non-fatal):", (e as Error).message);
    }

    try {
        await sgMail.send({
            to,
            from: { email: fromEmail, name: fromName },
            ...(context?.replyTo ? { replyTo: { email: context.replyTo, name: fromName } } : {}),
            subject,
            html,
            text
        });

        // Log successful send (enriched for customer history)
        await db.collection("email_logs").add({
            to,
            from: fromEmail,
            fromName,
            subject,
            htmlBody: (html || '').substring(0, 50000),
            status: "sent",
            type: context?.emailType || "quote_notification",
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
                    subject,
                    textBody: (text || '').substring(0, 50000),
                    htmlBody: (html || '').substring(0, 100000),
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
                console.error("Failed to store email in org inbox (non-fatal):", storeErr);
            }
        }

        console.log(`[QuoteEmail] Sent to ${to}: ${subject}`);
        return true;
    } catch (error) {
        console.error("[QuoteEmail] Error sending email:", error);
        await db.collection("email_logs").add({
            to,
            from: fromEmail,
            fromName,
            subject,
            status: "failed",
            type: context?.emailType || "quote_notification",
            orgId: context?.orgId || null,
            error: (error as Error).message,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return false;
    }
}

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
            companyName: data.branding?.companyName || data.name || "DispatchBox",
            primaryColor: data.branding?.primaryColor || "#4F46E5",
            logoUrl: data.branding?.logoUrl || "",
            fromEmail: orgFromEmail,
            fromName: data.outboundEmail?.fromName || data.name || "DispatchBox",
            emailPrefix,
        };
    } catch {
        return null;
    }
}

// ============================================
// HELPER: GET TECH EMAIL FOR ORG
// ============================================

async function getOrgOwnerEmail(orgId: string): Promise<string | null> {
    // Try to find the org owner/admin
    const usersSnap = await db.collection("users")
        .where("org_id", "==", orgId)
        .where("role", "in", ["owner", "admin", "dispatcher"])
        .limit(1)
        .get();

    if (!usersSnap.empty) {
        return usersSnap.docs[0].data().email || null;
    }

    // Fallback: check the org document for a contact email
    const orgDoc = await db.collection("organizations").doc(orgId).get();
    if (orgDoc.exists) {
        const data = orgDoc.data()!;
        return data.contactEmail || data.outboundEmail?.fromEmail || data.inboundEmail?.forwardTo || null;
    }

    return null;
}

// ============================================
// EMAIL TEMPLATES
// ============================================

function buildQuoteEmailToCustomer(opts: {
    customerName: string;
    quoteNumber: string;
    total: number;
    scopeOfWork: string;
    quoteLink: string;
    validUntil: string;
    companyName: string;
    primaryColor: string;
    logoUrl: string;
}): { html: string; text: string } {
    const { customerName, quoteNumber, total, scopeOfWork, quoteLink, validUntil, companyName, primaryColor, logoUrl } = opts;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <!-- Header -->
  <tr><td style="background:${primaryColor};padding:32px 40px;text-align:center;">
    ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="height:40px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;" />` : ''}
    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">${companyName}</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Service Quote</p>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:40px;">
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Hi ${customerName},</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">
      We've prepared a quote for your service request. Here's a summary:
    </p>
    <div style="background:#f8f9fc;border-radius:8px;padding:20px;margin:0 0 24px;border:1px solid #e5e7eb;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Quote Number:</td>
          <td style="padding:8px 0;color:#1f2937;font-weight:600;text-align:right;">${quoteNumber}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Estimated Total:</td>
          <td style="padding:8px 0;color:#1f2937;font-weight:700;font-size:18px;text-align:right;">$${total.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Valid Until:</td>
          <td style="padding:8px 0;color:#1f2937;text-align:right;">${validUntil}</td>
        </tr>
      </table>
    </div>
    <div style="background:#f8f9fc;border-left:4px solid ${primaryColor};padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 28px;">
      <p style="color:#6b7280;font-size:12px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Scope of Work</p>
      <p style="color:#333;font-size:14px;line-height:1.5;margin:0;">${scopeOfWork.substring(0, 300)}${scopeOfWork.length > 300 ? '...' : ''}</p>
    </div>
    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${quoteLink}" style="display:inline-block;background:${primaryColor};color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.3px;">
        View Full Quote &rarr;
      </a>
    </td></tr></table>
    <p style="color:#999;font-size:13px;text-align:center;margin:20px 0 0;">
      Click the button above to view the complete quote details, approve, or request changes.
    </p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #eee;">
    <p style="color:#999;font-size:12px;margin:0;text-align:center;">
      This quote was prepared by ${companyName}.<br/>
      &copy; ${new Date().getFullYear()} Powered by DispatchBox
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `Hi ${customerName},\n\nWe've prepared a quote for your service request.\n\nQuote Number: ${quoteNumber}\nEstimated Total: $${total.toFixed(2)}\nValid Until: ${validUntil}\n\nScope of Work:\n${scopeOfWork}\n\nView and approve your quote here:\n${quoteLink}\n\nThank you!\n${companyName}`;

    return { html, text };
}

function buildTechNotificationEmail(opts: {
    heading: string;
    message: string;
    details: { label: string; value: string }[];
    ctaText?: string;
    ctaUrl?: string;
    companyName: string;
    primaryColor: string;
    accentColor: string;
}): { html: string; text: string } {
    const { heading, message, details, ctaText, ctaUrl, primaryColor, accentColor } = opts;

    const detailsHtml = details.map(d =>
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">${d.label}:</td><td style="padding:8px 0;color:#1f2937;font-weight:500;text-align:right;">${d.value}</td></tr>`
    ).join('');

    const detailsText = details.map(d => `${d.label}: ${d.value}`).join('\n');

    const ctaHtml = ctaText && ctaUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td align="center">
      <a href="${ctaUrl}" style="display:inline-block;background:${primaryColor};color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">
        ${ctaText} &rarr;
      </a>
    </td></tr></table>` : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:${primaryColor};padding:28px 40px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">DispatchBox</h1>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <div style="background:${accentColor};border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <h2 style="margin:0;font-size:18px;color:#1a1a2e;">${heading}</h2>
    </div>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">${message}</p>
    <div style="background:#f8f9fc;border-radius:8px;padding:16px 20px;border:1px solid #e5e7eb;">
      <table style="width:100%;border-collapse:collapse;">${detailsHtml}</table>
    </div>
    ${ctaHtml}
  </td></tr>
  <tr><td style="background:#f8f9fc;padding:20px 40px;border-top:1px solid #eee;">
    <p style="color:#999;font-size:12px;margin:0;text-align:center;">
      &copy; ${new Date().getFullYear()} DispatchBox. All rights reserved.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `${heading}\n\n${message}\n\n${detailsText}\n\n${ctaText ? `${ctaText}: ${ctaUrl}` : ''}\n\n- DispatchBox`;

    return { html, text };
}

// ============================================
// CALLABLE: SEND QUOTE EMAIL TO CUSTOMER
// ============================================

/**
 * Callable function to send a quote email to the customer.
 * Called from the frontend when a tech "sends" a quote.
 */
export const sendQuoteEmail = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { quoteId } = data;
    if (!quoteId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing quoteId");
    }

    // Get quote
    const quoteDoc = await db.collection("quotes").doc(quoteId).get();
    if (!quoteDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Quote not found");
    }

    const quote = quoteDoc.data()!;
    const customerEmail = quote.customer?.email;

    if (!customerEmail) {
        throw new functions.https.HttpsError("failed-precondition", "Customer email not found on quote");
    }

    // Get org branding
    const branding = await getOrgBranding(quote.org_id);
    const companyName = branding?.companyName || "DispatchBox";
    const primaryColor = branding?.primaryColor || "#4F46E5";
    const logoUrl = branding?.logoUrl || "";
    const fromEmail = branding?.fromEmail || FROM_EMAIL;
    const fromName = branding?.fromName || "DispatchBox";

    // Generate access token for frictionless quote access
    let quoteLink = `${APP_BASE_URL}/quote/${quoteId}`;
    let trackingCode = '';
    try {
        const token = await createAccessToken({
            resourceType: 'quote',
            resourceId: quoteId,
            orgId: quote.org_id,
            customerEmail,
            customerPhone: quote.customer?.phone,
            customerName: quote.customer?.name,
            permissions: ['view', 'approve', 'decline'],
            createdBy: 'email',
            expiresInDays: 90,
        });
        quoteLink = `${APP_BASE_URL}/t/${token}`;
        trackingCode = token;
        console.log(`[QuoteEmail] Generated token ${token} for quote ${quoteId}`);
    } catch (tokenErr) {
        console.warn('[QuoteEmail] Token generation failed, using direct link:', (tokenErr as Error).message);
    }

    // Format valid until
    let validUntilStr = "30 days";
    if (quote.validUntil) {
        const validDate = quote.validUntil.toDate ? quote.validUntil.toDate() : new Date(quote.validUntil);
        validUntilStr = validDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    const { html, text } = buildQuoteEmailToCustomer({
        customerName: quote.customer?.name || "Customer",
        quoteNumber: quote.quoteNumber || `Q-${quoteId.substring(0, 6).toUpperCase()}`,
        total: quote.total || 0,
        scopeOfWork: quote.scopeOfWork || "See full quote for details.",
        quoteLink,
        validUntil: validUntilStr,
        companyName,
        primaryColor,
        logoUrl,
    });

    const success = await sendEmailWithLog(
        customerEmail,
        `Your Service Quote from ${companyName} — ${quote.quoteNumber || ''}`,
        html,
        text,
        fromEmail,
        fromName,
        {
            orgId: quote.org_id,
            emailType: 'quote_sent',
            replyTo: branding?.emailPrefix ? `${branding.emailPrefix}@service.dispatch-box.com` : undefined
        }
    );

    // Update quote to record email was sent
    if (success) {
        const updateData: any = {
            emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
            emailSentTo: customerEmail,
        };
        if (trackingCode) updateData.accessToken = trackingCode;
        await quoteDoc.ref.update(updateData);
    }

    return {
        success,
        message: success ? `Quote email sent to ${customerEmail}` : "Failed to send quote email",
        quoteLink,
        trackingCode: trackingCode || undefined,
    };
});

// ============================================
// FIRESTORE TRIGGER: QUOTE STATUS CHANGES
// Notifies the tech/dispatcher when customers
// interact with quotes.
// ============================================

export const onQuoteStatusChange = functions.firestore
    .document("quotes/{quoteId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const quoteId = context.params.quoteId;

        // Only fire on status changes
        if (before.status === after.status) {
            return null;
        }

        const orgId = after.org_id;
        if (!orgId) return null;

        // Get the tech/owner email
        const techEmail = await getOrgOwnerEmail(orgId);
        if (!techEmail) {
            console.log(`[QuoteNotify] No tech/owner email found for org ${orgId}`);
            return null;
        }

        const branding = await getOrgBranding(orgId);
        const primaryColor = branding?.primaryColor || "#4F46E5";
        const customerName = after.customer?.name || "A customer";
        const quoteNumber = after.quoteNumber || `Q-${quoteId.substring(0, 6).toUpperCase()}`;
        const total = after.total || 0;
        const dashboardUrl = `${APP_BASE_URL}/quotes/${quoteId}`;

        // ── QUOTE APPROVED ──
        if (after.status === "approved" && before.status !== "approved") {
            const { html, text } = buildTechNotificationEmail({
                heading: "✅ Quote Approved!",
                message: `Great news! ${customerName} has approved your quote. The job is ready to be scheduled.`,
                details: [
                    { label: "Quote", value: quoteNumber },
                    { label: "Customer", value: customerName },
                    { label: "Total", value: `$${total.toFixed(2)}` },
                    { label: "Approved At", value: new Date().toLocaleString() },
                ],
                ctaText: "View Quote & Schedule Job",
                ctaUrl: dashboardUrl,
                companyName: branding?.companyName || "DispatchBox",
                primaryColor,
                accentColor: "#dcfce7", // green tint
            });

            await sendEmailWithLog(techEmail, `✅ Quote ${quoteNumber} Approved — $${total.toFixed(2)}`, html, text, undefined, undefined, { orgId, emailType: 'quote_approved' });
        }

        // ── QUOTE DECLINED ──
        if (after.status === "declined" && before.status !== "declined") {
            const reason = after.declineReason || "No reason provided";
            const { html, text } = buildTechNotificationEmail({
                heading: "❌ Quote Declined",
                message: `${customerName} has declined the quote.${reason !== "No reason provided" ? ` Reason: "${reason}"` : ""}`,
                details: [
                    { label: "Quote", value: quoteNumber },
                    { label: "Customer", value: customerName },
                    { label: "Total", value: `$${total.toFixed(2)}` },
                    { label: "Reason", value: reason },
                ],
                ctaText: "View Quote Details",
                ctaUrl: dashboardUrl,
                companyName: branding?.companyName || "DispatchBox",
                primaryColor,
                accentColor: "#fee2e2", // red tint
            });

            await sendEmailWithLog(techEmail, `❌ Quote ${quoteNumber} Declined`, html, text, undefined, undefined, { orgId, emailType: 'quote_declined' });
        }

        // ── QUOTE CHANGE REQUEST (tech_review) ──
        if (after.status === "tech_review" && before.status !== "tech_review") {
            // Get the latest customer note
            const customerNotes = after.customerNotes || [];
            const latestCustomerNote = [...customerNotes].reverse().find((n: any) => n.author === "customer");
            const noteText = latestCustomerNote?.text || "The customer has requested changes.";

            const { html, text } = buildTechNotificationEmail({
                heading: "🔄 Change Request",
                message: `${customerName} has requested changes to the quote. Please review and respond.`,
                details: [
                    { label: "Quote", value: quoteNumber },
                    { label: "Customer", value: customerName },
                    { label: "Total", value: `$${total.toFixed(2)}` },
                    { label: "Customer's Request", value: `"${noteText.substring(0, 150)}${noteText.length > 150 ? '...' : ''}"` },
                ],
                ctaText: "Review & Respond",
                ctaUrl: dashboardUrl,
                companyName: branding?.companyName || "DispatchBox",
                primaryColor,
                accentColor: "#fef3c7", // amber tint
            });

            await sendEmailWithLog(techEmail, `🔄 Quote ${quoteNumber} — Customer Change Request`, html, text, undefined, undefined, { orgId, emailType: 'quote_change_request' });
        }

        // ── QUOTE VIEWED ──
        if (after.status === "viewed" && before.status === "sent") {
            // Lighter notification — just log, don't email for views to avoid noise
            console.log(`[QuoteNotify] Quote ${quoteNumber} viewed by customer`);
        }

        return null;
    });

// ============================================
// FIRESTORE TRIGGER: NEW TICKET → TECH EMAIL
// Notifies the tech/owner when a new service
// request ticket is created.
// ============================================

export const onNewTicketCreated = functions.firestore
    .document("tickets/{ticketId}")
    .onCreate(async (snap, context) => {
        const ticket = snap.data();
        const orgId = ticket.organizationId;

        if (!orgId) return null;

        const branding = await getOrgBranding(orgId);
        const primaryColor = branding?.primaryColor || "#4F46E5";
        const companyName = branding?.companyName || "DispatchBox";
        const source = ticket.source || "UNKNOWN";
        const sourceLabel = source === "EMAIL" ? "📧 Email" :
                           source === "PHONE" ? "📞 Phone Call" :
                           source === "PORTAL" ? "🌐 Portal" :
                           source === "AI_CALL" ? "🤖 AI Voice" : `📋 ${source}`;

        // ── 1. Notify the tech/owner ──
        const techEmail = await getOrgOwnerEmail(orgId);
        if (techEmail) {
            const dashboardUrl = `${APP_BASE_URL}/intake`;
            const { html, text } = buildTechNotificationEmail({
                heading: "📋 New Service Request",
                message: `A new service request has arrived and needs your attention.`,
                details: [
                    { label: "Source", value: sourceLabel },
                    { label: "Customer", value: ticket.customerName || ticket.requestorEmail || "Unknown" },
                    { label: "Subject", value: ticket.subject || "Service Request" },
                    { label: "Urgency", value: (ticket.urgency || "MEDIUM").toUpperCase() },
                    { label: "Description", value: (ticket.description || "").substring(0, 150) + ((ticket.description || "").length > 150 ? "..." : "") },
                ],
                ctaText: "View in Dashboard",
                ctaUrl: dashboardUrl,
                companyName,
                primaryColor,
                accentColor: "#dbeafe", // blue tint
            });

            await sendEmailWithLog(
                techEmail,
                `📋 New Service Request — ${ticket.customerName || ticket.subject || 'New Request'}`,
                html,
                text,
                undefined,
                undefined,
                { orgId, emailType: 'new_ticket_tech' }
            );
        } else {
            console.log(`[TicketNotify] No tech/owner email found for org ${orgId}`);
        }

        // ── 2. Send confirmation email to the customer (with tracking code) ──
        const customerEmail = ticket.requestorEmail;
        if (customerEmail) {
            const customerName = ticket.requestorName || ticket.customerName || "there";
            const logoUrl = branding?.logoUrl || "";
            const fromEmail = branding?.fromEmail || FROM_EMAIL;
            const fromName = branding?.fromName || companyName;

            // Generate access token for the ticket
            let trackingCode = '';
            let trackingUrl = '';
            try {
                const token = await createAccessToken({
                    resourceType: 'ticket',
                    resourceId: snap.id,
                    orgId,
                    customerEmail,
                    customerPhone: ticket.requestorPhone,
                    customerName,
                    permissions: ['view', 'reschedule'],
                    createdBy: 'system',
                    expiresInDays: 90,
                });
                trackingCode = token;
                trackingUrl = `${APP_BASE_URL}/t/${token}`;
                console.log(`[TicketNotify] Generated token ${token} for ticket ${snap.id}`);
            } catch (tokenErr) {
                console.warn('[TicketNotify] Token generation failed:', (tokenErr as Error).message);
            }

            const { html: custHtml, text: custText } = buildCustomerConfirmationEmail({
                customerName,
                description: ticket.description || ticket.subject || "Service request",
                companyName,
                primaryColor,
                logoUrl,
                trackingCode,
                trackingUrl,
            });

            await sendEmailWithLog(
                customerEmail,
                `✅ We received your request — ${companyName}`,
                custHtml,
                custText,
                fromEmail,
                fromName,
                {
                    orgId,
                    emailType: 'ticket_confirmation',
                    replyTo: branding?.emailPrefix ? `${branding.emailPrefix}@service.dispatch-box.com` : undefined
                }
            );
        }

        return null;
    });

// ============================================
// EMAIL TEMPLATE: CUSTOMER REQUEST CONFIRMATION
// ============================================

function buildCustomerConfirmationEmail(opts: {
    customerName: string;
    description: string;
    companyName: string;
    primaryColor: string;
    logoUrl: string;
    trackingCode?: string;
    trackingUrl?: string;
}): { html: string; text: string } {
    const { customerName, description, companyName, primaryColor, logoUrl, trackingCode, trackingUrl } = opts;

    const trackingBlock = trackingCode ? `
    <div style="background:#f0f5ff;border-radius:8px;padding:20px;margin:0 0 24px;border:1px solid #bfdbfe;text-align:center;">
      <p style="color:#1e40af;font-size:12px;font-weight:600;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Your Tracking Code</p>
      <p style="color:#1e3a5f;font-size:28px;font-weight:800;margin:0 0 8px;letter-spacing:4px;font-family:'Courier New',monospace;">${trackingCode}</p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 16px;">Use this code to check status anytime — no login required</p>
      ${trackingUrl ? `<a href="${trackingUrl}" style="display:inline-block;background:${primaryColor};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">Track Your Request &rarr;</a>` : ''}
    </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <!-- Header -->
  <tr><td style="background:${primaryColor};padding:32px 40px;text-align:center;">
    ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="height:40px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;" />` : ''}
    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">${companyName}</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Request Received ✅</p>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:40px;">
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Hi ${customerName},</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Thank you for reaching out! We've received your service request and our team has been notified.
    </p>
    <div style="background:#f8f9fc;border-left:4px solid ${primaryColor};padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 28px;">
      <p style="color:#6b7280;font-size:12px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Your Request</p>
      <p style="color:#333;font-size:14px;line-height:1.5;margin:0;">${description.substring(0, 400)}${description.length > 400 ? '...' : ''}</p>
    </div>
    ${trackingBlock}
    <div style="background:#ecfdf5;border-radius:8px;padding:20px;margin:0 0 24px;border:1px solid #bbf7d0;">
      <p style="color:#065f46;font-size:14px;font-weight:600;margin:0 0 8px;">📋 What happens next?</p>
      <ol style="color:#047857;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
        <li>Our team reviews your request</li>
        <li>We'll prepare a detailed quote if applicable</li>
        <li>We'll reach out to schedule your service</li>
      </ol>
    </div>
    <p style="color:#999;font-size:13px;text-align:center;margin:0;">
      We typically respond within a few hours during business hours. No need to reply to this email.
    </p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #eee;">
    <p style="color:#999;font-size:12px;margin:0;text-align:center;">
      This confirmation was sent by ${companyName}.<br/>
      &copy; ${new Date().getFullYear()} Powered by DispatchBox
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `Hi ${customerName},\n\nThank you for reaching out! We've received your service request and our team has been notified.\n\nYour Request:\n${description}\n${trackingCode ? `\nYour Tracking Code: ${trackingCode}\nTrack your request: ${trackingUrl || 'Visit our portal and enter your code'}\n` : ''}\nWhat happens next?\n1. Our team reviews your request\n2. We'll prepare a detailed quote if applicable\n3. We'll reach out to schedule your service\n\nWe typically respond within a few hours during business hours.\n\nThank you!\n${companyName}`;

    return { html, text };
}

