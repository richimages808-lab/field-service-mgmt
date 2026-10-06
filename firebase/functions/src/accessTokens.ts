import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════
//  ACCESS TOKEN SYSTEM
//  Generates short, shareable tokens for customer-facing resources.
//  Tokens are 8-character alphanumeric codes that can be read over
//  the phone, sent via SMS, or embedded in URLs.
// ═══════════════════════════════════════════════════════════════

export type TokenResourceType = "ticket" | "quote" | "job" | "invoice" | "appointment";
export type TokenPermission = "view" | "approve" | "decline" | "reschedule" | "pay";

export interface AccessToken {
    token: string;
    resourceType: TokenResourceType;
    resourceId: string;
    orgId: string;
    customerPhone?: string;
    customerEmail?: string;
    customerName?: string;
    permissions: TokenPermission[];
    expiresAt: admin.firestore.Timestamp | null;
    createdAt: admin.firestore.Timestamp;
    createdBy: "system" | "technician" | "portal" | "voice" | "email";
    status: "active" | "consumed" | "expired" | "revoked";
    accessLog: Array<{
        accessedAt: admin.firestore.Timestamp;
        action: string;
        ip?: string;
    }>;
}

/**
 * Generate a short, human-friendly 8-character alphanumeric token.
 * Uses uppercase letters + digits (excluding ambiguous chars: 0, O, I, 1, L).
 * This gives us ~34^8 ≈ 1.78 trillion combinations — collision-safe.
 */
function generateShortToken(): string {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // No 0/O/I/1/L
    const bytes = crypto.randomBytes(8);
    let token = "";
    for (let i = 0; i < 8; i++) {
        token += chars[bytes[i] % chars.length];
    }
    return token;
}

/**
 * Create a new access token for a customer-facing resource.
 * Returns the generated token string.
 */
export async function createAccessToken(params: {
    resourceType: TokenResourceType;
    resourceId: string;
    orgId: string;
    customerPhone?: string;
    customerEmail?: string;
    customerName?: string;
    permissions: TokenPermission[];
    createdBy: AccessToken["createdBy"];
    expiresInDays?: number; // null/undefined = no expiry for view-only
}): Promise<string> {
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const token = generateShortToken();
        const tokenRef = db.collection("access_tokens").doc(token);

        // Check for collision (extremely unlikely but safe)
        const existing = await tokenRef.get();
        if (existing.exists) {
            console.warn(`[AccessToken] Collision on token ${token}, retrying...`);
            continue;
        }

        const expiresAt = params.expiresInDays
            ? admin.firestore.Timestamp.fromDate(
                  new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000)
              )
            : null;

        const tokenData: any = {
            token,
            resourceType: params.resourceType,
            resourceId: params.resourceId,
            orgId: params.orgId,
            permissions: params.permissions,
            expiresAt,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: params.createdBy,
            status: "active",
            accessLog: [],
        };

        if (params.customerPhone) tokenData.customerPhone = params.customerPhone;
        if (params.customerEmail) tokenData.customerEmail = params.customerEmail;
        if (params.customerName) tokenData.customerName = params.customerName;

        await tokenRef.set(tokenData);

        // Also store the token reference on the resource itself for quick lookups
        try {
            const resourceCollection = getCollectionForType(params.resourceType);
            if (resourceCollection) {
                await db.collection(resourceCollection).doc(params.resourceId).update({
                    accessToken: token,
                    accessTokenCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
        } catch (err) {
            // Non-fatal — the token still works via the access_tokens collection
            console.warn(`[AccessToken] Could not back-link token to ${params.resourceType}/${params.resourceId}:`, err);
        }

        console.log(`[AccessToken] Created ${token} → ${params.resourceType}/${params.resourceId} (org: ${params.orgId})`);
        return token;
    }

    throw new Error("Failed to generate a unique access token after multiple retries.");
}

/**
 * Create tokens for multiple resource types at once (e.g., ticket + job + quote).
 * Returns a map of resourceType → token.
 */
export async function createAccessTokenBatch(params: {
    resources: Array<{
        resourceType: TokenResourceType;
        resourceId: string;
        permissions: TokenPermission[];
    }>;
    orgId: string;
    customerPhone?: string;
    customerEmail?: string;
    customerName?: string;
    createdBy: AccessToken["createdBy"];
    expiresInDays?: number;
}): Promise<Record<string, string>> {
    const tokens: Record<string, string> = {};

    for (const resource of params.resources) {
        const token = await createAccessToken({
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            orgId: params.orgId,
            customerPhone: params.customerPhone,
            customerEmail: params.customerEmail,
            customerName: params.customerName,
            permissions: resource.permissions,
            createdBy: params.createdBy,
            expiresInDays: params.expiresInDays,
        });
        tokens[resource.resourceType] = token;
    }

    return tokens;
}

function getCollectionForType(type: TokenResourceType): string | null {
    switch (type) {
        case "ticket": return "tickets";
        case "quote": return "quotes";
        case "job": return "jobs";
        case "invoice": return "invoices";
        case "appointment": return "jobs"; // appointments are scheduled jobs
        default: return null;
    }
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIC CLOUD FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve an access token → returns the resource data + org branding.
 * Public endpoint (no auth required) — the token IS the auth.
 */
export const resolveAccessToken = functions.https.onCall(async (data) => {
    const { token, verifyPhone } = data;

    if (!token || typeof token !== "string" || token.length !== 8) {
        throw new functions.https.HttpsError("invalid-argument", "Invalid token format.");
    }

    const tokenRef = db.collection("access_tokens").doc(token.toUpperCase());
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
        throw new functions.https.HttpsError("not-found", "This link is invalid or has expired.");
    }

    const tokenData = tokenDoc.data()!;

    // Check status
    if (tokenData.status === "consumed") {
        throw new functions.https.HttpsError("failed-precondition", "This link has already been used.");
    }
    if (tokenData.status === "revoked") {
        throw new functions.https.HttpsError("failed-precondition", "This link has been revoked.");
    }
    if (tokenData.status === "expired") {
        throw new functions.https.HttpsError("deadline-exceeded", "This link has expired.");
    }

    // Check expiry
    if (tokenData.expiresAt) {
        const expiresAt = tokenData.expiresAt.toDate ? tokenData.expiresAt.toDate() : new Date(tokenData.expiresAt);
        if (new Date() > expiresAt) {
            await tokenRef.update({ status: "expired" });
            throw new functions.https.HttpsError("deadline-exceeded", "This link has expired.");
        }
    }

    // Optional phone verification for sensitive actions
    if (verifyPhone && tokenData.customerPhone) {
        const normalizedInput = normalizePhone(verifyPhone);
        const normalizedStored = normalizePhone(tokenData.customerPhone);
        if (normalizedInput !== normalizedStored) {
            throw new functions.https.HttpsError(
                "permission-denied",
                "The phone number doesn't match our records."
            );
        }
    }

    // Fetch the actual resource
    const resourceCollection = getCollectionForType(tokenData.resourceType);
    if (!resourceCollection) {
        throw new functions.https.HttpsError("internal", "Unknown resource type.");
    }

    const resourceDoc = await db.collection(resourceCollection).doc(tokenData.resourceId).get();
    if (!resourceDoc.exists) {
        throw new functions.https.HttpsError("not-found", "The requested resource no longer exists.");
    }

    // Fetch org branding
    const orgDoc = await db.collection("organizations").doc(tokenData.orgId).get();
    const orgData = orgDoc.exists ? orgDoc.data() : {};

    // Log access — use new Date() because serverTimestamp() cannot be used inside arrayUnion
    const accessEntry = {
        accessedAt: admin.firestore.Timestamp.fromDate(new Date()),
        action: "viewed",
    };
    await tokenRef.update({
        accessLog: admin.firestore.FieldValue.arrayUnion(accessEntry),
    });

    // Build safe response (strip sensitive internal fields)
    const resourceData = resourceDoc.data()!;
    const safeResource = buildSafeResourceView(tokenData.resourceType, resourceData, resourceDoc.id);

    return {
        token: tokenData.token,
        resourceType: tokenData.resourceType,
        resourceId: tokenData.resourceId,
        permissions: tokenData.permissions,
        resource: safeResource,
        org: {
            name: orgData?.name || "Service Provider",
            companyName: orgData?.branding?.companyName || orgData?.name || "Service Provider",
            themeColor: orgData?.branding?.primaryColor || orgData?.portalConfig?.themeColor || "#3B82F6",
            logoUrl: orgData?.branding?.logoUrl || "",
            phone: orgData?.phone || "",
            slug: orgData?.slug || orgData?.portalConfig?.slug || "",
        },
    };
});

/**
 * Look up an existing appointment by phone + org slug.
 * Returns basic appointment info + the access token for managing it.
 */
export function getPhoneVariations(phone: string): string[] {
    const raw = (phone || "").trim();
    if (!raw) return [];

    const digits = raw.replace(/\D/g, "");
    const variations = new Set<string>();

    variations.add(raw);
    if (digits) {
        variations.add(digits);
    }

    if (digits.length === 10) {
        const area = digits.slice(0, 3);
        const prefix = digits.slice(3, 6);
        const line = digits.slice(6, 10);

        variations.add(`+1${digits}`);
        variations.add(`1${digits}`);
        variations.add(`(${area}) ${prefix}-${line}`);
        variations.add(`(${area})${prefix}-${line}`);
        variations.add(`${area}-${prefix}-${line}`);
        variations.add(`${area}.${prefix}.${line}`);
        variations.add(`${area} ${prefix} ${line}`);
        variations.add(`1-${area}-${prefix}-${line}`);
        variations.add(`+1 (${area}) ${prefix}-${line}`);
        variations.add(`+1 ${area}-${prefix}-${line}`);
        variations.add(`+1-${area}-${prefix}-${line}`);
    } else if (digits.length === 11 && digits.startsWith("1")) {
        const d10 = digits.slice(1);
        const area = d10.slice(0, 3);
        const prefix = d10.slice(3, 6);
        const line = d10.slice(6, 10);

        variations.add(d10);
        variations.add(`+${digits}`);
        variations.add(`+1${d10}`);
        variations.add(`1${d10}`);
        variations.add(`(${area}) ${prefix}-${line}`);
        variations.add(`(${area})${prefix}-${line}`);
        variations.add(`${area}-${prefix}-${line}`);
        variations.add(`${area}.${prefix}.${line}`);
        variations.add(`${area} ${prefix} ${line}`);
        variations.add(`1-${area}-${prefix}-${line}`);
        variations.add(`+1 (${area}) ${prefix}-${line}`);
        variations.add(`+1 ${area}-${prefix}-${line}`);
        variations.add(`+1-${area}-${prefix}-${line}`);
    } else if (digits.length > 10 && raw.startsWith("+")) {
        variations.add(`+${digits}`);
        const last10 = digits.slice(-10);
        variations.add(last10);
    }

    return Array.from(variations).filter(Boolean);
}

export const lookupAppointmentByPhone = functions.https.onCall(async (data) => {
    const { phone, slug } = data;

    if (!phone || !slug) {
        throw new functions.https.HttpsError("invalid-argument", "Phone and organization are required.");
    }

    // Find org
    let orgSnapshot = await db.collection("organizations")
        .where("slug", "==", slug).limit(1).get();
    if (orgSnapshot.empty) {
        orgSnapshot = await db.collection("organizations")
            .where("portalConfig.slug", "==", slug).limit(1).get();
    }
    if (orgSnapshot.empty) {
        throw new functions.https.HttpsError("not-found", "Organization not found.");
    }
    const orgId = orgSnapshot.docs[0].id;
    const orgData = orgSnapshot.docs[0].data();

    // Gather all candidate phone formats (raw, unformatted, formatted, E.164, etc.)
    const clientCandidates = Array.isArray(data.candidatePhones) ? data.candidatePhones : [];
    const variations = Array.from(new Set([
        ...getPhoneVariations(phone),
        ...clientCandidates.flatMap((p: string) => getPhoneVariations(p)),
    ])).filter(Boolean);

    // Search tickets for matches across any phone format (in chunks of up to 30)
    const candidateChunks: string[][] = [];
    for (let i = 0; i < variations.length; i += 30) {
        candidateChunks.push(variations.slice(i, i + 30));
    }

    let ticketDocs: admin.firestore.DocumentSnapshot[] = [];
    for (const chunk of candidateChunks) {
        const snap = await db.collection("tickets")
            .where("organizationId", "==", orgId)
            .where("requestorPhone", "in", chunk)
            .limit(20)
            .get();
        ticketDocs.push(...snap.docs);
    }

    // Deduplicate ticket docs by ID
    const seenTicketIds = new Set<string>();
    ticketDocs = ticketDocs.filter(d => {
        if (seenTicketIds.has(d.id)) return false;
        seenTicketIds.add(d.id);
        return true;
    });

    if (ticketDocs.length === 0) {
        // Also check jobs collection by customer.phone in variations
        let jobDocs: admin.firestore.DocumentSnapshot[] = [];
        for (const chunk of candidateChunks) {
            const snap = await db.collection("jobs")
                .where("org_id", "==", orgId)
                .where("customer.phone", "in", chunk)
                .limit(10)
                .get();
            jobDocs.push(...snap.docs);
        }

        const seenJobIds = new Set<string>();
        jobDocs = jobDocs.filter(d => {
            if (seenJobIds.has(d.id)) return false;
            seenJobIds.add(d.id);
            return true;
        });

        if (jobDocs.length > 0) {
            const sortedJobs = jobDocs.sort((a, b) => {
                const aData = a.data()!;
                const bData = b.data()!;
                const aTime = aData.scheduled_at?.seconds || aData.createdAt?.seconds || 0;
                const bTime = bData.scheduled_at?.seconds || bData.createdAt?.seconds || 0;
                return bTime - aTime;
            }).slice(0, 5);

            return buildJobAppointmentLookupResponse(sortedJobs, orgId, orgData);
        }

        throw new functions.https.HttpsError(
            "not-found",
            "No appointments found for this phone number. If you recently booked, please check back shortly."
        );
    }

    // Sort tickets by createdAt desc so most recent appear first
    const sortedTickets = ticketDocs.sort((a, b) => {
        const aData = a.data()!;
        const bData = b.data()!;
        const aTime = aData.createdAt?.toMillis ? aData.createdAt.toMillis() : (aData.createdAt?.seconds ? aData.createdAt.seconds * 1000 : 0);
        const bTime = bData.createdAt?.toMillis ? bData.createdAt.toMillis() : (bData.createdAt?.seconds ? bData.createdAt.seconds * 1000 : 0);
        return bTime - aTime;
    }).slice(0, 5);

    return buildAppointmentLookupResponse(sortedTickets, orgId, orgData);
});

async function buildJobAppointmentLookupResponse(
    jobDocs: admin.firestore.DocumentSnapshot[],
    orgId: string,
    orgData: any
) {
    const appointments: any[] = [];

    for (const jobDoc of jobDocs) {
        const job = jobDoc.data()!;
        const appointment: any = {
            jobId: jobDoc.id,
            description: job.request?.description || job.title || "Service Appointment",
            status: job.status || "CONFIRMED",
            createdAt: job.createdAt || null,
            source: "JOB",
        };

        if (job.scheduled_at) {
            appointment.scheduledAt = job.scheduled_at;
            appointment.scheduledSlot = job.scheduledSlot || null;
        }

        if (job.accessToken) {
            appointment.accessToken = job.accessToken;
        } else {
            try {
                const token = await createAccessToken({
                    resourceType: "job",
                    resourceId: jobDoc.id,
                    orgId,
                    customerPhone: job.customer?.phone || job.phone,
                    customerEmail: job.customer?.email,
                    permissions: ["view", "reschedule"],
                    createdBy: "system",
                    expiresInDays: 90,
                });
                appointment.accessToken = token;
            } catch (err) {
                console.error("Failed to generate token for job lookup:", err);
            }
        }

        appointments.push(appointment);
    }

    return {
        appointments,
        org: {
            name: orgData?.name || "Service Provider",
            companyName: orgData?.branding?.companyName || orgData?.name || "Service Provider",
            themeColor: orgData?.branding?.primaryColor || orgData?.portalConfig?.themeColor || "#3B82F6",
            logoUrl: orgData?.branding?.logoUrl || "",
        },
    };
}

async function buildAppointmentLookupResponse(
    ticketDocs: admin.firestore.DocumentSnapshot[],
    orgId: string,
    orgData: any
) {
    const appointments: any[] = [];

    for (const ticketDoc of ticketDocs) {
        const ticket = ticketDoc.data()!;
        const appointment: any = {
            ticketId: ticketDoc.id,
            description: ticket.description?.replace(/\[.*?\]\n.*?\n\n/s, "") || "Service request",
            status: ticket.status,
            createdAt: ticket.createdAt,
            source: ticket.source,
        };

        // Check for linked job with scheduling info
        if (ticket.autoJobId) {
            const jobDoc = await db.collection("jobs").doc(ticket.autoJobId).get();
            if (jobDoc.exists) {
                const job = jobDoc.data()!;
                appointment.jobId = jobDoc.id;
                appointment.jobStatus = job.status;
                if (job.scheduled_at) {
                    appointment.scheduledAt = job.scheduled_at;
                    appointment.scheduledSlot = job.scheduledSlot || null;
                }
            }
        }

        // Find or create access token
        if (ticket.accessToken) {
            appointment.accessToken = ticket.accessToken;
        } else {
            // Generate one on-the-fly for legacy tickets
            try {
                const token = await createAccessToken({
                    resourceType: "ticket",
                    resourceId: ticketDoc.id,
                    orgId,
                    customerPhone: ticket.requestorPhone,
                    customerEmail: ticket.requestorEmail,
                    permissions: ["view", "reschedule"],
                    createdBy: "system",
                    expiresInDays: 90,
                });
                appointment.accessToken = token;
            } catch (err) {
                console.error("Failed to generate token for lookup:", err);
            }
        }

        // Check for linked quote
        if (ticket.autoQuoteId) {
            appointment.quoteId = ticket.autoQuoteId;
            appointment.quoteTotal = ticket.autoQuoteTotal || null;
        }

        appointments.push(appointment);
    }

    return {
        appointments,
        org: {
            name: orgData?.name || "Service Provider",
            companyName: orgData?.branding?.companyName || orgData?.name || "Service Provider",
            themeColor: orgData?.branding?.primaryColor || orgData?.portalConfig?.themeColor || "#3B82F6",
            logoUrl: orgData?.branding?.logoUrl || "",
        },
    };
}

/**
 * Build a safe, customer-facing view of a resource (strip internal fields).
 */
function buildSafeResourceView(type: TokenResourceType, data: any, id: string): any {
    switch (type) {
        case "ticket":
            return {
                id,
                status: data.status,
                description: data.description?.replace(/\[.*?\]\n.*?\n\n/s, "") || "",
                customerName: data.requestorName || data.customerName || "",
                address: data.address || "",
                createdAt: data.createdAt,
                source: data.source,
                autoJobId: data.autoJobId || null,
                autoQuoteId: data.autoQuoteId || null,
                metadata: data.metadata || {},
            };

        case "job":
            return {
                id,
                status: data.status,
                priority: data.priority,
                customer: data.customer || {},
                scheduledAt: data.scheduled_at || null,
                scheduledSlot: data.scheduledSlot || null,
                description: data.request?.description || "",
                createdAt: data.createdAt,
            };

        case "quote":
            return {
                id,
                status: data.status,
                quoteNumber: data.quoteNumber,
                total: data.total,
                subtotal: data.subtotal,
                taxAmount: data.taxAmount,
                lineItems: data.lineItems || [],
                scopeOfWork: data.scopeOfWork || "",
                validUntil: data.validUntil,
                customer: data.customer || {},
                presentationMode: data.presentationMode || "full",
            };

        case "invoice":
            return {
                id,
                status: data.status,
                total: data.total,
                balance_due: data.balance_due,
                customer: data.customer || {},
                items: data.items || [],
                createdAt: data.createdAt,
            };

        case "appointment":
            return {
                id,
                status: data.status,
                scheduledAt: data.scheduled_at || null,
                scheduledSlot: data.scheduledSlot || null,
                customer: data.customer || {},
                description: data.request?.description || "",
            };

        default:
            return { id, status: data.status };
    }
}

function normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return phone;
}
