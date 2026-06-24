import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { sendReminderSMS, sendReminderEmail } from "./processAppointmentReminders";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * Scheduled Cloud Function running every 5 minutes to process follow-up rules.
 * Part 1: Evaluates active rules per organization to populate the pending_followups queue.
 * Part 2: Executes pending follow-ups that have become due.
 */
export const processFollowUpEngine = functions.pubsub
    .schedule("every 5 minutes")
    .onRun(async (context) => {
        console.log("=== STARTING FOLLOW-UP ENGINE PROCESSOR ===");
        const now = new Date();

        try {
            // Part 1: GENERATE pending follow-up entries based on active rules
            const orgsSnapshot = await db.collection("organizations").get();

            for (const orgDoc of orgsSnapshot.docs) {
                const orgId = orgDoc.id;
                const orgData = orgDoc.data();
                const rules = orgData.settings?.followUpRules || [];
                const activeRules = rules.filter((r: any) => r.enabled);

                if (activeRules.length === 0) continue;

                console.log(`Processing ${activeRules.length} active follow-up rules for Org: ${orgId}`);

                for (const rule of activeRules) {
                    try {
                        await generateFollowUpsForRule(orgId, rule, now);
                    } catch (err) {
                        console.error(`Error generating follow-ups for rule ${rule.id} in org ${orgId}:`, err);
                    }
                }
            }

            // Part 2: EXECUTE pending follow-ups whose scheduled time has arrived
            await executePendingFollowUps(now);

        } catch (globalErr) {
            console.error("Critical error in follow-up engine execution:", globalErr);
        }

        console.log("=== FOLLOW-UP ENGINE PROCESSOR COMPLETE ===");
    });

/**
 * Evaluates a rule against the database and creates pending follow-up items.
 */
async function generateFollowUpsForRule(orgId: string, rule: any, now: Date) {
    const delayMs = rule.delayValue * (rule.delayUnit === "hours" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);

    if (rule.triggerEvent === "unanswered_quote") {
        const quotesSnap = await db.collection("quotes")
            .where("org_id", "==", orgId)
            .where("status", "==", "sent")
            .get();

        for (const quoteDoc of quotesSnap.docs) {
            const quote = quoteDoc.data();
            const createdTime = quote.createdAt?.toDate?.() || new Date(quote.createdAt);
            const scheduledTime = new Date(createdTime.getTime() + delayMs);

            await createPendingFollowUpIfNeeded({
                orgId,
                ruleId: rule.id,
                triggerEvent: rule.triggerEvent,
                actionType: rule.actionType,
                maxRetries: rule.maxRetries,
                scheduledAt: scheduledTime,
                customerId: quote.customer_id || "",
                customerName: quote.customer?.name || "Customer",
                customerPhone: quote.customer?.phone || "",
                customerEmail: quote.customer?.email || "",
                sourceType: "quote",
                sourceId: quoteDoc.id
            });
        }
    } else if (rule.triggerEvent === "unpaid_invoice") {
        const invoicesSnap = await db.collection("invoices")
            .where("org_id", "==", orgId)
            .where("status", "==", "unpaid")
            .get();

        for (const invDoc of invoicesSnap.docs) {
            const invoice = invDoc.data();
            const dueTime = invoice.dueDate?.toDate?.() || new Date(invoice.dueDate);
            const scheduledTime = new Date(dueTime.getTime() + delayMs);

            await createPendingFollowUpIfNeeded({
                orgId,
                ruleId: rule.id,
                triggerEvent: rule.triggerEvent,
                actionType: rule.actionType,
                maxRetries: rule.maxRetries,
                scheduledAt: scheduledTime,
                customerId: invoice.customer_id || "",
                customerName: invoice.customer?.name || "Customer",
                customerPhone: invoice.customer?.phone || "",
                customerEmail: invoice.customer?.email || "",
                sourceType: "invoice",
                sourceId: invDoc.id
            });
        }
    } else if (rule.triggerEvent === "unanswered_question") {
        const questionsSnap = await db.collection("customer_questions")
            .where("orgId", "==", orgId)
            .where("status", "==", "pending")
            .get();

        for (const qDoc of questionsSnap.docs) {
            const question = qDoc.data();
            const createdTime = question.createdAt?.toDate?.() || new Date(question.createdAt);
            const scheduledTime = new Date(createdTime.getTime() + delayMs);

            await createPendingFollowUpIfNeeded({
                orgId,
                ruleId: rule.id,
                triggerEvent: rule.triggerEvent,
                actionType: rule.actionType,
                maxRetries: rule.maxRetries,
                scheduledAt: scheduledTime,
                customerId: question.customerId || "",
                customerName: question.customerName || "Customer",
                customerPhone: question.customerPhone || "",
                customerEmail: question.customerEmail || "",
                sourceType: "question",
                sourceId: qDoc.id
            });
        }
    } else if (rule.triggerEvent === "missed_appointment") {
        const jobsSnap = await db.collection("jobs")
            .where("org_id", "==", orgId)
            .where("status", "==", "scheduled")
            .get();

        for (const jobDoc of jobsSnap.docs) {
            const job = jobDoc.data();
            const scheduledEndTime = job.scheduledEndTime?.toDate?.() || new Date(job.scheduledEndTime || job.scheduledDate);
            
            if (scheduledEndTime.getTime() < now.getTime()) {
                const scheduledTime = new Date(scheduledEndTime.getTime() + delayMs);

                await createPendingFollowUpIfNeeded({
                    orgId,
                    ruleId: rule.id,
                    triggerEvent: rule.triggerEvent,
                    actionType: rule.actionType,
                    maxRetries: rule.maxRetries,
                    scheduledAt: scheduledTime,
                    customerId: job.customer_id || "",
                    customerName: job.customer?.name || "Customer",
                    customerPhone: job.customer?.phone || "",
                    customerEmail: job.customer?.email || "",
                    sourceType: "job",
                    sourceId: jobDoc.id
                });
            }
        }
    }
}

/**
 * Helper to register a pending follow-up entry in the collection if it does not already exist.
 */
async function createPendingFollowUpIfNeeded(params: {
    orgId: string;
    ruleId: string;
    triggerEvent: string;
    actionType: string;
    maxRetries: number;
    scheduledAt: Date;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    sourceType: string;
    sourceId: string;
}) {
    const existingSnap = await db.collection("pending_followups")
        .where("orgId", "==", params.orgId)
        .where("ruleId", "==", params.ruleId)
        .where("sourceId", "==", params.sourceId)
        .limit(1)
        .get();

    if (existingSnap.empty) {
        console.log(`Scheduling new follow-up for Org: ${params.orgId}, Trigger: ${params.triggerEvent}, SourceId: ${params.sourceId}`);
        await db.collection("pending_followups").add({
            orgId: params.orgId,
            ruleId: params.ruleId,
            triggerEvent: params.triggerEvent,
            actionType: params.actionType,
            maxRetries: params.maxRetries,
            scheduledAt: admin.firestore.Timestamp.fromDate(params.scheduledAt),
            customerId: params.customerId,
            customerName: params.customerName,
            customerPhone: params.customerPhone || null,
            customerEmail: params.customerEmail || null,
            sourceType: params.sourceType,
            sourceId: params.sourceId,
            retryCount: 0,
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
}

/**
 * Scans the pending_followups queue and processes all due items.
 */
async function executePendingFollowUps(now: Date) {
    const pendingSnap = await db.collection("pending_followups")
        .where("status", "==", "pending")
        .where("scheduledAt", "<=", admin.firestore.Timestamp.fromDate(now))
        .limit(20)
        .get();

    if (pendingSnap.empty) {
        console.log("No pending follow-ups due for execution.");
        return;
    }

    console.log(`Executing ${pendingSnap.size} due follow-up tasks...`);

    for (const doc of pendingSnap.docs) {
        const item = doc.data();
        const itemId = doc.id;

        try {
            // 1. Process communication or scheduling action based on actionType
            if (item.actionType === "resend_email_sms") {
                const message = `Friendly reminder regarding your ${item.sourceType} #${item.sourceId.substring(0, 6).toUpperCase()}. Please review and let us know if you have any questions! Link: https://dispatch-box.com/${item.sourceType}/${item.sourceId}`;

                if (item.customerEmail) {
                    await sendReminderEmail(item.customerEmail, message);
                }
                if (item.customerPhone) {
                    await sendReminderSMS(item.customerPhone, message, item.orgId);
                }
            } else if (item.actionType === "ai_call") {
                // Trigger Amy AI callback
                await db.collection("pending_callbacks").add({
                    orgId: item.orgId,
                    customerPhone: item.customerPhone || "",
                    customerName: item.customerName || "Customer",
                    quoteId: item.sourceType === "quote" ? item.sourceId : "",
                    jobId: item.sourceType === "job" ? item.sourceId : "",
                    status: "pending",
                    source: "automated_followup_call",
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`Queued AI Phone Agent call for customer ${item.customerName}`);
            } else if (item.actionType === "auto_reschedule") {
                console.log(`[FollowUp Engine] Auto-rescheduling job ${item.sourceId}`);
                // Move job to unassigned/rescheduled state, etc.
            } else if (item.actionType === "ask_feedback") {
                const message = `Hi ${item.customerName}, we noticed you declined our estimate. We would love to hear your feedback on how we can improve: https://dispatch-box.com/feedback/${item.sourceId}`;
                if (item.customerPhone) {
                    await sendReminderSMS(item.customerPhone, message, item.orgId);
                } else if (item.customerEmail) {
                    await sendReminderEmail(item.customerEmail, message);
                }
            } else if (item.actionType === "tech_late_sms") {
                const message = `Hi ${item.customerName}, our technician is running slightly behind schedule today. We will send an updated ETA shortly. Thank you for your patience!`;
                if (item.customerPhone) {
                    await sendReminderSMS(item.customerPhone, message, item.orgId);
                }
            } else if (item.actionType === "send_review_request") {
                const message = `Hi ${item.customerName}, thank you for choosing us! Here is your receipt. We would highly appreciate it if you could leave us a review here: https://dispatch-box.com/review`;
                if (item.customerEmail) {
                    await sendReminderEmail(item.customerEmail, message);
                }
            }

            // 2. Increment retry count and reschedule or mark completed
            const nextRetry = (item.retryCount || 0) + 1;
            const isCompleted = nextRetry >= (item.maxRetries || 3);

            await doc.ref.update({
                retryCount: nextRetry,
                status: isCompleted ? "completed" : "pending",
                lastExecutedAt: admin.firestore.FieldValue.serverTimestamp(),
                // Reschedule next attempt in 24 hours if not completed
                scheduledAt: admin.firestore.Timestamp.fromDate(new Date(now.getTime() + 24 * 60 * 60 * 1000))
            });

            console.log(`Successfully executed follow-up task ${itemId}. Action: ${item.actionType}. Attempt: ${nextRetry}/${item.maxRetries}`);
        } catch (err) {
            console.error(`Failed to execute follow-up item ${itemId}:`, err);
            await doc.ref.update({
                status: "failed",
                error: (err as Error).message,
                failedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }
}
