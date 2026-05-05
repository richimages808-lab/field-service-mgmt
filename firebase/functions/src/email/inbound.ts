import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as busboy from "busboy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as sgMail from "@sendgrid/mail";
import { logGeminiUsage } from "../billing";
import { v4 as uuidv4 } from "uuid";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Initialize SendGrid (lazy to avoid deploy analysis crashes)
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
let sgMailInitialized = false;
function ensureSendGrid() {
    if (!sgMailInitialized && SENDGRID_API_KEY) {
        sgMail.setApiKey(SENDGRID_API_KEY);
        sgMailInitialized = true;
    }
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Default DispatchBox email domain for prefix-based routing
const DISPATCH_BOX_DOMAIN = "service.dispatch-box.com";
const APP_BASE_URL = "https://dispatchbox.app";

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

type EmailIntent = "SERVICE_REQUEST" | "INQUIRY" | "SPAM_OR_IRRELEVANT";
type TriageMode = "SMART" | "ALWAYS_CREATE";

interface ParsedTicketData {
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    issueDescription: string;
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    suggestedFixes: string[];
    missingFields: string[];
}

interface EmailClassification {
    intent: EmailIntent;
    confidence: number;
    ticketData: ParsedTicketData;
}

interface OrganizationData {
    id: string;
    name: string;
    slug: string;
    branding?: {
        primaryColor?: string;
        logoUrl?: string;
        companyName?: string;
    };
    inboundEmail: {
        prefix?: string;
        customDomains?: string[];
        autoReplyEnabled: boolean;
        autoReplyTemplate?: string;
        triageMode?: TriageMode;
        autoQuoteOnEmail?: boolean;
        spamFilterEnabled?: boolean;
        forwardingEnabled?: boolean;
        forwardTo?: string;
        replyAsProxy?: boolean;
    };
    outboundEmail: {
        fromName: string;
        fromEmail: string;
        replyTo?: string;
    };
    autoQuoteEnabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Handles inbound emails from SendGrid Inbound Parse Webhook.
 * Smart triage: trusted customers get auto-tickets, unknown senders
 * receive an intake form link, spam is silently discarded.
 */
export const handleInboundEmail = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    const busboyInstance = busboy({ headers: req.headers });
    const fields: { [key: string]: string } = {};

    busboyInstance.on("field", (fieldname, val) => {
        fields[fieldname] = val;
    });

    busboyInstance.on("finish", async () => {
        try {
            const emailBody = fields.text || fields.html || "";
            const fromEmail = parseEmailAddress(fields.from);
            const fromName = parseDisplayName(fields.from);
            const toEmail = parseEmailAddress(fields.to);
            const subject = fields.subject || "No Subject";

            console.log(`Received email from: ${fromEmail}, to: ${toEmail}, Subject: ${subject}`);

            // ── PROXY REPLY DETECTION ──
            // Check if this is a reply routed via plus-addressing
            // e.g., acmeplumbing+T-abc123@dispatch-box.com
            const plusMatch = toEmail.match(/^([^+]+)\+([^@]+)@/i);
            if (plusMatch) {
                const ticketRef = plusMatch[2]; // e.g., "T-abc123"
                console.log(`Proxy reply detected for ticket ref: ${ticketRef}`);
                const org = await findOrganizationByRecipient(toEmail);
                if (org) {
                    await handleProxyReply(fromEmail, fromName, subject, emailBody, fields.html || "", ticketRef, org);
                    res.status(200).send("Proxy reply processed");
                    return;
                }
                console.warn(`No org found for proxy reply to: ${toEmail}`);
                res.status(200).send("No matching organization for proxy reply");
                return;
            }

            // 1. Find the organization for this email
            const org = await findOrganizationByRecipient(toEmail);

            if (!org) {
                console.log(`No organization found for recipient: ${toEmail}. Discarding.`);
                res.status(200).send("No matching organization");
                return;
            }

            console.log(`Routing to organization: ${org.name} (${org.id})`);

            const triageMode: TriageMode = org.inboundEmail?.triageMode || "SMART";
            const spamFilter = org.inboundEmail?.spamFilterEnabled !== false;

            // 2. Classify email with AI
            let classification: EmailClassification;
            try {
                classification = await classifyEmailWithAI(emailBody, subject);
            } catch (aiError) {
                console.warn("AI classification failed, treating as service request:", aiError);
                classification = {
                    intent: "SERVICE_REQUEST",
                    confidence: 0.5,
                    ticketData: {
                        issueDescription: `${subject}\n\n${emailBody}`.substring(0, 500),
                        urgency: "MEDIUM",
                        suggestedFixes: [],
                        missingFields: []
                    }
                };
            }

            // 3. LANE: Spam / Irrelevant — discard silently
            if (spamFilter && classification.intent === "SPAM_OR_IRRELEVANT" && classification.confidence > 0.7) {
                console.log(`Spam/irrelevant email discarded (confidence: ${classification.confidence})`);
                res.status(200).send("Email discarded as irrelevant");
                return;
            }

            // 4. Forward a copy to the org's real email (non-spam only)
            // We store the ticketId after triage so forwarding moves below triage lanes

            // 5. Check if sender is a known customer
            const existingCustomer = await findExistingCustomer(fromEmail, org.id);

            let ticketId: string | null = null;

            if (triageMode === "ALWAYS_CREATE" || existingCustomer) {
                // ── LANE: TRUSTED / ALWAYS_CREATE → auto-ticket ──
                ticketId = await handleTrustedSender(fromEmail, fromName, subject, classification.ticketData, org, existingCustomer);
            } else {
                // ── LANE: UNKNOWN SENDER → intake form ──
                await handleUnknownSender(fromEmail, fromName, subject, emailBody, classification.ticketData, org);
            }

            // 6. Forward after triage so we have the ticketId for plus-addressing
            const forwardingEnabled = org.inboundEmail?.forwardingEnabled === true;
            const forwardTo = org.inboundEmail?.forwardTo;
            if (forwardingEnabled && forwardTo) {
                try {
                    const fwdPrefix = org.inboundEmail?.prefix || "service";
                    const fwdFrom = `${fwdPrefix}@dispatch-box.com`;
                    const replyAsProxy = org.inboundEmail?.replyAsProxy === true;

                    // If reply-as proxy is enabled and we have a ticket, set Reply-To
                    // to the plus-addressed proxy so replies come back through the system
                    let replyTo: { email: string; name: string };
                    if (replyAsProxy && ticketId) {
                        replyTo = {
                            email: `${fwdPrefix}+${ticketId}@dispatch-box.com`,
                            name: fromName || fromEmail
                        };
                    } else {
                        replyTo = { email: fromEmail, name: fromName || fromEmail };
                    }

                    ensureSendGrid();
                    await sgMail.send({
                        to: forwardTo,
                        from: { email: fwdFrom, name: `${org.name || "DispatchBox"} Inbound` },
                        replyTo,
                        subject: `[Fwd] ${subject}`,
                        text: `--- Forwarded from ${fromName || fromEmail} <${fromEmail}> ---\n\n${emailBody}`,
                        html: fields.html ? `<div style="padding:12px;background:#f3f4f6;border-left:4px solid #6366f1;margin-bottom:16px;font-size:13px;color:#6b7280;">Forwarded from <strong>${fromName || fromEmail}</strong> &lt;${fromEmail}&gt;</div>${fields.html}` : undefined
                    });
                    console.log(`Email forwarded to ${forwardTo}${replyAsProxy ? ` (reply-as proxy: ${replyTo.email})` : ""}`);
                } catch (fwdErr) {
                    console.error("Email forwarding failed (non-fatal):", fwdErr);
                }
            }

            res.status(200).send("Email processed");
        } catch (error) {
            console.error("Error processing inbound email:", error);
            res.status(500).send("Internal Server Error");
        }
    });

    busboyInstance.end(req.rawBody);
});

// ═══════════════════════════════════════════════════════════════
//  TRIAGE LANES
// ═══════════════════════════════════════════════════════════════

/**
 * LANE: Trusted customer or ALWAYS_CREATE mode.
 * Auto-creates ticket, optionally runs auto-quote.
 * Returns the ticket ID for use in forwarding.
 */
async function handleTrustedSender(
    email: string,
    displayName: string,
    subject: string,
    ticketData: ParsedTicketData,
    org: OrganizationData,
    existingCustomer: admin.firestore.DocumentSnapshot | null
): Promise<string> {
    // Get or create customer ref
    let customerRef: admin.firestore.DocumentReference;
    let isNew = false;

    if (existingCustomer) {
        customerRef = existingCustomer.ref;
        console.log(`Trusted customer found: ${existingCustomer.id}`);
    } else {
        // ALWAYS_CREATE mode — register new customer as LEAD
        const newRef = db.collection("customers").doc();
        await newRef.set({
            email,
            name: ticketData.customerName || displayName || "Unknown",
            phone: ticketData.customerPhone || "",
            address: ticketData.customerAddress || "",
            org_id: org.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            type: "LEAD"
        });
        customerRef = newRef;
        isNew = true;
    }

    // Create ticket
    const ticketRef = await db.collection("tickets").add({
        requestorEmail: email,
        customerRef,
        customerName: existingCustomer?.data()?.name || ticketData.customerName || displayName,
        subject,
        description: ticketData.issueDescription,
        urgency: ticketData.urgency,
        suggestedFixes: ticketData.suggestedFixes,
        status: "PENDING",
        source: "EMAIL",
        organizationId: org.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        aiAnalysis: ticketData
    });

    console.log(`Ticket created: ${ticketRef.id} for trusted sender ${email}`);

    // Auto-quote if enabled
    const shouldAutoQuote = org.inboundEmail?.autoQuoteOnEmail === true || org.autoQuoteEnabled === true;
    let autoQuoteInfo = '';

    if (shouldAutoQuote) {
        try {
            const { autoCreateJobAndQuote } = require("../portal");
            const result = await autoCreateJobAndQuote(org.id, ticketRef.id, {
                customerName: existingCustomer?.data()?.name || ticketData.customerName || displayName,
                customerPhone: existingCustomer?.data()?.phone || ticketData.customerPhone || '',
                customerEmail: email,
                address: existingCustomer?.data()?.address || ticketData.customerAddress || '',
                description: ticketData.issueDescription,
                urgency: ticketData.urgency?.toLowerCase() || 'normal',
                customerId: existingCustomer?.id || customerRef.id
            });
            if (result.quoteId) {
                autoQuoteInfo = `\nWe've prepared an initial estimate for your review.`;
            }
        } catch (err) {
            console.error("Auto-quote on email failed (non-fatal):", err);
        }
    }

    // Send confirmation email
    if (org.inboundEmail?.autoReplyEnabled !== false) {
        const fromAddress = org.outboundEmail?.fromEmail || "service@dispatch-box.com";
        const fromNameStr = org.outboundEmail?.fromName || org.name || "DispatchBox";

        if (ticketData.missingFields.length > 0 && isNew) {
            await sendEmailReply(
                email,
                `Re: ${subject}`,
                `Hello${ticketData.customerName ? ` ${ticketData.customerName}` : ''},\n\nWe received your request and created a ticket. However, we need a bit more information to assist you efficiently.\n\nPlease reply with the following:\n- ${ticketData.missingFields.join("\n- ")}\n${autoQuoteInfo}\nThank you!\n${fromNameStr}`,
                fromAddress,
                fromNameStr
            );
        } else {
            await sendEmailReply(
                email,
                `Re: ${subject}`,
                org.inboundEmail?.autoReplyTemplate ||
                `Hello${existingCustomer?.data()?.name ? ` ${existingCustomer.data()?.name}` : ''},\n\nYour service request has been received and a ticket has been created. A technician will review your issue shortly.\n\nSummary: ${ticketData.issueDescription}${autoQuoteInfo}\n\nThank you for choosing ${fromNameStr}!`,
                fromAddress,
                fromNameStr
            );
        }
    }

    return ticketRef.id;
}

/**
 * PROXY REPLY HANDLER.
 * When the org owner replies to a forwarded email, the reply comes to
 * {prefix}+{ticketId}@dispatch-box.com. This function relays it to the
 * original customer from the dispatch-box address and logs it on the ticket.
 */
async function handleProxyReply(
    fromEmail: string,
    fromName: string,
    subject: string,
    textBody: string,
    htmlBody: string,
    ticketRef: string,
    org: OrganizationData
) {
    // Look up the ticket to find the original customer email
    const ticketDoc = await db.collection("tickets").doc(ticketRef).get();

    if (!ticketDoc.exists) {
        console.warn(`Proxy reply: ticket ${ticketRef} not found`);
        return;
    }

    const ticket = ticketDoc.data()!;
    const customerEmail = ticket.requestorEmail;

    if (!customerEmail) {
        console.warn(`Proxy reply: no requestorEmail on ticket ${ticketRef}`);
        return;
    }

    // Verify this reply is from the org owner (forwardTo matches sender)
    const forwardTo = org.inboundEmail?.forwardTo;
    if (forwardTo && fromEmail.toLowerCase() !== forwardTo.toLowerCase()) {
        console.warn(`Proxy reply: sender ${fromEmail} doesn't match forwardTo ${forwardTo}. Allowing anyway for flexibility.`);
    }

    // Send the reply to the customer from the dispatch-box address
    const prefix = org.inboundEmail?.prefix || "service";
    const dispatchBoxFrom = `${prefix}@dispatch-box.com`;
    const orgDisplayName = org.outboundEmail?.fromName || org.name || "DispatchBox";

    ensureSendGrid();
    await sgMail.send({
        to: customerEmail,
        from: { email: dispatchBoxFrom, name: orgDisplayName },
        replyTo: { email: dispatchBoxFrom, name: orgDisplayName },
        subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        text: textBody,
        html: htmlBody || undefined
    });

    console.log(`Proxy reply sent to ${customerEmail} from ${dispatchBoxFrom} (ticket: ${ticketRef})`);

    // Log the reply as activity on the ticket
    await db.collection("tickets").doc(ticketRef).collection("activity").add({
        type: "EMAIL_REPLY",
        direction: "OUTBOUND",
        from: dispatchBoxFrom,
        to: customerEmail,
        subject,
        body: textBody.substring(0, 2000),
        sentBy: fromEmail, // the org owner who actually replied
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * LANE: Unknown sender in SMART mode.
 * Creates a pending intake and sends a form link.
 */
async function handleUnknownSender(
    email: string,
    displayName: string,
    subject: string,
    originalBody: string,
    ticketData: ParsedTicketData,
    org: OrganizationData
) {
    // Check for existing pending intake to avoid spamming
    const existingIntake = await db.collection("pending_intakes")
        .where("senderEmail", "==", email)
        .where("orgId", "==", org.id)
        .where("status", "==", "PENDING")
        .limit(1)
        .get();

    if (!existingIntake.empty) {
        console.log(`Pending intake already exists for ${email} → ${org.id}. Skipping duplicate.`);
        return;
    }

    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    await db.collection("pending_intakes").doc(token).set({
        token,
        orgId: org.id,
        senderEmail: email,
        senderName: ticketData.customerName || displayName || "",
        originalSubject: subject,
        originalBody: originalBody.substring(0, 2000),
        aiAnalysis: ticketData,
        status: "PENDING",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt)
    });

    console.log(`Pending intake created: ${token} for unknown sender ${email}`);

    // Send intake form email
    const fromAddress = org.outboundEmail?.fromEmail || "service@dispatch-box.com";
    const fromNameStr = org.outboundEmail?.fromName || org.name || "DispatchBox";
    const themeColor = org.branding?.primaryColor || "#3B82F6";
    const companyName = org.branding?.companyName || org.name;
    const logoUrl = org.branding?.logoUrl || "";
    const intakeUrl = `${APP_BASE_URL}/intake/${token}`;

    const htmlBody = buildIntakeFormEmail({
        recipientName: ticketData.customerName || displayName || "there",
        issueSummary: ticketData.issueDescription,
        intakeUrl,
        companyName,
        themeColor,
        logoUrl,
        expiresIn: "48 hours"
    });

    const textBody = `Hi ${ticketData.customerName || displayName || "there"},\n\nWe received your email about: ${ticketData.issueDescription}\n\nTo get a technician assigned to your request, we need a few more details. Please complete this short form:\n\n${intakeUrl}\n\nThis link expires in 48 hours.\n\nThanks,\n${companyName}`;

    await sendHtmlEmailReply(
        email,
        `Action Required — Complete Your Service Request`,
        textBody,
        htmlBody,
        fromAddress,
        fromNameStr
    );
}

// ═══════════════════════════════════════════════════════════════
//  AI CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Uses Gemini to classify the email intent AND extract ticket data.
 */
async function classifyEmailWithAI(text: string, subject: string): Promise<EmailClassification> {
    const prompt = `
    You are an AI assistant for a Field Service Management company.
    Analyze the following email to classify its intent and extract ticket information.
    
    Subject: ${subject}
    Body: ${text}

    Respond in JSON format:
    {
      "intent": "SERVICE_REQUEST" | "INQUIRY" | "SPAM_OR_IRRELEVANT",
      "intentConfidence": 0.0 to 1.0,
      "customerName": "(string, if present)",
      "customerPhone": "(string, if present)",
      "customerAddress": "(string, if present)",
      "issueDescription": "(summary of the problem or inquiry)",
      "urgency": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "suggestedFixes": ["array of technical suggestions"],
      "missingFields": ["which of 'customerName', 'customerPhone', 'customerAddress' are missing"]
    }

    Intent classification rules:
    - SERVICE_REQUEST: customer needs work done (repair, install, fix, broken, leak, etc.)
    - INQUIRY: general question, pricing inquiry, availability check
    - SPAM_OR_IRRELEVANT: marketing emails, auto-replies, out-of-office, newsletters, unsubscribe notices, promotional content
    
    Respond ONLY with valid JSON, no markdown.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    if (response.usageMetadata?.totalTokenCount) {
        await logGeminiUsage(response.usageMetadata.totalTokenCount, 'gemini-2.5-flash', "classifyEmailWithAI");
    }

    const textResponse = response.candidates?.[0].content.parts[0].text || "{}";
    const jsonString = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
        const parsed = JSON.parse(jsonString);
        return {
            intent: parsed.intent || "SERVICE_REQUEST",
            confidence: parsed.intentConfidence || 0.5,
            ticketData: {
                customerName: parsed.customerName,
                customerPhone: parsed.customerPhone,
                customerAddress: parsed.customerAddress,
                issueDescription: parsed.issueDescription || text.substring(0, 500),
                urgency: parsed.urgency || "MEDIUM",
                suggestedFixes: parsed.suggestedFixes || [],
                missingFields: parsed.missingFields || []
            }
        };
    } catch (e) {
        console.error("Failed to parse AI classification:", textResponse);
        return {
            intent: "SERVICE_REQUEST",
            confidence: 0.5,
            ticketData: {
                issueDescription: text.substring(0, 500),
                urgency: "MEDIUM",
                suggestedFixes: [],
                missingFields: []
            }
        };
    }
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Looks up organization by the recipient email address.
 */
async function findOrganizationByRecipient(toEmail: string): Promise<OrganizationData | null> {
    const [localPart, domain] = toEmail.toLowerCase().split("@");

    // Strip plus-addressing suffix: "acmeplumbing+T-123" → "acmeplumbing"
    const prefix = localPart.includes("+") ? localPart.split("+")[0] : localPart;

    if (domain === DISPATCH_BOX_DOMAIN || domain === "dispatch-box.com") {
        const orgsSnapshot = await db.collection("organizations")
            .where("inboundEmail.prefix", "==", prefix)
            .limit(1)
            .get();

        if (!orgsSnapshot.empty) {
            const doc = orgsSnapshot.docs[0];
            return { id: doc.id, ...doc.data() } as OrganizationData;
        }
    }

    // Check for custom domain match
    const allOrgsSnapshot = await db.collection("organizations").get();
    for (const doc of allOrgsSnapshot.docs) {
        const orgData = doc.data();
        const customDomains = orgData.inboundEmail?.customDomains || [];

        if (customDomains.some((d: string) =>
            d.toLowerCase() === toEmail.toLowerCase() ||
            d.toLowerCase() === `@${domain}`
        )) {
            return { id: doc.id, ...orgData } as OrganizationData;
        }
    }

    return null;
}

/**
 * Finds an existing customer by email within an organization.
 */
async function findExistingCustomer(email: string, orgId: string): Promise<admin.firestore.DocumentSnapshot | null> {
    // Try org_id field
    let snapshot = await db.collection("customers")
        .where("email", "==", email)
        .where("org_id", "==", orgId)
        .limit(1)
        .get();

    if (!snapshot.empty) return snapshot.docs[0];

    // Try organizationId field (legacy)
    snapshot = await db.collection("customers")
        .where("email", "==", email)
        .where("organizationId", "==", orgId)
        .limit(1)
        .get();

    if (!snapshot.empty) return snapshot.docs[0];

    return null;
}

/** Extracts the email address from a "Name <email@example.com>" string. */
function parseEmailAddress(fromHeader: string): string {
    if (!fromHeader) return "unknown@example.com";
    const match = fromHeader.match(/<(.+)>/);
    return match ? match[1] : fromHeader.trim();
}

/** Extracts the display name from a "Name <email@example.com>" string. */
function parseDisplayName(fromHeader: string): string {
    if (!fromHeader) return "";
    const match = fromHeader.match(/^(.+?)\s*</);
    return match ? match[1].replace(/"/g, "").trim() : "";
}

/** Sends a plain text email via SendGrid. */
async function sendEmailReply(
    to: string, subject: string, text: string,
    fromEmail: string = "service@dispatch-box.com",
    fromName: string = "DispatchBox"
) {
    if (!SENDGRID_API_KEY) {
        console.warn("SendGrid API Key not set. Skipping email send.");
        return;
    }
    try {
        ensureSendGrid();
        await sgMail.send({ to, from: { email: fromEmail, name: fromName }, subject, text });
        console.log(`Email sent to ${to} from ${fromName} <${fromEmail}>`);
    } catch (error) {
        console.error("Error sending email:", error);
    }
}

/** Sends an HTML + text email via SendGrid. */
async function sendHtmlEmailReply(
    to: string, subject: string, text: string, html: string,
    fromEmail: string = "service@dispatch-box.com",
    fromName: string = "DispatchBox"
) {
    if (!SENDGRID_API_KEY) {
        console.warn("SendGrid API Key not set. Skipping email send.");
        return;
    }
    try {
        ensureSendGrid();
        await sgMail.send({ to, from: { email: fromEmail, name: fromName }, subject, text, html });
        console.log(`HTML email sent to ${to} from ${fromName} <${fromEmail}>`);
    } catch (error) {
        console.error("Error sending HTML email:", error);
    }
}

// ═══════════════════════════════════════════════════════════════
//  BRANDED HTML EMAIL TEMPLATE
// ═══════════════════════════════════════════════════════════════

function buildIntakeFormEmail(opts: {
    recipientName: string;
    issueSummary: string;
    intakeUrl: string;
    companyName: string;
    themeColor: string;
    logoUrl: string;
    expiresIn: string;
}): string {
    const { recipientName, issueSummary, intakeUrl, companyName, themeColor, logoUrl, expiresIn } = opts;

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <!-- Header -->
  <tr><td style="background:${themeColor};padding:32px 40px;text-align:center;">
    ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="height:40px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;" />` : ''}
    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">${companyName}</h1>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:40px;">
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Complete Your Service Request</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Hi ${recipientName},
    </p>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">
      We received your email and it looks like you need help with:
    </p>
    <div style="background:#f8f9fc;border-left:4px solid ${themeColor};padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 24px;">
      <p style="color:#333;font-size:14px;line-height:1.5;margin:0;font-style:italic;">${issueSummary}</p>
    </div>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 28px;">
      To get a technician assigned quickly, we just need a few more details from you:
    </p>
    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${intakeUrl}" style="display:inline-block;background:${themeColor};color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.3px;">
        Complete Your Request &rarr;
      </a>
    </td></tr></table>
    <p style="color:#999;font-size:13px;text-align:center;margin:20px 0 0;">
      This link expires in ${expiresIn}.
    </p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #eee;">
    <p style="color:#999;font-size:12px;margin:0;text-align:center;">
      You received this email because you contacted ${companyName}.<br/>
      If you didn't send this request, you can safely ignore this message.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
