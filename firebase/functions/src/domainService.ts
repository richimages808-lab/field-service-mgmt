import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

const db = admin.firestore();

// ============================================================
// NAMESILO API CONFIGURATION
// ============================================================

const NAMESILO_API_KEY = process.env.NAMESILO_API_KEY || "";
const NAMESILO_BASE_URL = "https://www.namesilo.com/api";

interface NameSiloResponse {
    reply: {
        code: number;
        detail: string;
        [key: string]: any;
    };
}

/**
 * Make an authenticated request to the NameSilo API
 */
async function nameSiloRequest(
    operation: string,
    params: Record<string, string> = {}
): Promise<NameSiloResponse> {
    const queryParams = new URLSearchParams({
        version: "1",
        type: "xml",
        key: NAMESILO_API_KEY,
        ...params
    });

    const url = `${NAMESILO_BASE_URL}/${operation}?${queryParams.toString()}`;
    const response = await fetch(url);
    const text = await response.text();

    // NameSilo returns XML — parse the key fields
    // For production, use a proper XML parser; this is a simplified approach
    const codeMatch = text.match(/<code>(\d+)<\/code>/);
    const detailMatch = text.match(/<detail>(.*?)<\/detail>/);
    const code = codeMatch ? parseInt(codeMatch[1]) : 999;
    const detail = detailMatch ? detailMatch[1] : "Unknown error";

    return {
        reply: {
            code,
            detail,
            rawXml: text
        }
    };
}

// ============================================================
// DOMAIN SEARCH
// ============================================================

/**
 * Check domain availability and return pricing
 */
export const checkDomainAvailability = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { domain } = data;
    if (!domain) {
        throw new functions.https.HttpsError("invalid-argument", "Domain name is required");
    }

    // Clean the domain
    const cleanDomain = domain.toLowerCase().replace(/[^a-z0-9.-]/g, "").trim();

    try {
        const result = await nameSiloRequest("checkRegisterAvailability", {
            domains: cleanDomain
        });

        // Parse availability from XML
        const availableMatch = result.reply.rawXml.match(
            /<available>(.*?)<\/available>/
        );
        const priceMatch = result.reply.rawXml.match(
            /<price>([\d.]+)<\/price>/
        );

        const isAvailable = availableMatch
            ? availableMatch[1].includes(cleanDomain)
            : false;
        const wholesalePrice = priceMatch ? parseFloat(priceMatch[1]) : 10.95;

        // Add our markup
        const retailPrice = Math.ceil(wholesalePrice * 2.2 * 100) / 100; // ~120% markup, rounded

        return {
            domain: cleanDomain,
            available: isAvailable,
            pricing: {
                registration: retailPrice,
                renewal: 24.99, // Fixed annual renewal
                currency: "USD"
            },
            suggestions: isAvailable ? [] : generateDomainSuggestions(cleanDomain)
        };
    } catch (err: any) {
        console.error("Domain check error:", err);
        throw new functions.https.HttpsError("internal", "Failed to check domain availability");
    }
});

/**
 * Generate alternative domain suggestions
 */
function generateDomainSuggestions(domain: string): string[] {
    const baseName = domain.replace(/\.[^.]+$/, "");
    const extensions = [".com", ".net", ".co", ".io", ".services", ".pro"];
    return extensions.map(ext => `${baseName}${ext}`);
}

// ============================================================
// DOMAIN REGISTRATION
// ============================================================

/**
 * Register a domain for a customer organization
 */
export const registerDomain = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, domain } = data;
    if (!orgId || !domain) {
        throw new functions.https.HttpsError("invalid-argument", "Organization ID and domain are required");
    }

    // Verify user has access to this org
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (userData?.org_id !== orgId) {
        throw new functions.https.HttpsError("permission-denied", "Access denied");
    }

    const cleanDomain = domain.toLowerCase().replace(/[^a-z0-9.-]/g, "").trim();

    try {
        // 1. Register domain via NameSilo
        const regResult = await nameSiloRequest("registerDomain", {
            domain: cleanDomain,
            years: "1",
            private: "1", // WHOIS privacy
            auto_renew: "1"
        });

        if (regResult.reply.code !== 300 && regResult.reply.code !== 301) {
            throw new Error(`Domain registration failed: ${regResult.reply.detail}`);
        }

        // 2. Configure DNS records for Firebase Hosting
        const dnsRecords = [
            { type: "CNAME", host: "app", value: "dispatch-box.web.app" },
            { type: "TXT", host: "", value: "firebase=dispatch-box" }
        ];

        for (const record of dnsRecords) {
            await nameSiloRequest("dnsAddRecord", {
                domain: cleanDomain,
                rrtype: record.type,
                rrhost: record.host,
                rrvalue: record.value,
                rrttl: "3600"
            });
        }

        // 3. Store domain info in Firestore
        await db.collection("organizations").doc(orgId).update({
            "customDomain.domain": cleanDomain,
            "customDomain.status": "dns_configuring",
            "customDomain.registeredAt": admin.firestore.FieldValue.serverTimestamp(),
            "customDomain.registrar": "namesilo",
            "customDomain.autoRenew": true,
            "customDomain.dnsRecords": dnsRecords,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            success: true,
            domain: cleanDomain,
            status: "dns_configuring",
            message: `Domain ${cleanDomain} registered! DNS records are being configured.`,
            dnsRecords
        };
    } catch (err: any) {
        console.error("Domain registration error:", err);
        throw new functions.https.HttpsError("internal", err.message || "Failed to register domain");
    }
});

// ============================================================
// DOMAIN STATUS & MANAGEMENT
// ============================================================

/**
 * Get domain status and DNS verification
 */
export const getDomainStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Organization ID is required");
    }

    const orgDoc = await db.collection("organizations").doc(orgId).get();
    const orgData = orgDoc.data();

    if (!orgData?.customDomain?.domain) {
        return { hasDomain: false };
    }

    const domain = orgData.customDomain.domain;

    // Check DNS propagation via NameSilo
    try {
        const dnsResult = await nameSiloRequest("dnsListRecords", {
            domain
        });

        return {
            hasDomain: true,
            domain,
            status: orgData.customDomain.status,
            registeredAt: orgData.customDomain.registeredAt,
            autoRenew: orgData.customDomain.autoRenew,
            dnsConfigured: dnsResult.reply.code === 300
        };
    } catch (err: any) {
        return {
            hasDomain: true,
            domain,
            status: orgData.customDomain.status,
            error: "Unable to verify DNS status"
        };
    }
});

/**
 * Setup DNS for a customer-owned domain (they already own it)
 */
export const setupExistingDomain = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, domain } = data;
    if (!orgId || !domain) {
        throw new functions.https.HttpsError("invalid-argument", "Organization ID and domain are required");
    }

    const cleanDomain = domain.toLowerCase().replace(/[^a-z0-9.-]/g, "").trim();

    // Generate DNS records the customer needs to add at their registrar
    const dnsRecords = [
        {
            type: "CNAME",
            host: "app",
            value: "dispatch-box.web.app",
            purpose: "Points your app subdomain to DispatchBox"
        },
        {
            type: "TXT",
            host: "@",
            value: `dispatchbox-verify=${orgId}`,
            purpose: "Verifies domain ownership"
        },
        {
            type: "CNAME",
            host: "em._domainkey",
            value: "u12345.wl.sendgrid.net",
            purpose: "Email authentication (DKIM)"
        },
        {
            type: "CNAME",
            host: "url1234",
            value: "sendgrid.net",
            purpose: "Email link tracking"
        }
    ];

    // Store in Firestore
    await db.collection("organizations").doc(orgId).update({
        "customDomain.domain": cleanDomain,
        "customDomain.status": "pending_verification",
        "customDomain.ownedByCustomer": true,
        "customDomain.requiredDnsRecords": dnsRecords,
        "customDomain.createdAt": admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
        success: true,
        domain: cleanDomain,
        status: "pending_verification",
        message: "Please add the following DNS records at your domain registrar:",
        dnsRecords
    };
});
