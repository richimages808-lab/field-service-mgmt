import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// ============================================================================
// SendGrid Event Webhook Handler
// ============================================================================
// Receives real-time email delivery events from SendGrid:
//   - bounce, dropped, deferred (delivery failures)
//   - spam_report (recipient marked as spam)
//   - unsubscribe (recipient clicked unsubscribe link)
//   - delivered, open, click (positive engagement — logged but not alerted)
//
// Critical events (bounce, spam_report, unsubscribe) auto-suppress the
// recipient address to protect domain reputation at scale.
// ============================================================================

/** Events that should trigger auto-suppression of the recipient address */
const SUPPRESSION_EVENTS = new Set([
    "bounce",
    "dropped",
    "spam_report",
    "unsubscribe",
]);

/** Events worth logging but not suppressing */
const LOG_EVENTS = new Set([
    "delivered",
    "deferred",
    "open",
    "click",
    "processed",
]);

interface SendGridEvent {
    email: string;
    timestamp: number;
    event: string;
    sg_event_id?: string;
    sg_message_id?: string;
    category?: string | string[];
    reason?: string;
    status?: string;
    response?: string;
    type?: string;        // bounce type: "bounce" or "blocked"
    bounce_classification?: string;
    url?: string;         // for click events
    useragent?: string;
    ip?: string;
}

/**
 * Handles inbound SendGrid Event Webhook POST requests.
 * SendGrid sends batches of events as a JSON array.
 *
 * Endpoint: POST /handleSendGridWebhook
 * Configure in SendGrid → Settings → Mail Settings → Event Webhooks
 * URL: https://us-central1-maintenancemanager-c5533.cloudfunctions.net/handleSendGridWebhook
 */
export const handleSendGridWebhook = functions.https.onRequest(async (req, res) => {
    // SendGrid only sends POST
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const events: SendGridEvent[] = Array.isArray(req.body) ? req.body : [req.body];

        if (!events.length) {
            res.status(200).send("OK - no events");
            return;
        }

        console.log(`[Email Webhook] Received ${events.length} event(s)`);

        const batch = db.batch();
        const suppressionChecks: Promise<void>[] = [];
        let criticalCount = 0;

        for (const event of events) {
            if (!event.email || !event.event) continue;

            const eventType = event.event.toLowerCase();
            const isCritical = SUPPRESSION_EVENTS.has(eventType);
            const isLoggable = isCritical || LOG_EVENTS.has(eventType);

            if (!isLoggable) continue;

            // Log every relevant event to Firestore
            const logRef = db.collection("email_events").doc();
            batch.set(logRef, {
                email: event.email.toLowerCase(),
                event: eventType,
                timestamp: event.timestamp
                    ? admin.firestore.Timestamp.fromMillis(event.timestamp * 1000)
                    : admin.firestore.FieldValue.serverTimestamp(),
                reason: event.reason || null,
                status: event.status || null,
                response: event.response || null,
                bounceType: event.type || null,
                bounceClassification: event.bounce_classification || null,
                sgEventId: event.sg_event_id || null,
                sgMessageId: event.sg_message_id || null,
                category: event.category || null,
                url: event.url || null,
                resolved: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Auto-suppress bad addresses to protect domain reputation
            if (isCritical) {
                criticalCount++;
                suppressionChecks.push(
                    suppressEmailAddress(event.email, eventType, event.reason || event.response || "")
                );
            }
        }

        // Commit all event logs in one batch
        await batch.commit();

        // Run suppression checks in parallel
        if (suppressionChecks.length > 0) {
            await Promise.allSettled(suppressionChecks);
        }

        if (criticalCount > 0) {
            console.warn(`[Email Webhook] ${criticalCount} critical event(s) processed (bounces/spam/unsubscribes)`);
        }

        res.status(200).send("OK");
    } catch (error) {
        console.error("[Email Webhook] Error processing events:", (error as Error).message);
        // Always return 200 to prevent SendGrid from retrying endlessly
        res.status(200).send("OK - error logged");
    }
});

/**
 * Add an email address to the suppression list.
 * Future sends will check this list and skip suppressed addresses.
 */
async function suppressEmailAddress(email: string, reason: string, details: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const docId = normalizedEmail.replace(/[^a-z0-9@._-]/g, "_");

    try {
        const ref = db.collection("email_suppressions").doc(docId);
        const existing = await ref.get();

        if (existing.exists) {
            // Update with latest event
            await ref.update({
                lastEventType: reason,
                lastEventDetails: details,
                eventCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } else {
            await ref.set({
                email: normalizedEmail,
                suppressedAt: admin.firestore.FieldValue.serverTimestamp(),
                reason,
                details,
                eventCount: 1,
                active: true,
                // Track which org this email belongs to (if we can find it)
                orgId: await findOrgForEmail(normalizedEmail),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        console.log(`[Email Webhook] Suppressed: ${normalizedEmail} (${reason})`);
    } catch (e) {
        console.error(`[Email Webhook] Failed to suppress ${normalizedEmail}:`, (e as Error).message);
    }
}

/**
 * Try to find which org a suppressed email belongs to.
 * Checks customers and users collections.
 */
async function findOrgForEmail(email: string): Promise<string | null> {
    try {
        // Check customers first
        const custSnap = await db.collection("customers")
            .where("email", "==", email)
            .limit(1)
            .get();
        if (!custSnap.empty) {
            return custSnap.docs[0].data().org_id || custSnap.docs[0].data().organizationId || null;
        }

        // Check users (technicians)
        const userSnap = await db.collection("users")
            .where("email", "==", email)
            .limit(1)
            .get();
        if (!userSnap.empty) {
            return userSnap.docs[0].data().organizationId || null;
        }
    } catch (e) {
        console.warn("[Email Webhook] Org lookup failed:", (e as Error).message);
    }
    return null;
}

/**
 * Check if an email address is suppressed before sending.
 * Call this from any email-sending function to skip bad addresses.
 *
 * Usage:
 *   const { isEmailSuppressed } = require("./email/webhooks");
 *   if (await isEmailSuppressed(recipientEmail)) {
 *       console.log(`Skipping suppressed email: ${recipientEmail}`);
 *       return;
 *   }
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
    if (!email) return false;
    const docId = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
    try {
        const doc = await db.collection("email_suppressions").doc(docId).get();
        return doc.exists && doc.data()?.active === true;
    } catch (e) {
        // On error, don't suppress — better to attempt delivery
        return false;
    }
}

/**
 * Remove an email from the suppression list (manual override by admin).
 * Callable function — requires authentication.
 */
export const unsuppressEmail = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { email } = data;
    if (!email) {
        throw new functions.https.HttpsError("invalid-argument", "Email is required");
    }

    const docId = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
    const ref = db.collection("email_suppressions").doc(docId);
    const doc = await ref.get();

    if (!doc.exists) {
        return { success: false, message: "Email not found in suppression list" };
    }

    await ref.update({
        active: false,
        unsuppressedBy: context.auth.uid,
        unsuppressedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[Email Webhook] Unsuppressed: ${email} by ${context.auth.uid}`);
    return { success: true, message: `${email} removed from suppression list` };
});
