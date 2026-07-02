/**
 * Global Search Service
 * Queries multiple Firestore collections in parallel to provide unified search
 * across tracking codes, jobs, quotes, customers, and invoices.
 */
import { db } from '../firebase';
import {
    collection, query, where, getDocs, doc, getDoc, limit,
} from 'firebase/firestore';

// ─── Result Types ──────────────────────────────────────────
export type SearchResultCategory = 'tracking' | 'jobs' | 'quotes' | 'customers' | 'invoices';

export interface SearchResult {
    id: string;
    category: SearchResultCategory;
    title: string;
    subtitle: string;
    status?: string;
    statusColor?: string;
    navigateTo: string;
    meta?: Record<string, string>;
}

export interface SearchResults {
    tracking: SearchResult[];
    jobs: SearchResult[];
    quotes: SearchResult[];
    customers: SearchResult[];
    invoices: SearchResult[];
    totalCount: number;
}

const EMPTY_RESULTS: SearchResults = {
    tracking: [],
    jobs: [],
    quotes: [],
    customers: [],
    invoices: [],
    totalCount: 0,
};

// ─── Status styling helpers ────────────────────────────────
const JOB_STATUS_COLORS: Record<string, string> = {
    pending: '#6b7280',
    unscheduled: '#6b7280',
    quote_pending: '#7c3aed',
    scheduled: '#2563eb',
    in_progress: '#d97706',
    completed: '#059669',
    cancelled: '#dc2626',
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
    draft: '#6b7280',
    sent: '#2563eb',
    viewed: '#7c3aed',
    approved: '#059669',
    declined: '#dc2626',
    tech_review: '#d97706',
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
    draft: '#6b7280',
    sent: '#2563eb',
    paid: '#059669',
    overdue: '#dc2626',
    void: '#6b7280',
    partial: '#d97706',
};

// ─── Token resource type → navigation path mapping ─────────
function tokenResourcePath(resourceType: string, resourceId: string): string {
    switch (resourceType) {
        case 'ticket':
        case 'job':
            return `/jobs/${resourceId}`;
        case 'quote':
            return `/quotes/${resourceId}`;
        case 'invoice':
            return `/invoices/${resourceId}`;
        case 'appointment':
            return `/jobs/${resourceId}`;
        default:
            return `/jobs/${resourceId}`;
    }
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
    ticket: 'Ticket',
    job: 'Job',
    quote: 'Quote',
    invoice: 'Invoice',
    appointment: 'Appointment',
};

// ─── Main Search Function ──────────────────────────────────
export async function globalSearch(searchTerm: string, orgId: string): Promise<SearchResults> {
    if (!searchTerm || searchTerm.trim().length < 2 || !orgId) {
        return EMPTY_RESULTS;
    }

    const q = searchTerm.trim();
    const qUpper = q.toUpperCase();
    const qLower = q.toLowerCase();

    // Run all searches in parallel
    const [trackingResults, jobResults, quoteResults, customerResults, invoiceResults] = await Promise.all([
        searchAccessTokens(qUpper, orgId),
        searchJobs(qLower, orgId),
        searchQuotes(q, qLower, orgId),
        searchCustomers(qLower, orgId),
        searchInvoices(qLower, orgId),
    ]);

    // If we got a tracking code match, also remove duplicate entries from the resource-specific results
    const trackingResourceIds = new Set(trackingResults.map(r => r.meta?.resourceId).filter(Boolean));

    const dedupedJobs = jobResults.filter(r => !trackingResourceIds.has(r.id));
    const dedupedQuotes = quoteResults.filter(r => !trackingResourceIds.has(r.id));
    const dedupedInvoices = invoiceResults.filter(r => !trackingResourceIds.has(r.id));

    const results: SearchResults = {
        tracking: trackingResults,
        jobs: dedupedJobs,
        quotes: dedupedQuotes,
        customers: customerResults,
        invoices: dedupedInvoices,
        totalCount: trackingResults.length + dedupedJobs.length + dedupedQuotes.length + customerResults.length + dedupedInvoices.length,
    };

    return results;
}

// ─── Access Token Lookup ───────────────────────────────────
async function searchAccessTokens(tokenUpper: string, orgId: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Only attempt exact token lookup if it looks like a token (4-10 alphanumeric chars)
    if (/^[A-Z0-9]{4,10}$/.test(tokenUpper)) {
        try {
            const tokenDoc = await getDoc(doc(db, 'access_tokens', tokenUpper));
            if (tokenDoc.exists()) {
                const data = tokenDoc.data();
                // Verify it belongs to this org
                if (data.orgId === orgId) {
                    const resourceType = data.resourceType || 'ticket';
                    results.push({
                        id: tokenUpper,
                        category: 'tracking',
                        title: `${RESOURCE_TYPE_LABELS[resourceType] || 'Resource'} — ${tokenUpper}`,
                        subtitle: data.customerName
                            ? `${data.customerName}${data.customerEmail ? ' · ' + data.customerEmail : ''}`
                            : data.customerEmail || data.customerPhone || 'No customer info',
                        status: data.status || 'active',
                        statusColor: data.status === 'active' ? '#059669' : '#6b7280',
                        navigateTo: tokenResourcePath(resourceType, data.resourceId),
                        meta: {
                            resourceType,
                            resourceId: data.resourceId,
                        },
                    });
                }
            }
        } catch (err) {
            console.warn('[GlobalSearch] Token lookup failed:', err);
        }
    }

    return results;
}

// ─── Jobs Search ───────────────────────────────────────────
async function searchJobs(qLower: string, orgId: string): Promise<SearchResult[]> {
    try {
        const jobsQ = query(collection(db, 'jobs'), where('org_id', '==', orgId));
        const snap = await getDocs(jobsQ);

        const results: SearchResult[] = [];
        snap.docs.forEach(d => {
            const data = d.data();
            const idPrefix = d.id.slice(0, 8).toLowerCase();

            const matchFields = [
                data.customer?.name,
                data.customer?.phone,
                data.customer?.email,
                data.customer?.address,
                data.request?.description,
                data.request?.type,
                data.assigned_tech_name,
                data.accessToken,
                d.id,
            ].filter(Boolean);

            const matches = matchFields.some(f => f.toLowerCase().includes(qLower)) || idPrefix.includes(qLower);

            if (matches) {
                const statusLabel = (data.status || 'pending').replace(/_/g, ' ');
                results.push({
                    id: d.id,
                    category: 'jobs',
                    title: data.customer?.name || 'Unknown Customer',
                    subtitle: [
                        data.request?.type || data.category || '',
                        data.assigned_tech_name ? `Tech: ${data.assigned_tech_name}` : '',
                        data.customer?.address ? data.customer.address.split(',')[0] : '',
                    ].filter(Boolean).join(' · '),
                    status: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
                    statusColor: JOB_STATUS_COLORS[data.status] || '#6b7280',
                    navigateTo: `/jobs/${d.id}`,
                });
            }
        });

        return results.slice(0, 8); // Cap at 8 results
    } catch (err) {
        console.warn('[GlobalSearch] Jobs search failed:', err);
        return [];
    }
}

// ─── Quotes Search ─────────────────────────────────────────
async function searchQuotes(q: string, qLower: string, orgId: string): Promise<SearchResult[]> {
    try {
        const quotesQ = query(collection(db, 'quotes'), where('org_id', '==', orgId));
        const snap = await getDocs(quotesQ);

        const results: SearchResult[] = [];
        snap.docs.forEach(d => {
            const data = d.data();

            const matchFields = [
                data.quoteNumber,
                data.customer?.name,
                data.customer?.email,
                data.customer?.phone,
                data.accessToken,
                d.id,
            ].filter(Boolean);

            const matches = matchFields.some(f => f.toLowerCase().includes(qLower));

            if (matches) {
                const statusLabel = (data.status || 'draft').replace(/_/g, ' ');
                results.push({
                    id: d.id,
                    category: 'quotes',
                    title: `${data.quoteNumber || 'Quote'} — ${data.customer?.name || 'Unknown'}`,
                    subtitle: `$${(data.total || 0).toFixed(2)}${data.customer?.email ? ' · ' + data.customer.email : ''}`,
                    status: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
                    statusColor: QUOTE_STATUS_COLORS[data.status] || '#6b7280',
                    navigateTo: `/quotes/${d.id}`,
                });
            }
        });

        return results.slice(0, 8);
    } catch (err) {
        console.warn('[GlobalSearch] Quotes search failed:', err);
        return [];
    }
}

// ─── Customers Search ──────────────────────────────────────
async function searchCustomers(qLower: string, orgId: string): Promise<SearchResult[]> {
    try {
        const customersQ = query(collection(db, 'customers'), where('org_id', '==', orgId));
        const snap = await getDocs(customersQ);

        const results: SearchResult[] = [];
        snap.docs.forEach(d => {
            const data = d.data();

            const matchFields = [
                data.name,
                data.email,
                data.phone,
                data.companyName,
                data.alternatePhone,
                data.address,
            ].filter(Boolean);

            const matches = matchFields.some(f => f.toLowerCase().includes(qLower));

            if (matches) {
                results.push({
                    id: d.id,
                    category: 'customers',
                    title: data.name || 'Unknown Customer',
                    subtitle: [
                        data.email,
                        data.phone,
                        data.companyName ? `(${data.companyName})` : '',
                    ].filter(Boolean).join(' · '),
                    status: data.status === 'active' ? 'Active' : data.status,
                    statusColor: data.status === 'active' ? '#059669' : '#6b7280',
                    navigateTo: `/contacts/${d.id}`,
                });
            }
        });

        return results.slice(0, 8);
    } catch (err) {
        console.warn('[GlobalSearch] Customers search failed:', err);
        return [];
    }
}

// ─── Invoices Search ───────────────────────────────────────
async function searchInvoices(qLower: string, orgId: string): Promise<SearchResult[]> {
    try {
        const invoicesQ = query(collection(db, 'invoices'), where('org_id', '==', orgId));
        const snap = await getDocs(invoicesQ);

        const results: SearchResult[] = [];
        snap.docs.forEach(d => {
            const data = d.data();
            const invoiceNumber = `INV-${d.id.slice(0, 6).toUpperCase()}`;

            const matchFields = [
                invoiceNumber,
                data.customer?.name,
                data.customer?.email,
                data.customer_name, // legacy field
                data.accessToken,
                d.id,
            ].filter(Boolean);

            const matches = matchFields.some(f => f.toLowerCase().includes(qLower));

            if (matches) {
                const statusLabel = (data.status || 'draft');
                results.push({
                    id: d.id,
                    category: 'invoices',
                    title: `${invoiceNumber} — ${data.customer?.name || data.customer_name || 'Unknown'}`,
                    subtitle: `$${(data.total || data.amount || 0).toFixed(2)}${data.status === 'overdue' ? ' · OVERDUE' : ''}`,
                    status: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
                    statusColor: INVOICE_STATUS_COLORS[data.status] || '#6b7280',
                    navigateTo: `/invoices/${d.id}`,
                });
            }
        });

        return results.slice(0, 8);
    } catch (err) {
        console.warn('[GlobalSearch] Invoices search failed:', err);
        return [];
    }
}
