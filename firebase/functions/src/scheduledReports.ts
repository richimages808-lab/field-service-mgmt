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
 * Pub/Sub function to run every 15 minutes and process scheduled reports.
 */
export const processScheduledReports = functions.pubsub.schedule("every 15 minutes").onRun(async (context) => {
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
                    // Update nextRunAt upon success
                    let newNextRunAt = calculateNextRunAt(report, new Date());


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

function calculateNextRunAt(report: ScheduledReport, now: Date): Date {
    const times = report.timesOfDay && report.timesOfDay.length > 0 
        ? [...report.timesOfDay] 
        : (report.timeOfDay ? [report.timeOfDay] : ["08:00"]);
    
    // Sort times ascending
    times.sort();
    
    // Search up to 60 days in the future
    for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
        const testDate = new Date(now.getTime());
        testDate.setDate(testDate.getDate() + dayOffset);
        
        // Day filtering
        if (report.frequency === "weekly" && report.daysOfWeek && report.daysOfWeek.length > 0) {
            if (!report.daysOfWeek.includes(testDate.getDay())) continue;
        }
        if (report.frequency === "monthly" && report.daysOfMonth && report.daysOfMonth.length > 0) {
            if (!report.daysOfMonth.includes(testDate.getDate())) continue;
        }
        
        for (const timeStr of times) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            testDate.setHours(hours || 8, minutes || 0, 0, 0);
            
            // 60-second grace period to prevent double-runs
            if (testDate.getTime() > now.getTime() + 60*1000) {
                return testDate;
            }
        }
    }
    
    // Fallback
    const fallback = new Date(now.getTime());
    fallback.setDate(fallback.getDate() + 1);
    return fallback;
}

async function executeReport(report: ScheduledReport): Promise<void> {
    // 2. Fetch data based on ReportType
    const reportData = await fetchReportData(report);

    // If there is no data, prompt the user directly instead of sending an empty file
    if (!reportData || reportData.length === 0) {
        if (report.deliveryMethod === "email") {
            await dispatchEmptyEmail(report);
        } else if (report.deliveryMethod === "sms") {
            await dispatchEmptySMS(report);
        }
        return;
    }

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
// DATA FETCHING HUB — Proper queries for all 11 report types
// ----------------------------------------------------------------------------
async function fetchReportData(report: ScheduledReport): Promise<any[]> {
    const orgId = report.organizationId;

    // Default date range: last 30 days (configurable via reportParams)
    const now = new Date();
    const daysBack = report.reportParams?.daysBack || 30;
    const rangeStart = new Date(now.getTime() - daysBack * 86400000);
    const startTs = admin.firestore.Timestamp.fromDate(rangeStart);

    let data: any[] = [];

    switch (report.reportType) {

        // ── Revenue Trend ────────────────────────────────────────────────
        case "revenue_trend": {
            const snap = await db.collection("invoices")
                .where("org_id", "==", orgId)
                .where("createdAt", ">=", startTs)
                .orderBy("createdAt", "asc")
                .get();

            const dailyRevenue: Record<string, number> = {};
            snap.docs.forEach(d => {
                const inv = d.data();
                const date = inv.createdAt?.toDate?.()?.toLocaleDateString() || "Unknown";
                dailyRevenue[date] = (dailyRevenue[date] || 0) + (inv.total || 0);
            });

            data = Object.entries(dailyRevenue).map(([Date, Revenue]) => ({
                Date,
                Revenue: `$${Revenue.toFixed(2)}`,
                InvoiceCount: snap.docs.filter(d =>
                    (d.data().createdAt?.toDate?.()?.toLocaleDateString() || "") === Date
                ).length
            }));
            break;
        }

        // ── Tech Utilization ─────────────────────────────────────────────
        case "tech_utilization": {
            const snap = await db.collection("jobs")
                .where("org_id", "==", orgId)
                .where("status", "==", "completed")
                .where("updatedAt", ">=", startTs)
                .get();

            const techStats: Record<string, { jobs: number; revenue: number; totalMinutes: number }> = {};
            snap.docs.forEach(d => {
                const job = d.data();
                const tech = job.assigned_tech_name || "Unassigned";
                if (!techStats[tech]) techStats[tech] = { jobs: 0, revenue: 0, totalMinutes: 0 };
                techStats[tech].jobs++;
                techStats[tech].revenue += job.costs?.total || 0;
                techStats[tech].totalMinutes += job.actual_duration || job.estimated_duration || 0;
            });

            data = Object.entries(techStats)
                .sort(([, a], [, b]) => b.jobs - a.jobs)
                .map(([Technician, stats]) => ({
                    Technician,
                    CompletedJobs: stats.jobs,
                    Revenue: `$${stats.revenue.toFixed(2)}`,
                    TotalHours: (stats.totalMinutes / 60).toFixed(1)
                }));
            break;
        }

        // ── Job Pipeline ─────────────────────────────────────────────────
        case "job_pipeline": {
            const snap = await db.collection("jobs")
                .where("org_id", "==", orgId)
                .where("createdAt", ">=", startTs)
                .get();

            const statusCounts: Record<string, number> = {};
            snap.docs.forEach(d => {
                const status = d.data().status || "unknown";
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });

            data = Object.entries(statusCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([Status, Count]) => ({ Status: Status.replace(/_/g, " "), Count }));
            break;
        }

        // ── Jobs by Category ─────────────────────────────────────────────
        case "jobs_by_category": {
            const snap = await db.collection("jobs")
                .where("org_id", "==", orgId)
                .where("createdAt", ">=", startTs)
                .get();

            const catCounts: Record<string, number> = {};
            snap.docs.forEach(d => {
                const cat = d.data().category || d.data().type || "other";
                catCounts[cat] = (catCounts[cat] || 0) + 1;
            });

            data = Object.entries(catCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([Category, Count]) => ({ Category, Count }));
            break;
        }

        // ── Jobs by Source ───────────────────────────────────────────────
        case "jobs_by_source": {
            const snap = await db.collection("jobs")
                .where("org_id", "==", orgId)
                .where("createdAt", ">=", startTs)
                .get();

            const sourceCounts: Record<string, number> = {};
            snap.docs.forEach(d => {
                const source = d.data().request?.source || "manual";
                sourceCounts[source] = (sourceCounts[source] || 0) + 1;
            });

            data = Object.entries(sourceCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([Source, Count]) => ({ Source, Count }));
            break;
        }

        // ── Invoice Aging ────────────────────────────────────────────────
        case "invoice_aging": {
            const snap = await db.collection("invoices")
                .where("org_id", "==", orgId)
                .where("status", "in", ["sent", "overdue", "partial"])
                .get();

            const nowMs = now.getTime();
            data = snap.docs.map(d => {
                const inv = d.data();
                const created = inv.createdAt?.toDate?.() || new Date();
                const daysSince = Math.floor((nowMs - created.getTime()) / 86400000);
                const balance = inv.balance_due ?? (inv.total - (inv.payments_applied || 0));
                let bucket = "0-30 days";
                if (daysSince > 90) bucket = "90+ days";
                else if (daysSince > 60) bucket = "61-90 days";
                else if (daysSince > 30) bucket = "31-60 days";

                return {
                    InvoiceID: d.id,
                    Customer: inv.customer?.name || inv.customer_name || "Unknown",
                    Total: `$${(inv.total || 0).toFixed(2)}`,
                    BalanceDue: `$${(balance || 0).toFixed(2)}`,
                    DaysOutstanding: daysSince,
                    AgingBucket: bucket,
                    Status: inv.status
                };
            }).filter(inv => {
                const bal = parseFloat(inv.BalanceDue.replace("$", ""));
                return bal > 0;
            });
            break;
        }

        // ── Customer Leaderboard ─────────────────────────────────────────
        case "customer_leaderboard": {
            const snap = await db.collection("invoices")
                .where("org_id", "==", orgId)
                .where("createdAt", ">=", startTs)
                .get();

            const custMap: Record<string, { name: string; revenue: number; invoiceCount: number }> = {};
            snap.docs.forEach(d => {
                const inv = d.data();
                const id = inv.customer_id || inv.customer?.name || "Unknown";
                const name = inv.customer?.name || inv.customer_name || "Unknown";
                if (!custMap[id]) custMap[id] = { name, revenue: 0, invoiceCount: 0 };
                custMap[id].revenue += inv.total || 0;
                custMap[id].invoiceCount++;
            });

            data = Object.entries(custMap)
                .sort(([, a], [, b]) => b.revenue - a.revenue)
                .slice(0, 20)
                .map(([, stats], rank) => ({
                    Rank: rank + 1,
                    Customer: stats.name,
                    TotalRevenue: `$${stats.revenue.toFixed(2)}`,
                    Invoices: stats.invoiceCount
                }));
            break;
        }

        // ── Quote Conversion ─────────────────────────────────────────────
        case "quote_conversion": {
            const snap = await db.collection("quotes")
                .where("org_id", "==", orgId)
                .where("createdAt", ">=", startTs)
                .get();

            let approved = 0, declined = 0, pending = 0, expired = 0;
            let totalValue = 0, approvedValue = 0;
            snap.docs.forEach(d => {
                const q = d.data();
                totalValue += q.total || 0;
                if (q.status === "approved" || q.status === "completed") { approved++; approvedValue += q.total || 0; }
                else if (q.status === "declined") declined++;
                else if (q.status === "expired" || q.status === "superseded") expired++;
                else pending++;
            });

            const total = snap.size || 1;
            data = [{
                TotalQuotes: snap.size,
                Approved: approved,
                Declined: declined,
                Pending: pending,
                Expired: expired,
                ApprovalRate: `${Math.round((approved / total) * 100)}%`,
                TotalQuoteValue: `$${totalValue.toFixed(2)}`,
                ApprovedValue: `$${approvedValue.toFixed(2)}`
            }];
            break;
        }

        // ── Profitability ────────────────────────────────────────────────
        case "profitability": {
            const [invoiceSnap, jobSnap] = await Promise.all([
                db.collection("invoices")
                    .where("org_id", "==", orgId)
                    .where("createdAt", ">=", startTs)
                    .orderBy("createdAt", "asc")
                    .get(),
                db.collection("jobs")
                    .where("org_id", "==", orgId)
                    .where("status", "==", "completed")
                    .where("updatedAt", ">=", startTs)
                    .get()
            ]);

            const weeklyData: Record<string, { revenue: number; costs: number }> = {};
            const getWeekKey = (date: Date) => {
                const d = new Date(date);
                d.setDate(d.getDate() - d.getDay());
                return d.toLocaleDateString();
            };

            invoiceSnap.docs.forEach(d => {
                const inv = d.data();
                const date = inv.createdAt?.toDate?.();
                if (!date) return;
                const week = getWeekKey(date);
                if (!weeklyData[week]) weeklyData[week] = { revenue: 0, costs: 0 };
                weeklyData[week].revenue += inv.total || 0;
            });

            jobSnap.docs.forEach(d => {
                const job = d.data();
                const date = job.updatedAt?.toDate?.();
                if (!date) return;
                const week = getWeekKey(date);
                if (!weeklyData[week]) weeklyData[week] = { revenue: 0, costs: 0 };
                const cost = typeof job.costs?.total === "number" ? job.costs.total :
                    (typeof job.costs?.labor === "number" ? job.costs.labor : 0) +
                    (typeof job.costs?.parts === "number" ? job.costs.parts : 0);
                weeklyData[week].costs += cost;
            });

            data = Object.entries(weeklyData)
                .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                .map(([WeekOf, stats]) => ({
                    WeekOf,
                    Revenue: `$${stats.revenue.toFixed(2)}`,
                    Costs: `$${stats.costs.toFixed(2)}`,
                    Profit: `$${(stats.revenue - stats.costs).toFixed(2)}`,
                    Margin: stats.revenue > 0
                        ? `${Math.round(((stats.revenue - stats.costs) / stats.revenue) * 100)}%`
                        : "N/A"
                }));
            break;
        }

        // ── Average Job Metrics ──────────────────────────────────────────
        case "avg_job_metrics": {
            const snap = await db.collection("jobs")
                .where("org_id", "==", orgId)
                .where("status", "==", "completed")
                .where("updatedAt", ">=", startTs)
                .get();

            const catStats: Record<string, { totalDuration: number; totalValue: number; count: number }> = {};
            snap.docs.forEach(d => {
                const job = d.data();
                const cat = job.category || job.type || "other";
                if (!catStats[cat]) catStats[cat] = { totalDuration: 0, totalValue: 0, count: 0 };
                catStats[cat].count++;
                catStats[cat].totalDuration += job.actual_duration || job.estimated_duration || 0;
                catStats[cat].totalValue += job.costs?.total || job.estimates?.total || 0;
            });

            data = Object.entries(catStats)
                .sort(([, a], [, b]) => b.count - a.count)
                .map(([Category, stats]) => ({
                    Category,
                    JobCount: stats.count,
                    AvgDuration: `${Math.round(stats.totalDuration / stats.count)} min`,
                    AvgValue: `$${(stats.totalValue / stats.count).toFixed(2)}`
                }));
            break;
        }

        // ── Inventory Alerts ─────────────────────────────────────────────
        case "inventory_alerts": {
            const snap = await db.collection("materials")
                .where("org_id", "==", orgId)
                .get();

            data = snap.docs
                .map(d => {
                    const m = d.data();
                    const qty = m.quantity ?? 0;
                    const min = m.minQuantity ?? m.minQty ?? 0;
                    return { id: d.id, ...m, quantity: qty, minQuantity: min };
                })
                .filter((m: any) => m.minQuantity > 0 && m.quantity <= m.minQuantity)
                .sort((a: any, b: any) => (a.quantity / a.minQuantity) - (b.quantity / b.minQuantity))
                .map((m: any) => ({
                    Item: m.name || "Unknown",
                    Category: m.category || "other",
                    CurrentQty: m.quantity,
                    MinQty: m.minQuantity,
                    PercentOfMin: m.minQuantity > 0 ? `${Math.round((m.quantity / m.minQuantity) * 100)}%` : "N/A",
                    Location: m.location || "N/A"
                }));
            break;
        }

        default: {
            // Fallback: recent jobs summary
            const snap = await db.collection("jobs")
                .where("org_id", "==", orgId)
                .orderBy("createdAt", "desc")
                .limit(100)
                .get();
            data = snap.docs.map(d => {
                const job = d.data();
                return {
                    JobID: d.id,
                    Customer: job.customer?.name || "Unknown",
                    Status: job.status,
                    Priority: job.priority,
                    Category: job.category || "N/A",
                    CreatedAt: job.createdAt?.toDate?.()?.toLocaleDateString() || "Unknown"
                };
            });
            break;
        }
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

async function dispatchEmptyEmail(report: ScheduledReport) {
    if (!SENDGRID_API_KEY) {
        console.warn("SendGrid API Key not set. Cannot email empty reports.");
        return;
    }

    const msg = {
        to: report.deliveryDestination,
        from: FROM_EMAIL,
        subject: `Your Scheduled Report: ${report.name}`,
        text: `We ran your scheduled report for "${report.name}", but currently there is no data to report for this period. \n\n(e.g., No inventory items are currently below their minimum threshold, or no jobs match the criteria).`
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

async function dispatchEmptySMS(report: ScheduledReport) {
    if (!twilioClient && !SENDGRID_API_KEY) {
        console.warn("Neither Twilio nor SendGrid configured. Cannot SMS empty reports.");
        return;
    }

    const normalizedDest = normalizePhoneToE164(report.deliveryDestination);
    const msgBody = `Your regular report "${report.name}" was run, but there is no data to report for this period.`;

    if (twilioClient && (TWILIO_PHONE_NUMBER || TWILIO_MESSAGING_SERVICE_SID) && !normalizedDest.includes('@')) {
        const msgOptions: any = { body: msgBody, to: normalizedDest };
        if (TWILIO_MESSAGING_SERVICE_SID) msgOptions.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
        else if (TWILIO_PHONE_NUMBER) msgOptions.from = TWILIO_PHONE_NUMBER;
        
        await twilioClient.messages.create(msgOptions);
    } else if (SENDGRID_API_KEY && normalizedDest.includes('@')) {
        await sgMail.send({
            to: normalizedDest,
            from: FROM_EMAIL,
            subject: report.name,
            text: msgBody
        });
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
