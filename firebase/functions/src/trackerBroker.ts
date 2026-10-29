/**
 * trackerBroker.ts - Per-gateway MQTT logins on the EMQX broker
 *
 * Each gateway (Minew MG5) gets its own broker login, keyed by its MAC address:
 *   username = gw-<12 hex mac, lowercase>
 *   tracker_gateway_credentials/{MAC12 uppercase} → { username, password, org_id, deviceId, source, ... }
 *   (server-only collection — no client access via rules)
 *
 * Two ways a login is created:
 *   1. "prepared"  — a site admin prepares a unit before shipping (org_id = null). When the customer
 *                    registers that MAC, the login is claimed by their org. The customer only plugs it in.
 *   2. "self"      — the customer registers a gateway we never prepared; a login is created on demand
 *                    and shown to them so they can enter it in Minew's config tool.
 *
 * Endpoints:
 *   gatewayConnection     (callable) — customer: get/claim/create the login for one of their gateways
 *   trackerPlatformAdmin  (callable) — site admin: overview, prepare units, broker settings, platform key
 *   onTrackerDeviceDeleted (trigger) — releases a prepared login, or deletes a self-created one
 *
 * Config (functions/.env.<projectId>):
 *   EMQX_API_BASE   e.g. https://xxxx.ala.us-east-1.emqxsl.com:8443/api/v5
 *   EMQX_API_KEY / EMQX_API_SECRET  — EMQX Cloud API key (Deployment → API Key)
 *   TRACKER_MQTT_HOST / TRACKER_MQTT_PORT — public broker address shown to customers
 *   (host/port can be overridden by site admins in platform_settings/tracker_broker)
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const CREDS = "tracker_gateway_credentials";
const BROKER_SETTINGS_DOC = "platform_settings/tracker_broker";
const USERS_PATH = "authentication/password_based:built_in_database/users";

type CredSource = "prepared" | "self";

interface GatewayCred {
    mac: string;
    username: string;
    password: string;
    org_id: string | null;
    deviceId: string | null;
    source: CredSource;
    createdAt?: FirebaseFirestore.Timestamp;
    createdBy?: string;
    claimedAt?: FirebaseFirestore.Timestamp | null;
    lastMessageAt?: FirebaseFirestore.Timestamp | null;
    label?: string | null;
}

export const normalizeMac = (raw: unknown): string => String(raw ?? "").toUpperCase().replace(/[^0-9A-F]/g, "");
export const isMac = (key: string): boolean => /^[0-9A-F]{12}$/.test(key);
export const usernameForMac = (mac: string): string => `gw-${mac.toLowerCase()}`;
/** Reverse of usernameForMac — returns the 12-hex MAC or "" */
export const macFromUsername = (username: unknown): string => {
    const m = /^gw-([0-9a-f]{12})$/i.exec(String(username ?? ""));
    return m ? m[1].toUpperCase() : "";
};
const formatMac = (mac: string) => (isMac(mac) ? mac.match(/.{2}/g)!.join(":") : mac);

function randomPassword(len = 20): string {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const bytes = crypto.randomBytes(len);
    return Array.from(bytes, b => chars[b % chars.length]).join("");
}

// ── EMQX management API ──

function emqxConfigured(): boolean {
    return !!(process.env.EMQX_API_BASE && process.env.EMQX_API_KEY && process.env.EMQX_API_SECRET);
}

async function emqx(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
    if (!emqxConfigured()) {
        throw new functions.https.HttpsError("failed-precondition", "The tracker broker isn't configured yet. Please contact DispatchBox support.");
    }
    const base = process.env.EMQX_API_BASE!.replace(/\/+$/, "");
    const auth = Buffer.from(`${process.env.EMQX_API_KEY}:${process.env.EMQX_API_SECRET}`).toString("base64");
    const res = await fetch(`${base}/${path}`, {
        method,
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
}

/** Creates the broker login, or resets its password if it already exists */
async function upsertBrokerUser(username: string, password: string): Promise<void> {
    const created = await emqx("POST", USERS_PATH, { user_id: username, password });
    if (created.status >= 200 && created.status < 300) return;
    if (created.status === 409 || /exist/i.test(JSON.stringify(created.data || ""))) {
        const updated = await emqx("PUT", `${USERS_PATH}/${encodeURIComponent(username)}`, { password });
        if (updated.status >= 200 && updated.status < 300) return;
        throw new functions.https.HttpsError("internal", `Broker refused password reset (${updated.status})`);
    }
    throw new functions.https.HttpsError("internal", `Broker refused new login (${created.status})`);
}

async function deleteBrokerUser(username: string): Promise<void> {
    const res = await emqx("DELETE", `${USERS_PATH}/${encodeURIComponent(username)}`);
    if (res.status >= 300 && res.status !== 404) {
        console.warn(`[trackerBroker] delete ${username} → ${res.status}`, res.data);
    }
}

async function brokerSettings(): Promise<{ host: string; port: number }> {
    const snap = await db.doc(BROKER_SETTINGS_DOC).get();
    const host = String(snap.get("host") || process.env.TRACKER_MQTT_HOST || "");
    const port = Number(snap.get("port") || process.env.TRACKER_MQTT_PORT || 8883);
    return { host, port };
}

function connectionPayload(cred: GatewayCred, broker: { host: string; port: number }) {
    return {
        host: broker.host,
        port: broker.port,
        tls: true,
        username: cred.username,
        password: cred.password,
        clientId: formatMac(cred.mac),
        source: cred.source,
    };
}

// ── Auth helpers ──

async function callerContext(context: functions.https.CallableContext) {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    const uid = context.auth.uid;
    const token = context.auth.token as Record<string, any>;
    const userSnap = await db.collection("users").doc(uid).get();
    const role = String(token.role || userSnap.get("role") || "");
    const orgId = String(token.org_id || userSnap.get("org_id") || "");
    const siteAdmin = token.site_admin === true || userSnap.get("site_admin") === true;
    return { uid, role, orgId, siteAdmin };
}

// ── Customer callable ──

/**
 * gatewayConnection({ deviceId, action?: 'get' | 'reset' })
 * Returns the broker settings for one gateway, claiming a prepared login or creating one on demand.
 */
export const gatewayConnection = functions.https.onCall(async (data, context) => {
    const caller = await callerContext(context);
    const deviceId = String(data?.deviceId || "");
    const action = data?.action === "reset" ? "reset" : "get";
    if (!deviceId) throw new functions.https.HttpsError("invalid-argument", "deviceId is required.");

    const deviceRef = db.collection("tracker_devices").doc(deviceId);
    const device = await deviceRef.get();
    if (!device.exists) throw new functions.https.HttpsError("not-found", "Gateway not found.");
    const orgId = device.get("org_id") as string;
    if (orgId !== caller.orgId && !caller.siteAdmin) throw new functions.https.HttpsError("permission-denied", "This gateway belongs to another account.");
    if (!["owner", "admin", "dispatcher"].includes(caller.role) && !caller.siteAdmin) {
        throw new functions.https.HttpsError("permission-denied", "Only owners, admins, or dispatchers can connect gateways.");
    }
    if (device.get("role") !== "gateway") throw new functions.https.HttpsError("failed-precondition", "Only gateways connect to the broker.");
    if (device.get("isDemo")) throw new functions.https.HttpsError("failed-precondition", "Demo gateways don't need a connection.");

    const mac = normalizeMac(device.get("identifierKey") || device.get("identifier"));
    if (!isMac(mac)) {
        throw new functions.https.HttpsError("failed-precondition", "This gateway's MAC address doesn't look right. Edit the gateway and enter the 12-character MAC from its label (e.g. AC:23:3F:12:34:56).");
    }

    const credRef = db.collection(CREDS).doc(mac);
    const broker = await brokerSettings();

    const result = await db.runTransaction(async tx => {
        const snap = await tx.get(credRef);
        const existing = snap.exists ? (snap.data() as GatewayCred) : null;

        if (existing && existing.org_id && existing.org_id !== orgId) {
            throw new functions.https.HttpsError("already-exists", "This MAC address is already connected to another DispatchBox account. Double-check the label, or contact support.");
        }
        if (existing && existing.deviceId && existing.deviceId !== deviceId && existing.org_id === orgId) {
            const other = await tx.get(db.collection("tracker_devices").doc(existing.deviceId));
            if (other.exists) throw new functions.https.HttpsError("already-exists", `This MAC address is already used by "${other.get("label")}".`);
        }

        if (existing && action === "get") {
            const claimed: GatewayCred = { ...existing, org_id: orgId, deviceId };
            if (!existing.org_id || existing.deviceId !== deviceId) {
                tx.update(credRef, { org_id: orgId, deviceId, claimedAt: admin.firestore.FieldValue.serverTimestamp() });
            }
            return { cred: claimed, needsBrokerWrite: false };
        }

        // New self-setup login, or a password reset
        const cred: GatewayCred = {
            mac,
            username: usernameForMac(mac),
            password: randomPassword(),
            org_id: orgId,
            deviceId,
            source: existing?.source === "prepared" && action === "reset" ? "self" : (existing?.source || "self"),
        };
        return { cred, needsBrokerWrite: true };
    });

    if (result.needsBrokerWrite) {
        await upsertBrokerUser(result.cred.username, result.cred.password);
        await credRef.set({
            ...result.cred,
            createdBy: caller.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            claimedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }

    await deviceRef.set({
        connection: {
            mqttUsername: result.cred.username,
            setupBy: result.cred.source === "prepared" ? "dispatchbox" : "self",
            provisionedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
    }, { merge: true });

    // The gateway's MAC may have been edited — free any login still tied to its old MAC
    const stale = await db.collection(CREDS).where("deviceId", "==", deviceId).get();
    for (const s of stale.docs) {
        if (s.id === mac) continue;
        if (s.get("source") === "prepared") {
            await s.ref.update({ org_id: null, deviceId: null, claimedAt: null });
        } else {
            try { await deleteBrokerUser(s.get("username")); } catch (err) { console.warn("[trackerBroker] stale cleanup failed", err); }
            await s.ref.delete();
        }
    }

    return connectionPayload(result.cred, broker);
});

// ── Cleanup trigger ──

export const onTrackerDeviceDeleted = functions.firestore.document("tracker_devices/{deviceId}").onDelete(async (snap, ctx) => {
    if (snap.get("role") !== "gateway") return;
    const mac = normalizeMac(snap.get("identifierKey"));
    if (!isMac(mac)) return;
    const credRef = db.collection(CREDS).doc(mac);
    const cred = await credRef.get();
    if (!cred.exists || cred.get("deviceId") !== ctx.params.deviceId) return;

    if (cred.get("source") === "prepared") {
        // The unit still has these settings loaded — keep the login so it can be re-registered
        await credRef.update({ org_id: null, deviceId: null, claimedAt: null });
        return;
    }
    try {
        if (emqxConfigured()) await deleteBrokerUser(cred.get("username"));
    } catch (err) {
        console.warn("[trackerBroker] broker cleanup failed", err);
    }
    await credRef.delete();
});

// ── Site admin callable ──

const hashKey = (key: string): string => crypto.createHash("sha256").update(key).digest("hex");

/**
 * trackerPlatformAdmin({ action, ... }) — site admins only
 *   overview                      → broker config status + every gateway login
 *   prepare  { macs: string[], label? } → create logins for units being shipped
 *   reveal   { mac }              → settings for one login (to load into a unit)
 *   saveBroker { host, port }     → public broker address shown to customers
 *   rotatePlatformKey             → new key for the EMQX → DispatchBox forwarding rule
 *   remove   { mac }              → delete an unclaimed prepared login
 */
export const trackerPlatformAdmin = functions.https.onCall(async (data, context) => {
    const caller = await callerContext(context);
    if (!caller.siteAdmin) throw new functions.https.HttpsError("permission-denied", "Site admins only.");
    const action = String(data?.action || "overview");

    if (action === "overview") {
        const [broker, credsSnap, keySnap] = await Promise.all([
            brokerSettings(),
            db.collection(CREDS).orderBy("createdAt", "desc").limit(500).get(),
            db.collection("tracker_ingest_keys").where("platform", "==", true).get(),
        ]);
        const orgIds = Array.from(new Set(credsSnap.docs.map(d => d.get("org_id")).filter(Boolean))) as string[];
        const orgNames = new Map<string, string>();
        await Promise.all(orgIds.map(async id => {
            const o = await db.collection("organizations").doc(id).get();
            orgNames.set(id, String(o.get("name") || o.get("companyName") || id));
        }));
        const deviceIds = credsSnap.docs.map(d => d.get("deviceId")).filter(Boolean) as string[];
        const deviceInfo = new Map<string, { label: string; lastSeenAt: string | null }>();
        for (let i = 0; i < deviceIds.length; i += 100) {
            const refs = deviceIds.slice(i, i + 100).map(id => db.collection("tracker_devices").doc(id));
            const docs = refs.length ? await db.getAll(...refs) : [];
            docs.forEach(d => {
                if (d.exists) deviceInfo.set(d.id, { label: String(d.get("label") || ""), lastSeenAt: d.get("lastSeenAt")?.toDate?.()?.toISOString() || null });
            });
        }
        const platformKey = keySnap.docs[0];
        return {
            apiConfigured: emqxConfigured(),
            broker,
            platformKey: platformKey ? {
                last4: platformKey.get("last4") || null,
                orgId: platformKey.get("org_id") || null,
                lastUsedAt: platformKey.get("lastUsedAt")?.toDate?.()?.toISOString() || null,
            } : null,
            gateways: credsSnap.docs.map(d => {
                const c = d.data() as GatewayCred;
                const dev = c.deviceId ? deviceInfo.get(c.deviceId) : undefined;
                return {
                    mac: formatMac(c.mac),
                    username: c.username,
                    source: c.source,
                    label: c.label || null,
                    orgId: c.org_id,
                    orgName: c.org_id ? orgNames.get(c.org_id) || c.org_id : null,
                    deviceLabel: dev?.label || null,
                    lastSeenAt: dev?.lastSeenAt || null,
                    lastMessageAt: c.lastMessageAt?.toDate?.()?.toISOString() || null,
                    createdAt: c.createdAt?.toDate?.()?.toISOString() || null,
                };
            }),
        };
    }

    if (action === "prepare") {
        const macs: string[] = (Array.isArray(data?.macs) ? data.macs : []).map(normalizeMac);
        const bad = macs.filter(m => !isMac(m));
        if (!macs.length) throw new functions.https.HttpsError("invalid-argument", "Enter at least one MAC address.");
        if (bad.length) throw new functions.https.HttpsError("invalid-argument", `Not a valid MAC: ${bad.join(", ")}`);
        const broker = await brokerSettings();
        const out = [];
        for (const mac of Array.from(new Set(macs))) {
            const ref = db.collection(CREDS).doc(mac);
            const snap = await ref.get();
            if (snap.exists) {
                out.push({ ...connectionPayload(snap.data() as GatewayCred, broker), alreadyExisted: true });
                continue;
            }
            const cred: GatewayCred = {
                mac, username: usernameForMac(mac), password: randomPassword(),
                org_id: null, deviceId: null, source: "prepared", label: data?.label ? String(data.label) : null,
            };
            await upsertBrokerUser(cred.username, cred.password);
            await ref.set({ ...cred, createdBy: caller.uid, createdAt: admin.firestore.FieldValue.serverTimestamp(), claimedAt: null, lastMessageAt: null });
            out.push({ ...connectionPayload(cred, broker), alreadyExisted: false });
        }
        return { prepared: out };
    }

    if (action === "reveal") {
        const mac = normalizeMac(data?.mac);
        const snap = await db.collection(CREDS).doc(mac).get();
        if (!snap.exists) throw new functions.https.HttpsError("not-found", "No login for that MAC.");
        return connectionPayload(snap.data() as GatewayCred, await brokerSettings());
    }

    if (action === "remove") {
        const mac = normalizeMac(data?.mac);
        const ref = db.collection(CREDS).doc(mac);
        const snap = await ref.get();
        if (!snap.exists) return { ok: true };
        if (snap.get("org_id")) throw new functions.https.HttpsError("failed-precondition", "This gateway is claimed by an organization. Delete it from their registry first.");
        await deleteBrokerUser(snap.get("username"));
        await ref.delete();
        return { ok: true };
    }

    if (action === "saveBroker") {
        const host = String(data?.host || "").trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
        const port = Number(data?.port || 8883);
        if (!host) throw new functions.https.HttpsError("invalid-argument", "Host is required.");
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new functions.https.HttpsError("invalid-argument", "Port must be 1-65535.");
        await db.doc(BROKER_SETTINGS_DOC).set({ host, port, updatedBy: caller.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return { host, port };
    }

    if (action === "rotatePlatformKey") {
        // Platform keys are bound to the site admin's org only as a fallback for legacy/unprovisioned logins
        const existing = await db.collection("tracker_ingest_keys").where("platform", "==", true).get();
        const batch = db.batch();
        existing.docs.forEach(d => batch.delete(d.ref));
        const key = `dbx_plt_${crypto.randomBytes(24).toString("hex")}`;
        batch.set(db.collection("tracker_ingest_keys").doc(hashKey(key)), {
            org_id: caller.orgId || null,
            platform: true,
            last4: key.slice(-4),
            createdBy: caller.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();
        return { key, last4: key.slice(-4) };
    }

    throw new functions.https.HttpsError("invalid-argument", `Unknown action: ${action}`);
});
