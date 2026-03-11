import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";
import { Parser } from "json2csv";
import * as xlsx from "xlsx";
import PDFDocument = require("pdfkit");
import { ScheduledReport } from "./types/ScheduledReport";

// Initialize Twilio
const twilio = require("twilio");
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;
const twilioClient = (() => {
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
        && !TWILIO_ACCOUNT_SID.includes("your-")
        && TWILIO_ACCOUNT_SID.startsWith("AC")) {
        try {
            return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        } catch (e) {
            console.warn("[ScheduledReports] Failed to initialize Twilio client:", (e as Error).message);
            return null;
        }
    }
    return null;
})();

// Initialize Sendgrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
}
const FROM_EMAIL = "service@dispatch-box.com";

const db = admin.firestore();
const storage = admin.storage();

/**
 * Pub/Sub function to run every hour and process scheduled reports.
 */
export const processScheduledReports = functions.pubsub.schedule("every 1 hours").onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();

    // 1. Fetch active reports that are due
    const snapshot = await db.collection("scheduled_reports")
        .where("active", "==", true)
        .where("nextRunAt", "<=", now)
        .get();

    if (snapshot.empty) {
        console.log("No scheduled reports due at this time.");
        return;
    }

    console.log(`Processing ${snapshot.size} scheduled reports...`);

    const promises: Promise<void>[] = [];

    for (const doc of snapshot.docs) {
        const report = { id: doc.id, ...doc.data() } as ScheduledReport;

        // Execute each report processing independently
        promises.push(
            executeReport(report)
                .then(async () => {
                    // Update nextRunAt upon success
                    let newNextRunAt = new Date();
                    const currentNextRunAt = report.nextRunAt.toDate();
                    if (report.frequency === "daily") {
                        currentNextRunAt.setDate(currentNextRunAt.getDate() + 1);
                    } else if (report.frequency === "weekly") {
                        currentNextRunAt.setDate(currentNextRunAt.getDate() + 7);
                    } else if (report.frequency === "monthly") {
                        currentNextRunAt.setMonth(currentNextRunAt.getMonth() + 1);
                    }
                    newNextRunAt = currentNextRunAt;
                    // If the newNextRunAt is still in the past (e.g., missed runs), push it to the future
                    if (newNextRunAt.getTime() < Date.now()) {
                        newNextRunAt = new Date(); // fallback
                        if (report.frequency === "daily") newNextRunAt.setDate(newNextRunAt.getDate() + 1);
                        else if (report.frequency === "weekly") newNextRunAt.setDate(newNextRunAt.getDate() + 7);
                        else if (report.frequency === "monthly") newNextRunAt.setMonth(newNextRunAt.getMonth() + 1);
                    }

                    await doc.ref.update({
                        lastRunAt: now,
                        nextRunAt: admin.firestore.Timestamp.fromDate(newNextRunAt)
                    });
                    console.log(`Successfully processed report ${report.id} (${report.name})`);
                })
                .catch((error) => {
                    console.error(`Error processing report ${report.id} (${report.name}):`, error);
                })
        );
    }

    await Promise.all(promises);
});

async function executeReport(report: ScheduledReport): Promise<void> {
    // 2. Fetch data based on ReportType
    const reportData = await fetchReportData(report);

    // 3. Convert Data to Format
    const { fileBuffer, contentType, extension } = await formatData(reportData, report.format);
    const fileName = `${report.reportType}_${Date.now()}.${extension}`;

    // 4. Dispatch the Report
    if (report.deliveryMethod === "email") {
        await dispatchViaEmail(report, fileBuffer, contentType, fileName);
    } else if (report.deliveryMethod === "sms") {
        await dispatchViaSMS(report, fileBuffer, contentType, fileName);
    }
}

// ----------------------------------------------------------------------------
// DATA FETCHING HUB
// ----------------------------------------------------------------------------
async function fetchReportData(report: ScheduledReport): Promise<any[]> {
    // This is the backend equivalent to frontend ReportingService.ts drilldowns
    let data: any[] = [];
    const orgId = report.organizationId;

    // Most reports query jobs. Example generic queries.
    if (report.reportType === "job_pipeline") {
        const snap = await db.collection("jobs").where("organizationId", "==", orgId)
            .where("status", "in", ["pending", "scheduled", "completed"]).get();
        data = snap.docs.map(d => ({ JobID: d.id, ...d.data() }));
    } else if (report.reportType === "invoice_aging") {
        const snap = await db.collection("invoices").where("organizationId", "==", orgId)
            .where("status", "in", ["unpaid", "overdue"]).get();
        data = snap.docs.map(d => ({ InvoiceID: d.id, ...d.data() }));
    } else if (report.reportType === "inventory_alerts") {
        const snap = await db.collection("materials").where("organizationId", "==", orgId).get();
        data = snap.docs.map(d => ({ MaterialID: d.id, ...d.data() })).filter((m: any) => m.quantity < (m.minQuantity || 10));
    } else {
        // Generic fallback query top 100 recent jobs if unhandled yet
        const snap = await db.collection("jobs").where("organizationId", "==", orgId).limit(100).get();
        data = snap.docs.map(d => ({ JobID: d.id, ...d.data() }));
    }

    // Clean up Timestamp objects before formatting
    return data.map(record => {
        const cleaned: any = {};
        for (const [key, value] of Object.entries(record)) {
            if (value instanceof admin.firestore.Timestamp) {
                cleaned[key] = value.toDate().toLocaleString();
            } else if (typeof value === "object" && value !== null) {
                cleaned[key] = JSON.stringify(value);
            } else {
                cleaned[key] = value;
            }
        }
        return cleaned;
    });
}

// ----------------------------------------------------------------------------
// FORMATTING HUB
// ----------------------------------------------------------------------------
async function formatData(data: any[], format: 'csv' | 'excel' | 'pdf'): Promise<{ fileBuffer: Buffer, contentType: string, extension: string }> {
    if (!data.length) {
        data = [{ Message: "No data available for this report period." }];
    }

    if (format === 'csv') {
        const parser = new Parser();
        const csv = parser.parse(data);
        return { fileBuffer: Buffer.from(csv), contentType: 'text/csv', extension: 'csv' };
    }
    else if (format === 'excel') {
        const worksheet = xlsx.utils.json_to_sheet(data);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Report");
        const outBuffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
        return { fileBuffer: outBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' };
    }
    else if (format === 'pdf') {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 30 });
                const chunks: Buffer[] = [];
                doc.on('data', (chunk: Buffer) => chunks.push(chunk));
                doc.on('end', () => resolve({
                    fileBuffer: Buffer.concat(chunks),
                    contentType: 'application/pdf',
                    extension: 'pdf'
                }));

                // Simple PDF rendering logic
                doc.fontSize(16).text('Scheduled Report', { align: 'center' }).moveDown();
                doc.fontSize(10);

                const keys = Object.keys(data[0] || {});

                data.forEach((row, i) => {
                    const line = keys.map(k => `${k}: ${row[k]}`).join(" | ");
                    doc.text(line.substring(0, 150)); // Truncate to avoid overflow
                    if (i % 30 === 0 && i !== 0) doc.addPage();
                });

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    throw new Error(`Unsupported format: ${format}`);
}

// ----------------------------------------------------------------------------
// DISPATCH HUB
// ----------------------------------------------------------------------------
async function dispatchViaEmail(report: ScheduledReport, fileBuffer: Buffer, contentType: string, fileName: string) {
    if (!SENDGRID_API_KEY) {
        console.warn("SendGrid API Key not set. Cannot email reports.");
        return;
    }

    const msg = {
        to: report.deliveryDestination,
        from: FROM_EMAIL,
        subject: `Your Scheduled Report: ${report.name}`,
        text: `Attached is your requested report for: ${report.name}.`,
        attachments: [
            {
                content: fileBuffer.toString("base64"),
                filename: fileName,
                type: contentType,
                disposition: "attachment"
            }
        ]
    };

    await sgMail.send(msg);
}

async function dispatchViaSMS(report: ScheduledReport, fileBuffer: Buffer, contentType: string, fileName: string) {
    if (!twilioClient && !SENDGRID_API_KEY) {
        console.warn("Neither Twilio nor SendGrid configured. Cannot SMS reports.");
        return;
    }

    // Normalize phone number to E.164 format
    const normalizedDest = normalizePhoneToE164(report.deliveryDestination);

    // Since SMS cannot attach raw files cleanly (PDF/Excel), upload to Firebase Storage and send Signed URL
    const bucket = storage.bucket();
    const file = bucket.file(`scheduled_reports/${report.organizationId}/${fileName}`);

    await file.save(fileBuffer, {
        contentType,
        metadata: { cacheControl: "public, max-age=31536000" }
    });

    const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7 // URL valid for 7 days
    });

    const msgBody = `Your regular report "${report.name}" is ready: ${url}`;

    if (twilioClient && (TWILIO_PHONE_NUMBER || TWILIO_MESSAGING_SERVICE_SID) && !normalizedDest.includes('@')) {

        const msgOptions: any = {
            body: msgBody,
            to: normalizedDest
        };

        if (TWILIO_MESSAGING_SERVICE_SID) {
            msgOptions.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
        } else if (TWILIO_PHONE_NUMBER) {
            msgOptions.from = TWILIO_PHONE_NUMBER;
        }

        await twilioClient.messages.create(msgOptions);
        console.log(`[ScheduledReports] SMS sent to ${normalizedDest}`);
        return;
    } else if (SENDGRID_API_KEY && normalizedDest.includes('@')) {
        // Fallback: Email-to-SMS Gateway via SendGrid
        await sgMail.send({
            to: normalizedDest,
            from: FROM_EMAIL,
            subject: report.name, // Keep subject short for SMS
            text: msgBody
        });
    } else {
        console.warn(`Could not dispatch SMS for report ${report.id}. Invalid configuration or destination: ${normalizedDest}`);
    }
}

/**
 * Normalize a phone number to E.164 format for Twilio.
 */
function normalizePhoneToE164(phone: string): string {
    // If it's an email address (carrier gateway), return as-is
    if (phone.includes('@')) return phone;

    const hasPlus = phone.startsWith('+');
    const digits = phone.replace(/\D/g, '');
    if (hasPlus && digits.length >= 11) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return hasPlus ? `+${digits}` : `+${digits}`;
}
