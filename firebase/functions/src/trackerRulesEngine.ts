/**
 * trackerRulesEngine.ts - 24/7 Server-Side Tracker Rules & Location-Based Messaging Engine
 *
 * Runs automatically in Google Cloud when no user is logged into the web app:
 *   1. Inline on every gateway telemetry packet via `evaluateGatewayAndTagRules(orgId, gatewayId)`
 *   2. On a 5-minute background schedule via `monitorTrackerRulesScheduled`
 *   3. On demand from the UI via `triggerTrackerRuleAlert` (callable)
 *
 * Rules evaluated server-side:
 *   - Rule 1 (Left-Behind Tool / Equipment Tag Alert):
 *       Detects when a vehicle gateway moves beyond `trackerAlertDistanceFt` (default 500 ft)
 *       from an assigned BLE tag or hasn't heard the tag for > 30 min while the gateway is online.
 *       Dispatches instant SMS to the assigned technician / dispatcher / fleet manager with a
 *       Google Maps pin to the last known location, and auto-clears when the tag returns to the truck.
 *   - Rule 2 (Customer Location-Based Messaging):
 *       a) Auto Jobsite Arrival Check-In & Customer "Tech Has Arrived" SMS (`trackerAlertsJobsiteArrivalCheckin`)
 *       b) Customer "Tech Is Approaching (~X mins away)" SMS when entering 1.5-mile approach radius
 *       c) Customer En-Route Traffic / Late Arrival ETA SMS (`trackerAlertsCustomerTrafficSms`,
 *          `trackerAlertCustomerTrafficThresholdMin`)
 *   - Rule 3 (Operational Fleet & Anti-Theft Rules):
 *       a) After-Hours Vehicle/Trailer Movement Theft Alert (`trackerAlertsAfterHoursTheft`)
 *       b) Extended Engine Idle Alert (`trackerAlertsEngineIdle`)
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { sendSMS } from "./twilio/sms";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

const SEPARATION_WINDOW_MIN = 30;
const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between repeat SMS for the same ongoing incident
const THEFT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between repeat after-hours theft SMS

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

function toDateSafe(v: any): Date | null {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v.toDate === "function") return v.toDate();
    if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
    if (typeof v === "string" || typeof v === "number") {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

interface OrgRuleConfig {
    companyName: string;
    timezone: string;
    notifyTechSms: boolean;
    notifyDispatcherConsole: boolean;
    notifyFleetManager: boolean;
    alertDistanceFt: number;
    customerTrafficSmsEnabled: boolean;
    trafficThresholdMin: number;
    afterHoursTheftEnabled: boolean;
    afterHoursWindow: string; // '8pm_6am' | '6pm_6am' | '24_7_weekend'
    engineIdleEnabled: boolean;
    engineIdleThresholdMin: number;
    jobsiteArrivalEnabled: boolean;
    jobsiteArrivalRadiusFt: number;
}

async function loadOrgRuleConfig(orgId: string): Promise<{ config: OrgRuleConfig; orgData: Record<string, any> }> {
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgData = orgSnap.exists ? (orgSnap.data() || {}) : {};
    const ts = orgData.trackerSettings || {};
    const st = orgData.settings || {};

    const config: OrgRuleConfig = {
        companyName: orgData.branding?.companyName || orgData.name || "DispatchBox",
        timezone: st.timezone || orgData.timezone || "Pacific/Honolulu",
        notifyTechSms: ts.trackerAlertsTechSms ?? st.trackerAlertsTechSms ?? true,
        notifyDispatcherConsole: ts.trackerAlertsDispatcherConsole ?? st.trackerAlertsDispatcherConsole ?? true,
        notifyFleetManager: ts.trackerAlertsFleetManager ?? st.trackerAlertsFleetManager ?? false,
        alertDistanceFt: Number(ts.trackerAlertDistanceFt || st.trackerAlertDistanceFt || 500),
        customerTrafficSmsEnabled: ts.trackerAlertsCustomerTrafficSms ?? st.trackerAlertsCustomerTrafficSms ?? true,
        trafficThresholdMin: Number(ts.trackerAlertCustomerTrafficThresholdMin || st.trackerAlertCustomerTrafficThresholdMin || 10),
        afterHoursTheftEnabled: ts.trackerAlertsAfterHoursTheft ?? st.trackerAlertsAfterHoursTheft ?? true,
        afterHoursWindow: String(ts.trackerAlertsAfterHoursWindow || st.trackerAlertsAfterHoursWindow || "8pm_6am"),
        engineIdleEnabled: ts.trackerAlertsEngineIdle ?? st.trackerAlertsEngineIdle ?? true,
        engineIdleThresholdMin: Number(ts.trackerAlertsEngineIdleThresholdMin || st.trackerAlertsEngineIdleThresholdMin || 15),
        jobsiteArrivalEnabled: ts.trackerAlertsJobsiteArrivalCheckin ?? st.trackerAlertsJobsiteArrivalCheckin ?? true,
        jobsiteArrivalRadiusFt: Number(ts.trackerAlertsJobsiteArrivalRadiusFt || st.trackerAlertsJobsiteArrivalRadiusFt || 250),
    };
    return { config, orgData };
}

/** Resolves phone numbers for tech, dispatchers/owners, and fleet managers in an org */
async function resolveStaffPhones(
    orgId: string,
    assignedTechId?: string | null,
    assignedTechName?: string | null
): Promise<{ techPhone: string | null; dispatcherPhones: string[]; techName: string }> {
    const usersSnap = await db.collection("users").where("org_id", "==", orgId).get();
    let techPhone: string | null = null;
    let techName = assignedTechName || "Technician";
    const dispatcherPhones = new Set<string>();

    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        const phone = u.phone || u.contactPhone || u.mobilePhone || null;
        const role = String(u.role || "").toLowerCase();
        if (assignedTechId && uDoc.id === assignedTechId) {
            techName = u.name || u.displayName || techName;
            if (phone) techPhone = phone;
        } else if (assignedTechName && (u.name === assignedTechName || u.displayName === assignedTechName)) {
            if (phone && !techPhone) techPhone = phone;
        }
        if (phone && ["owner", "admin", "dispatcher", "manager"].includes(role)) {
            dispatcherPhones.add(String(phone));
        }
    }

    // Fallback to org contact phone if no user phones are populated
    if (dispatcherPhones.size === 0) {
        const orgSnap = await db.collection("organizations").doc(orgId).get();
        const orgPhone = orgSnap.data()?.phone || orgSnap.data()?.contactPhone || orgSnap.data()?.branding?.phone;
        if (orgPhone) dispatcherPhones.add(String(orgPhone));
    }

    return {
        techPhone: techPhone || Array.from(dispatcherPhones)[0] || null,
        dispatcherPhones: Array.from(dispatcherPhones),
        techName,
    };
}

function isWithinAfterHoursWindow(now: Date, timezone: string, windowCode: string): boolean {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            hour12: false,
            weekday: "short",
            hour: "2-digit",
        }).formatToParts(now);
        const hour = Number(parts.find(p => p.type === "hour")?.value ?? 12);
        const weekday = parts.find(p => p.type === "weekday")?.value ?? "Mon";
        const isWeekend = weekday === "Sat" || weekday === "Sun";

        if (windowCode === "24_7_weekend" && isWeekend) return true;
        if (windowCode === "6pm_6am") return hour >= 18 || hour < 6;
        // Default '8pm_6am'
        return hour >= 20 || hour < 6;
    } catch {
        return false;
    }
}

function formatLocalTime(d: Date, timezone: string): string {
    try {
        return d.toLocaleTimeString("en-US", {
            timeZone: timezone,
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
    } catch {
        return d.toISOString().slice(11, 16);
    }
}

/** Geocodes an address once using OpenStreetMap Nominatim if coordinates aren't cached on the job */
async function resolveJobCoordinates(jobDoc: FirebaseFirestore.QueryDocumentSnapshot): Promise<{ lat: number; lng: number } | null> {
    const job = jobDoc.data();
    const lat = Number(job.customer?.lat ?? job.location?.lat ?? job.lat);
    const lng = Number(job.customer?.lng ?? job.location?.lng ?? job.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
        return { lat, lng };
    }
    const address = String(job.customer?.address || job.location?.address || "").trim();
    if (!address || address.length < 5) return null;

    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
        const res = await fetch(url, {
            headers: { "User-Agent": "DispatchBox-FieldService/1.0" },
        });
        if (!res.ok) return null;
        const arr: any = await res.json();
        if (Array.isArray(arr) && arr.length > 0) {
            const pLat = parseFloat(arr[0].lat);
            const pLng = parseFloat(arr[0].lon);
            if (Number.isFinite(pLat) && Number.isFinite(pLng)) {
                await jobDoc.ref.update({
                    "customer.lat": pLat,
                    "customer.lng": pLng,
                });
                return { lat: pLat, lng: pLng };
            }
        }
    } catch (e) {
        console.warn("[TrackerRules] Address geocode fallback failed:", (e as Error).message);
    }
    return null;
}

/**
 * Evaluates all server-side rules for a gateway and its child tags.
 * Called automatically by `ingestTrackerTelemetry` and by the 5-minute scheduled monitor.
 */
export async function evaluateGatewayAndTagRules(
    orgId: string,
    gatewayDocId: string,
    heardTagKeys: string[] = []
): Promise<{ alertsTriggered: string[] }> {
    const alertsTriggered: string[] = [];
    const gwSnap = await db.collection("tracker_devices").doc(gatewayDocId).get();
    if (!gwSnap.exists) return { alertsTriggered };
    const gw = gwSnap.data()!;
    if (gw.isDemo) return { alertsTriggered };

    const { config } = await loadOrgRuleConfig(orgId);
    const now = new Date();
    const gwSeen = toDateSafe(gw.lastSeenAt) || now;
    const gwLoc = gw.lastLocation && typeof gw.lastLocation.lat === "number" && typeof gw.lastLocation.lng === "number"
        ? { lat: gw.lastLocation.lat as number, lng: gw.lastLocation.lng as number, speedKph: gw.lastLocation.speedKph as number | undefined }
        : null;

    const { techPhone, dispatcherPhones, techName } = await resolveStaffPhones(
        orgId,
        gw.assignedToType === "tech" ? gw.assignedToId : null,
        gw.assignedToName
    );

    const heardSet = new Set(heardTagKeys.map(k => String(k).toUpperCase()));

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 1: Left-Behind Tool / Equipment Tag Separation & Auto-Recovery
    // ─────────────────────────────────────────────────────────────────────────
    const childTagsSnap = await db.collection("tracker_devices")
        .where("org_id", "==", orgId)
        .where("parentDeviceId", "==", gatewayDocId)
        .get();

    for (const tagDoc of childTagsSnap.docs) {
        const tag = tagDoc.data();
        if (tag.isDemo) continue;
        const tagKey = String(tag.identifierKey || "").toUpperCase();
        const tagSeen = toDateSafe(tag.lastSeenAt);
        const tagLoc = tag.lastLocation && typeof tag.lastLocation.lat === "number" && typeof tag.lastLocation.lng === "number"
            ? { lat: tag.lastLocation.lat as number, lng: tag.lastLocation.lng as number }
            : gwLoc;

        const heardJustNow = heardSet.has(tagKey) || (tagSeen && (now.getTime() - tagSeen.getTime()) < 90 * 1000);

        // 1A: Recovery — Tag is back in range of the vehicle gateway
        if (heardJustNow && tag.separationAlertActive === true) {
            await tagDoc.ref.update({
                separationAlertActive: false,
                separationRecoveredAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            // Resolve any open alert docs for this tag
            const openAlerts = await db.collection("tracker_alerts")
                .where("org_id", "==", orgId)
                .where("deviceId", "==", tagDoc.id)
                .where("status", "==", "active")
                .get();
            const b = db.batch();
            openAlerts.docs.forEach(d => b.update(d.ref, {
                status: "resolved",
                resolvedReason: "returned_to_vehicle",
                resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            }));
            await b.commit();

            if (config.notifyTechSms && techPhone) {
                const msg = `${config.companyName}: ✅ Tool Recovered — "${tag.label}" is back inside ${gw.label}.`;
                await sendSMS(techPhone, msg, { orgId, customerName: techName });
            }
            alertsTriggered.push(`recovered:${tag.label}`);
            continue;
        }

        // 1B: Separation check — Gateway is active, but tag hasn't been heard or truck moved away
        if (!heardJustNow && tagSeen) {
            const silentMin = (gwSeen.getTime() - tagSeen.getTime()) / 60000;
            const distM = (gwLoc && tagLoc) ? haversineM(gwLoc, tagLoc) : 0;
            const distFt = Math.round(distM * 3.28084);
            const separatedByDistance = gwLoc && tagLoc && distFt >= config.alertDistanceFt && silentMin >= 2;
            const separatedByTime = silentMin >= SEPARATION_WINDOW_MIN && (now.getTime() - gwSeen.getTime()) <= 25 * 60000;

            if (separatedByDistance || separatedByTime) {
                const lastAlertAt = toDateSafe(tag.separationAlertSentAt);
                const cooldownElapsed = !lastAlertAt || (now.getTime() - lastAlertAt.getTime()) >= ALERT_COOLDOWN_MS;

                if (!tag.separationAlertActive || cooldownElapsed) {
                    const mapsLink = tagLoc
                        ? `https://www.google.com/maps?q=${tagLoc.lat.toFixed(5)},${tagLoc.lng.toFixed(5)}`
                        : "https://dispatch-box-sb.web.app/inventory/trackers";
                    const reasonDetail = separatedByDistance
                        ? `${gw.label} moved ${distFt} ft away without "${tag.label}"`
                        : `${gw.label} has not detected "${tag.label}" for ${Math.round(silentMin)} min`;

                    await tagDoc.ref.update({
                        separationAlertActive: true,
                        separationAlertSentAt: admin.firestore.FieldValue.serverTimestamp(),
                        separationDetail: reasonDetail,
                    });

                    await db.collection("tracker_alerts").add({
                        org_id: orgId,
                        type: "left_behind",
                        status: "active",
                        deviceId: tagDoc.id,
                        deviceLabel: tag.label,
                        gatewayId: gatewayDocId,
                        gatewayLabel: gw.label,
                        techName,
                        detail: reasonDetail,
                        distanceFt: distFt || null,
                        silentMinutes: Math.round(silentMin),
                        lastLocation: tagLoc || null,
                        mapsUrl: mapsLink,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    const smsBody = `${config.companyName} 🚨 LEFT-BEHIND TOOL ALERT: "${tag.label}" was not detected in ${gw.label} (${reasonDetail}). Last known position: ${mapsLink}`;
                    const recipients = new Set<string>();
                    if (config.notifyTechSms && techPhone) recipients.add(techPhone);
                    if ((config.notifyDispatcherConsole || config.notifyFleetManager) && dispatcherPhones.length) {
                        dispatcherPhones.forEach(p => recipients.add(p));
                    }
                    for (const phone of recipients) {
                        await sendSMS(phone, smsBody, { orgId, customerName: techName });
                    }
                    alertsTriggered.push(`left_behind:${tag.label}`);
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 2: Customer Location-Based Messaging (Arrival, Approaching & Traffic ETA)
    // ─────────────────────────────────────────────────────────────────────────
    if (gwLoc) {
        const jobsSnap = await db.collection("jobs")
            .where("org_id", "==", orgId)
            .where("status", "in", ["scheduled", "in_progress", "dispatched", "en_route"])
            .get();

        for (const jobDoc of jobsSnap.docs) {
            const job = jobDoc.data();
            // Match job to this gateway's technician (or match if org only has 1 active gateway)
            if (gw.assignedToType === "tech" && gw.assignedToId && job.assigned_tech_id && job.assigned_tech_id !== gw.assignedToId) {
                continue;
            }
            const customerPhone = job.customer?.phone || job.customerPhone || null;
            const customerName = job.customer?.name || job.customerName || "Valued Customer";
            const address = job.customer?.address || job.location?.address || "your service address";
            const jobTechName = job.assigned_tech_name || techName;

            const jobCoords = await resolveJobCoordinates(jobDoc);
            if (!jobCoords) continue;

            const distM = haversineM(gwLoc, jobCoords);
            const distFt = Math.round(distM * 3.28084);

            // 2A: Auto Jobsite Arrival Geofence Check-In & Customer Arrival SMS
            if (config.jobsiteArrivalEnabled && distFt <= config.jobsiteArrivalRadiusFt && !job.trackerAutoArrivedAt) {
                const jobUpdate: Record<string, any> = {
                    trackerAutoArrivedAt: admin.firestore.FieldValue.serverTimestamp(),
                    trackerArrivalGatewayId: gatewayDocId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                };
                if (["scheduled", "dispatched", "en_route"].includes(String(job.status))) {
                    jobUpdate.status = "in_progress";
                }
                await jobDoc.ref.update(jobUpdate);

                await db.collection("tracker_alerts").add({
                    org_id: orgId,
                    type: "jobsite_arrival",
                    status: "resolved",
                    gatewayId: gatewayDocId,
                    gatewayLabel: gw.label,
                    jobId: jobDoc.id,
                    customerName,
                    detail: `${gw.label} (${jobTechName}) arrived within ${distFt} ft of ${address}. Job auto-checked in.`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                if (customerPhone) {
                    const arrivalMsg = `${config.companyName}: Hi ${customerName}, your technician ${jobTechName} has arrived on-site at ${address}.`;
                    await sendSMS(customerPhone, arrivalMsg, {
                        orgId,
                        jobId: jobDoc.id,
                        customerId: job.customer_id || job.customer?.id,
                        customerName,
                    });
                }
                alertsTriggered.push(`jobsite_arrival:${jobDoc.id}`);
                continue;
            }

            // 2B: Customer "Tech Is Approaching (~X mins away)" SMS (within 1.5 miles / 2400m while moving)
            if (
                config.customerTrafficSmsEnabled &&
                distM > config.jobsiteArrivalRadiusFt * 0.3048 &&
                distM <= 2400 &&
                (gwLoc.speedKph ?? 0) >= 5 &&
                !job.trackerApproachingSmsSentAt &&
                !job.trackerAutoArrivedAt
            ) {
                const speedKph = Math.max(gwLoc.speedKph || 35, 25);
                const etaMin = Math.max(2, Math.round(((distM / 1000) / speedKph) * 60));
                await jobDoc.ref.update({
                    trackerApproachingSmsSentAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                if (customerPhone) {
                    const approachMsg = `${config.companyName}: Hi ${customerName}, technician ${jobTechName} is approaching ${address} and is approximately ${etaMin} minutes away!`;
                    await sendSMS(customerPhone, approachMsg, {
                        orgId,
                        jobId: jobDoc.id,
                        customerId: job.customer_id || job.customer?.id,
                        customerName,
                    });
                }
                alertsTriggered.push(`customer_approaching:${jobDoc.id}`);
            }

            // 2C: Customer En-Route Traffic / Late Arrival ETA Delay SMS
            const scheduledAt = toDateSafe(job.scheduled_at || job.scheduledStart);
            if (
                config.customerTrafficSmsEnabled &&
                scheduledAt &&
                distM > 500 &&
                !job.trackerTrafficDelaySmsSentAt &&
                !job.trackerAutoArrivedAt
            ) {
                // Only evaluate jobs scheduled within [-2 hours, +1 hour] of now
                const minFromSched = (now.getTime() - scheduledAt.getTime()) / 60000;
                if (minFromSched >= -60 && minFromSched <= 180) {
                    const effectiveSpeedKph = Math.max(gwLoc.speedKph || 30, 20);
                    const estDriveMin = Math.ceil(((distM / 1000) / effectiveSpeedKph) * 60);
                    const estArrival = new Date(now.getTime() + estDriveMin * 60000);
                    const delayMin = Math.round((estArrival.getTime() - scheduledAt.getTime()) / 60000);

                    if (delayMin >= config.trafficThresholdMin) {
                        const newEtaStr = formatLocalTime(estArrival, config.timezone);
                        await jobDoc.ref.update({
                            trackerTrafficDelaySmsSentAt: admin.firestore.FieldValue.serverTimestamp(),
                            trackerEstimatedArrivalAt: admin.firestore.Timestamp.fromDate(estArrival),
                        });

                        await db.collection("tracker_alerts").add({
                            org_id: orgId,
                            type: "customer_traffic_delay",
                            status: "active",
                            gatewayId: gatewayDocId,
                            gatewayLabel: gw.label,
                            jobId: jobDoc.id,
                            customerName,
                            detail: `Customer notified of +${delayMin} min traffic delay (New ETA: ${newEtaStr}) for ${address}.`,
                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        });

                        if (customerPhone) {
                            const delayMsg = `${config.companyName} Notice: Hi ${customerName}, technician ${jobTechName} encountered traffic en route to ${address}. Updated estimated arrival: ${newEtaStr} (+${delayMin} min delay).`;
                            await sendSMS(customerPhone, delayMsg, {
                                orgId,
                                jobId: jobDoc.id,
                                customerId: job.customer_id || job.customer?.id,
                                customerName,
                            });
                        }
                        alertsTriggered.push(`customer_traffic_delay:${jobDoc.id}`);
                    }
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 3: After-Hours Movement Theft Alert & Extended Engine Idle Alert
    // ─────────────────────────────────────────────────────────────────────────
    if (gwLoc && config.afterHoursTheftEnabled && (gwLoc.speedKph ?? 0) >= 8) {
        if (isWithinAfterHoursWindow(now, config.timezone, config.afterHoursWindow)) {
            const lastTheftAt = toDateSafe(gw.lastAfterHoursAlertAt);
            if (!lastTheftAt || (now.getTime() - lastTheftAt.getTime()) >= THEFT_COOLDOWN_MS) {
                const mapsLink = `https://www.google.com/maps?q=${gwLoc.lat.toFixed(5)},${gwLoc.lng.toFixed(5)}`;
                await gwSnap.ref.update({
                    lastAfterHoursAlertAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                await db.collection("tracker_alerts").add({
                    org_id: orgId,
                    type: "after_hours_theft",
                    status: "active",
                    gatewayId: gatewayDocId,
                    gatewayLabel: gw.label,
                    detail: `After-hours vehicle movement detected on ${gw.label} (${Math.round((gwLoc.speedKph || 0) * 0.621371)} mph).`,
                    lastLocation: { lat: gwLoc.lat, lng: gwLoc.lng },
                    mapsUrl: mapsLink,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                const theftMsg = `${config.companyName} 🚨 AFTER-HOURS MOVEMENT ALERT: ${gw.label} is moving outside operating hours (${Math.round((gwLoc.speedKph || 0) * 0.621371)} mph). Live position: ${mapsLink}`;
                for (const phone of dispatcherPhones) {
                    await sendSMS(phone, theftMsg, { orgId, customerName: gw.label });
                }
                alertsTriggered.push(`after_hours_theft:${gw.label}`);
            }
        }
    }

    if (config.engineIdleEnabled && typeof gw.ignitionOn === "boolean") {
        const isIdling = gw.ignitionOn === true && (gwLoc?.speedKph ?? 0) < 2;
        if (isIdling) {
            const idleStart = toDateSafe(gw.idleStartedAt) || now;
            if (!gw.idleStartedAt) {
                await gwSnap.ref.update({ idleStartedAt: admin.firestore.Timestamp.fromDate(now) });
            } else {
                const idleMin = (now.getTime() - idleStart.getTime()) / 60000;
                const lastIdleAlert = toDateSafe(gw.lastIdleAlertAt);
                if (idleMin >= config.engineIdleThresholdMin && (!lastIdleAlert || (now.getTime() - lastIdleAlert.getTime()) >= THEFT_COOLDOWN_MS)) {
                    await gwSnap.ref.update({ lastIdleAlertAt: admin.firestore.FieldValue.serverTimestamp() });
                    await db.collection("tracker_alerts").add({
                        org_id: orgId,
                        type: "engine_idle",
                        status: "active",
                        gatewayId: gatewayDocId,
                        gatewayLabel: gw.label,
                        detail: `${gw.label} has been idling continuously for ${Math.round(idleMin)} minutes.`,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    if (config.notifyFleetManager && dispatcherPhones.length) {
                        const idleMsg = `${config.companyName} ⚠️ Engine Idle Alert: ${gw.label} has been idling for ${Math.round(idleMin)} min (threshold: ${config.engineIdleThresholdMin} min).`;
                        await sendSMS(dispatcherPhones[0], idleMsg, { orgId, customerName: gw.label });
                    }
                    alertsTriggered.push(`engine_idle:${gw.label}`);
                }
            }
        } else if (gw.idleStartedAt) {
            await gwSnap.ref.update({ idleStartedAt: admin.firestore.FieldValue.delete() });
        }
    }

    return { alertsTriggered };
}

/**
 * Scheduled 24/7 Cloud Function: Runs every 5 minutes even when no user is logged into the web app.
 * Evaluates all active non-demo gateways and their tags across all organizations.
 */
export const monitorTrackerRulesScheduled = functions.pubsub
    .schedule("every 5 minutes")
    .onRun(async () => {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000); // Gateways seen within the last 60 minutes
        const gwSnap = await db.collection("tracker_devices")
            .where("role", "==", "gateway")
            .where("lastSeenAt", ">=", admin.firestore.Timestamp.fromDate(cutoff))
            .get();

        for (const doc of gwSnap.docs) {
            const d = doc.data();
            if (d.isDemo || !d.org_id) continue;
            try {
                await evaluateGatewayAndTagRules(String(d.org_id), doc.id);
            } catch (err) {
                console.error(`[monitorTrackerRulesScheduled] Error evaluating gateway ${doc.id}:`, err);
            }
        }
        return null;
    });

/**
 * Callable Cloud Function: Allows the web UI ("Test Left-Behind Alert Workflow",
 * "Test Customer Traffic Alert SMS", or "Run Rules Now") to trigger real server-side
 * rule evaluation and dispatch live SMS notifications.
 */
export const triggerTrackerRuleAlert = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }
    const uid = context.auth.uid;
    const token = context.auth.token as Record<string, any>;
    const userSnap = await db.collection("users").doc(uid).get();
    const orgId = String(data?.orgId || token.org_id || userSnap.get("org_id") || uid);
    const mode = String(data?.mode || "evaluate_all"); // 'left_behind_test' | 'customer_traffic_test' | 'evaluate_all'
    const { config } = await loadOrgRuleConfig(orgId);
    const { techPhone, dispatcherPhones, techName } = await resolveStaffPhones(orgId, uid, userSnap.get("name"));
    const targetPhone = data?.toPhone || techPhone || dispatcherPhones[0] || userSnap.get("phone") || null;

    if (mode === "left_behind_test") {
        // Find the org's real tag & gateway if present
        const devSnap = await db.collection("tracker_devices").where("org_id", "==", orgId).get();
        const gwDoc = devSnap.docs.find(d => d.get("role") === "gateway" && !d.get("isDemo")) || devSnap.docs.find(d => d.get("role") === "gateway");
        const tagDoc = devSnap.docs.find(d => d.get("role") === "tag" && !d.get("isDemo")) || devSnap.docs.find(d => d.get("role") === "tag");
        const gwLabel = gwDoc ? String(gwDoc.get("label")) : "Service Jeep 1";
        const tagLabel = tagDoc ? String(tagDoc.get("label")) : "Laptop Bag";
        const loc = gwDoc?.get("lastLocation") || tagDoc?.get("lastLocation");
        const mapsUrl = loc && typeof loc.lat === "number"
            ? `https://www.google.com/maps?q=${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`
            : "https://dispatch-box-sb.web.app/inventory/trackers";

        const detail = `${gwLabel} moved ${config.alertDistanceFt} ft from jobsite without "${tagLabel}"`;
        await db.collection("tracker_alerts").add({
            org_id: orgId,
            type: "left_behind",
            status: "active",
            deviceId: tagDoc?.id || null,
            deviceLabel: tagLabel,
            gatewayId: gwDoc?.id || null,
            gatewayLabel: gwLabel,
            techName,
            detail,
            distanceFt: config.alertDistanceFt,
            mapsUrl,
            isTest: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        let smsSent = false;
        const smsBody = `${config.companyName} 🚨 LEFT-BEHIND TOOL ALERT: "${tagLabel}" was not detected in ${gwLabel} (${detail}). Last known position: ${mapsUrl}`;
        if (targetPhone) {
            const res = await sendSMS(targetPhone, smsBody, { orgId, customerName: techName });
            smsSent = res.success;
        }
        return { ok: true, mode, gwLabel, tagLabel, detail, smsSent, targetPhone, smsBody };
    }

    if (mode === "customer_traffic_test") {
        const delayMin = config.trafficThresholdMin || 10;
        const estArrival = new Date(Date.now() + (25 + delayMin) * 60000);
        const newEtaStr = formatLocalTime(estArrival, config.timezone);
        const customerName = String(data?.customerName || "Customer");
        const address = String(data?.address || "Customer Jobsite");

        const smsBody = `${config.companyName} Notice: Hi ${customerName}, technician ${techName} encountered traffic en route to ${address}. Updated estimated arrival: ${newEtaStr} (+${delayMin} min delay).`;
        await db.collection("tracker_alerts").add({
            org_id: orgId,
            type: "customer_traffic_delay",
            status: "active",
            customerName,
            detail: `Customer notified of +${delayMin} min traffic delay (New ETA: ${newEtaStr}).`,
            isTest: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        let smsSent = false;
        if (targetPhone) {
            const res = await sendSMS(targetPhone, smsBody, { orgId, customerName });
            smsSent = res.success;
        }
        return { ok: true, mode, delayMin, newEtaStr, smsSent, targetPhone, smsBody };
    }

    // Default: evaluate all active gateways for this org right now
    const gwSnap = await db.collection("tracker_devices")
        .where("org_id", "==", orgId)
        .where("role", "==", "gateway")
        .get();
    const triggered: string[] = [];
    for (const g of gwSnap.docs) {
        if (g.get("isDemo")) continue;
        const res = await evaluateGatewayAndTagRules(orgId, g.id);
        triggered.push(...res.alertsTriggered);
    }
    return { ok: true, mode: "evaluate_all", triggered };
});

