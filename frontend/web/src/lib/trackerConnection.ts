/**
 * trackerConnection.ts - Client wrappers for gateway broker logins (see functions/src/trackerBroker.ts)
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface GatewayConnectionSettings {
    host: string;
    port: number;
    tls: boolean;
    username: string;
    password: string;
    clientId: string;
    /** 'prepared' = DispatchBox loaded these settings before shipping */
    source: 'prepared' | 'self';
}

export async function getGatewayConnection(deviceId: string, action: 'get' | 'reset' = 'get'): Promise<GatewayConnectionSettings> {
    const fn = httpsCallable<{ deviceId: string; action: string }, GatewayConnectionSettings>(functions, 'gatewayConnection');
    const res = await fn({ deviceId, action });
    return res.data;
}

export interface PlatformGatewayRow {
    mac: string;
    username: string;
    source: 'prepared' | 'self';
    label: string | null;
    orgId: string | null;
    orgName: string | null;
    deviceLabel: string | null;
    lastSeenAt: string | null;
    lastMessageAt: string | null;
    createdAt: string | null;
}

export interface PlatformOverview {
    apiConfigured: boolean;
    broker: { host: string; port: number };
    platformKey: { last4: string | null; orgId: string | null; lastUsedAt: string | null } | null;
    gateways: PlatformGatewayRow[];
}

export async function trackerPlatformAdmin<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const fn = httpsCallable<Record<string, unknown>, T>(functions, 'trackerPlatformAdmin');
    const res = await fn({ action, ...payload });
    return res.data;
}

/** Friendly message from a Firebase callable error */
export function callableErrorMessage(err: any, fallback: string): string {
    const msg = String(err?.message || '').trim();
    return msg && msg.toLowerCase() !== 'internal' ? msg : fallback;
}
