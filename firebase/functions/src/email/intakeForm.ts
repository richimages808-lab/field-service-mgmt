import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
let sgMailInitialized = false;
function ensureSendGrid() {
    if (!sgMailInitialized && SENDGRID_API_KEY) {
        sgMail.setApiKey(SENDGRID_API_KEY);
        sgMailInitialized = true;
    }
}

/**
 * Public endpoint to fetch pending intake data for the intake form.
 * No authentication required — token acts as auth.
 */
export const getIntakeData = functions.https.onCall(async (data) => {
    const { token } = data;

    if (!token || typeof token !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Token is required");
    }

    const intakeDoc = await db.collection("pending_intakes").doc(token).get();

    if (!intakeDoc.exists) {
        throw new functions.https.HttpsError("not-found", "This request link is invalid or has expired.");
    }

    const intake = intakeDoc.data()!;

    // Check expiry
    const expiresAt = intake.expiresAt?.toDate ? intake.expiresAt.toDate() : new Date(intake.expiresAt);
    if (new Date() > expiresAt) {
        await intakeDoc.ref.update({ status: "EXPIRED" });
        throw new functions.https.HttpsError("deadline-exceeded", "This request link has expired. Please send another email.");
    }

    if (intake.status !== "PENDING") {
        throw new functions.https.HttpsError(
            "failed-precondition",
            intake.status === "CONSUMED"
                ? "This request has already been submitted."
                : "This request link is no longer valid."
        );
    }

    // Fetch org branding
    const orgDoc = await db.collection("organizations").doc(intake.orgId).get();
    const orgData = orgDoc.exists ? orgDoc.data() : {};

    return {
        senderEmail: intake.senderEmail,
        senderName: intake.senderName || "",
        issueSummary: intake.aiAnalysis?.issueDescription || "",
        originalSubject: intake.originalSubject || "",
        urgency: intake.aiAnalysis?.urgency || "MEDIUM",
        org: {
            name: orgData?.name || "Service Provider",
            companyName: orgData?.branding?.companyName || orgData?.name || "Service Provider",
            themeColor: orgData?.branding?.primaryColor || orgData?.portalConfig?.themeColor || "#3B82F6",
            logoUrl: orgData?.branding?.logoUrl || ""
        }
    };
});

/**
 * Public endpoint to submit the intake form.
 * Creates a customer + ticket from the pending intake.
 */
export const submitEmailIntake = functions.https.onCall(async (data) => {
    const { token, customerName, customerPhone, customerAddress, description, urgency } = data;

    if (!token || typeof token !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Token is required");
    }
    if (!customerName || !customerPhone || !customerAddress) {
        throw new functions.https.HttpsError("invalid-argument", "Name, phone, and address are required");
    }

    const intakeRef = db.collection("pending_intakes").doc(token);
    const intakeDoc = await intakeRef.get();

    if (!intakeDoc.exists) {
        throw new functions.https.HttpsError("not-found", "This request link is invalid.");
    }

    const intake = intakeDoc.data()!;

    // Validate status
    if (intake.status !== "PENDING") {
        throw new functions.https.HttpsError(
            "failed-precondition",
            intake.status === "CONSUMED"
                ? "This request has already been submitted."
                : "This request link is no longer valid."
        );
    }

    // Check expiry
    const expiresAt = intake.expiresAt?.toDate ? intake.expiresAt.toDate() : new Date(intake.expiresAt);
    if (new Date() > expiresAt) {
        await intakeRef.update({ status: "EXPIRED" });
        throw new functions.https.HttpsError("deadline-exceeded", "This request link has expired.");
    }

    const orgId = intake.orgId;
    const senderEmail = intake.senderEmail;

    try {
        // 1. Create customer record
        const customerRef = db.collection("customers").doc();
        await customerRef.set({
            email: senderEmail,
            name: customerName,
            phone: customerPhone,
            address: customerAddress,
            org_id: orgId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            type: "LEAD",
            source: "EMAIL_INTAKE"
        });

        // 2. Create ticket
        const finalDescription = description || intake.aiAnalysis?.issueDescription || intake.originalSubject;
        const finalUrgency = urgency || intake.aiAnalysis?.urgency || "MEDIUM";

        const ticketRef = await db.collection("tickets").add({
            requestorEmail: senderEmail,
            requestorName: customerName,
            requestorPhone: customerPhone,
            customerRef: customerRef,
            customerName: customerName,
            subject: intake.originalSubject,
            description: finalDescription,
            address: customerAddress,
            urgency: finalUrgency,
            suggestedFixes: intake.aiAnalysis?.suggestedFixes || [],
            status: "PENDING",
            source: "EMAIL_INTAKE",
            organizationId: orgId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            aiAnalysis: intake.aiAnalysis || null,
            intakeToken: token
        });

        // 3. Mark intake as consumed
        await intakeRef.update({
            status: "CONSUMED",
            consumedAt: admin.firestore.FieldValue.serverTimestamp(),
            customerId: customerRef.id,
            ticketId: ticketRef.id
        });

        console.log(`Intake ${token} consumed → customer ${customerRef.id}, ticket ${ticketRef.id}`);

        // 4. Auto-quote if org has it enabled
        let autoQuoteResult: { jobId?: string; quoteId?: string } = {};
        try {
            const orgDoc = await db.collection("organizations").doc(orgId).get();
            const orgData = orgDoc.exists ? orgDoc.data() : null;
            const autoQuoteEnabled = orgData?.autoQuoteEnabled === true || orgData?.inboundEmail?.autoQuoteOnEmail === true;

            if (autoQuoteEnabled) {
                const { autoCreateJobAndQuote } = require("../portal");
                autoQuoteResult = await autoCreateJobAndQuote(orgId, ticketRef.id, {
                    customerName,
                    customerPhone,
                    customerEmail: senderEmail,
                    address: customerAddress,
                    description: finalDescription,
                    urgency: finalUrgency.toLowerCase(),
                    customerId: customerRef.id,
                    photoUrls: [],
                });
            }
        } catch (err) {
            console.error("Auto-quote on intake failed (non-fatal):", err);
        }

        // 5. Send confirmation email
        try {
            const orgDoc = await db.collection("organizations").doc(orgId).get();
            const orgData = orgDoc.exists ? orgDoc.data() : {};
            const fromEmail = orgData?.outboundEmail?.fromEmail || "service@dispatch-box.com";
            const fromName = orgData?.outboundEmail?.fromName || orgData?.name || "DispatchBox";

            if (SENDGRID_API_KEY) {
                ensureSendGrid();
                await sgMail.send({
                    to: senderEmail,
                    from: { email: fromEmail, name: fromName },
                    subject: `Re: ${intake.originalSubject}`,
                    text: `Hello ${customerName},\n\nYour service request has been received and a ticket has been created. A technician will review your issue shortly.\n\nSummary: ${finalDescription}\n\nThank you for choosing ${fromName}!`
                });
            }
        } catch (emailErr) {
            console.error("Confirmation email failed (non-fatal):", emailErr);
        }

        return {
            success: true,
            ticketId: ticketRef.id,
            message: "Your service request has been submitted successfully!",
            ...(autoQuoteResult.jobId && { autoJobId: autoQuoteResult.jobId }),
            ...(autoQuoteResult.quoteId && { autoQuoteId: autoQuoteResult.quoteId })
        };
    } catch (error: any) {
        console.error("submitEmailIntake failed:", error);
        throw new functions.https.HttpsError("internal", `Submission failed: ${error.message}`);
    }
});
