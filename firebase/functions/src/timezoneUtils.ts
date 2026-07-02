/**
 * timezoneUtils.ts — Server-side timezone resolution for Cloud Functions.
 *
 * Resolves the correct IANA timezone for any US job/address.
 * Used by outboundCall, voice, appointment reminders, and any backend
 * function that needs to present times in the work-location's local timezone.
 *
 * Priority: Job timezone field → Address resolution → Org timezone → fallback
 */

// ─── US State → IANA Timezone Mapping ────────────────────────────────────────

const STATE_TIMEZONE_MAP: Record<string, string> = {
    // Eastern Time
    CT: "America/New_York", DE: "America/New_York", DC: "America/New_York",
    FL: "America/New_York", GA: "America/New_York", IN: "America/Indiana/Indianapolis",
    KY: "America/New_York", ME: "America/New_York", MD: "America/New_York",
    MA: "America/New_York", MI: "America/Detroit", NH: "America/New_York",
    NJ: "America/New_York", NY: "America/New_York", NC: "America/New_York",
    OH: "America/New_York", PA: "America/New_York", RI: "America/New_York",
    SC: "America/New_York", VT: "America/New_York", VA: "America/New_York",
    WV: "America/New_York",
    // Central Time
    AL: "America/Chicago", AR: "America/Chicago", IL: "America/Chicago",
    IA: "America/Chicago", KS: "America/Chicago", LA: "America/Chicago",
    MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago",
    NE: "America/Chicago", ND: "America/Chicago", OK: "America/Chicago",
    SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago",
    WI: "America/Chicago",
    // Mountain Time
    AZ: "America/Phoenix",
    CO: "America/Denver", ID: "America/Boise", MT: "America/Denver",
    NM: "America/Denver", UT: "America/Denver", WY: "America/Denver",
    // Pacific Time
    CA: "America/Los_Angeles", NV: "America/Los_Angeles",
    OR: "America/Los_Angeles", WA: "America/Los_Angeles",
    // Alaska
    AK: "America/Anchorage",
    // Hawaii
    HI: "Pacific/Honolulu",
    // US Territories
    PR: "America/Puerto_Rico", GU: "Pacific/Guam", VI: "America/Virgin",
    AS: "Pacific/Pago_Pago", MP: "Pacific/Guam",
};

const STATE_NAME_TO_ABBR: Record<string, string> = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
    california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
    florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
    illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
    kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
    massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
    missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
    virginia: "VA", washington: "WA", "west virginia": "WV",
    wisconsin: "WI", wyoming: "WY",
    "district of columbia": "DC", "puerto rico": "PR", guam: "GU",
};

// ─── Core Resolution Functions ───────────────────────────────────────────────

/**
 * Extract a US state abbreviation from an address string.
 */
export function extractStateFromAddress(address: string): string | null {
    if (!address) return null;

    // Try 2-letter state abbreviation before zip code
    const abbrMatch = address.match(/,\s*([A-Z]{2})\s*[\d$]/);
    if (abbrMatch && STATE_TIMEZONE_MAP[abbrMatch[1]]) return abbrMatch[1];

    // Without trailing digit
    const abbrMatch2 = address.match(/,\s*([A-Z]{2})\s*$/);
    if (abbrMatch2 && STATE_TIMEZONE_MAP[abbrMatch2[1]]) return abbrMatch2[1];

    // With space before zip
    const abbrMatch3 = address.match(/\b([A-Z]{2})\s+\d{5}/);
    if (abbrMatch3 && STATE_TIMEZONE_MAP[abbrMatch3[1]]) return abbrMatch3[1];

    // Full state name match
    const lower = address.toLowerCase();
    for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
        if (lower.includes(name)) return abbr;
    }

    return null;
}

/**
 * Resolve an IANA timezone from a US address string.
 */
export function resolveTimezoneFromAddress(address: string): string | null {
    const state = extractStateFromAddress(address);
    if (!state) return null;
    return STATE_TIMEZONE_MAP[state] || null;
}

/**
 * Get the effective timezone for a job document.
 * Priority: job.timezone → resolved from customer address → org timezone → fallback
 */
export function getJobTimezone(jobData: any, orgTimezone?: string): string {
    // 1. Explicit timezone on the job
    if (jobData?.timezone) return jobData.timezone;

    // 2. Resolve from customer address
    const address = jobData?.customer?.address;
    if (address) {
        const resolved = resolveTimezoneFromAddress(address);
        if (resolved) return resolved;
    }

    // 3. Org timezone fallback
    if (orgTimezone) return orgTimezone;

    // 4. Default fallback
    return "America/New_York";
}

/**
 * Get a short timezone abbreviation (e.g., "HST", "PST", "EST").
 */
export function getTimezoneAbbr(timezone: string): string {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            timeZoneName: "short"
        }).formatToParts(new Date());
        return parts.find(p => p.type === "timeZoneName")?.value || "";
    } catch {
        return "";
    }
}

/**
 * Format a Date in a specific timezone with a given format.
 */
export function formatInTimezone(
    date: Date,
    timezone: string,
    options?: Intl.DateTimeFormatOptions
): string {
    try {
        return new Intl.DateTimeFormat("en-US", {
            ...options,
            timeZone: timezone,
        }).format(date);
    } catch {
        return date.toLocaleString();
    }
}

/**
 * Format a date string in the given timezone for Firestore date field (YYYY-MM-DD).
 */
export function formatDateInTz(date: Date, tz: string): string {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
    const parts = formatter.formatToParts(date);
    const v: Record<string, string> = {};
    for (const p of parts) v[p.type] = p.value;
    return `${v.year}-${v.month}-${v.day}`;
}

/**
 * Get the current hour in a timezone (0-23).
 */
export function getCurrentHourInTz(tz: string): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
    }).formatToParts(new Date());
    const hourPart = parts.find(p => p.type === "hour");
    return parseInt(hourPart?.value || "0", 10);
}
