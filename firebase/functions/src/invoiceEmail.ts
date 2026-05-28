import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";
import { createAccessToken } from "./accessTokens";

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
        const orgName = orgData?.name || userData?.company_name || "Your Service Provider";
        const orgPhone = orgData?.phone || "";

        // 5. Build the sender address
        // Use org-specific from address if available, otherwise fallback
        const fromEmail = orgData?.outboundEmail?.fromAddress || "invoices@dispatch-box.com";
        const fromName = orgName;

        // 6. Build invoice number
        const invoiceNumber = `INV-${invoiceId.slice(0, 6).toUpperCase()}`;

        // 7. Build line items HTML
        const items = invoice.items || [];
        const lineItemsHtml = items.map((item: any) => {
            const amount = item.total || item.amount || 0;
            return `
                <tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; color: #374151; font-size: 14px;">
                        ${item.description || "Item"}
                    </td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; text-align: right; color: #374151; font-size: 14px; font-weight: 500;">
                        $${amount.toFixed(2)}
                    </td>
                </tr>`;
        }).join("");

        const total = invoice.total || 0;
        const balanceDue = invoice.balance_due ?? total;
        const paymentsApplied = invoice.payments_applied || 0;

        // Generate access token for frictionless invoice access
        const APP_BASE_URL = 'https://dispatch-box.com';
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

        // 8. Build email HTML
        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 32px 24px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                ${orgName}
            </h1>
            <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Invoice ${invoiceNumber}</p>
        </div>

        <!-- Amount Due -->
        <div style="background: #f8fafc; padding: 24px; text-align: center; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Amount Due</p>
            <p style="margin: 0; color: #111827; font-size: 36px; font-weight: 700;">$${balanceDue.toFixed(2)}</p>
        </div>

        <!-- Greeting -->
        <div style="padding: 24px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
                Hi ${invoice.customer?.name || "there"},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                Please find your invoice details below. If you have any questions, feel free to reach out${orgPhone ? ` at ${orgPhone}` : ""}.
            </p>
        </div>

        <!-- Line Items -->
        <div style="padding: 0 24px;">
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <thead>
                    <tr style="background: #f9fafb;">
                        <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Description</th>
                        <th style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${lineItemsHtml}
                </tbody>
                <tfoot>
                    ${paymentsApplied > 0 ? `
                    <tr>
                        <td style="padding: 12px 16px; text-align: right; font-size: 14px; color: #6b7280;">Subtotal</td>
                        <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #374151;">$${total.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px 16px; text-align: right; font-size: 14px; color: #16a34a;">Payments Applied</td>
                        <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #16a34a;">-$${paymentsApplied.toFixed(2)}</td>
                    </tr>
                    ` : ""}
                    <tr style="background: #f0fdf4;">
                        <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700; color: #111827; border-top: 2px solid #e5e7eb;">
                            ${paymentsApplied > 0 ? "Balance Due" : "Total"}
                        </td>
                        <td style="padding: 16px; text-align: right; font-size: 18px; font-weight: 700; color: #111827; border-top: 2px solid #e5e7eb;">
                            $${balanceDue.toFixed(2)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <!-- CTA + Tracking -->
        ${invoiceLink ? `
        <div style="padding: 0 24px 24px; text-align: center;">
            <a href="${invoiceLink}" style="display:inline-block;background:linear-gradient(135deg, #1e40af, #3b82f6);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.3px;">
                View Invoice Online &rarr;
            </a>
        </div>
        ` : ''}
        ${trackingCode ? `
        <div style="padding: 0 24px 24px; text-align: center;">
            <div style="background:#f0f5ff;border-radius:8px;padding:16px;border:1px solid #bfdbfe;">
                <p style="color:#1e40af;font-size:11px;font-weight:600;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Tracking Code</p>
                <p style="color:#1e3a5f;font-size:22px;font-weight:800;margin:0;letter-spacing:3px;font-family:'Courier New',monospace;">${trackingCode}</p>
            </div>
        </div>
        ` : ''}

        <!-- Footer -->
        <div style="padding: 32px 24px; text-align: center; margin-top: 24px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Thank you for your business!
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0;">
                ${orgName}${orgPhone ? ` • ${orgPhone}` : ""}
            </p>
        </div>
    </div>
</body>
</html>`;

        // 9. Send via SendGrid
        const msg = {
            to: customerEmail,
            from: { email: fromEmail, name: fromName },
            subject: `Invoice ${invoiceNumber} from ${orgName} — $${balanceDue.toFixed(2)} Due`,
            html: emailHtml,
            text: `Invoice ${invoiceNumber} from ${orgName}\n\nAmount Due: $${balanceDue.toFixed(2)}\n\nItems:\n${items.map((i: any) => `• ${i.description}: $${(i.total || i.amount || 0).toFixed(2)}`).join("\n")}\n\nTotal: $${total.toFixed(2)}${trackingCode ? `\n\nTracking Code: ${trackingCode}\nView online: ${invoiceLink}` : ''}\n\nThank you for your business!`,
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
