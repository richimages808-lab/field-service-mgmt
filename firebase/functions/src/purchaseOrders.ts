import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require("pdfkit");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require('node-fetch');

const db = admin.firestore();
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);

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

        // Structured or stringified addresses
        const shipToAddress = poData.shippingAddress || vendorData?.shippingAddress || orgData?.address || "Main Receiving Warehouse";
        const billToAddress = poData.billingAddress || vendorData?.billingAddress || orgData?.billingAddress || orgData?.address || orgName;
        const shippingLocName = poData.shippingLocationName || "Primary Destination";

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
                        .replace(/\{\{vaultedPaymentId\}\}/g, vendorData.vaultedPaymentId || "")
                        .replace(/\{\{customerApiId\}\}/g, vendorData.customerApiId || "");
                }
            }

            // Hydrate Body Template with full structured variables
            let hydratedBody = (bodyTemplate || "{}")
                .replace(/\{\{customerApiId\}\}/g, vendorData.customerApiId || "")
                .replace(/\{\{vaultedPaymentId\}\}/g, vendorData.vaultedPaymentId || "")
                .replace(/\{\{accountNumber\}\}/g, poData.orderFieldValues?.accountNumber || vendorData.accountNumber || "")
                .replace(/\{\{shippingAddress\}\}/g, shipToAddress)
                .replace(/\{\{shippingLocationName\}\}/g, shippingLocName)
                .replace(/\{\{billingAddress\}\}/g, billToAddress)
                .replace(/\{\{paymentTerms\}\}/g, vendorData.paymentTerms || "Net 30")
                .replace(/\{\{taxId\}\}/g, vendorData.taxId || "")
                .replace(/\{\{orderId\}\}/g, orderId)
                .replace(/\{\{total\}\}/g, (poData.total || 0).toString());

            // Hydrate any vendor-specific required order fields
            if (poData.orderFieldValues && typeof poData.orderFieldValues === 'object') {
                for (const [fKey, fVal] of Object.entries(poData.orderFieldValues)) {
                    const regex = new RegExp(`\\{\\{${fKey}\\}\\}`, 'g');
                    hydratedBody = hydratedBody.replace(regex, String(fVal || ''));
                }
            }

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
                const doc = new PDFDocument({ margin: 45, size: 'A4' });
                const chunks: any[] = [];
                doc.on("data", (chunk: any) => chunks.push(chunk));
                doc.on("end", () => resolve(Buffer.concat(chunks)));

                // Header
                doc.fontSize(22).font("Helvetica-Bold").text("PURCHASE ORDER", { align: "right" });
                doc.fontSize(10).font("Helvetica").text(`PO #: ${orderId}`, { align: "right" });
                doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: "right" });
                doc.moveDown();

                // Organization Top Title
                doc.fontSize(16).font("Helvetica-Bold").text(orgName, 45, 45);
                doc.fontSize(9).font("Helvetica").text(`Account / Org ID: ${orgId}`);
                if (poData.orderFieldValues?.accountNumber || vendorData?.accountNumber) {
                    doc.text(`Vendor Account #: ${poData.orderFieldValues?.accountNumber || vendorData.accountNumber}`);
                }
                if (vendorData?.paymentTerms) {
                    doc.text(`Terms: ${vendorData.paymentTerms}`);
                }
                if (vendorData?.taxId) {
                    doc.text(`Tax ID / EIN: ${vendorData.taxId}`);
                }
                doc.moveDown(1.5);

                // Two column Bill To & Ship To
                const colY = doc.y;
                const colWidth = 235;

                // BILL TO (Left Column)
                doc.rect(45, colY, colWidth, 95).fillAndStroke("#f8fafc", "#e2e8f0");
                doc.fillColor("#0f172a").fontSize(10).font("Helvetica-Bold").text("BILL TO (Accounts Payable):", 55, colY + 8);
                doc.fontSize(9).font("Helvetica").text(orgName, 55, colY + 24);
                doc.text(billToAddress, 55, colY + 38, { width: colWidth - 20 });
                if (vendorData?.phone) {
                    doc.text(`Phone: ${vendorData.phone}`, 55, colY + 75);
                }

                // SHIP TO (Right Column)
                const rightX = 315;
                doc.rect(rightX, colY, colWidth, 95).fillAndStroke("#eff6ff", "#bfdbfe");
                doc.fillColor("#1e3a8a").fontSize(10).font("Helvetica-Bold").text("SHIP TO (Delivery Destination):", rightX + 10, colY + 8);
                doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text(shippingLocName, rightX + 10, colY + 24);
                doc.font("Helvetica").text(shipToAddress, rightX + 10, colY + 38, { width: colWidth - 20 });
                if (poData.shippingVerified) {
                    doc.fillColor("#166534").fontSize(8).font("Helvetica-Bold").text("✓ Verified Destination Address", rightX + 10, colY + 75);
                }

                doc.fillColor("#000000");
                doc.y = colY + 105;
                doc.moveDown(0.5);

                // Vendor TO info & Required Fields Box
                const orderFields = poData.orderFieldValues || {};
                const orderFieldKeys = Object.keys(orderFields);

                doc.fontSize(10).font("Helvetica-Bold").text("VENDOR & ORDER REQUIREMENTS:");
                doc.fontSize(9).font("Helvetica").text(`Supplier: ${poData.vendorName} (${vendorEmail})`);
                if (vendorData?.phone) doc.text(`Supplier Phone: ${vendorData.phone}`);
                if (vendorData?.discountCodes) doc.text(`Discount / Promo Codes: ${vendorData.discountCodes}`);

                // Render filled out requirements
                if (orderFieldKeys.length > 0) {
                    doc.moveDown(0.3);
                    doc.font("Helvetica-Bold").fontSize(9).text("Order Placement Specifications:");
                    doc.font("Helvetica").fontSize(8.5);
                    for (const [k, v] of Object.entries(orderFields)) {
                        if (v && k !== 'accountNumber') {
                            const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                            doc.text(`• ${label}: ${v}`);
                        }
                    }
                }
                doc.moveDown(0.8);

                // Items table header
                const tableTop = doc.y;
                doc.rect(45, tableTop, 505, 20).fill("#f1f5f9");
                doc.fillColor("#334155").font("Helvetica-Bold").fontSize(9);
                doc.text("Item / Description", 55, tableTop + 5);
                doc.text("SKU / Part #", 250, tableTop + 5);
                doc.text("Qty", 360, tableTop + 5, { align: "right", width: 30 });
                doc.text("Unit Price", 410, tableTop + 5, { align: "right", width: 60 });
                doc.text("Total", 480, tableTop + 5, { align: "right", width: 60 });

                doc.fillColor("#000000").font("Helvetica");
                let y = tableTop + 25;

                // Items
                const items = poData.items || [];
                for (const item of items) {
                    doc.text(item.name || "Unknown Item", 55, y, { width: 190 });
                    doc.text(item.sku || "N/A", 250, y, { width: 100 });
                    doc.text(item.quantity?.toString() || "0", 360, y, { align: "right", width: 30 });
                    doc.text(`$${(item.unitPrice || 0).toFixed(2)}`, 410, y, { align: "right", width: 60 });
                    doc.text(`$${(item.totalPrice || 0).toFixed(2)}`, 480, y, { align: "right", width: 60 });
                    y += 20;

                    // Add new page if table gets too long
                    if (y > 700) {
                        doc.addPage();
                        y = 50;
                    }
                }

                doc.moveTo(45, y).lineTo(550, y).stroke("#cbd5e1");
                y += 15;

                // Totals
                doc.font("Helvetica-Bold").fontSize(9);
                doc.text("Subtotal:", 390, y);
                doc.text(`$${(poData.subtotal || 0).toFixed(2)}`, 480, y, { align: "right", width: 60 });
                y += 15;
                
                doc.text("Estimated Tax:", 390, y);
                doc.text(`$${(poData.tax || 0).toFixed(2)}`, 480, y, { align: "right", width: 60 });
                y += 15;

                if (poData.shipping) {
                    doc.text("Shipping & Handling:", 390, y);
                    doc.text(`$${(poData.shipping || 0).toFixed(2)}`, 480, y, { align: "right", width: 60 });
                    y += 15;
                }

                doc.fontSize(11).text("TOTAL:", 390, y);
                doc.text(`$${(poData.total || 0).toFixed(2)}`, 480, y, { align: "right", width: 60 });
                
                y += 25;
                doc.font("Helvetica").fontSize(9);
                if (vendorData?.orderInstructions || poData.notes) {
                    doc.font("Helvetica-Bold").text("Special Instructions & Delivery Notes:", 45, y);
                    doc.font("Helvetica").text(poData.notes || vendorData?.orderInstructions || "", 45, y + 14, { width: 495 });
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
            text: `Please find the attached Purchase Order ${orderId} from ${orgName}. Delivery destination: ${shipToAddress}. Let us know if you have any questions.`,
            html: `<p>Please find the attached Purchase Order <strong>${orderId}</strong> from ${orgName}.</p><p><strong>Delivery Destination:</strong> ${shipToAddress}</p><p>Let us know if you have any questions.</p>`,
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

