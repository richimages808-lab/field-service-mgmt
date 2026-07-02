/**
 * timezoneUtils.ts — Timezone resolution utilities for multi-timezone field service operations.
 *
 * Resolves the correct IANA timezone for any US job/address using state extraction.
 * Used by CreateJob, CalendarBoard, and anywhere times need to be displayed
 * in the work-location's local timezone.
 *
 * Priority: Job address timezone → Org timezone → Browser timezone
 */

import type { Job } from '../types';

// ─── US State → IANA Timezone Mapping ────────────────────────────────────────
// Covers all 50 states, DC, and US territories.
// States that span multiple timezones use the most populous zone.

const STATE_TIMEZONE_MAP: Record<string, string> = {
    // Eastern Time
    CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York',
    FL: 'America/New_York', GA: 'America/New_York', IN: 'America/Indiana/Indianapolis',
    KY: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York',
    MA: 'America/New_York', MI: 'America/Detroit', NH: 'America/New_York',
    NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York',
    OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York',
    SC: 'America/New_York', VT: 'America/New_York', VA: 'America/New_York',
    WV: 'America/New_York',
    // Central Time
    AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago',
    IA: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago',
    MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago',
    NE: 'America/Chicago', ND: 'America/Chicago', OK: 'America/Chicago',
    SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
    WI: 'America/Chicago',
    // Mountain Time
    AZ: 'America/Phoenix', // No DST
    CO: 'America/Denver', ID: 'America/Boise', MT: 'America/Denver',
    NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver',
    // Pacific Time
    CA: 'America/Los_Angeles', NV: 'America/Los_Angeles',
    OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',
    // Alaska
    AK: 'America/Anchorage',
    // Hawaii
    HI: 'Pacific/Honolulu',
    // US Territories
    PR: 'America/Puerto_Rico', GU: 'Pacific/Guam', VI: 'America/Virgin',
    AS: 'Pacific/Pago_Pago', MP: 'Pacific/Guam',
};

// Full state name → abbreviation mapping for text extraction
const STATE_NAME_TO_ABBR: Record<string, string> = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR',
    california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
    florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
    illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
    kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
    massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
    missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
    'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
    ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
    'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
    tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
    virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
    wisconsin: 'WI', wyoming: 'WY',
    'district of columbia': 'DC', 'puerto rico': 'PR', guam: 'GU',
};

// ─── Core Resolution Functions ───────────────────────────────────────────────

/**
 * Extract a US state abbreviation from an address string.
 * Handles formats like:
 *   "123 Main St, Honolulu, HI 96815"
 *   "456 Oak Ave, Los Angeles, California 90001"
 *   "789 Elm St, Austin, TX"
 */
export function extractStateFromAddress(address: string): string | null {
    if (!address) return null;

    // Try to match 2-letter state abbreviation (e.g., "HI", "CA", "TX")
    // Look for: comma + optional space + 2 uppercase letters + space/digit/end
    const abbrMatch = address.match(/,\s*([A-Z]{2})\s*[\d$]/);
    if (abbrMatch && STATE_TIMEZONE_MAP[abbrMatch[1]]) {
        return abbrMatch[1];
    }

    // Also try without trailing digit (e.g., "Austin, TX")
    const abbrMatch2 = address.match(/,\s*([A-Z]{2})\s*$/);
    if (abbrMatch2 && STATE_TIMEZONE_MAP[abbrMatch2[1]]) {
        return abbrMatch2[1];
    }

    // Try with space before zip: "Honolulu, HI 96815"
    const abbrMatch3 = address.match(/\b([A-Z]{2})\s+\d{5}/);
    if (abbrMatch3 && STATE_TIMEZONE_MAP[abbrMatch3[1]]) {
        return abbrMatch3[1];
    }

    // Try full state name match
    const lower = address.toLowerCase();
    for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
        if (lower.includes(name)) {
            return abbr;
        }
    }

    return null;
}

/**
 * Resolve an IANA timezone from a US address string.
 * Returns null if the state cannot be determined.
 */
export function resolveTimezoneFromAddress(address: string): string | null {
    const state = extractStateFromAddress(address);
    if (!state) return null;
    return STATE_TIMEZONE_MAP[state] || null;
}

/**
 * Get the effective timezone for a job.
 * Priority: job.timezone → resolved from job address → org timezone → browser timezone
 */
export function getJobTimezone(job: Job, orgTimezone?: string): string {
    // 1. Explicit timezone on the job (best — already resolved)
    if ((job as any).timezone) return (job as any).timezone;

    // 2. Resolve from job's customer address
    const address = job.customer?.address;
    if (address) {
        const resolved = resolveTimezoneFromAddress(address);
        if (resolved) return resolved;
    }

    // 3. Org timezone fallback
    if (orgTimezone) return orgTimezone;

    // 4. Browser timezone last resort
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get a short timezone abbreviation (e.g., "HST", "PT", "ET").
 */
export function getTimezoneAbbr(timezone: string): string {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'short'
        }).formatToParts(new Date());
        return parts.find(p => p.type === 'timeZoneName')?.value || '';
    } catch {
        return '';
    }
}

/**
 * Format a Date in a specific timezone.
 * @param date - The date to format
 * @param timezone - IANA timezone string
 * @param options - Intl.DateTimeFormat options
 */
export function formatInTimezone(
    date: Date,
    timezone: string,
    options?: Intl.DateTimeFormatOptions
): string {
    try {
        return new Intl.DateTimeFormat('en-US', {
            ...options,
            timeZone: timezone,
        }).format(date);
    } catch {
        return date.toLocaleString();
    }
}

/**
 * Check if two IANA timezone strings represent different offsets at the current time.
 * Returns true if the timezones currently have different UTC offsets.
 */
export function timezonesAreDifferent(tz1: string, tz2: string): boolean {
    if (tz1 === tz2) return false;
    try {
        const now = new Date();
        const offset1 = getTimezoneOffsetMinutes(now, tz1);
        const offset2 = getTimezoneOffsetMinutes(now, tz2);
        return offset1 !== offset2;
    } catch {
        return tz1 !== tz2;
    }
}

/**
 * Get the UTC offset in minutes for a timezone at a specific date.
 */
function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: timezone });
    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    return (tzDate.getTime() - utcDate.getTime()) / 60000;
}
