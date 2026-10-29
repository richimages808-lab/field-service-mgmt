/**
 * invoiceBuilder.ts — Builds the invoice for a completed job.
 *
 * FIXED PRICE  → the approved quote's line items
 *               + approved on-site scope amendments + approved overruns
 *               − deposit already paid. Tax uses the quote's tax rate.
 *
 * TIME & MATERIALS → actual time on site × approved labor rate
 *               + materials used × (1 + approved markup)
 *               + trip fee + mileage + other charges + approved amendments
 *               − deposit. Flags it if it goes over the customer's "not to exceed".
 *
 * Parts and labor captured at completion are ALWAYS kept on the job as cost
 * (for profit reporting) regardless of how the customer is billed.
 */

import type { Job, Quote, QuoteLineItem, BillingType } from '../types';

export interface InvoiceLine {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    total: number;
    taxable: boolean;
    kind: 'quote' | 'amendment' | 'overrun' | 'labor' | 'material' | 'trip' | 'mileage' | 'other' | 'discount';
}

export interface BuiltInvoice {
    billingType: BillingType;
    items: InvoiceLine[];
    subtotal: number;
    tax_rate: number;      // decimal, e.g. 0.04712
    tax_amount: number;
    total: number;
    deposit_applied: number;
    balance_due: number;
    exceedsCap: boolean;
    notes: string[];
}

export interface ApprovedOverrun {
    reason?: string;
    additionalItems?: Array<Pick<QuoteLineItem, 'description' | 'quantity' | 'unitPrice'> & { total?: number; taxable?: boolean }>;
    additionalTotal?: number;
}

export interface BuildInvoiceInput {
    job: Partial<Job> & Record<string, any>;
    quote?: (Partial<Quote> & Record<string, any>) | null;
    approvedOverruns?: ApprovedOverrun[];
    defaults?: { laborRate: number; materialMarkup: number; taxRate?: number };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function line(kind: InvoiceLine['kind'], description: string, quantity: number, unitPrice: number, taxable = true): InvoiceLine {
    const q = Number(quantity) || 0;
    const p = round2(Number(unitPrice) || 0);
    const t = round2(q * p);
    return { kind, description, quantity: q, unit_price: p, amount: t, total: t, taxable };
}

/** Accepts percent (4.712) or decimal (0.04712). */
export function normalizeTaxRate(rate: any): number {
    const r = Number(rate) || 0;
    return r > 1 ? Math.round((r / 100) * 1e8) / 1e8 : r;
}

function toMs(v: any): number | null {
    if (!v) return null;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    const t = new Date(v).getTime();
    return isNaN(t) ? null : t;
}

/** Minutes actually worked on site. */
export function actualLaborMinutes(job: Record<string, any>): number {
    const labor = job?.costs?.labor;
    if (labor && typeof labor === 'object' && Number(labor.actualMinutes) > 0) return Number(labor.actualMinutes);
    if (Number(job?.actual_duration) > 0) return Number(job.actual_duration);
    const start = toMs(job?.actual_start) ?? toMs(job?.arrived_at);
    const end = toMs(job?.actual_end) ?? toMs(job?.completed_at) ?? toMs(job?.finished_at);
    if (start && end && end > start) return Math.round((end - start) / 60000);
    return 0;
}

function approvedAmendmentLines(job: Record<string, any>): InvoiceLine[] {
    const out: InvoiceLine[] = [];
    const amendments: any[] = Array.isArray(job?.scope_amendments) ? job.scope_amendments : [];
    for (const a of amendments) {
        if (!a || a.approvedVia === 'sms_pending') continue; // not approved yet
        for (const it of (a.items || [])) {
            out.push(line('amendment', `Added on site: ${it.description}`, it.quantity || 1, it.unitPrice || 0, it.taxable !== false));
        }
    }
    return out;
}

function overrunLines(overruns: ApprovedOverrun[] = []): InvoiceLine[] {
    const out: InvoiceLine[] = [];
    for (const o of overruns) {
        if (Array.isArray(o.additionalItems) && o.additionalItems.length > 0) {
            for (const it of o.additionalItems) {
                out.push(line('overrun', `Approved additional work: ${it.description}`, it.quantity || 1, it.unitPrice ?? it.total ?? 0, it.taxable !== false));
            }
        } else if (Number(o.additionalTotal) > 0) {
            out.push(line('overrun', `Approved additional work${o.reason ? `: ${o.reason}` : ''}`, 1, Number(o.additionalTotal)));
        }
    }
    return out;
}

export function resolveBillingType(job: Record<string, any>, quote?: Record<string, any> | null): BillingType {
    return (quote?.billingType || job?.billingType || (quote ? 'fixed' : 'time_and_materials')) as BillingType;
}

export function buildInvoice(input: BuildInvoiceInput): BuiltInvoice {
    const { job, quote, approvedOverruns, defaults } = input;
    const billingType = resolveBillingType(job, quote);
    const notes: string[] = [];
    const items: InvoiceLine[] = [];

    if (billingType === 'fixed' && quote) {
        for (const li of (quote.lineItems || []) as any[]) {
            if (li.isOptional && !(li.selected || li.accepted || li.included)) continue;
            if (li.isCompanyExpense || li.equipmentBillingType === 'company_expense') continue;
            const unit = Number(li.unitPrice ?? (li.total / (li.quantity || 1))) || 0;
            const kind: InvoiceLine['kind'] = li.type === 'discount' ? 'discount' : 'quote';
            const l = line(kind, li.description || 'Service', li.quantity || 1, unit, li.taxable !== false);
            if (kind === 'discount' && l.total > 0) { l.unit_price = -l.unit_price; l.amount = -l.amount; l.total = -l.total; }
            items.push(l);
        }
        const hasDiscountLine = items.some(i => i.kind === 'discount');
        const quoteDiscount = Number(quote.discount) || 0;
        if (!hasDiscountLine && quoteDiscount > 0) {
            items.push({ ...line('discount', quote.discountReason ? `Discount — ${quote.discountReason}` : 'Discount', 1, -quoteDiscount, false) });
        }
    } else {
        const terms: Record<string, any> = quote?.tmTerms || {};
        const rate = Number(terms.laborRate) || Number(defaults?.laborRate) || 0;
        const markupPct = Number(terms.materialMarkup ?? defaults?.materialMarkup ?? 0);
        const minutes = actualLaborMinutes(job);
        if (minutes > 0 && rate > 0) {
            const hours = round2(minutes / 60);
            items.push(line('labor', `Labor — ${hours} hr @ $${rate.toFixed(2)}/hr`, hours, rate));
        } else {
            notes.push('No on-site time was recorded — add labor before sending.');
        }
        if (Number(terms.tripFee) > 0) items.push(line('trip', 'Trip / service call fee', 1, Number(terms.tripFee)));

        const parts = job?.costs?.parts;
        const partItems: any[] = parts && typeof parts === 'object' && Array.isArray(parts.items) ? parts.items : [];
        for (const p of partItems) {
            const cost = Number(p.unitCost) || Number(p.unitPrice) || 0;
            if (!p.name && cost === 0) continue;
            items.push(line('material', `Material: ${p.name || 'Part'}`, p.quantity || 1, cost * (1 + markupPct / 100)));
        }
        const mileage = job?.costs?.mileage;
        if (mileage && typeof mileage === 'object' && Number(mileage.total) > 0) {
            items.push(line('mileage', `Mileage — ${mileage.miles || 0} mi`, 1, Number(mileage.total)));
        }
        const other = job?.costs?.other;
        if (Array.isArray(other)) {
            for (const o of other) if (Number(o?.amount) > 0) items.push(line('other', o.description || 'Additional charge', 1, Number(o.amount)));
        }
    }

    items.push(...approvedAmendmentLines(job));
    items.push(...overrunLines(approvedOverruns));

    const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
    const taxRate = normalizeTaxRate(quote?.taxRate ?? defaults?.taxRate ?? 0);
    const taxableBase = items.filter(i => i.taxable).reduce((s, i) => s + i.total, 0);
    const tax_amount = round2(Math.max(0, taxableBase) * taxRate);
    const total = round2(subtotal + tax_amount);
    const deposit_applied = job?.deposit_paid ? round2(Number(job.deposit_amount) || 0) : 0;
    const balance_due = round2(Math.max(0, total - deposit_applied));

    let exceedsCap = false;
    const cap = Number(quote?.tmTerms?.notToExceed) || 0;
    if (billingType === 'time_and_materials' && cap > 0 && subtotal > cap) {
        exceedsCap = true;
        notes.push(`Over the customer's not-to-exceed amount ($${cap.toFixed(2)}). Get approval or adjust before sending.`);
    }
    if (billingType === 'fixed' && !quote) notes.push('No approved quote found — review line items.');

    return { billingType, items, subtotal, tax_rate: taxRate, tax_amount, total, deposit_applied, balance_due, exceedsCap, notes };
}
