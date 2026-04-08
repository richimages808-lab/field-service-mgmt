import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as busboy from "busboy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as sgMail from "@sendgrid/mail";
import { logGeminiUsage } from "../billing";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Initialize SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Default DispatchBox email domain for prefix-based routing
const DISPATCH_BOX_DOMAIN = "service.dispatch-box.com";

interface ParsedTicketData {
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    issueDescription: string;
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    suggestedFixes: string[];
    missingFields: string[];
}

interface OrganizationData {
    id: string;
    name: string;
    slug: string;
    inboundEmail: {
        prefix?: string;
        customDomains?: string[];
        autoReplyEnabled: boolean;
        autoReplyTemplate?: string;
    };
    outboundEmail: {
        fromName: string;
        fromEmail: string;
        replyTo?: string;
    };
}

/**
 * Looks up organization by the recipient email address.
 * Supports both:
 * - Email prefix: acme@service.dispatch-box.com → org with prefix "acme"
 * - Custom domain: support@acme-hvac.com → org with customDomains containing that address
 */
async function findOrganizationByRecipient(toEmail: string): Promise<OrganizationData | null> {
    const [localPart, domain] = toEmail.toLowerCase().split("@");

    // Check if it's a DispatchBox prefix email (e.g., acme@service.dispatch-box.com)
    if (domain === DISPATCH_BOX_DOMAIN || domain === "dispatch-box.com") {
        const orgsSnapshot = await db.collection("organizations")
            .where("inboundEmail.prefix", "==", localPart)
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

        // Check if this email matches any custom domain
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
 * Handles inbound emails from SendGrid Inbound Parse Webhook.
 * Routes to the appropriate organization based on recipient address.
 */
export const handleInboundEmail = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    const busboyInstance = busboy({ headers: req.headers });
    const fields: { [key: string]: string } = {};
    // const attachments: any[] = []; // TODO: Handle attachments in future

    busboyInstance.on("field", (fieldname, val) => {
        fields[fieldname] = val;
    });

    busboyInstance.on("finish", async () => {
        try {
            const emailBody = fields.text || fields.html || "";
            const fromEmail = parseEmailAddress(fields.from);
            const toEmail = parseEmailAddress(fields.to);
            const subject = fields.subject || "No Subject";

            console.log(`Received email from: ${fromEmail}, to: ${toEmail}, Subject: ${subject}`);

            // 1. Find the organization for this email
            const org = await findOrganizationByRecipient(toEmail);

            if (!org) {
                console.log(`No organization found for recipient: ${toEmail}`);
                // Still process the email to default org or reject
                // For now, we'll create ticket without org_id
            }

            console.log(`Routing to organization: ${org?.name || 'Default'} (${org?.id || 'none'})`);

            // 2. Analyze with AI (with fallback if AI unavailable)
            let aiAnalysis: ParsedTicketData;
            try {
                aiAnalysis = await processEmailWithAI(emailBody, subject);
            } catch (aiError) {
                console.warn("AI analysis failed, using fallback:", aiError);
                aiAnalysis = {
                    issueDescription: `${subject}\n\n${emailBody}`.substring(0, 500),
                    urgency: "MEDIUM",
                    suggestedFixes: [],
                    missingFields: []
                };
            }

            // 3. Find or Register Customer (within org)
            const { customerRef, isNew } = await findOrRegisterCustomer(fromEmail, aiAnalysis, org?.id);

            // 4. Create Ticket (associated with org)
            await createTicket(fromEmail, subject, aiAnalysis, customerRef, org?.id);

            // 5. Send Auto-Reply (using org's settings if available)
            if (org?.inboundEmail?.autoReplyEnabled !== false) {
                const fromAddress = org?.outboundEmail?.fromEmail || "service@dispatch-box.com";
                const fromName = org?.outboundEmail?.fromName || "DispatchBox";

                if (aiAnalysis.missingFields.length > 0 && isNew) {
                    await sendEmailReply(
                        fromEmail,
                        "Action Required: Missing Information for your Ticket",
                        `Hello,\n\nWe received your request but need a bit more information to assist you.\n\nPlease reply with the following:\n${aiAnalysis.missingFields.join("\n- ")}\n\nThank you!\n${fromName}`,
                        fromAddress,
                        fromName
                    );
                } else {
                    await sendEmailReply(
                        fromEmail,
                        "Ticket Created Successfully",
                        org?.inboundEmail?.autoReplyTemplate ||
                        `Hello,\n\nYour ticket has been created successfully. A technician will review your issue shortly.\n\nSummary: ${aiAnalysis.issueDescription}\n\nThank you!\n${fromName}`,
                        fromAddress,
                        fromName
                    );
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

/**
 * Extracts the email address from a "Name <email@example.com>" string.
 */
function parseEmailAddress(fromHeader: string): string {
    if (!fromHeader) return "unknown@example.com";
    const match = fromHeader.match(/<(.+)>/);
    return match ? match[1] : fromHeader.trim();
}

/**
 * Uses Gemini to parse the email content.
 */
async function processEmailWithAI(text: string, subject: string): Promise<ParsedTicketData> {
    const prompt = `
    You are an AI assistant for a Field Service Management company.
    Analyze the following email to extract ticket information.
    
    Subject: ${subject}
    Body: ${text}

    Extract the following in JSON format:
    - customerName: (string, if present)
    - customerPhone: (string, if present)
    - customerAddress: (string, if present)
    - issueDescription: (summary of the problem)
    - urgency: (LOW, MEDIUM, HIGH, CRITICAL based on tone and keywords)
    - suggestedFixes: (array of strings, technical suggestions for the technician)
    - missingFields: (array of strings, list which of 'customerName', 'customerPhone', 'customerAddress' are missing)
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    if (response.usageMetadata?.totalTokenCount) {
        await logGeminiUsage(response.usageMetadata.totalTokenCount, 'gemini-2.5-flash', "processEmailWithAI");
    }

    const textResponse = response.candidates?.[0].content.parts[0].text || "{}";

    // Clean up markdown code blocks if present
    const jsonString = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
        return JSON.parse(jsonString) as ParsedTicketData;
    } catch (e) {
        console.error("Failed to parse AI response:", textResponse);
        return {
            issueDescription: text,
            urgency: "MEDIUM",
            suggestedFixes: [],
            missingFields: []
        };
    }
}

/**
 * Finds a customer by email or creates a temporary record.
 */
async function findOrRegisterCustomer(email: string, data: ParsedTicketData, orgId?: string) {
    const customersRef = db.collection("customers");

    // Query by email (and optionally org_id)
    let query = customersRef.where("email", "==", email);
    if (orgId) {
        query = query.where("org_id", "==", orgId);
    }

    const snapshot = await query.limit(1).get();

    if (!snapshot.empty) {
        return { customerRef: snapshot.docs[0].ref, isNew: false };
    }

    // Create new customer/lead
    const newCustomerRef = customersRef.doc();
    await newCustomerRef.set({
        email,
        name: data.customerName || "Unknown",
        phone: data.customerPhone || "",
        address: data.customerAddress || "",
        org_id: orgId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        type: "LEAD"
    });

    return { customerRef: newCustomerRef, isNew: true };
}

/**
 * Creates a ticket in Firestore.
 */
async function createTicket(
    email: string,
    subject: string,
    data: ParsedTicketData,
    customerRef: admin.firestore.DocumentReference,
    orgId?: string
) {
    const ticketData: any = {
        requestorEmail: email,
        customerRef,
        subject,
        description: data.issueDescription,
        urgency: data.urgency,
        suggestedFixes: data.suggestedFixes,
        status: "PENDING",
        source: "EMAIL",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        aiAnalysis: data
    };

    if (orgId) {
        ticketData.org_id = orgId;
    }

    await db.collection("tickets").add(ticketData);
}

/**
 * Sends an email via SendGrid.
 */
async function sendEmailReply(
    to: string,
    subject: string,
    text: string,
    fromEmail: string = "service@dispatch-box.com",
    fromName: string = "DispatchBox"
) {
    if (!SENDGRID_API_KEY) {
        console.warn("SendGrid API Key not set. Skipping email send.");
        return;
    }

    const msg = {
        to,
        from: {
            email: fromEmail,
            name: fromName
        },
        subject,
        text,
    };

    try {
        await sgMail.send(msg);
        console.log(`Email sent to ${to} from ${fromName} <${fromEmail}>`);
    } catch (error) {
        console.error("Error sending email:", error);
    }
}
