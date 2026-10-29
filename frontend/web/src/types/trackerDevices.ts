/**
 * trackerDevices.ts - Types for the Tracker Device Registry
 *
 * Hierarchy:
 *   Tracker Type (catalog model, e.g. "Minew MG5 Gateway", "Minew BLE Tag")
 *     └─ Registered Device (a physical unit owned by the org, e.g. "Van 3 Gateway")
 *          └─ Tag (BLE tag relayed by that gateway, e.g. "Pipe Threader Tag")
 *
 * Firestore:
 *   tracker_devices/{deviceId}                        → TrackerDevice
 *   tracker_devices/{deviceId}/tracker_locations/{id} → TrackerLocationPoint
 */

export type TrackerDeviceRole = 'gateway' | 'tag' | 'standalone';

export type TrackerAssigneeType = 'tech' | 'vehicle' | 'tool' | 'location' | 'none';

export interface TrackerLatLng {
    lat: number;
    lng: number;
    accuracyM?: number;
    speedKph?: number;
    heading?: number;
    address?: string;
}

export interface TrackerDevice {
    id: string;
    org_id: string;
    /** Catalog model id from TOP_TRACKER_CATALOG (e.g. minew_mg5, minew_ble_tag) */
    modelId: string;
    role: TrackerDeviceRole;
    /** Human friendly label, e.g. "Van 3 Gateway" or "Ridgid Press Tool Tag" */
    label: string;
    /** Primary hardware identifier: IMEI for gateways, MAC for BLE tags, serial otherwise */
    identifier: string;
    /** Uppercase alphanumeric form of identifier (colons/dashes stripped) used for hardware matching */
    identifierKey: string;
    serial?: string;
    /** For tags: id of the gateway device this tag is assigned to */
    parentDeviceId?: string | null;

    // Assignment
    assignedToType: TrackerAssigneeType;
    assignedToId?: string | null;
    assignedToName?: string | null;
    /** Optional link to a tools/{id} record this tag is physically attached to */
    linkedToolId?: string | null;
    linkedToolName?: string | null;

    // Battery
    batteryInstalledDate?: string; // ISO
    reportedBatteryLevel?: number | null; // 0-100 live reading from hardware
    reportedBatteryAt?: any;

    // Live state (written by ingest function)
    lastSeenAt?: any; // Timestamp
    lastLocation?: TrackerLatLng | null;
    lastRssi?: number | null;
    /** For tags: gateway that most recently heard this tag (may differ from parentDeviceId) */
    lastSeenByDeviceId?: string | null;
    ignitionOn?: boolean | null;
    lastHistoryAt?: any; // Timestamp of the most recent history point (used for throttling)
    lastHistoryLocation?: { lat: number; lng: number } | null;
    /** Gateways only: BLE tags heard recently that are not registered yet (for quick registration) */
    unregisteredTagsSeen?: Array<{ mac: string; rssi?: number | null; seenAt: string }>;
    /** Gateways only: broker login info written by the gatewayConnection function (password is never stored here) */
    connection?: {
        mqttUsername?: string;
        /** 'dispatchbox' = unit was prepared before shipping; 'self' = customer entered the settings */
        setupBy?: 'dispatchbox' | 'self';
        provisionedAt?: any;
    } | null;

    notes?: string;
    isDemo?: boolean;
    createdAt?: any;
    updatedAt?: any;
}

export interface TrackerLocationPoint {
    id: string;
    lat: number;
    lng: number;
    recordedAt: any; // Timestamp
    source: 'gps' | 'gateway_relay' | 'manual' | 'demo';
    speedKph?: number | null;
    rssi?: number | null;
    batteryLevel?: number | null;
    /** For tag points: which gateway reported it */
    viaDeviceId?: string | null;
    /** TTL field — Firestore TTL policy deletes the point after this date */
    expireAt?: any;
}
