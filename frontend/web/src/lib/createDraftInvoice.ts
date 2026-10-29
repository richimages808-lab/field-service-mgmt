/**
 * createDraftInvoice.ts — One place that turns a completed job into a draft invoice.
 *
 * Used by the Job Completion Wizard (Job Detail) and by the tech's
 * "Complete" button on My Schedule, so both paths bill the same way
 * (fixed price OR time & materials, via buildInvoice).
 */

import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { buildInvoice } from './invoiceBuilder';

export interface DraftInvoiceResult {
    invoiceId: string | null;
    exceedsCap: boolean;
    total: number;
    skipped?: 'already_invoiced' | 'zero_total';
}

export async function createDraftInvoiceForJob(params: {
    job: Record<string, any>;
    orgId: string;
    defaults: { laborRate: number; materialMarkup: number };
}): Promise<DraftInvoiceResult> {
    const { job, orgId, defaults } = params;

    if (job.invoice_id) {
        return { invoiceId: job.invoice_id, exceedsCap: false, total: 0, skipped: 'already_invoiced' };
    }

    let quote: Record<string, any> | null = null;
    const quoteId = job.active_quote_id || job.quote_id || job.createdFromQuoteId;
    if (quoteId) {
        const qSnap = await getDoc(doc(db, 'quotes', quoteId));
        if (qSnap.exists()) quote = { id: qSnap.id, ...qSnap.data() };
    }

    let approvedOverruns: any[] = [];
    try {
        const oSnap = await getDocs(query(
            collection(db, 'overrunRequests'),
            where('org_id', '==', orgId),
            where('job_id', '==', job.id)
        ));
        approvedOverruns = oSnap.docs.map(d => d.data())
            .filter((o: any) => o.status === 'approved' || o.customerResponse === 'approved');
    } catch (e) {
        console.warn('Could not load overrun requests:', e);
    }

    const built = buildInvoice({ job: job as any, quote, approvedOverruns, defaults });

    if (!(built.total > 0)) {
        return { invoiceId: null, exceedsCap: false, total: 0, skipped: 'zero_total' };
    }

    const invoiceRef = await addDoc(collection(db, 'invoices'), {
        org_id: orgId,
        customer_id: job.customer_id || '',
        customer: job.customer || null,
        items: built.items,
        billingType: built.billingType,
        subtotal: built.subtotal,
        tax_rate: built.tax_rate,
        tax_amount: built.tax_amount,
        total: built.total,
        deposit_applied: built.deposit_applied,
        deposit_deducted: (built.deposit_applied || 0) > 0,
        deposit_amount: built.deposit_applied || 0,
        balance_due: built.balance_due,
        payments_applied: built.deposit_applied,
        exceeds_not_to_exceed: built.exceedsCap,
        review_notes: built.notes,
        status: 'draft',
        createdAt: serverTimestamp(),
        source_job_id: job.id,
        job_id: job.id,
        quote_id: quote?.id || null,
    });

    // Link invoice back to the job
    await updateDoc(doc(db, 'jobs', job.id), { invoice_id: invoiceRef.id });

    return { invoiceId: invoiceRef.id, exceedsCap: !!built.exceedsCap, total: built.total };
}
