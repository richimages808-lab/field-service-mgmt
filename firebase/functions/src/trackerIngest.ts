/**
 * trackerIngest.ts - Real-time tracker telemetry ingestion (Minew MG5 & generic gateways)
 *
 * Endpoints:
 *   ingestTrackerTelemetry (HTTPS POST)  — called by an MQTT broker webhook / bridge
 *   rotateTrackerIngestKey (callable)    — owner/admin/dispatcher generates a per-org API key
 *
 * Auth: header `x-dispatchbox-key: <key>` (or ?key=). Keys are stored hashed in
 * tracker_ingest_keys/{sha256} → { org_id } (no client access via rules).
 *
 * Accepted payloads (object or array of objects):
 *   1. Normalized:
 *      { gateway: { id|imei|mac, lat, lng, speedKph?, heading?, battery?, ignition?, ts? },
 *        tags: [{ mac, rssi?, battery?, ts? }] }
 *   2. Minew gateway style array:
 *      [{ type: "Gateway", mac|imei, lat|latitude, lng|lon|longitude, timestamp },
 *       { type: "iBeacon"|"Unknown"|..., mac, rssi, battery, timestamp }, ...]
 *   3. MG5-style object (provisional until Minew's "Parsed JSON Format" doc is confirmed):
 *      { gateway_mac|gatewayMac|mac|imei, timestamp, gps: { lat|latitude, lon|lng|longitude, speed? },
 *        device_data|devices|tags: [{ mac, rssi, battery }] }
 *   Any of the above may arrive wrapped in an EMQX rule-engine envelope
 *   ({ topic, clientid, username, payload }) where payload is a JSON string or object. If the payload
 *   has no gateway identifier, a 12-hex MAC in the topic (e.g. /mgx/AC233FC0FFEE/status) is used.
 *
 * Platform keys (tracker_ingest_keys.platform == true, used by the shared EMQX forwarding rule):
 *   the broker-authenticated MQTT username (gw-<mac>, see trackerBroker.ts) decides the org and
 *   gateway — the payload is never trusted for tenancy. Unknown usernames fall back to the key's org.
 *
 * History policy (keep in sync with frontend/web/src/lib/trackerDevices.ts):
 *   gateway: every 5 min moving / 30 min parked; tag: 15 min moving / 60 min parked;
 *   points carry expireAt = recordedAt + 90 days (Firestore TTL policy deletes them).
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { macFromUsername } from "./trackerBroker";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

const POLICY = {
    retentionDays: 90,
    gatewayMovingIntervalMin: 5,
    gatewayStationaryIntervalMin: 30,
    tagMovingIntervalMin: 15,
    tagStationaryIntervalMin: 60,
    movementThresholdM: 100,
    movingSpeedKph: 5,
    maxUnregisteredTags: 25,
};

type Role = "gateway" | "tag" | "standalone";

interface GatewayReading {
    key: string;
    lat?: number;
    lng?: number;
    speedKph?: number;
    heading?: number;
    battery?: number;
    ignition?: boolean;
    at: Date;
}

interface TagReading {
    key: string;
    mac: string;
    rssi?: number;
    battery?: number;
    at: Date;
}

const normalizeKey = (raw: unknown): string => String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const formatMac = (key: string): string => (/^[0-9A-F]{12}$/.test(key) ? key.match(/.{2}/g)!.join(":") : key);
const hashKey = (key: string): string => crypto.createHash("sha256").update(key).digest("hex");

function num(...vals: unknown[]): number | undefined {
    for (const v of vals) {
        const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

function parseTs(v: unknown): Date {
    if (v == null || v === "") return new Date();
    if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? new Date() : d;
}

/** Minew tags report battery as % (0-100) or mV (2000-3300). Normalize to % */
function normalizeBattery(v: unknown): number | undefined {
    const n = num(v);
    if (n == null) return undefined;
    if (n <= 100) return Math.max(0, Math.round(n));
    return Math.max(0, Math.min(100, Math.round(((n - 2200) / (3000 - 2200)) * 100)));
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

function shouldRecord(role: Role, lastAt: Date | null, lastLoc: { lat: number; lng: number } | null,
    cur: { lat: number; lng: number; at: Date; speedKph?: number }): boolean {
    if (!lastAt || !lastLoc) return true;
    const mins = (cur.at.getTime() - lastAt.getTime()) / 60000;
    if (mins <= 0) return false;
    const moved = haversineM(lastLoc, cur);
    const moving = (cur.speedKph ?? 0) >= POLICY.movingSpeedKph || moved >= POLICY.movementThresholdM;
    const interval = role === "tag"
        ? (moving ? POLICY.tagMovingIntervalMin : POLICY.tagStationaryIntervalMin)
        : (moving ? POLICY.gatewayMovingIntervalMin : POLICY.gatewayStationaryIntervalMin);
    return mins >= interval - 0.01;
}

/** True when the body is an EMQX rule-engine envelope ({ topic, clientid, username, payload }) */
function isEnvelope(body: any): boolean {
    return !!body && typeof body === "object" && !Array.isArray(body) && "payload" in body && ("topic" in body || "clientid" in body || "username" in body);
}

/** Extracts the first 12-hex MAC address found inside any string (e.g. topic "/mgx/AC233FC2A833/status" or status "GW-AC233FC2A833") */
function extractMacFromString(raw: unknown): string {
    const str = String(raw ?? "");
    const parts = str.split(/[^A-Fa-f0-9]+/).map(s => s.toUpperCase()).filter(s => /^[0-9A-F]{12}$/.test(s));
    if (parts.length > 0) return parts[0];
    const colonMatch = str.match(/(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/);
    return colonMatch ? normalizeKey(colonMatch[0]) : "";
}

/** Unwraps an EMQX rule-engine envelope if present */
function unwrapEnvelope(body: any): { body: any; topicKey: string } {
    if (!isEnvelope(body)) {
        return { body, topicKey: "" };
    }
    let inner = body.payload;
    if (typeof inner === "string") {
        try { inner = JSON.parse(inner); } catch { /* keep string if not JSON */ }
    }
    const topicMac = extractMacFromString(body.topic) || macFromUsername(body.username) || extractMacFromString(body.clientid);
    return { body: inner, topicKey: topicMac || normalizeKey(body.clientid) };
}

function tagFrom(i: any, fallbackTs?: unknown): TagReading {
    const key = normalizeKey(i.mac || i.tag_mac || i.tagMac || i.beaconId || i.id);
    return {
        key,
        mac: formatMac(key),
        rssi: num(i.rssi),
        battery: normalizeBattery(i.battery ?? i.battery_level ?? i.batteryLevel ?? i.batt ?? i.voltage),
        at: parseTs(i.timestamp || i.ts || i.time || fallbackTs),
    };
}

const TAG_TYPES = new Set(["ibeacon", "eddystone", "uid", "url", "tlm", "sensor", "acc", "accelerometer", "s1", "s3", "s4", "s1/s3/s4", "unknown", "tag", "beacon", "e8", "minibeacon"]);

function isGatewayItem(i: any): boolean {
    if (!i || typeof i !== "object") return false;
    const t = String(i.type || i.device_type || "").toLowerCase();
    if (t === "gateway" || t === "mg5" || t === "gw") return true;
    if (TAG_TYPES.has(t)) return false;
    return !!(i.gps || i.gatewayFree !== undefined || i.gatewayLoad !== undefined || i.gateway_mac || i.gatewayMac);
}

/** Converts any supported payload shape into gateway + tag readings */
function parsePayload(rawBody: any, headerTopicKey = ""): Array<{ gateway: GatewayReading; tags: TagReading[] }> {
    const out: Array<{ gateway: GatewayReading; tags: TagReading[] }> = [];
    const { body, topicKey: envTopicKey } = unwrapEnvelope(rawBody);
    const topicKey = envTopicKey || headerTopicKey;
    if (body == null) return out;

    // Handle string payload (e.g. raw hex or status text wrapped in envelope or text body)
    if (typeof body === "string") {
        const mac = topicKey || extractMacFromString(body);
        if (mac) {
            const upper = body.toUpperCase().replace(/[^0-9A-F]/g, "");
            const tags: TagReading[] = [];
            const seenTagKeys = new Set<string>();
            // Scan raw hex for Minew OUI MACs (AC233Fxxxxxx or C30000xxxxxx, big-endian or BLE little-endian)
            const bigMatches = upper.match(/(?:AC233F|C30000)[0-9A-F]{6}/g) || [];
            for (const m of bigMatches) {
                if (m !== mac && !seenTagKeys.has(m)) {
                    seenTagKeys.add(m);
                    tags.push({ key: m, mac: formatMac(m), at: new Date() });
                }
            }
            const revMatches = upper.match(/[0-9A-F]{6}(?:3F23AC|0000C3)/g) || [];
            for (const rm of revMatches) {
                const bytes = rm.match(/.{2}/g);
                if (!bytes) continue;
                const m = bytes.reverse().join("");
                if (m !== mac && !seenTagKeys.has(m)) {
                    seenTagKeys.add(m);
                    tags.push({ key: m, mac: formatMac(m), at: new Date() });
                }
            }
            out.push({ gateway: { key: mac, at: new Date() }, tags });
        }
        return out;
    }

    const items: any[] = Array.isArray(body) ? body : [body];

    // Shape 3: MG5-style single object with a tag list, gps block, gateway_status, or status/mac
    if (!Array.isArray(body) && typeof body === "object" && !body.gateway) {
        const t = String(body.type || body.data_type || "").toLowerCase();
        // Single tag object posted directly
        if ((TAG_TYPES.has(t) || (body.rssi !== undefined && !body.gps && !body.gateway_status)) && (body.mac || body.tag_mac || body.tagMac)) {
            out.push({
                gateway: { key: topicKey, at: parseTs(body.timestamp || body.ts || body.time) },
                tags: [tagFrom(body)],
            });
            return out;
        }

        const gps = body.gps || body.location || {};
        const gwStatus = body.gateway_status || body.status_info || {};
        const rawList = body.device_data ?? body.devices ?? body.tags ?? [];
        const list: any[] = Array.isArray(rawList) ? rawList : (rawList && typeof rawList === "object" ? [rawList] : []);
        const gwKey = normalizeKey(body.gateway_mac || body.gatewayMac || body.imei || body.mac || body.id || body.clientid || body.clientId)
            || extractMacFromString(body.status || body.message || body.topic)
            || topicKey;

        out.push({
            gateway: {
                key: gwKey,
                lat: num(gps.lat, gps.latitude, body.lat, body.latitude),
                lng: num(gps.lon, gps.lng, gps.longitude, body.lon, body.lng, body.longitude),
                speedKph: num(gps.speed, body.speed, body.speedKph),
                heading: num(gps.heading, gps.course, body.heading),
                battery: normalizeBattery(body.battery ?? gwStatus.battery ?? gwStatus.voltage),
                ignition: typeof body.ignition === "boolean" ? body.ignition : (typeof gwStatus.ignition === "boolean" ? gwStatus.ignition : (gwStatus.acc === 1 ? true : gwStatus.acc === 0 ? false : undefined)),
                at: parseTs(body.timestamp || body.ts || body.time),
            },
            tags: list.filter(i => i && (i.mac || i.tag_mac || i.tagMac)).map(i => tagFrom(i, body.timestamp || body.ts)),
        });
        return out;
    }

    // Shape 2: flat Minew array containing a Gateway record + tag records
    const gwItem = items.find(i => isGatewayItem(i));
    if (gwItem) {
        const gps = gwItem.gps || gwItem.location || {};
        const gwStatus = gwItem.gateway_status || {};
        const gateway: GatewayReading = {
            key: normalizeKey(gwItem.imei || gwItem.mac || gwItem.id || gwItem.gatewayMac || gwItem.gateway_mac) || topicKey,
            lat: num(gwItem.lat, gwItem.latitude, gps.lat, gps.latitude),
            lng: num(gwItem.lng, gwItem.lon, gwItem.longitude, gps.lng, gps.lon, gps.longitude),
            speedKph: num(gwItem.speed, gwItem.speedKph, gps.speed),
            heading: num(gwItem.heading, gwItem.course, gps.heading, gps.course),
            battery: normalizeBattery(gwItem.battery ?? gwStatus.battery),
            ignition: typeof gwItem.ignition === "boolean" ? gwItem.ignition : (gwStatus.acc === 1 ? true : gwStatus.acc === 0 ? false : undefined),
            at: parseTs(gwItem.timestamp || gwItem.ts || gwItem.time),
        };
        const tags: TagReading[] = items
            .filter(i => i !== gwItem && i && (i.mac || i.tag_mac || i.tagMac))
            .map(i => tagFrom(i, gwItem.timestamp || gwItem.ts));
        out.push({ gateway, tags });
        return out;
    }

    // Shape 1: normalized object(s) { gateway: {...}, tags: [...] }
    for (const item of items) {
        if (!item || typeof item !== "object" || !item.gateway) continue;
        const g = item.gateway;
        const gps = g.gps || g.location || {};
        const gateway: GatewayReading = {
            key: normalizeKey(g.id || g.imei || g.mac || g.gateway_mac || g.gatewayMac) || topicKey,
            lat: num(g.lat, g.latitude, gps.lat, gps.latitude),
            lng: num(g.lng, g.lon, g.longitude, gps.lng, gps.lon, gps.longitude),
            speedKph: num(g.speedKph, g.speed, gps.speed),
            heading: num(g.heading, gps.heading, gps.course),
            battery: normalizeBattery(g.battery),
            ignition: typeof g.ignition === "boolean" ? g.ignition : undefined,
            at: parseTs(g.ts || g.timestamp || g.time),
        };
        const tags: TagReading[] = (Array.isArray(item.tags) ? item.tags : [])
            .filter((t: any) => t && (t.mac || t.tag_mac || t.tagMac))
            .map((t: any) => tagFrom(t, g.ts || g.timestamp));
        out.push({ gateway, tags });
    }
    if (out.length) return out;

    // Minew array without an explicit Gateway record (e.g. tag-only scan batch or empty heartbeat array)
    if (Array.isArray(body)) {
        const tags = items.filter(i => i && (i.mac || i.tag_mac || i.tagMac)).map(i => tagFrom(i));
        const latestAt = tags.length ? tags[0].at : new Date();
        out.push({
            gateway: { key: topicKey, at: latestAt },
            tags,
        });
        return out;
    }

    return out;
}

async function findDevicesByKeys(orgId: string, keys: string[]) {
    const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    const unique = Array.from(new Set(keys.filter(Boolean)));
    for (let i = 0; i < unique.length; i += 30) {
        const snap = await db.collection("tracker_devices").where("identifierKey", "in", unique.slice(i, i + 30)).get();
        snap.docs.forEach(d => { if (d.get("org_id") === orgId) map.set(d.get("identifierKey"), d); });
    }
    return map;
}

function historyPoint(lat: number, lng: number, at: Date, extra: Record<string, any>) {
    return {
        lat, lng,
        recordedAt: admin.firestore.Timestamp.fromDate(at),
        expireAt: admin.firestore.Timestamp.fromDate(new Date(at.getTime() + POLICY.retentionDays * 86400000)),
        ...extra,
    };
}

async function processReading(orgId: string, reading: { gateway: GatewayReading; tags: TagReading[] }) {
    const { gateway, tags } = reading;

    // If the payload didn't carry the gateway MAC (e.g. Minew sent a tag-only scan array and EMQX forwarded raw payload),
    // fall back to the organization's sole registered non-demo gateway when unambiguous.
    if (!gateway.key) {
        const gwSnap = await db.collection("tracker_devices")
            .where("org_id", "==", orgId)
            .where("role", "==", "gateway")
            .get();
        const activeGws = gwSnap.docs.filter(d => !d.get("isDemo") && d.get("identifierKey"));
        if (activeGws.length === 1) {
            gateway.key = String(activeGws[0].get("identifierKey"));
        } else {
            return { ok: false, reason: "missing gateway identifier" };
        }
    }

    const devices = await findDevicesByKeys(orgId, [gateway.key, ...tags.map(t => t.key)]);
    const gwDoc = devices.get(gateway.key);
    if (!gwDoc) return { ok: false, reason: `gateway ${gateway.key} is not registered` };

    const batch = db.batch();
    const gw = gwDoc.data();
    const hasFix = typeof gateway.lat === "number" && typeof gateway.lng === "number" && !(gateway.lat === 0 && gateway.lng === 0);
    const gwLoc = hasFix ? { lat: gateway.lat!, lng: gateway.lng! } : (gw.lastLocation ? { lat: gw.lastLocation.lat, lng: gw.lastLocation.lng } : null);
    let historyWrites = 0;

    // ── Gateway ──
    const gwUpdate: Record<string, any> = {
        lastSeenAt: admin.firestore.Timestamp.fromDate(gateway.at),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (hasFix) {
        gwUpdate.lastLocation = { lat: gateway.lat, lng: gateway.lng, speedKph: gateway.speedKph ?? null, heading: gateway.heading ?? null };
        const lastAt = gw.lastHistoryAt?.toDate?.() || null;
        if (shouldRecord("gateway", lastAt, gw.lastHistoryLocation || null, { lat: gateway.lat!, lng: gateway.lng!, at: gateway.at, speedKph: gateway.speedKph })) {
            batch.set(gwDoc.ref.collection("tracker_locations").doc(), historyPoint(gateway.lat!, gateway.lng!, gateway.at, {
                source: "gps", speedKph: gateway.speedKph ?? null, batteryLevel: gateway.battery ?? null, viaDeviceId: null,
            }));
            gwUpdate.lastHistoryAt = admin.firestore.Timestamp.fromDate(gateway.at);
            gwUpdate.lastHistoryLocation = { lat: gateway.lat, lng: gateway.lng };
            historyWrites++;
        }
    }
    if (typeof gateway.ignition === "boolean") gwUpdate.ignitionOn = gateway.ignition;
    if (typeof gateway.battery === "number") {
        gwUpdate.reportedBatteryLevel = gateway.battery;
        gwUpdate.reportedBatteryAt = admin.firestore.Timestamp.fromDate(gateway.at);
    }

    // ── Tags ──
    const unregistered: Array<{ mac: string; rssi: number | null; seenAt: string }> = [];
    for (const t of tags) {
        const tagDoc = devices.get(t.key);
        if (!tagDoc) {
            unregistered.push({ mac: t.mac, rssi: t.rssi ?? null, seenAt: t.at.toISOString() });
            continue;
        }
        if (tagDoc.id === gwDoc.id) continue;
        const td = tagDoc.data();
        const tagUpdate: Record<string, any> = {
            lastSeenAt: admin.firestore.Timestamp.fromDate(t.at),
            lastSeenByDeviceId: gwDoc.id,
            lastRssi: t.rssi ?? null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (typeof t.battery === "number") {
            tagUpdate.reportedBatteryLevel = t.battery;
            tagUpdate.reportedBatteryAt = admin.firestore.Timestamp.fromDate(t.at);
        }
        if (gwLoc) {
            tagUpdate.lastLocation = { lat: gwLoc.lat, lng: gwLoc.lng };
            const lastAt = td.lastHistoryAt?.toDate?.() || null;
            if (shouldRecord("tag", lastAt, td.lastHistoryLocation || null, { ...gwLoc, at: t.at, speedKph: gateway.speedKph })) {
                batch.set(tagDoc.ref.collection("tracker_locations").doc(), historyPoint(gwLoc.lat, gwLoc.lng, t.at, {
                    source: "gateway_relay", speedKph: gateway.speedKph ?? null, rssi: t.rssi ?? null,
                    batteryLevel: t.battery ?? null, viaDeviceId: gwDoc.id,
                }));
                tagUpdate.lastHistoryAt = admin.firestore.Timestamp.fromDate(t.at);
                tagUpdate.lastHistoryLocation = gwLoc;
                historyWrites++;
            }
        }
        batch.update(tagDoc.ref, tagUpdate);
    }

    // Merge newly discovered (unregistered) tags into the gateway's discovery list
    if (unregistered.length) {
        const existing: Array<{ mac: string; rssi: number | null; seenAt: string }> = Array.isArray(gw.unregisteredTagsSeen) ? gw.unregisteredTagsSeen : [];
        const merged = new Map(existing.map(e => [normalizeKey(e.mac), e]));
        unregistered.forEach(u => merged.set(normalizeKey(u.mac), u));
        gwUpdate.unregisteredTagsSeen = Array.from(merged.values())
            .sort((a, b) => b.seenAt.localeCompare(a.seenAt))
            .slice(0, POLICY.maxUnregisteredTags);
    }

    batch.update(gwDoc.ref, gwUpdate);
    if (/^[0-9A-F]{12}$/.test(gateway.key)) {
        batch.set(db.collection("tracker_gateway_credentials").doc(gateway.key), {
            lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    await batch.commit();
    return { ok: true, gatewayId: gwDoc.id, gatewayKey: gateway.key, tagsMatched: tags.length - unregistered.length, tagsUnregistered: unregistered.length, historyWrites };
}

export const ingestTrackerTelemetry = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");
        if (req.method === "OPTIONS") {
            res.set("Access-Control-Allow-Headers", "Content-Type, x-dispatchbox-key");
            res.status(204).send("");
            return;
        }
        if (req.method !== "POST") {
            res.status(405).json({ error: "POST only" });
            return;
        }

        const key = String(req.get("x-dispatchbox-key") || req.query.key || "").trim();
        if (!key) {
            res.status(401).json({ error: "Missing x-dispatchbox-key header" });
            return;
        }
        const keyDoc = await db.collection("tracker_ingest_keys").doc(hashKey(key)).get();
        if (!keyDoc.exists) {
            res.status(403).json({ error: "Invalid key" });
            return;
        }
        let orgId = keyDoc.get("org_id") as string;

        let body: any = req.body;
        if (Buffer.isBuffer(body)) {
            body = body.toString("utf8");
        }
        if (typeof body === "string") {
            try { body = JSON.parse(body); } catch { /* keep raw string so parsePayload can extract MAC */ }
        }

        const headerTopicKey = extractMacFromString(req.get("x-mqtt-topic") || req.query.topic)
            || macFromUsername(req.get("x-mqtt-username") || req.query.username)
            || extractMacFromString(req.get("x-mqtt-clientid") || req.query.clientid);

        try {
            // Platform key + per-gateway login → the authenticated username / clientid / topic decides org and gateway
            let forcedGatewayKey = "";
            const envUsername = isEnvelope(body) ? body.username : (req.get("x-mqtt-username") || req.query.username);
            const envMac = macFromUsername(envUsername)
                || (isEnvelope(body) ? (extractMacFromString(body.clientid) || extractMacFromString(body.topic)) : headerTopicKey);
            if (keyDoc.get("platform") === true && envMac) {
                const credRef = db.collection("tracker_gateway_credentials").doc(envMac);
                const cred = await credRef.get();
                if (cred.exists) {
                    await credRef.update({ lastMessageAt: admin.firestore.FieldValue.serverTimestamp() });
                    if (!cred.get("org_id")) {
                        res.status(200).json({ ok: true, unclaimed: true, mac: envMac });
                        return;
                    }
                    orgId = cred.get("org_id");
                    forcedGatewayKey = envMac;
                }
            }
            if (!orgId) {
                res.status(200).json({ ok: false, reason: "unknown gateway login" });
                return;
            }

            const readings = parsePayload(body, headerTopicKey);
            if (!readings.length) {
                console.warn("[ingestTrackerTelemetry] unparsed payload:", JSON.stringify(body).slice(0, 1000));
                await db.doc("platform_settings/tracker_last_ingest").set({
                    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: "unparsed",
                    sample: JSON.stringify(body).slice(0, 2000),
                }, { merge: true });
                res.status(200).json({ ok: false, reason: "No gateway reading found in payload" });
                return;
            }
            if (forcedGatewayKey) readings.forEach(r => { r.gateway.key = forcedGatewayKey; });
            const results = [];
            for (const r of readings) results.push(await processReading(orgId, r));
            await Promise.all([
                keyDoc.ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() }),
                db.doc("platform_settings/tracker_last_ingest").set({
                    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: "processed",
                    results,
                    sample: JSON.stringify(body).slice(0, 2000),
                }, { merge: true }),
            ]);
            res.status(200).json({ ok: true, results });
        } catch (err) {
            console.error("[ingestTrackerTelemetry] failed", err);
            res.status(500).json({ error: (err as Error).message });
        }
    });

export const rotateTrackerIngestKey = functions.https.onCall(async (_data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    const uid = context.auth.uid;
    const token = context.auth.token as Record<string, any>;
    const userSnap = await db.collection("users").doc(uid).get();
    const role = String(token.role || userSnap.get("role") || "");
    const orgId = String(token.org_id || userSnap.get("org_id") || "");
    if (!orgId) throw new functions.https.HttpsError("failed-precondition", "No organization on this account.");
    if (!["owner", "admin", "dispatcher"].includes(role) && token.site_admin !== true) {
        throw new functions.https.HttpsError("permission-denied", "Only owners, admins, or dispatchers can manage tracker keys.");
    }

    // Revoke any existing keys for the org
    const existing = await db.collection("tracker_ingest_keys").where("org_id", "==", orgId).get();
    const batch = db.batch();
    existing.docs.filter(d => d.get("platform") !== true).forEach(d => batch.delete(d.ref));

    const key = `dbx_trk_${crypto.randomBytes(24).toString("hex")}`;
    batch.set(db.collection("tracker_ingest_keys").doc(hashKey(key)), {
        org_id: orgId,
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db.collection("organizations").doc(orgId), {
        trackerIngest: { keyLast4: key.slice(-4), rotatedAt: admin.firestore.FieldValue.serverTimestamp(), rotatedBy: uid },
    }, { merge: true });
    await batch.commit();

    return { key, keyLast4: key.slice(-4) };
});
