/**
 * trackerDevices.ts - Tracker Device Registry service
 *
 * - Tracking/retention policy (shared contract with the ingestTrackerTelemetry Cloud Function)
 * - Role/status/battery helpers for the Type → Device → Tag hierarchy
 * - Firestore CRUD for tracker_devices + tracker_locations history
 * - Demo fleet seeder (sandbox only) that exercises the same history throttling policy
 */
import {
    collection,
    doc,
    query,
    where,
    orderBy,
    limit as fsLimit,
    onSnapshot,
    addDoc,
    updateDoc,
    getDocs,
    writeBatch,
    serverTimestamp,
    Timestamp,
    deleteField
} from 'firebase/firestore';
import { db } from '../firebase';
import { TOP_TRACKER_CATALOG, TrackerDeviceModel } from '../utils/trackerCatalog';
import {
    TrackerDevice,
    TrackerDeviceRole,
    TrackerLocationPoint,
    TrackerAssigneeType
} from '../types/trackerDevices';

export const TRACKER_DEVICES_COLLECTION = 'tracker_devices';
export const TRACKER_LOCATIONS_SUBCOLLECTION = 'tracker_locations';

/**
 * Location history policy. Keep in sync with firebase/functions/src/trackerIngest.ts.
 * Gateways (vehicle powered) log densely while driving; tags inherit the gateway position
 * at a coarser cadence. Points auto-expire via Firestore TTL on `expireAt`.
 */
export const TRACKING_POLICY = {
    retentionDays: 90,
    gatewayMovingIntervalMin: 5,
    gatewayStationaryIntervalMin: 30,
    tagMovingIntervalMin: 15,
    tagStationaryIntervalMin: 60,
    movementThresholdM: 100,
    movingSpeedKph: 5,
    /** Device counts as "online" if heard within this window */
    gatewayOnlineWindowMin: 15,
    tagOnlineWindowMin: 30
};

// ─────────────────────────────────────────────────────────────────────────────
// Generic helpers
// ─────────────────────────────────────────────────────────────────────────────

export function toDateSafe(val: any): Date | null {
    if (!val) return null;
    try {
        if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
        if (typeof val.toDate === 'function') return val.toDate();
        if (typeof val === 'string' || typeof val === 'number') {
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d;
        }
        if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
        if (typeof val._seconds === 'number') return new Date(val._seconds * 1000);
    } catch {
        return null;
    }
    return null;
}

export function normalizeIdentifier(raw: string): string {
    return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Formats a 12-hex-char key as AA:BB:CC:DD:EE:FF, otherwise returns trimmed input */
export function formatMac(raw: string): string {
    const key = normalizeIdentifier(raw);
    if (/^[0-9A-F]{12}$/.test(key)) return key.match(/.{2}/g)!.join(':');
    return (raw || '').trim();
}

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatRelative(date: Date | null): string {
    if (!date) return 'Never';
    const diffMs = Date.now() - date.getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
    const days = Math.round(hrs / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model / role helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getModel(modelId: string): TrackerDeviceModel {
    return TOP_TRACKER_CATALOG.find(m => m.id === modelId) || TOP_TRACKER_CATALOG[TOP_TRACKER_CATALOG.length - 1];
}

/** Gateways relay tags; BLE beacons are tags; everything else stands alone. */
export function roleForModel(model: TrackerDeviceModel): TrackerDeviceRole {
    if (model.canRelayTags) return 'gateway';
    if (model.type === 'ble_beacon') return 'tag';
    return 'standalone';
}

export function identifierLabelForRole(role: TrackerDeviceRole, model?: TrackerDeviceModel): { label: string; placeholder: string; hint?: string } {
    if (role === 'gateway') return { label: 'MAC Address *', placeholder: 'e.g. AC:23:3F:12:34:56', hint: 'Printed on the label on the gateway: 12 letters and numbers.' };
    if (role === 'tag') return { label: 'Tag MAC Address *', placeholder: 'e.g. AC:23:3F:88:99:A1', hint: 'Printed on the tag, or shown in Minew\'s app.' };
    if (model?.type === 'gps_cellular') return { label: 'Device IMEI / Serial *', placeholder: 'e.g. 869204049201948' };
    return { label: 'Serial Number / Identifier *', placeholder: 'e.g. HG6T8942KL' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────────

export type DeviceConnectivity = 'online' | 'idle' | 'offline' | 'never' | 'separated';

export interface DeviceStatusInfo {
    status: DeviceConnectivity;
    label: string;
    detail: string;
    lastSeen: Date | null;
}

/**
 * For tags, "separated" means the parent gateway is still reporting but has not heard
 * this tag for over the tag online window — the classic left-behind signal.
 */
export function getDeviceStatus(device: TrackerDevice, parent?: TrackerDevice | null): DeviceStatusInfo {
    const lastSeen = toDateSafe(device.lastSeenAt);
    if (!lastSeen) return { status: 'never', label: 'Never Reported', detail: 'Waiting for first check-in', lastSeen };

    const ageMin = (Date.now() - lastSeen.getTime()) / 60000;
    const windowMin = device.role === 'tag' ? TRACKING_POLICY.tagOnlineWindowMin : TRACKING_POLICY.gatewayOnlineWindowMin;

    if (device.role === 'tag' && parent) {
        const parentSeen = toDateSafe(parent.lastSeenAt);
        if (parentSeen && ageMin > windowMin && parentSeen.getTime() - lastSeen.getTime() > windowMin * 60000) {
            return {
                status: 'separated',
                label: 'Not In Vehicle',
                detail: `${parent.label} is reporting but hasn't heard this tag since ${formatRelative(lastSeen)}`,
                lastSeen
            };
        }
    }

    if (ageMin <= windowMin) return { status: 'online', label: 'Online', detail: `Heard ${formatRelative(lastSeen)}`, lastSeen };
    if (ageMin <= 24 * 60) return { status: 'idle', label: 'Idle', detail: `Last heard ${formatRelative(lastSeen)}`, lastSeen };
    return { status: 'offline', label: 'Offline', detail: `Last heard ${formatRelative(lastSeen)}`, lastSeen };
}

// ─────────────────────────────────────────────────────────────────────────────
// Battery
// ─────────────────────────────────────────────────────────────────────────────

export interface DeviceBatteryInfo {
    kind: 'powered' | 'live' | 'estimated';
    percent: number | null;
    status: 'good' | 'due_soon' | 'replace' | 'powered';
    dueDate: Date | null;
    daysRemaining: number | null;
    batteryType: string;
    summary: string;
}

export function estimateDeviceBattery(device: TrackerDevice, model: TrackerDeviceModel = getModel(device.modelId)): DeviceBatteryInfo {
    const bt = model.batteryType.toLowerCase();
    if (bt.includes('hardwire') || bt.includes('vehicle 12v')) {
        return {
            kind: 'powered', percent: null, status: 'powered', dueDate: null, daysRemaining: null,
            batteryType: model.batteryType, summary: 'Vehicle powered — no battery to replace'
        };
    }

    const installed = toDateSafe(device.batteryInstalledDate) || toDateSafe(device.createdAt) || new Date();
    const lifespanMonths = model.estimatedLifespanMonths || 12;
    const dueDate = new Date(installed);
    dueDate.setMonth(dueDate.getMonth() + Math.round(lifespanMonths));
    const daysRemaining = Math.ceil((dueDate.getTime() - Date.now()) / 86400000);

    let percent: number;
    let kind: DeviceBatteryInfo['kind'];
    if (typeof device.reportedBatteryLevel === 'number' && device.reportedBatteryLevel >= 0) {
        percent = Math.round(device.reportedBatteryLevel);
        kind = 'live';
    } else {
        const totalDays = lifespanMonths * 30.5;
        const used = (Date.now() - installed.getTime()) / 86400000;
        percent = Math.max(0, Math.min(100, Math.round(((totalDays - used) / totalDays) * 100)));
        kind = 'estimated';
    }

    let status: DeviceBatteryInfo['status'] = 'good';
    if (percent <= 5 || daysRemaining <= 0) status = 'replace';
    else if (percent <= 20 || daysRemaining <= 30) status = 'due_soon';

    const summary = daysRemaining > 0
        ? `~${daysRemaining} days left (replace by ${dueDate.toLocaleDateString()})`
        : `Past replacement date (${dueDate.toLocaleDateString()})`;

    return { kind, percent, status, dueDate, daysRemaining, batteryType: model.batteryType, summary };
}

// ─────────────────────────────────────────────────────────────────────────────
// History throttling (identical logic runs server-side)
// ─────────────────────────────────────────────────────────────────────────────

export function shouldRecordHistoryPoint(
    role: TrackerDeviceRole,
    last: { lat: number; lng: number; at: Date } | null,
    cur: { lat: number; lng: number; at: Date; speedKph?: number | null }
): boolean {
    if (!last) return true;
    const mins = (cur.at.getTime() - last.at.getTime()) / 60000;
    if (mins <= 0) return false;
    const moved = haversineM(last, cur);
    const moving = (cur.speedKph ?? 0) >= TRACKING_POLICY.movingSpeedKph || moved >= TRACKING_POLICY.movementThresholdM;
    const interval = role === 'tag'
        ? (moving ? TRACKING_POLICY.tagMovingIntervalMin : TRACKING_POLICY.tagStationaryIntervalMin)
        : (moving ? TRACKING_POLICY.gatewayMovingIntervalMin : TRACKING_POLICY.gatewayStationaryIntervalMin);
    return mins >= interval - 0.01;
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore operations
// ─────────────────────────────────────────────────────────────────────────────

export function subscribeTrackerDevices(
    orgId: string,
    onData: (devices: TrackerDevice[]) => void,
    onError?: (err: Error) => void
): () => void {
    const q = query(collection(db, TRACKER_DEVICES_COLLECTION), where('org_id', '==', orgId));
    return onSnapshot(
        q,
        snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as TrackerDevice))),
        err => onError?.(err)
    );
}

export interface RegisterDeviceInput {
    modelId: string;
    label: string;
    identifier: string;
    serial?: string;
    parentDeviceId?: string | null;
    assignedToType: TrackerAssigneeType;
    assignedToId?: string | null;
    assignedToName?: string | null;
    linkedToolId?: string | null;
    linkedToolName?: string | null;
    batteryInstalledDate?: string;
    notes?: string;
}

export async function registerTrackerDevice(orgId: string, input: RegisterDeviceInput): Promise<string> {
    const model = getModel(input.modelId);
    const role = roleForModel(model);
    const identifier = role === 'tag' || role === 'gateway' ? formatMac(input.identifier) : input.identifier.trim();
    const ref = await addDoc(collection(db, TRACKER_DEVICES_COLLECTION), {
        org_id: orgId,
        modelId: model.id,
        role,
        label: input.label.trim(),
        identifier,
        identifierKey: normalizeIdentifier(identifier),
        serial: input.serial?.trim() || null,
        parentDeviceId: role === 'tag' ? input.parentDeviceId || null : null,
        assignedToType: input.assignedToType,
        assignedToId: input.assignedToId || null,
        assignedToName: input.assignedToName || null,
        linkedToolId: input.linkedToolId || null,
        linkedToolName: input.linkedToolName || null,
        batteryInstalledDate: input.batteryInstalledDate || new Date().toISOString(),
        reportedBatteryLevel: null,
        lastSeenAt: null,
        lastLocation: null,
        notes: input.notes?.trim() || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return ref.id;
}

export async function updateTrackerDevice(deviceId: string, patch: Partial<TrackerDevice>): Promise<void> {
    const clean: Record<string, any> = { ...patch, updatedAt: serverTimestamp() };
    delete clean.id;
    if (typeof patch.identifier === 'string') clean.identifierKey = normalizeIdentifier(patch.identifier);
    await updateDoc(doc(db, TRACKER_DEVICES_COLLECTION, deviceId), clean);
}

/** Removes a single unregistered-tag sighting from a gateway (after registering or dismissing it) */
export async function dismissUnregisteredTag(gateway: TrackerDevice, mac: string): Promise<void> {
    const key = normalizeIdentifier(mac);
    const remaining = (gateway.unregisteredTagsSeen || []).filter(t => normalizeIdentifier(t.mac) !== key);
    await updateDoc(doc(db, TRACKER_DEVICES_COLLECTION, gateway.id), {
        unregisteredTagsSeen: remaining.length ? remaining : deleteField()
    });
}

async function deleteHistory(deviceId: string): Promise<void> {
    const ref = collection(db, TRACKER_DEVICES_COLLECTION, deviceId, TRACKER_LOCATIONS_SUBCOLLECTION);
    // Delete in pages of 100 until empty
    for (let i = 0; i < 50; i++) {
        const snap = await getDocs(query(ref, fsLimit(100)));
        if (snap.empty) return;
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
}

/** Deletes a device + its history. If deleteChildren is true, child tags are also deleted; otherwise unassigned. */
export async function deleteTrackerDevice(
    device: TrackerDevice,
    children: TrackerDevice[] = [],
    deleteChildren = false
): Promise<void> {
    if (children.length) {
        if (deleteChildren) {
            for (const c of children) {
                try {
                    await deleteHistory(c.id);
                } catch (e) {
                    console.warn(`[deleteTrackerDevice] History delete warning for child ${c.id}:`, e);
                }
                const b = writeBatch(db);
                b.delete(doc(db, TRACKER_DEVICES_COLLECTION, c.id));
                await b.commit();
            }
        } else {
            const batch = writeBatch(db);
            children.forEach(c => batch.update(doc(db, TRACKER_DEVICES_COLLECTION, c.id), {
                parentDeviceId: null,
                updatedAt: serverTimestamp()
            }));
            await batch.commit();
        }
    }
    try {
        await deleteHistory(device.id);
    } catch (e) {
        console.warn(`[deleteTrackerDevice] History delete warning for ${device.id}:`, e);
    }
    const batch = writeBatch(db);
    batch.delete(doc(db, TRACKER_DEVICES_COLLECTION, device.id));
    await batch.commit();
}

export async function fetchLocationHistory(deviceId: string, since: Date, max = 3000): Promise<TrackerLocationPoint[]> {
    const q = query(
        collection(db, TRACKER_DEVICES_COLLECTION, deviceId, TRACKER_LOCATIONS_SUBCOLLECTION),
        where('recordedAt', '>=', Timestamp.fromDate(since)),
        orderBy('recordedAt', 'asc'),
        fsLimit(max)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as TrackerLocationPoint));
}

/** Manually log the current position for a device (e.g. from the dispatcher's phone at a jobsite) */
export async function logManualLocation(device: TrackerDevice, lat: number, lng: number, accuracyM?: number): Promise<void> {
    const now = new Date();
    const expire = new Date(now.getTime() + TRACKING_POLICY.retentionDays * 86400000);
    await addDoc(collection(db, TRACKER_DEVICES_COLLECTION, device.id, TRACKER_LOCATIONS_SUBCOLLECTION), {
        lat, lng,
        recordedAt: Timestamp.fromDate(now),
        source: 'manual',
        speedKph: null,
        expireAt: Timestamp.fromDate(expire)
    });
    await updateDoc(doc(db, TRACKER_DEVICES_COLLECTION, device.id), {
        lastSeenAt: Timestamp.fromDate(now),
        lastLocation: { lat, lng, accuracyM: accuracyM ?? null },
        lastHistoryAt: Timestamp.fromDate(now),
        lastHistoryLocation: { lat, lng },
        updatedAt: serverTimestamp()
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo fleet (sandbox) — realistic 7-day Oahu routes downsampled by TRACKING_POLICY
// ─────────────────────────────────────────────────────────────────────────────

const SHOP = { lat: 21.3245, lng: -157.884, name: 'Shop (Kalihi)' };
const JOBSITES = [
    { lat: 21.4022, lng: -157.7394, name: 'Kailua' },
    { lat: 21.3354, lng: -158.0868, name: 'Kapolei' },
    { lat: 21.2793, lng: -157.8292, name: 'Waikiki' },
    { lat: 21.3972, lng: -157.9752, name: 'Pearl City' },
    { lat: 21.2906, lng: -157.7124, name: 'Hawaii Kai' },
    { lat: 21.4513, lng: -158.0153, name: 'Mililani' },
    { lat: 21.418, lng: -157.8036, name: 'Kaneohe' },
    { lat: 21.3156, lng: -157.8008, name: 'Manoa' }
];

function mulberry32(seed: number) {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface RawSample { at: Date; lat: number; lng: number; speedKph: number; place?: string }

/** Builds a 5-minute resolution timeline for one vehicle over the past `days` days. */
function buildVehicleTimeline(seed: number, days: number): RawSample[] {
    const rand = mulberry32(seed);
    const STEP = 5 * 60000;
    const samples: RawSample[] = [];
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);

    let pos = { ...SHOP };
    let t = start.getTime();
    const pushPark = (until: number, place: string) => {
        while (t < until && t <= now.getTime()) {
            samples.push({ at: new Date(t), lat: pos.lat + (rand() - 0.5) * 0.00008, lng: pos.lng + (rand() - 0.5) * 0.00008, speedKph: 0, place });
            t += STEP;
        }
    };
    const drive = (dest: { lat: number; lng: number }) => {
        const distKm = haversineM(pos, dest) / 1000;
        const steps = Math.max(2, Math.round((distKm / 38) * 12)); // ~38 km/h avg, 12 steps per hour
        const from = { ...pos };
        for (let i = 1; i <= steps && t <= now.getTime(); i++) {
            const f = i / steps;
            const wobble = Math.sin(f * Math.PI) * 0.004;
            samples.push({
                at: new Date(t),
                lat: from.lat + (dest.lat - from.lat) * f + wobble * (rand() - 0.5),
                lng: from.lng + (dest.lng - from.lng) * f + wobble * (rand() - 0.5),
                speedKph: Math.round(28 + rand() * 30)
            });
            t += STEP;
        }
        pos = { ...pos, lat: dest.lat, lng: dest.lng };
    };

    for (let d = 0; d <= days; d++) {
        const dayStart = start.getTime() + d * 86400000;
        const isSunday = new Date(dayStart).getDay() === 0;
        const departAt = dayStart + (7 * 60 + Math.round(rand() * 30)) * 60000;
        pushPark(departAt, SHOP.name);
        if (!isSunday) {
            const jobs = 2 + Math.floor(rand() * 2);
            for (let j = 0; j < jobs; j++) {
                const site = JOBSITES[Math.floor(rand() * JOBSITES.length)];
                drive(site);
                pushPark(t + (75 + Math.round(rand() * 75)) * 60000, site.name);
            }
            drive(SHOP);
        }
        pushPark(dayStart + 86400000, SHOP.name);
        if (t > now.getTime()) break;
    }
    return samples;
}

function downsample(role: TrackerDeviceRole, raw: RawSample[]): RawSample[] {
    const out: RawSample[] = [];
    let last: { lat: number; lng: number; at: Date } | null = null;
    for (const s of raw) {
        if (shouldRecordHistoryPoint(role, last, s)) {
            out.push(s);
            last = { lat: s.lat, lng: s.lng, at: s.at };
        }
    }
    return out;
}

async function writeHistory(deviceId: string, points: RawSample[], source: TrackerLocationPoint['source'], viaDeviceId?: string) {
    const ref = collection(db, TRACKER_DEVICES_COLLECTION, deviceId, TRACKER_LOCATIONS_SUBCOLLECTION);
    for (let i = 0; i < points.length; i += 400) {
        const batch = writeBatch(db);
        points.slice(i, i + 400).forEach(p => {
            batch.set(doc(ref), {
                lat: p.lat,
                lng: p.lng,
                recordedAt: Timestamp.fromDate(p.at),
                source,
                speedKph: p.speedKph,
                viaDeviceId: viaDeviceId || null,
                expireAt: Timestamp.fromDate(new Date(p.at.getTime() + TRACKING_POLICY.retentionDays * 86400000))
            });
        });
        await batch.commit();
    }
}

export async function seedDemoFleet(
    orgId: string,
    people: Array<{ id: string; name: string }>,
    onProgress?: (msg: string) => void
): Promise<void> {
    const techA = people[0] || { id: 'demo-tech-1', name: 'Kai Nakamura' };
    const techB = people[1] || people[0] || { id: 'demo-tech-2', name: 'Leilani Akana' };
    const DAYS = 7;

    const vehicles = [
        {
            label: 'Van 1 — MG5 Gateway', imei: '869204049201948', tech: techA, seed: 11,
            tags: [
                { label: 'Ridgid Press Tool Tag', mac: 'AC233F8899A1', tool: 'Ridgid RP 351 Press Tool', battery: 82, months: 6 },
                { label: 'Pipe Threader Tag', mac: 'AC233F8899A2', tool: 'Ridgid 700 Power Drive', battery: null, months: 20 },
                { label: 'Drain Camera Tag', mac: 'AC233F8899A3', tool: 'SeeSnake Mini Camera', battery: 21, months: 41, leftBehind: true }
            ]
        },
        {
            label: 'Van 2 — MG5 Gateway', imei: '869204049207731', tech: techB, seed: 29,
            tags: [
                { label: 'Jetter Hose Reel Tag', mac: 'AC233F8899B1', tool: 'Spartan Jetter Reel', battery: 64, months: 14 },
                { label: 'Leak Detector Tag', mac: 'AC233F8899B2', tool: 'Gen-Ear LE Leak Detector', battery: null, months: 3 }
            ]
        }
    ];

    for (const v of vehicles) {
        onProgress?.(`Creating ${v.label}…`);
        const raw = buildVehicleTimeline(v.seed, DAYS);
        const gwPoints = downsample('gateway', raw);
        const lastRaw = raw[raw.length - 1];

        const gwRef = await addDoc(collection(db, TRACKER_DEVICES_COLLECTION), {
            org_id: orgId,
            modelId: 'minew_mg5',
            role: 'gateway',
            label: v.label,
            identifier: v.imei,
            identifierKey: normalizeIdentifier(v.imei),
            parentDeviceId: null,
            assignedToType: 'tech',
            assignedToId: v.tech.id,
            assignedToName: v.tech.name,
            batteryInstalledDate: new Date(Date.now() - 200 * 86400000).toISOString(),
            reportedBatteryLevel: null,
            lastSeenAt: Timestamp.fromDate(lastRaw.at),
            lastLocation: { lat: lastRaw.lat, lng: lastRaw.lng, speedKph: lastRaw.speedKph },
            lastHistoryAt: Timestamp.fromDate(gwPoints[gwPoints.length - 1].at),
            lastHistoryLocation: { lat: gwPoints[gwPoints.length - 1].lat, lng: gwPoints[gwPoints.length - 1].lng },
            ignitionOn: lastRaw.speedKph > 0,
            unregisteredTagsSeen: v.seed === 11 ? [{ mac: 'AC:23:3F:88:99:C7', rssi: -71, seenAt: new Date().toISOString() }] : [],
            notes: 'Demo gateway generated for sandbox testing',
            isDemo: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        onProgress?.(`Writing ${gwPoints.length} history points for ${v.label}…`);
        await writeHistory(gwRef.id, gwPoints, 'demo');

        for (const tag of v.tags) {
            // Left-behind tag: stops being heard after the vehicle leaves its 2nd-to-last day jobsite
            let tagRaw = raw;
            if ((tag as any).leftBehind) {
                const cutoff = Date.now() - 2 * 86400000;
                const leaveIdx = raw.findIndex((s, i) => s.at.getTime() > cutoff && s.place && s.place !== SHOP.name && raw[i + 1]?.speedKph > 0);
                if (leaveIdx > 0) tagRaw = raw.slice(0, leaveIdx + 1);
            }
            const tagPoints = downsample('tag', tagRaw);
            const tagLast = tagRaw[tagRaw.length - 1];
            const mac = formatMac(tag.mac);
            onProgress?.(`Writing ${tag.label} (${tagPoints.length} points)…`);
            const tagRef = await addDoc(collection(db, TRACKER_DEVICES_COLLECTION), {
                org_id: orgId,
                modelId: 'minew_ble_tag',
                role: 'tag',
                label: tag.label,
                identifier: mac,
                identifierKey: normalizeIdentifier(mac),
                parentDeviceId: gwRef.id,
                assignedToType: 'tech',
                assignedToId: v.tech.id,
                assignedToName: v.tech.name,
                linkedToolId: null,
                linkedToolName: tag.tool,
                batteryInstalledDate: new Date(Date.now() - tag.months * 30.5 * 86400000).toISOString(),
                reportedBatteryLevel: tag.battery,
                lastSeenAt: Timestamp.fromDate(tagLast.at),
                lastLocation: { lat: tagLast.lat, lng: tagLast.lng },
                lastRssi: -55 - Math.round(Math.random() * 20),
                lastSeenByDeviceId: gwRef.id,
                lastHistoryAt: Timestamp.fromDate(tagPoints[tagPoints.length - 1].at),
                lastHistoryLocation: { lat: tagPoints[tagPoints.length - 1].lat, lng: tagPoints[tagPoints.length - 1].lng },
                notes: '',
                isDemo: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            await writeHistory(tagRef.id, tagPoints, 'demo', gwRef.id);
        }
    }

    // An unassigned spare tag (registered but not yet placed under a gateway)
    await addDoc(collection(db, TRACKER_DEVICES_COLLECTION), {
        org_id: orgId,
        modelId: 'minew_ble_tag',
        role: 'tag',
        label: 'Spare Tag (unassigned)',
        identifier: 'AC:23:3F:88:99:FF',
        identifierKey: 'AC233F8899FF',
        parentDeviceId: null,
        assignedToType: 'none',
        assignedToId: null,
        assignedToName: null,
        batteryInstalledDate: new Date().toISOString(),
        reportedBatteryLevel: null,
        lastSeenAt: null,
        lastLocation: null,
        notes: '',
        isDemo: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

export async function removeDemoFleet(
    devices: TrackerDevice[],
    onProgress?: (msg: string) => void,
    orgId?: string
): Promise<void> {
    const isDemo = (d: TrackerDevice) => Boolean(
        d.isDemo ||
        (d.notes && d.notes.toLowerCase().includes('demo')) ||
        (d.label && d.label.toLowerCase().includes('demo'))
    );

    const fromList = devices.filter(isDemo);
    const seenIds = new Set(fromList.map(d => d.id));
    const allDemo: TrackerDevice[] = [...fromList];

    if (orgId) {
        try {
            const q = query(collection(db, TRACKER_DEVICES_COLLECTION), where('org_id', '==', orgId));
            const snap = await getDocs(q);
            snap.docs.forEach(docSnap => {
                const item = { id: docSnap.id, ...docSnap.data() } as TrackerDevice;
                if (!seenIds.has(item.id) && isDemo(item)) {
                    seenIds.add(item.id);
                    allDemo.push(item);
                }
            });
        } catch (e) {
            console.warn('[removeDemoFleet] org query fallback warning:', e);
        }
    }

    // Delete child tags first, then gateways
    const tags = allDemo.filter(d => d.role === 'tag');
    const gateways = allDemo.filter(d => d.role !== 'tag');
    const ordered = [...tags, ...gateways];

    for (const d of ordered) {
        onProgress?.(`Removing ${d.label}…`);
        try {
            await deleteHistory(d.id);
        } catch (histErr) {
            console.warn(`[removeDemoFleet] History deletion warning for ${d.id}:`, histErr);
        }
        try {
            const batch = writeBatch(db);
            batch.delete(doc(db, TRACKER_DEVICES_COLLECTION, d.id));
            await batch.commit();
        } catch (delErr) {
            console.error(`[removeDemoFleet] Failed to delete doc ${d.id}:`, delErr);
            throw delErr;
        }
    }
}
