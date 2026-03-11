/**
 * customDomainService.ts — Custom Domain Management for DispatchBox
 *
 * Handles custom domain provisioning for white-label branding:
 * - Firebase Hosting custom domain for the web app
 * - SendGrid domain authentication for branded email
 * - DNS verification polling
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const FIREBASE_PROJECT_ID = "maintenancemanager-c5533";

// ============================================================
// HELPERS
// ============================================================

async function sendGridRequest(method: string, path: string, body?: any): Promise<any> {
    if (!SENDGRID_API_KEY) {
        throw new Error("SENDGRID_API_KEY not configured");
    }
    const url = `https://api.sendgrid.com/v3${path}`;
    const options: any = {
        method,
        headers: {
            "Authorization": `Bearer ${SENDGRID_API_KEY}`,
            "Content-Type": "application/json"
        }
    };
    if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SendGrid API error ${response.status}: ${errorText}`);
    }
    if (response.status === 204) return null;
    return response.json();
}

// ============================================================
// REGISTER CUSTOM DOMAIN
// ============================================================

/**
 * Registers a custom domain for an org.
 * Returns the DNS records the customer needs to add.
 */
export const registerCustomDomain = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, domain } = data;
    if (!orgId || !domain) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId or domain");
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
        throw new functions.https.HttpsError("invalid-argument", "Invalid domain format");
    }

    // Check if domain is already claimed
    const existingDomain = await db.collection("org_custom_domains")
        .where("domain", "==", domain.toLowerCase())
        .limit(1)
        .get();

    if (!existingDomain.empty) {
        const existingOrgId = existingDomain.docs[0].data().orgId;
        if (existingOrgId !== orgId) {
            throw new functions.https.HttpsError("already-exists", "This domain is already registered to another organization");
        }
    }

    const now = admin.firestore.Timestamp.now();
    const dnsRecords: Array<{ type: string; host: string; value: string; purpose: string }> = [];

    // ---- Firebase Hosting custom domain DNS ----
    // The customer needs to add a CNAME for their domain pointing to Firebase Hosting
    dnsRecords.push({
        type: "CNAME",
        host: domain.toLowerCase(),
        value: `${FIREBASE_PROJECT_ID}.web.app`,
        purpose: "Website hosting — points your domain to DispatchBox"
    });

    // ---- SendGrid Domain Authentication ----
    let sendgridDomainId: number | null = null;
    let sendgridDnsRecords: any[] = [];

    try {
        const sgResult = await sendGridRequest("POST", "/whitelabel/domains", {
            domain: domain.toLowerCase(),
            subdomain: "em",
            automatic_security: true,
            default: false,
            custom_spf: false
        });

        sendgridDomainId = sgResult.id;

        // Extract DNS records from SendGrid response
        if (sgResult.dns) {
            for (const [key, record] of Object.entries(sgResult.dns) as any) {
                const rec = record as any;
                dnsRecords.push({
                    type: rec.type || "CNAME",
                    host: rec.host,
                    value: rec.data,
                    purpose: `Email authentication (${key})`
                });
                sendgridDnsRecords.push({
                    key,
                    type: rec.type || "CNAME",
                    host: rec.host,
                    data: rec.data,
                    valid: rec.valid || false
                });
            }
        }
    } catch (error) {
        console.warn("[CustomDomain] SendGrid domain auth error:", (error as Error).message);
        // Non-fatal: web hosting still works without email domain auth
    }

    // Save domain configuration
    const domainDoc = {
        orgId,
        domain: domain.toLowerCase(),
        status: "pending_verification",
        dnsRecords,
        sendgrid: {
            domainId: sendgridDomainId,
            dnsRecords: sendgridDnsRecords,
            verified: false
        },
        hosting: {
            target: `${FIREBASE_PROJECT_ID}.web.app`,
            verified: false
        },
        createdAt: now,
        updatedAt: now,
        createdBy: context.auth.uid
    };

    if (!existingDomain.empty) {
        await existingDomain.docs[0].ref.update(domainDoc);
    } else {
        await db.collection("org_custom_domains").add(domainDoc);
    }

    // Update org
    await db.collection("organizations").doc(orgId).update({
        customDomain: domain.toLowerCase(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
        success: true,
        domain: domain.toLowerCase(),
        dnsRecords,
        message: `Domain registered! Please add the following DNS records to your domain registrar, then click "Verify" to activate.`
    };
});

// ============================================================
// VERIFY CUSTOM DOMAIN
// ============================================================

/**
 * Checks if the customer has added the required DNS records.
 */
export const verifyCustomDomain = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    // Get the domain config
    const domainSnap = await db.collection("org_custom_domains")
        .where("orgId", "==", orgId)
        .limit(1)
        .get();

    if (domainSnap.empty) {
        throw new functions.https.HttpsError("not-found", "No custom domain registered");
    }

    const domainDoc = domainSnap.docs[0];
    const domainData = domainDoc.data();
    const verificationResults: Record<string, boolean> = {};

    // ---- Verify SendGrid Domain ----
    let sendgridVerified = false;
    if (domainData.sendgrid?.domainId) {
        try {
            const result = await sendGridRequest(
                "POST",
                `/whitelabel/domains/${domainData.sendgrid.domainId}/validate`
            );
            sendgridVerified = result?.valid || false;
            verificationResults.email = sendgridVerified;
        } catch (error) {
            console.warn("[CustomDomain] SendGrid verification error:", (error as Error).message);
            verificationResults.email = false;
        }
    }

    // ---- Check DNS for hosting CNAME ----
    // We'll do a simple DNS lookup to check if the CNAME is pointing to our hosting
    let hostingVerified = false;
    try {
        // Use Google DNS-over-HTTPS to check CNAME
        const dnsResponse = await fetch(
            `https://dns.google/resolve?name=${domainData.domain}&type=CNAME`
        );
        const dnsResult = await dnsResponse.json();

        if (dnsResult.Answer) {
            hostingVerified = dnsResult.Answer.some(
                (record: any) => record.data?.includes(FIREBASE_PROJECT_ID)
            );
        }
        verificationResults.hosting = hostingVerified;
    } catch (error) {
        console.warn("[CustomDomain] DNS check error:", (error as Error).message);
        verificationResults.hosting = false;
    }

    // Determine overall status
    const allVerified = sendgridVerified && hostingVerified;
    const anyVerified = sendgridVerified || hostingVerified;
    const newStatus = allVerified
        ? "verified"
        : anyVerified
            ? "partially_verified"
            : "pending_verification";

    // Update Firestore
    await domainDoc.ref.update({
        status: newStatus,
        "sendgrid.verified": sendgridVerified,
        "hosting.verified": hostingVerified,
        lastVerifiedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
    });

    return {
        success: true,
        domain: domainData.domain,
        status: newStatus,
        verification: verificationResults,
        message: allVerified
            ? "All DNS records verified! Your custom domain is active."
            : anyVerified
                ? "Some DNS records verified. Please check remaining records."
                : "DNS records not yet detected. Changes can take up to 48 hours to propagate."
    };
});

// ============================================================
// GET CUSTOM DOMAIN STATUS
// ============================================================

/**
 * Returns the current custom domain configuration and status.
 */
export const getCustomDomainStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    const domainSnap = await db.collection("org_custom_domains")
        .where("orgId", "==", orgId)
        .limit(1)
        .get();

    if (domainSnap.empty) {
        return { configured: false };
    }

    const domainData = domainSnap.docs[0].data();
    return {
        configured: true,
        domain: domainData.domain,
        status: domainData.status,
        dnsRecords: domainData.dnsRecords,
        hostingVerified: domainData.hosting?.verified || false,
        emailVerified: domainData.sendgrid?.verified || false
    };
});

// ============================================================
// REMOVE CUSTOM DOMAIN
// ============================================================

/**
 * Removes a custom domain from an org.
 */
export const removeCustomDomain = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    const domainSnap = await db.collection("org_custom_domains")
        .where("orgId", "==", orgId)
        .limit(1)
        .get();

    if (!domainSnap.empty) {
        const domainData = domainSnap.docs[0].data();

        // Delete SendGrid domain authentication if exists
        if (domainData.sendgrid?.domainId) {
            try {
                await sendGridRequest("DELETE", `/whitelabel/domains/${domainData.sendgrid.domainId}`);
            } catch (e) {
                console.warn("[CustomDomain] Error removing SendGrid domain:", (e as Error).message);
            }
        }

        await domainSnap.docs[0].ref.delete();
    }

    // Clear from org
    await db.collection("organizations").doc(orgId).update({
        customDomain: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: "Custom domain removed" };
});
