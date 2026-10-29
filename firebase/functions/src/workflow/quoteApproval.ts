/**
 * quoteApproval.ts — What happens on the server when a quote is approved.
 *
 * Runs for EVERY approval (customer via public link, or staff in the app),
 * so behavior no longer depends on who clicked Approve.
 *
 *  1. Make sure a job exists (creates one for standalone quotes — idempotent).
 *  2. Move the job to `unscheduled` ("Approved — waiting to be scheduled") and copy
 *     billing type, deposit, availability and parts lists from the quote.
 *  3. The job workflow trigger (jobWorkflowTrigger.ts) then evaluates the
 *     Ready-to-Schedule gate and auto-schedules if the org wants that.
 */

import * as admin from "firebase-admin";

const db = admin.firestore();

/** Statuses where approval may (re)set the job to unscheduled. */
const PRE_SCHEDULE_STATUSES = ["pending", "quote_pending", "unscheduled", "new", undefined, null, ""];

function partsFromQuote(quote: any) {
    const items: any[] = Array.isArray(quote?.lineItems) ? quote.lineItems : [];
    const materials = items.filter(l => l.type === "material").map(l => ({
        name: l.description || "Material",
        quantity: l.quantity || 1,
        unitPrice: l.unitPrice || 0,
        materialId: l.materialId || null,
        received: false,
    }));
    const equipment = items.filter(l => l.type === "equipment" && !l.isCompanyExpense).map(l => ({
        name: l.description || "Equipment",
        quantity: l.quantity || 1,
        equipmentUsageType: l.equipmentUsageType || "one_time",
        isCompanyExpense: !!l.isCompanyExpense,
        received: false,
    }));
    return { materials, equipment };
}

function approvalFields(quoteId: string, quote: any) {
    const fields: Record<string, any> = {
        quoteStatus: "approved",
        active_quote_id: quoteId,
        billingType: quote.billingType || "fixed",
        deposit_required: quote.agreement?.requiresDeposit === true && (quote.agreement?.depositAmount || 0) > 0,
        deposit_amount: quote.agreement?.depositAmount || 0,
        deposit_paid: quote.agreement?.depositPaid === true,
        schedulingPreference: quote.agreement?.schedulingPreference || "email",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (quote.estimatedDuration) fields.estimated_duration = quote.estimatedDuration;
    if (Array.isArray(quote.agreement?.availabilityWindows) && quote.agreement.availabilityWindows.length > 0) {
        fields["request.availabilityWindows"] = quote.agreement.availabilityWindows;
    }
    return fields;
}

export async function handleQuoteApproved(quoteId: string, quote: any): Promise<string | null> {
    const quoteRef = db.collection("quotes").doc(quoteId);
    const { materials, equipment } = partsFromQuote(quote);
    const needsParts = materials.length > 0 || equipment.length > 0;

    // ── 1. Ensure a job exists (transaction prevents duplicates on retries) ──
    const jobId = await db.runTransaction(async tx => {
        const fresh = await tx.get(quoteRef);
        const existing = fresh.data()?.job_id || fresh.data()?.jobId;
        if (existing) return existing as string;

        const jobRef = db.collection("jobs").doc();
        const title = quote.customer?.name
            ? `${quote.customer.name} - ${(quote.scopeOfWork || "Service Appointment").slice(0, 40)}`
            : (quote.scopeOfWork || `Job from Quote ${quote.quoteNumber || quoteId}`).slice(0, 50);
        // approvalFields() uses a dotted key for update(); set() would store it literally, so nest it here
        const { ["request.availabilityWindows"]: windows, ...createFields } = approvalFields(quoteId, quote);
        tx.set(jobRef, {
            org_id: quote.org_id,
            customer_id: quote.customer_id || null,
            title,
            customer: quote.customer || { name: "Customer", address: "", phone: "", email: "" },
            request: {
                description: quote.scopeOfWork || "Service requested via approved quote",
                photos: [],
                availability: [],
                source: "manual",
                ...(windows ? { availabilityWindows: windows } : {}),
            },
            status: "unscheduled",
            priority: quote.priority || "medium",
            estimated_duration: quote.estimatedDuration || 60,
            materials_needed: materials,
            equipment_needed: equipment,
            parts_procurement_status: needsParts ? "needed" : "not_needed",
            parts_ready: !needsParts,
            equipment_ready: equipment.length === 0,
            createdFromQuoteId: quoteId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            ...createFields,
        });
        tx.update(quoteRef, { job_id: jobRef.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`[QuoteApproval] Created job ${jobRef.id} for standalone quote ${quoteId}`);
        return jobRef.id;
    });

    // ── 2. Update an existing job ──
    const jobRef = db.collection("jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return null;
    const job = jobSnap.data() || {};
    if (job.createdFromQuoteId === quoteId && job.status === "unscheduled" && !job.quoteApprovalApplied) {
        await jobRef.update({ quoteApprovalApplied: true });
        return jobId; // freshly created above — already complete
    }

    const update: Record<string, any> = { ...approvalFields(quoteId, quote), quoteApprovalApplied: true };
    if (PRE_SCHEDULE_STATUSES.includes(job.status)) update.status = "unscheduled";
    if (!Array.isArray(job.materials_needed) || job.materials_needed.length === 0) {
        update.materials_needed = materials;
        update.equipment_needed = equipment;
        if (!job.parts_procurement_status) update.parts_procurement_status = needsParts ? "needed" : "not_needed";
        if (job.parts_ready === undefined) update.parts_ready = !needsParts;
    }
    await jobRef.update(update);
    console.log(`[QuoteApproval] Job ${jobId} → ${update.status || job.status} (quote ${quoteId} approved)`);
    return jobId;
}
