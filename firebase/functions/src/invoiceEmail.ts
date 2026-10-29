import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";
import { createAccessToken } from "./accessTokens";
import {
    renderEmailLayout,
    renderEmailButton,
    renderTrackingCodeBlock
} from "./email/emailTemplate";

const db = admin.firestore();
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * Sends an invoice to the customer via email using SendGrid.
 * Locks the invoice and marks it as "sent" upon successful delivery.
 */
export const sendInvoiceEmail = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { invoiceId } = data;
    if (!invoiceId) {
        throw new functions.https.HttpsError("invalid-argument", "invoiceId is required.");
    }

    try {
        // 1. Load invoice
        const invoiceRef = db.collection("invoices").doc(invoiceId);
        const invoiceSnap = await invoiceRef.get();
        if (!invoiceSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Invoice not found.");
        }
        const invoice = invoiceSnap.data()!;

        // 2. Auth check — user must belong to the same org
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        const userData = userDoc.data();
        const userOrgId = userData?.org_id || context.auth.uid;
        if (invoice.org_id && invoice.org_id !== userOrgId) {
            throw new functions.https.HttpsError("permission-denied", "Unauthorized.");
        }

        // 3. Get customer email
        const customerEmail = invoice.customer?.email;
        if (!customerEmail) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "Customer has no email address on this invoice."
            );
        }

        // 4. Get organization info for branding
        const orgDoc = await db.collection("organizations").doc(invoice.org_id || userOrgId).get();
        const orgData = orgDoc.data();
        const companyName = orgData?.branding?.companyName || orgData?.name || userData?.company_name || "Your Service Provider";
        const primaryColor = orgData?.branding?.primaryColor || "#2563eb";
        const logoUrl = orgData?.branding?.logoUrl || "";
        const orgPhone = orgData?.branding?.phone || orgData?.phone || "";
        const orgAddress = orgData?.branding?.address || orgData?.address || "";
        const orgWebsite = orgData?.branding?.socialLinks?.website || orgData?.website || "";

        // 5. Build the sender address
        // Use org-specific from address if available, otherwise fallback
        const fromEmail = orgData?.outboundEmail?.fromAddress || "invoices@dispatch-box.com";
        const fromName = companyName;

        // 6. Build invoice number
        const invoiceNumber = `INV-${invoiceId.slice(0, 6).toUpperCase()}`;

        // 7. Build line items HTML
        const items = invoice.items || [];
        const lineItemsHtml = items.map((item: any) => {
            const amount = item.total || item.amount || 0;
            return `
                <tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        ${item.description || "Item"}
                    </td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #0f172a; font-size: 14px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        $${amount.toFixed(2)}
                    </td>
                </tr>`;
        }).join("");

        const total = invoice.total || 0;
        const balanceDue = invoice.balance_due ?? total;
        const paymentsApplied = invoice.payments_applied || 0;

        // Generate access token for frictionless invoice access
        const projectId = process.env.GCLOUD_PROJECT || 
                          (process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG).projectId : '');
        const isSandbox = projectId === 'dispatch-box-sb' || (projectId && projectId.includes('-sb'));
        const APP_BASE_URL = data.baseUrl || (isSandbox ? 'https://dispatch-box-sb.web.app' : 'https://dispatch-box.com');
        let invoiceLink = '';
        let trackingCode = '';
        try {
            const token = await createAccessToken({
                resourceType: 'invoice',
                resourceId: invoiceId,
                orgId: invoice.org_id || userOrgId,
                customerEmail,
                customerPhone: invoice.customer?.phone,
                customerName: invoice.customer?.name,
                permissions: ['view', 'pay'],
                createdBy: 'email',
                expiresInDays: 90,
            });
            invoiceLink = `${APP_BASE_URL}/t/${token}`;
            trackingCode = token;
            console.log(`[InvoiceEmail] Generated token ${token} for invoice ${invoiceId}`);
        } catch (tokenErr) {
            console.warn('[InvoiceEmail] Token generation failed:', (tokenErr as Error).message);
        }

        // 8. Build modern email HTML
        const bodyHtml = `
        <p style="color: #0f172a; font-size: 18px; font-weight: 700; margin: 0 0 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            Hi ${invoice.customer?.name || "there"},
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            Please find your invoice summary below. If you have any questions regarding your bill, our team is always here to assist.
        </p>

        <!-- Amount Due Hero Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 0 0 24px; padding: 24px 20px; text-align: center;">
            <tr>
                <td align="center">
                    <p style="color: #64748b; font-size: 11px; font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        ${balanceDue <= 0 ? 'Total Paid' : 'Amount Due'}
                    </p>
                    <p style="color: #0f172a; font-size: 36px; font-weight: 800; margin: 0 0 8px; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        $${balanceDue.toFixed(2)}
                    </p>
                    <p style="color: #64748b; font-size: 13px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        Invoice #${invoiceNumber}
                    </p>
                </td>
            </tr>
        </table>

        <!-- Line Items Table -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin: 0 0 24px;">
            <thead>
                <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                    <th style="padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Description</th>
                    <th style="padding: 12px 16px; text-align: right; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${lineItemsHtml}
            </tbody>
            <tfoot>
                ${paymentsApplied > 0 ? `
                <tr>
                    <td style="padding: 10px 16px; text-align: right; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Subtotal</td>
                    <td style="padding: 10px 16px; text-align: right; font-size: 13px; font-weight: 600; color: #1e293b; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">$${total.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 16px; text-align: right; font-size: 13px; color: #16a34a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Payments Applied</td>
                    <td style="padding: 10px 16px; text-align: right; font-size: 13px; font-weight: 600; color: #16a34a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">-$${paymentsApplied.toFixed(2)}</td>
                </tr>
                ` : ''}
                <tr style="background-color: #f8fafc;">
                    <td style="padding: 14px 16px; text-align: right; font-size: 15px; font-weight: 700; color: #0f172a; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        ${paymentsApplied > 0 ? "Balance Due" : "Total"}
                    </td>
                    <td style="padding: 14px 16px; text-align: right; font-size: 16px; font-weight: 800; color: #0f172a; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        $${balanceDue.toFixed(2)}
                    </td>
                </tr>
            </tfoot>
        </table>

        ${invoiceLink ? renderEmailButton(invoiceLink, 'View & Pay Invoice Online &rarr;', primaryColor) : ''}
        ${trackingCode ? renderTrackingCodeBlock(trackingCode, invoiceLink, primaryColor) : ''}
        `;

        const emailHtml = renderEmailLayout({
            companyName,
            primaryColor,
            logoUrl,
            badgeText: balanceDue <= 0 ? 'Invoice Paid ✓' : `Invoice #${invoiceNumber}`,
            badgeVariant: balanceDue <= 0 ? 'success' : 'warning',
            preheaderText: `Invoice ${invoiceNumber} from ${companyName} — $${balanceDue.toFixed(2)} due`,
            bodyHtml,
            footerPhone: orgPhone,
            footerEmail: fromEmail,
            footerAddress: orgAddress,
            footerWebsite: orgWebsite
        });

        // 9. Send via SendGrid
        const msg = {
            to: customerEmail,
            from: { email: fromEmail, name: fromName },
            subject: `Invoice ${invoiceNumber} from ${companyName} — $${balanceDue.toFixed(2)} Due`,
            html: emailHtml,
            text: `Invoice ${invoiceNumber} from ${companyName}\n\nAmount Due: $${balanceDue.toFixed(2)}\n\nItems:\n${items.map((i: any) => `• ${i.description}: $${(i.total || i.amount || 0).toFixed(2)}`).join("\n")}\n\nTotal: $${total.toFixed(2)}${trackingCode ? `\n\nTracking Code: ${trackingCode}\nView online: ${invoiceLink}` : ''}\n\nThank you for your business!`,
        };

        if (SENDGRID_API_KEY) {
            await sgMail.send(msg);
            console.log(`[InvoiceEmail] Sent invoice ${invoiceNumber} to ${customerEmail}`);
        } else {
            console.warn("[InvoiceEmail] SENDGRID_API_KEY not set. Simulating send.");
        }

        // 10. Update invoice status
        const updateData: any = {
            status: "sent",
            is_locked: true,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            sent_to_email: customerEmail,
        };
        if (trackingCode) updateData.accessToken = trackingCode;
        await invoiceRef.update(updateData);

        // 11. Log in sent_emails collection for audit
        await db.collection("sent_emails").add({
            to: customerEmail,
            subject: msg.subject,
            type: "invoice",
            invoice_id: invoiceId,
            org_id: invoice.org_id || userOrgId,
            sent_by: context.auth.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            message: `Invoice sent to ${customerEmail}`,
            invoiceNumber,
            trackingCode: trackingCode || undefined,
            invoiceLink: invoiceLink || undefined,
        };
    } catch (error: any) {
        console.error("[InvoiceEmail] Error:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError("internal", error.message || "Failed to send invoice email.");
    }
});
