import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require("pdfkit");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require('node-fetch');

const db = admin.firestore();
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
sgMail.setApiKey(SENDGRID_API_KEY);

export const dispatchPurchaseOrder = functions.https.onCall(async (data, context) => {
    // 1. Auth check
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated to dispatch orders'
        );
    }

    const { orderId } = data;
    if (!orderId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'orderId is required'
        );
    }

    try {
        const poRef = db.collection("purchaseOrders").doc(orderId);
        const poSnap = await poRef.get();

        if (!poSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Purchase Order not found');
        }

        const poData = poSnap.data();
        if (!poData) throw new Error("No data in PO");

        const orgId = poData.organizationId;
        
        // Ensure user belongs to this org (basic security check)
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        if (userDoc.data()?.org_id !== orgId) {
            throw new functions.https.HttpsError('permission-denied', 'Unauthorized org access');
        }

        if (poData.status !== "draft" && poData.status !== "error") {
             throw new functions.https.HttpsError('failed-precondition', 'Can only dispatch draft or error status orders.');
        }

        // Lookup vendor
        const vendorDoc = await db.collection("vendors").doc(poData.vendorId).get();
        if (!vendorDoc.exists) {
            await poRef.update({ status: "error", error: "Vendor not found" });
            throw new Error(`Vendor not found for PO ${orderId}`);
        }
        const vendorData = vendorDoc.data();
        const vendorEmail = vendorData?.email;

        // Organization info for the from/header details
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        const orgData = orgDoc.data();
        const orgName = orgData?.name || "Our Organization";

        let dispatchMethod = 'email_pdf';

        // Branch: Execute Dynamic API if configured
        if (vendorData?.integrationType === 'dynamic_api' && vendorData?.apiConfig?.endpointUrl) {
            dispatchMethod = 'dynamic_api';
            console.log(`Executing Dynamic API for PO ${orderId}`);
            
            const { endpointUrl, method, headersTemplate, bodyTemplate } = vendorData.apiConfig;
            
            // Hydrate Headers
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            if (headersTemplate) {
                for (const [key, value] of Object.entries(headersTemplate)) {
                    headers[key] = (value as string)
                        .replace("{{vaultedPaymentId}}", vendorData.vaultedPaymentId || "")
                        .replace("{{customerApiId}}", vendorData.customerApiId || "");
                }
            }

            // Hydrate Body Template
            let hydratedBody = (bodyTemplate || "{}")
                .replace(/\{\{customerApiId\}\}/g, vendorData.customerApiId || "")
                .replace(/\{\{shippingAddress\}\}/g, vendorData.shippingAddress || "")
                .replace(/\{\{billingAddress\}\}/g, vendorData.billingAddress || "")
                .replace(/\{\{orderId\}\}/g, orderId)
                .replace(/\{\{total\}\}/g, (poData.total || 0).toString());

            // Inject items as JSON string if placeholder exists
            if (hydratedBody.includes("{{itemsJson}}")) {
                hydratedBody = hydratedBody.replace("{{itemsJson}}", JSON.stringify(poData.items || []));
            }

            // Make the request
            const response = await fetch(endpointUrl, {
                method: method || 'POST',
                headers,
                body: (method === 'POST' || method === 'PUT') ? hydratedBody : undefined
            });

            if (!response.ok) {
                const errorText = await response.text();
                await poRef.update({ status: "error", error: `API Error: ${response.status}` });
                throw new Error(`Vendor API returned ${response.status}: ${errorText}`);
            }

            // Successfully processed via API
            await poRef.update({
                status: "sent",
                sentAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Successfully placed order via API for PO ${orderId}`);
            return { success: true, method: dispatchMethod, message: 'Dispatched via API' };
        }

        // Branch: Fallback to PDF Generation & Email
        if (!vendorEmail) {
            await poRef.update({ status: "error", error: "Vendor missing email for PDF dispatch" });
            throw new Error(`Vendor has no email address for fallback PDF processing.`);
        }

        const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                const chunks: any[] = [];
                doc.on("data", (chunk: any) => chunks.push(chunk));
                doc.on("end", () => resolve(Buffer.concat(chunks)));

                // Header
                doc.fontSize(20).text("PURCHASE ORDER", { align: "right" });
                doc.moveDown();

                doc.fontSize(14).text(orgName);
                doc.fontSize(10).text(`Organization ID: ${orgId}`);
                doc.moveDown(2);

                // PO Info
                doc.fontSize(12).text(`PO Number: ${orderId}`);
                doc.text(`Date: ${new Date().toLocaleDateString()}`);
                if (vendorData?.accountNumber) {
                    doc.text(`Our Account Number: ${vendorData.accountNumber}`);
                }
                if (vendorData?.discountCodes) {
                    doc.text(`Applicable Discounts: ${vendorData.discountCodes}`);
                }
                doc.moveDown();

                // Vendor Info
                doc.text("TO:");
                doc.text(poData.vendorName);
                doc.text(vendorEmail);
                if (vendorData?.phone) doc.text(vendorData.phone);
                doc.moveDown(2);

                // Items table header
                const tableTop = doc.y;
                doc.font("Helvetica-Bold");
                doc.text("Item / Description", 50, tableTop);
                doc.text("SKU", 250, tableTop);
                doc.text("Qty", 350, tableTop);
                doc.text("Unit Price", 400, tableTop);
                doc.text("Total", 480, tableTop);
                
                doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
                
                doc.font("Helvetica");
                let y = tableTop + 25;

                // Items
                const items = poData.items || [];
                for (const item of items) {
                    doc.text(item.name || "Unknown Item", 50, y);
                    doc.text(item.sku || "N/A", 250, y);
                    doc.text(item.quantity?.toString() || "0", 350, y);
                    doc.text(`$${(item.unitPrice || 0).toFixed(2)}`, 400, y);
                    doc.text(`$${(item.totalPrice || 0).toFixed(2)}`, 480, y);
                    y += 20;

                    // Add new page if table gets too long
                    if (y > 700) {
                        doc.addPage();
                        y = 50;
                    }
                }

                doc.moveTo(50, y).lineTo(550, y).stroke();
                y += 15;

                // Totals
                doc.font("Helvetica-Bold");
                doc.text("Subtotal:", 400, y);
                doc.text(`$${(poData.subtotal || 0).toFixed(2)}`, 480, y);
                y += 15;
                
                doc.text("Estimated Tax:", 400, y);
                doc.text(`$${(poData.tax || 0).toFixed(2)}`, 480, y);
                y += 15;

                doc.text("TOTAL:", 400, y);
                doc.text(`$${(poData.total || 0).toFixed(2)}`, 480, y);
                
                doc.moveDown(3);
                doc.font("Helvetica");
                if (vendorData?.orderInstructions) {
                    doc.text("Instructions:", 50);
                    doc.text(vendorData.orderInstructions);
                }

                doc.end();
            } catch (err) {
                reject(err);
            }
        });

        // Send Email
        const pdfBase64 = pdfBuffer.toString("base64");
        const msg = {
            to: vendorEmail,
            from: "orders@yourfieldservicesoftware.com", // Adjust this to verified sender
            subject: `New Purchase Order ${orderId} from ${orgName}`,
            text: `Please find the attached Purchase Order ${orderId} from ${orgName}. Let us know if you have any questions.`,
            html: `<p>Please find the attached Purchase Order <strong>${orderId}</strong> from ${orgName}.</p><p>Let us know if you have any questions.</p>`,
            attachments: [
                {
                    content: pdfBase64,
                    filename: `PurchaseOrder-${orderId}.pdf`,
                    type: "application/pdf",
                    disposition: "attachment"
                }
            ]
        };

        if (SENDGRID_API_KEY) {
             await sgMail.send(msg);
        } else {
             console.warn("SENDGRID_API_KEY is not set. Simulating email dispatch.");
        }

        // Update status to sent
        await poRef.update({
            status: "sent",
            sentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Successfully sent PO ${orderId} to ${vendorEmail}`);
        return { success: true, method: dispatchMethod, message: 'Dispatched via Email PDF' };

    } catch (error: any) {
        console.error("Error dispatching Purchase Order:", error);
        throw new functions.https.HttpsError('internal', error.message || 'Error dispatching PO');
    }
});
