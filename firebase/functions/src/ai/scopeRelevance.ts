/**
 * scopeRelevance.ts — Trade-domain relevance guard for AI quotes/estimates.
 * ─────────────────────────────────────────────────────────────────────────
 * Prevents parts from unrelated trades (e.g. a braided refrigerator water line)
 * from appearing on a quote for a different kind of work (e.g. a camera/NVR install).
 *
 * Parts can leak in from several places: Gemini hallucinations, org-learned
 * "added items" patterns, customer job history, or fuzzy inventory renames.
 * This module gives every quote path one deterministic, shared filter.
 *
 * NOTE: A mirror of this file lives at frontend/web/src/lib/scopeRelevance.ts —
 * keep the two in sync.
 */

export type TradeDomain =
    | 'plumbing'
    | 'electrical'
    | 'hvac'
    | 'low_voltage'
    | 'appliance'
    | 'roofing';

/** Strongly trade-specific product keywords (used for BOTH items and requests). */
const ITEM_KEYWORDS: Record<TradeDomain, string[]> = {
    plumbing: [
        'water line', 'supply line', 'supply hose', 'braided stainless', 'pex', 'cpvc', 'copper pipe', 'abs pipe',
        'drain pipe', 'p-trap', 'p trap', 'wax ring', 'flapper', 'fill valve', 'flush valve', 'faucet', 'toilet',
        'bidet', 'shut-off valve', 'shutoff valve', 'angle stop', 'compression fitting', 'sharkbite', 'plumber',
        'teflon', 'ptfe', 'thread seal tape', 'water heater', 'ice maker', 'garbage disposal', 'sink', 'shower',
        'tub spout', 'closet bolt', 'backflow', 'sump pump', 'drain', 'sewer', 'water softener', 'hose bib',
    ],
    electrical: [
        'breaker', 'romex', 'nm-b', 'receptacle', 'outlet', 'gfci', 'afci', 'junction box', 'wire nut',
        'electrical box', 'conduit', 'thhn', 'light switch', 'dimmer', 'load center', 'electrical panel',
        'light fixture', 'ceiling fan', 'surge protector',
    ],
    hvac: [
        'refrigerant', 'r-410a', 'r410a', 'r-22', 'r22', 'capacitor', 'contactor', 'line set', 'lineset',
        'condenser', 'evaporator coil', 'air filter', 'furnace', 'blower motor', 'thermostat', 'ductwork',
        'flex duct', 'mini split', 'mini-split', 'heat pump', 'condensate', 'air handler', 'ac unit', 'a/c unit',
    ],
    low_voltage: [
        'camera', 'nvr', 'dvr', 'cctv', 'cat5', 'cat 5', 'cat6', 'cat 6', 'rj45', 'rj-45', 'poe', 'ethernet',
        'coax', 'rg6', 'rg59', 'hdmi', 'keystone', 'patch panel', 'patch cable', 'network switch', 'router',
        'wifi', 'wi-fi', 'access point', 'doorbell', 'security system', 'alarm panel', 'low voltage', 'low-voltage',
        'speaker wire', 'surveillance', 'intercom',
    ],
    appliance: [
        'refrigerator', 'fridge', 'dishwasher', 'washing machine', 'clothes dryer', 'dryer vent', 'oven',
        'range hood', 'microwave', 'stove', 'cooktop', 'freezer',
    ],
    roofing: [
        'shingle', 'roofing', 'roof', 'flashing', 'gutter', 'downspout', 'underlayment', 'soffit', 'fascia',
    ],
};

/** Extra words that only signal intent in a customer REQUEST (not used to classify parts). */
const REQUEST_ONLY_KEYWORDS: Record<TradeDomain, string[]> = {
    plumbing: ['plumb', 'plumbing', 'plumber', 'leak', 'leaking', 'leaky', 'clog', 'clogged', 'pipe', 'water pressure',
        'drip', 'dripping', 'running water', 'no hot water'],
    electrical: ['electric', 'electrical', 'electrician', 'wiring', 'rewire', 'light', 'lighting', 'power outage',
        'no power', 'panel', 'switch', 'ev charger'],
    hvac: ['hvac', 'air conditioner', 'air conditioning', 'a/c', 'ac', 'heating', 'cooling', 'heater', 'vent', 'duct'],
    low_voltage: ['security', 'network', 'networking', 'internet', 'tv mount', 'smart home', 'speaker', 'cabling', 'data drop'],
    appliance: ['appliance', 'washer', 'dryer'],
    roofing: ['roof'],
};

/**
 * Adjacent trades that legitimately share parts.
 * e.g. a camera install may need an outlet; a fridge install needs a water line.
 */
const COMPATIBLE: Record<TradeDomain, TradeDomain[]> = {
    plumbing: ['plumbing', 'appliance'],
    electrical: ['electrical', 'low_voltage', 'hvac', 'appliance'],
    hvac: ['hvac', 'electrical'],
    low_voltage: ['low_voltage', 'electrical'],
    appliance: ['appliance', 'plumbing', 'electrical'],
    roofing: ['roofing'],
};

function normalize(text: string): string {
    return ` ${(text || '').toLowerCase().replace(/[^a-z0-9/\-\s]/g, ' ').replace(/\s+/g, ' ')} `;
}

function matchesKeyword(haystack: string, kw: string): boolean {
    // Whole-word match (allowing plural s/es) so "poe" doesn't match "poet" and "ac" doesn't match "access".
    const escaped = kw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}(s|es)?(?![a-z0-9])`, 'i').test(haystack);
}

/** Domains a PART/MATERIAL name belongs to. Empty set = neutral (screws, sealant, anchors...). */
export function detectItemDomains(itemName: string): Set<TradeDomain> {
    const text = normalize(itemName);
    const domains = new Set<TradeDomain>();
    (Object.keys(ITEM_KEYWORDS) as TradeDomain[]).forEach(d => {
        if (ITEM_KEYWORDS[d].some(kw => matchesKeyword(text, kw))) domains.add(d);
    });
    return domains;
}

/** Domains a customer REQUEST describes. Empty set = unknown → no filtering is applied. */
export function detectRequestDomains(requestText: string): Set<TradeDomain> {
    const text = normalize(requestText);
    const domains = new Set<TradeDomain>();
    (Object.keys(ITEM_KEYWORDS) as TradeDomain[]).forEach(d => {
        const kws = [...ITEM_KEYWORDS[d], ...REQUEST_ONLY_KEYWORDS[d]];
        if (kws.some(kw => matchesKeyword(text, kw))) domains.add(d);
    });
    return domains;
}

function allowedDomainsFor(requestDomains: Set<TradeDomain>): Set<TradeDomain> {
    const allowed = new Set<TradeDomain>();
    requestDomains.forEach(d => COMPATIBLE[d].forEach(c => allowed.add(c)));
    return allowed;
}

/**
 * True if an item is relevant to the request's trade(s).
 * Neutral items and requests with no detectable trade are always allowed.
 */
export function isItemRelevantToRequest(itemName: string, requestText: string): boolean {
    const itemDomains = detectItemDomains(itemName);
    if (itemDomains.size === 0) return true;
    const requestDomains = detectRequestDomains(requestText);
    if (requestDomains.size === 0) return true;
    const allowed = allowedDomainsFor(requestDomains);
    for (const d of itemDomains) if (allowed.has(d)) return true;
    return false;
}

/**
 * Remove parts belonging to trades unrelated to the customer's request.
 * Returns the kept parts; removed parts are logged.
 */
export function filterOutOfScopeParts<T extends { name?: string }>(
    parts: T[],
    requestText: string,
    logPrefix: string = '[ScopeRelevance]'
): T[] {
    if (!Array.isArray(parts) || parts.length === 0 || !requestText) return parts || [];
    return parts.filter(p => {
        const name = p?.name || '';
        if (!name) return true;
        const keep = isItemRelevantToRequest(name, requestText);
        if (!keep) {
            console.warn(`${logPrefix} Removed out-of-scope part "${name}" — trade [${[...detectItemDomains(name)].join(', ')}] does not match request trade [${[...detectRequestDomains(requestText)].join(', ')}]`);
        }
        return keep;
    });
}

/**
 * Guard for fuzzy inventory matching: reject an inventory record whose trade
 * conflicts with the AI-recommended part (prevents "Cat6 cable line" → "Refrigerator Water Line").
 */
export function isInventoryMatchCompatible(partName: string, inventoryName: string): boolean {
    const partDomains = detectItemDomains(partName);
    const invDomains = detectItemDomains(inventoryName);
    if (partDomains.size === 0 || invDomains.size === 0) {
        // Neutral part matched to a trade-specific inventory item is still suspicious
        // only if the inventory item is trade-specific and the part is not — allow, the
        // request-level filter will catch it on the renamed description.
        return true;
    }
    const allowed = allowedDomainsFor(partDomains);
    for (const d of invDomains) if (allowed.has(d)) return true;
    return false;
}

const DOMAIN_LABELS: Record<TradeDomain, string> = {
    plumbing: 'Plumbing',
    electrical: 'Electrical',
    hvac: 'HVAC',
    low_voltage: 'Low-Voltage / Security / Networking',
    appliance: 'Appliance',
    roofing: 'Roofing',
};

/**
 * Prompt block injected into every quote/estimate prompt. Anchors parts to the
 * TRADE OF THE REQUEST rather than the company's primary trade, so a plumbing
 * company quoting a camera install doesn't get plumbing parts.
 */
export function buildScopeRelevancePromptRules(requestText: string, companyTrade?: string): string {
    const domains = [...detectRequestDomains(requestText)];
    const detected = domains.length > 0 ? domains.map(d => DOMAIN_LABELS[d]).join(', ') : 'Not auto-detected — infer from the request';
    return `
══════════════════════════════════════════════
SCOPE RELEVANCE — MANDATORY
══════════════════════════════════════════════
Detected work type of THIS request: ${detected}${companyTrade ? `\nCompany's primary registered trade: ${companyTrade}` : ''}
1. Every item in "partsNeeded" MUST be physically required to complete THIS customer's request. If you cannot explain how an item is used in the step-by-step procedure for this request, DO NOT include it.
2. The company's primary trade, past jobs, customer history, and learned patterns are CONTEXT ONLY. NEVER add a part simply because it is common for the company's trade or appeared on a previous job.
3. If the request is a different kind of work than the company's primary trade (e.g. a plumbing company asked to install security cameras), quote the work the customer ACTUALLY asked for using the correct parts for that work. Do NOT search for or invent ${companyTrade || 'primary-trade'} components that the request does not need.
4. Never include parts from an unrelated trade (e.g. water lines, supply hoses, P-traps, or wax rings on a camera/NVR/network job; refrigerant or breakers on a faucet job).
5. Set jobClassification.tradeCategory to the trade of THE REQUEST, not the company.
6. Still produce a full estimate, but report in "serviceScope" whether the requested work falls within the company's listed services/trade. Set "inScope": false ONLY when the requested work is clearly a different trade or service than anything the company offers. If out of scope, explain why in "reason" (one sentence). The request will be flagged for a dispatcher to review before anything is sent to the customer.
`;
}

/** JSON snippet to include in AI output schemas so the model reports service scope. */
export const SERVICE_SCOPE_JSON_SCHEMA = `"serviceScope": {"inScope": true, "reason": "One sentence: why the request does or does not match the company's services"}`;

// ─────────────────────────────────────────────────────────────────────────
// Company service-scope assessment — flags requests the company may not do
// ─────────────────────────────────────────────────────────────────────────

/**
 * Which company trades can perform a request of a given trade.
 * Stricter than COMPATIBLE (which governs shared parts): an HVAC company is
 * NOT assumed to do general electrical work, but an electrician can do low-voltage.
 */
const SERVICE_SUPPORT: Record<TradeDomain, TradeDomain[]> = {
    plumbing: ['plumbing'],
    electrical: ['electrical'],
    hvac: ['hvac'],
    low_voltage: ['low_voltage', 'electrical'],
    appliance: ['appliance', 'plumbing', 'electrical'],
    roofing: ['roofing'],
};

/** Industry strings that mean "we do a bit of everything" — the rule check can't decide. */
const BROAD_INDUSTRY_KEYWORDS = [
    'general', 'handyman', 'contractor', 'home service', 'home services', 'home repair', 'maintenance',
    'property', 'multi-trade', 'multi trade', 'facilities', 'facility', 'remodel', 'remodeling', 'construction',
];

export interface ServiceScopeProfile {
    industry?: string;
    /** Free-text service names / categories / work categories the company offers. */
    services?: string[];
}

export interface ServiceScopeReview {
    /** 'needs_review' when flagged; 'in_scope' otherwise. Dispatchers set 'reviewed' in the UI. */
    status: 'needs_review' | 'in_scope' | 'reviewed';
    outOfScope: boolean;
    reason: string;
    requestTrades: string[];
    companyTrades: string[];
    /** Which signal produced the decision. */
    source: 'rules' | 'ai' | 'rules+ai' | 'none';
}

/**
 * Trades the company performs, inferred from its industry + listed services.
 *
 * Each service is classified on its own and counted. A trade only counts as
 * offered if it appears in at least a third as many services as the company's
 * dominant trade, so incidental words ("Smart Wi-Fi Thermostat", "Contactor Relay
 * Switch", "Condensate Drain Line") don't make an HVAC shop look like a
 * low-voltage, electrical, or plumbing company. Trades named in the industry
 * always count.
 */
export function detectCompanyDomains(profile?: ServiceScopeProfile): { domains: Set<TradeDomain>; broad: boolean } {
    const industry = (profile?.industry || '').trim();
    const services = (profile?.services || []).filter(Boolean);
    const industryNorm = normalize(industry);
    const broad = !industry || BROAD_INDUSTRY_KEYWORDS.some(kw => matchesKeyword(industryNorm, kw));

    const domains = detectRequestDomains(industry);
    const counts = new Map<TradeDomain, number>();
    services.forEach(s => detectRequestDomains(s).forEach(d => counts.set(d, (counts.get(d) || 0) + 1)));
    const max = Math.max(0, ...counts.values());
    const threshold = Math.max(1, Math.ceil(max / 3));
    counts.forEach((count, d) => { if (count >= threshold) domains.add(d); });
    return { domains, broad };
}

/**
 * Decide whether a customer request is outside the company's service scope.
 *
 * Deterministic trade rules are authoritative when they can decide (known request
 * trade + known, non-broad company trades). When they can't, or when the request
 * spans several trades and only some are supported, the AI's own judgement
 * (serviceScope.inScope) breaks the tie.
 */
export function assessServiceScope(
    requestText: string,
    profile?: ServiceScopeProfile,
    aiScope?: { inScope?: boolean; reason?: string } | null
): ServiceScopeReview {
    const requestDomains = detectRequestDomains(requestText || '');
    const { domains: companyDomains, broad } = detectCompanyDomains(profile);
    const requestTrades = [...requestDomains].map(d => DOMAIN_LABELS[d]);
    const companyTrades = [...companyDomains].map(d => DOMAIN_LABELS[d]);
    const aiSaysOut = aiScope?.inScope === false;
    const aiReason = (aiScope?.reason || '').trim();

    const result = (outOfScope: boolean, reason: string, source: ServiceScopeReview['source']): ServiceScopeReview => ({
        status: outOfScope ? 'needs_review' : 'in_scope',
        outOfScope,
        reason,
        requestTrades,
        companyTrades,
        source,
    });

    const rulesCanDecide = requestDomains.size > 0 && companyDomains.size > 0 && !broad;
    if (rulesCanDecide) {
        const supported = [...requestDomains].filter(d => SERVICE_SUPPORT[d].some(s => companyDomains.has(s)));
        if (supported.length === 0) {
            const reason = `Request looks like ${requestTrades.join(' / ')} work, but the company's listed services cover ${companyTrades.join(', ')}.`;
            return result(true, aiSaysOut && aiReason ? `${reason} AI: ${aiReason}` : reason, aiSaysOut ? 'rules+ai' : 'rules');
        }
        if (supported.length === requestDomains.size) {
            return result(false, 'Request matches the company\'s listed services.', 'rules');
        }
        // Mixed request — some trades supported, some not. Let the AI break the tie.
        if (aiSaysOut) {
            const unsupported = [...requestDomains].filter(d => !supported.includes(d)).map(d => DOMAIN_LABELS[d]);
            return result(true, aiReason || `Part of this request (${unsupported.join(', ')}) is outside the company's listed services.`, 'rules+ai');
        }
        return result(false, 'Request matches the company\'s listed services.', 'rules');
    }

    if (aiSaysOut) {
        return result(true, aiReason || 'AI judged this request to be outside the company\'s listed services.', 'ai');
    }
    return result(false, aiScope ? 'Request appears to match the company\'s services.' : 'Scope could not be determined automatically.', aiScope ? 'ai' : 'none');
}
