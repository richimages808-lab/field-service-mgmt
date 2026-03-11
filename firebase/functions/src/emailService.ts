import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

const db = admin.firestore();

// ============================================================
// IMPROVMX API CONFIGURATION
// ============================================================

const IMPROVMX_API_KEY = process.env.IMPROVMX_API_KEY || "";
const IMPROVMX_BASE_URL = "https://api.improvmx.com/v3";

/**
 * Make an authenticated request to the ImprovMX API
 */
async function improvmxRequest(
    method: string,
    path: string,
    body?: Record<string, any>
): Promise<any> {
    const credentials = Buffer.from(`api:${IMPROVMX_API_KEY}`).toString("base64");

    const options: any = {
        method,
        headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type": "application/json"
        }
    };

    if (body && (method === "POST" || method === "PUT")) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${IMPROVMX_BASE_URL}${path}`, options);
    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error || data.errors?.join(", ") || "ImprovMX API error");
    }

    return data;
}

// ============================================================
// EMAIL FORWARDING SETUP
// ============================================================

/**
 * Set up email forwarding for a customer's custom domain.
 * Creates the domain in ImprovMX and adds initial aliases.
 */
export const setupEmailForwarding = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, domain, aliases, forwardTo, tier } = data;
    if (!orgId || !domain || !forwardTo) {
        throw new functions.https.HttpsError("invalid-argument", "orgId, domain, and forwardTo are required");
    }

    // Verify user belongs to org
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (userData?.org_id !== orgId) {
        throw new functions.https.HttpsError("permission-denied", "Access denied");
    }

    try {
        // 1. Add domain to ImprovMX
        console.log(`Setting up email forwarding for ${domain}`);
        await improvmxRequest("POST", "/domains", { domain });

        // 2. Create default aliases
        const aliasNames = aliases && aliases.length > 0
            ? aliases
            : ["info", "support"];

        const createdAliases: any[] = [];
        for (const alias of aliasNames) {
            try {
                const result = await improvmxRequest(
                    "POST",
                    `/domains/${domain}/aliases`,
                    { alias: alias.toLowerCase().trim(), forward: forwardTo }
                );
                createdAliases.push(result.alias);
            } catch (err: any) {
                console.warn(`Failed to create alias ${alias}@${domain}:`, err.message);
            }
        }

        // 3. Store email config in Firestore
        await db.collection("organizations").doc(orgId).update({
            "emailForwarding.provider": "improvmx",
            "emailForwarding.domain": domain,
            "emailForwarding.forwardTo": forwardTo,
            "emailForwarding.aliases": createdAliases.map((a: any) => ({
                alias: a.alias,
                forward: a.forward,
                id: a.id
            })),
            "emailForwarding.tier": tier || "email_starter",
            "emailForwarding.status": "active",
            "emailForwarding.setupAt": admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            success: true,
            domain,
            aliases: createdAliases,
            message: `Email forwarding set up for ${domain}. ${createdAliases.length} aliases created.`,
            mxRecords: [
                { type: "MX", host: "@", value: "mx1.improvmx.com", priority: 10 },
                { type: "MX", host: "@", value: "mx2.improvmx.com", priority: 20 }
            ]
        };
    } catch (err: any) {
        console.error("Email forwarding setup error:", err);
        throw new functions.https.HttpsError("internal", err.message || "Failed to set up email forwarding");
    }
});

// ============================================================
// ALIAS MANAGEMENT
// ============================================================

/**
 * Add an email alias for a domain
 */
export const addEmailAlias = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, domain, alias, forwardTo } = data;
    if (!orgId || !domain || !alias || !forwardTo) {
        throw new functions.https.HttpsError("invalid-argument", "orgId, domain, alias, and forwardTo are required");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.org_id !== orgId) {
        throw new functions.https.HttpsError("permission-denied", "Access denied");
    }

    try {
        const result = await improvmxRequest(
            "POST",
            `/domains/${domain}/aliases`,
            { alias: alias.toLowerCase().trim(), forward: forwardTo }
        );

        // Update Firestore
        await db.collection("organizations").doc(orgId).update({
            "emailForwarding.aliases": admin.firestore.FieldValue.arrayUnion({
                alias: result.alias.alias,
                forward: result.alias.forward,
                id: result.alias.id
            })
        });

        return { success: true, alias: result.alias };
    } catch (err: any) {
        console.error("Add alias error:", err);
        throw new functions.https.HttpsError("internal", err.message || "Failed to add email alias");
    }
});

/**
 * Remove an email alias
 */
export const removeEmailAlias = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, domain, alias } = data;
    if (!orgId || !domain || !alias) {
        throw new functions.https.HttpsError("invalid-argument", "orgId, domain, and alias are required");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.org_id !== orgId) {
        throw new functions.https.HttpsError("permission-denied", "Access denied");
    }

    try {
        await improvmxRequest("DELETE", `/domains/${domain}/aliases/${alias}`);

        // Remove from Firestore — re-fetch and filter
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        const emailConfig = orgDoc.data()?.emailForwarding;
        if (emailConfig?.aliases) {
            const updatedAliases = emailConfig.aliases.filter(
                (a: any) => a.alias !== alias
            );
            await db.collection("organizations").doc(orgId).update({
                "emailForwarding.aliases": updatedAliases
            });
        }

        return { success: true };
    } catch (err: any) {
        console.error("Remove alias error:", err);
        throw new functions.https.HttpsError("internal", err.message || "Failed to remove alias");
    }
});

/**
 * List email aliases for a domain
 */
export const listEmailAliases = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId, domain } = data;
    if (!orgId || !domain) {
        throw new functions.https.HttpsError("invalid-argument", "orgId and domain are required");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.org_id !== orgId) {
        throw new functions.https.HttpsError("permission-denied", "Access denied");
    }

    try {
        const result = await improvmxRequest("GET", `/domains/${domain}/aliases`);
        return { success: true, aliases: result.aliases || [] };
    } catch (err: any) {
        console.error("List aliases error:", err);
        throw new functions.https.HttpsError("internal", err.message || "Failed to list aliases");
    }
});

/**
 * Check MX record status for a domain
 */
export const checkDomainEmailStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { domain } = data;
    if (!domain) {
        throw new functions.https.HttpsError("invalid-argument", "domain is required");
    }

    try {
        const result = await improvmxRequest("GET", `/domains/${domain}/check`);
        return {
            success: true,
            valid: result.valid,
            records: result.records || []
        };
    } catch (err: any) {
        console.error("Domain MX check error:", err);
        throw new functions.https.HttpsError("internal", err.message || "Failed to check domain");
    }
});
