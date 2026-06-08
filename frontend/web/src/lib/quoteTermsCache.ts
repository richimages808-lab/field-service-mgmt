/**
 * Quote Terms Cache — Firestore-backed caching for system default T&C
 * ═══════════════════════════════════════════════════════════════════════════
 * Caches the generic, jurisdiction-specific system default terms in Firestore
 * so they are computed once and shared across ALL SaaS customers in the same
 * jurisdiction.
 *
 * Cache location: platform/termsCache/jurisdictions/{jurisdictionCode}
 *
 * Flow:
 *   1. On first use for a jurisdiction → compute from hardcoded defaults
 *   2. Write to Firestore cache
 *   3. All subsequent orgs in that jurisdiction → read from cache (no recompute)
 *   4. In-memory Map for same-session reads (avoid Firestore round-trips)
 *
 * The cache stores the "template" terms — generic versions with placeholder
 * values for quote-specific fields (deposit, total, etc.) which get resolved
 * at render time. Org-specific customizations are NEVER cached here.
 */

import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
    TermItem,
    TermCategory,
    generateSystemDefaultTerms,
    getCountryForJurisdiction,
    ALL_JURISDICTIONS
} from './quoteTerms';

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface CachedTermsDoc {
    jurisdictionCode: string;
    country: string;
    /** The static terms (with default placeholder values for quote-specific fields) */
    terms: TermItem[];
    /** ISO string of when this was cached */
    cachedAt: string;
    /** Cache version — bump when the hardcoded terms change */
    cacheVersion: number;
    /** Server timestamp for Firestore */
    updatedAt?: any;
}

/** Current cache version — increment this when hardcoded terms in quoteTerms.ts change */
const CACHE_VERSION = 1;

// ═══════════════════════════════════════════════════════════════════════════
//  IN-MEMORY CACHE (session-level — avoids Firestore reads for repeat access)
// ═══════════════════════════════════════════════════════════════════════════

const memoryCache = new Map<string, TermItem[]>();

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get cached system default terms for a jurisdiction.
 *
 * Resolution order:
 *   1. In-memory cache (instant, same-session)
 *   2. Firestore cache (shared across all orgs/users)
 *   3. Compute from hardcoded defaults → write to both caches
 *
 * The returned terms use standard placeholder values (no deposit, $1000 total,
 * 30-day validity). Quote-specific values (deposit amount, actual total, etc.)
 * should be applied AFTER caching via `applyQuoteSpecificValues()`.
 */
export async function getCachedJurisdictionTerms(jurisdictionCode: string): Promise<TermItem[]> {
    // 1. Check in-memory cache
    const memCached = memoryCache.get(jurisdictionCode);
    if (memCached) {
        return memCached;
    }

    // 2. Check Firestore cache
    try {
        const cacheRef = doc(db, 'platform', 'termsCache', 'jurisdictions', jurisdictionCode);
        const cacheSnap = await getDoc(cacheRef);

        if (cacheSnap.exists()) {
            const data = cacheSnap.data() as CachedTermsDoc;

            // Validate cache version — stale cache gets recomputed
            if (data.cacheVersion === CACHE_VERSION && data.terms?.length > 0) {
                memoryCache.set(jurisdictionCode, data.terms);
                return data.terms;
            }
        }
    } catch (err) {
        console.warn('[TermsCache] Firestore read failed, computing from defaults:', err);
        // Non-fatal — fall through to compute
    }

    // 3. Cache miss — compute from hardcoded defaults and write to cache
    const terms = computeGenericDefaults(jurisdictionCode);
    memoryCache.set(jurisdictionCode, terms);

    // Write to Firestore (fire-and-forget — don't block the UI)
    writeCacheToFirestore(jurisdictionCode, terms).catch(err => {
        console.warn('[TermsCache] Failed to write cache to Firestore:', err);
    });

    return terms;
}

/**
 * Apply quote-specific values (deposit, total, valid days) to cached generic terms.
 * This replaces the placeholder values with actual quote data.
 */
export function applyQuoteSpecificValues(
    cachedTerms: TermItem[],
    config: {
        requiresDeposit: boolean;
        depositAmount?: number;
        total: number;
        validDays: number;
        companyName?: string;
    }
): TermItem[] {
    return cachedTerms.map(term => {
        let text = term.text;

        // Replace deposit/payment terms
        if (term.id === 'payment-completion' && config.requiresDeposit && config.depositAmount) {
            const remaining = Math.max(0, config.total - config.depositAmount);
            return {
                ...term,
                id: 'payment-deposit',
                text: `A deposit of $${config.depositAmount.toFixed(2)} is due upon acceptance. The remaining balance of $${remaining.toFixed(2)} is due upon completion of services.`
            };
        }

        // Replace placeholder values
        text = text.replace(/\$1000\.00/g, `$${config.total.toFixed(2)}`);
        text = text.replace(/30 days from the date of issue/g, `${config.validDays} days from the date of issue`);

        if (config.companyName) {
            text = text.replace(/Service Provider/g, config.companyName);
        }

        if (text === term.text) return term;
        return { ...term, text };
    });
}

/**
 * Pre-warm the cache for all jurisdictions.
 * Useful for admin/platform initialization.
 * Can be called from OrganizationSettings or a platform admin page.
 */
export async function prewarmAllJurisdictionCaches(): Promise<{ cached: number; skipped: number }> {
    let cached = 0;
    let skipped = 0;

    for (const jurisdiction of ALL_JURISDICTIONS) {
        try {
            const cacheRef = doc(db, 'platform', 'termsCache', 'jurisdictions', jurisdiction.code);
            const cacheSnap = await getDoc(cacheRef);

            if (cacheSnap.exists() && (cacheSnap.data() as CachedTermsDoc).cacheVersion === CACHE_VERSION) {
                skipped++;
                continue;
            }

            const terms = computeGenericDefaults(jurisdiction.code);
            await writeCacheToFirestore(jurisdiction.code, terms);
            cached++;
        } catch (err) {
            console.error(`[TermsCache] Failed to cache ${jurisdiction.code}:`, err);
            skipped++;
        }
    }

    return { cached, skipped };
}

/**
 * Invalidate the cache for a specific jurisdiction (e.g., when platform terms are updated).
 */
export function invalidateJurisdictionCache(jurisdictionCode: string): void {
    memoryCache.delete(jurisdictionCode);
}

/**
 * Clear all in-memory caches (useful for testing or logout).
 */
export function clearAllTermsCaches(): void {
    memoryCache.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
//  INTERNALS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the generic system default terms for a jurisdiction using
 * standard placeholder values. These are the "template" terms that
 * get cached and shared across all customers.
 */
function computeGenericDefaults(jurisdictionCode: string): TermItem[] {
    return generateSystemDefaultTerms({
        jurisdictionState: jurisdictionCode,
        country: getCountryForJurisdiction(jurisdictionCode),
        requiresDeposit: false,
        depositAmount: undefined,
        total: 1000,        // Placeholder — replaced at render time
        validDays: 30,      // Placeholder — replaced at render time
        warrantyDays: 90,
        cancellationHours: 24,
        disputeResolutionDays: 30,
    });
}

/**
 * Write computed terms to the Firestore cache collection.
 */
async function writeCacheToFirestore(jurisdictionCode: string, terms: TermItem[]): Promise<void> {
    const cacheRef = doc(db, 'platform', 'termsCache', 'jurisdictions', jurisdictionCode);
    const cacheDoc: CachedTermsDoc = {
        jurisdictionCode,
        country: getCountryForJurisdiction(jurisdictionCode),
        terms,
        cachedAt: new Date().toISOString(),
        cacheVersion: CACHE_VERSION,
        updatedAt: serverTimestamp(),
    };
    await setDoc(cacheRef, cacheDoc);
}
