/**
 * Quote Service - Centralized business logic for quote management
 */

import {
    collection,
    doc,
    getDoc,
    updateDoc,
    addDoc,
    runTransaction,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { db, functions } from '../firebase';
import { Quote, Job, Invoice, QuoteLineItem } from '../types';
import { logOutboundEmail, logInternalNote } from './communicationsService';

/**
 * Safely log an internal note — skips silently if the user is not authenticated.
 * Public-facing actions (approve, decline, propose changes) are performed by
 * unauthenticated customers via direct links, and the `communications` collection
 * requires auth. The note is non-critical, so we skip rather than fail.
 */
async function safeLogInternalNote(params: Parameters<typeof logInternalNote>[0] & { quote_id?: string }): Promise<void> {
    const auth = getAuth();
    if (!auth.currentUser) {
        // Unauthenticated (public) context — skip communication log
        return;
    }
    await logInternalNote(params);
}

// =============================================================================
// AUTO-SCHEDULING ON QUOTE APPROVAL
// =============================================================================
// Auto-scheduling now happens ONLY on the server (functions/src/workflow/
// jobWorkflowTrigger.ts → autoSchedule.ts). It runs when an approved job passes
// the Ready-to-Schedule gate (deposit paid + parts per org rule) and the org
// chose "Automatically book" in Workflow Setup.

// =============================================================================
// QUOTE APPROVAL WORKFLOW
// =============================================================================

export interface ApproveQuoteParams {
    quoteId: string;
    signatureDataUrl: string;
    signerName: string;
    agreedToOverrun: boolean;
    ipAddress?: string;
    schedulingPreference?: 'email' | 'phone' | 'text';
    availabilityWindows?: Array<{
        day: string;
        startTime?: string;
        endTime?: string;
        preferredTime?: string;
        submittedAt?: string;
    }>;
    quoteData?: Quote;
}

/**
 * Create a Job from an approved Quote (used by the "Convert to Job" button for
 * older approved quotes that never got a job). Idempotent: if the quote already
 * has a job, that job id is returned. The new job starts as `unscheduled`
 * ("Approved — waiting to be scheduled"); the server then applies the
 * Ready-to-Schedule gate and auto-schedules if the org chose that.
 */
export async function createJobFromQuote(quote: Quote): Promise<string> {
    const quoteId = quote.id;
    const materialsList = (quote.lineItems || []).filter(l => l.type === 'material').map(l => ({
        name: l.description,
        quantity: l.quantity || 1,
        unitPrice: l.unitPrice || 0,
        materialId: l.materialId || null,
        received: false
    }));
    const equipmentList = (quote.lineItems || []).filter(l => l.type === 'equipment' && !l.isCompanyExpense).map(l => ({
        name: l.description,
        quantity: l.quantity || 1,
        equipmentUsageType: l.equipmentUsageType || 'one_time',
        isCompanyExpense: l.isCompanyExpense || false,
        received: false
    }));
    const hasPartsOrEquipment = materialsList.length > 0 || equipmentList.length > 0;

    const jobTitle = quote.customer?.name
        ? `${quote.customer.name} - ${quote.scopeOfWork ? quote.scopeOfWork.slice(0, 40) : 'Service Appointment'}`
        : (quote.scopeOfWork ? quote.scopeOfWork.slice(0, 50) : `Job from Quote ${quote.quoteNumber}`);

    const newJobData: any = {
        org_id: quote.org_id,
        customer_id: quote.customer_id || null,
        title: jobTitle,
        customer: quote.customer || { name: 'Customer', address: '', phone: '', email: '' },
        request: {
            description: quote.scopeOfWork || 'Service requested via approved quote',
            photos: [],
            availability: [],
            source: 'manual'
        },
        status: 'unscheduled',
        priority: quote.priority || 'medium',
        estimated_duration: quote.estimatedDuration || 60,
        quoteStatus: 'approved',
        quoteApprovalApplied: true,
        active_quote_id: quoteId,
        billingType: (quote as any).billingType || 'fixed',
        deposit_required: !!quote.agreement?.requiresDeposit && (quote.agreement?.depositAmount || 0) > 0,
        deposit_amount: quote.agreement?.depositAmount || 0,
        deposit_paid: quote.agreement?.depositPaid || false,
        schedulingPreference: quote.agreement?.schedulingPreference || 'email',
        materials_needed: materialsList,
        equipment_needed: equipmentList,
        parts_procurement_status: hasPartsOrEquipment ? 'needed' : 'not_needed',
        parts_ready: !hasPartsOrEquipment,
        equipment_ready: equipmentList.length === 0,
        createdFromQuoteId: quoteId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    if (quote.agreement?.availabilityWindows && quote.agreement.availabilityWindows.length > 0) {
        newJobData.request.availabilityWindows = quote.agreement.availabilityWindows;
    }

    const quoteRef = doc(db, 'quotes', quoteId);
    return runTransaction(db, async (tx) => {
        const fresh = await tx.get(quoteRef);
        const existing = fresh.data()?.job_id || fresh.data()?.jobId;
        if (existing) return existing as string;
        const jobRef = doc(collection(db, 'jobs'));
        tx.set(jobRef, newJobData);
        tx.update(quoteRef, { job_id: jobRef.id, updatedAt: serverTimestamp() });
        return jobRef.id;
    });
}

/**
 * Handle the customer's (or staff's) approval of a quote.
 *
 * This ONLY records the approval on the quote (signature, overrun agreement,
 * scheduling preference, availability). Everything that follows runs on the
 * server (functions/src/workflow/quoteApproval.ts) for every approval path, so
 * the result is the same whether the customer approves from a link or staff
 * approve in the app:
 *   - creates the job for standalone quotes
 *   - moves the job to 'unscheduled' (Approved — waiting to be scheduled)
 *   - applies the Ready-to-Schedule gate and the org's scheduling choice
 *     (office schedules / auto-book / customer picks a time)
 */
export async function approveQuote(params: ApproveQuoteParams): Promise<void> {
    const { quoteId, signatureDataUrl, signerName, agreedToOverrun, ipAddress, schedulingPreference, availabilityWindows, quoteData } = params;

    let quote: Quote;
    if (quoteData) {
        quote = quoteData;
    } else {
        const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
        if (!quoteDoc.exists()) {
            throw new Error('Quote not found');
        }
        quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;
    }

    if (quote.status === 'approved') {
        throw new Error('Quote has already been approved');
    }

    const quoteUpdate: Record<string, any> = {
        status: 'approved',
        approvedAt: serverTimestamp(),
        'agreement.customerSignature': {
            dataUrl: signatureDataUrl,
            signedAt: serverTimestamp(),
            signerName: signerName.trim(),
            ipAddress: ipAddress || 'Unknown'
        },
        'agreement.schedulingPreference': schedulingPreference || 'email',
        'overrunProtection.customerAgreed': agreedToOverrun,
        'overrunProtection.agreedAt': serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    if (availabilityWindows && availabilityWindows.length > 0) {
        quoteUpdate['agreement.availabilityWindows'] = availabilityWindows;
    }

    await updateDoc(doc(db, 'quotes', quoteId), quoteUpdate);

    // Internal note (skipped automatically for public/unauthenticated approvals)
    try {
        await safeLogInternalNote({
            org_id: quote.org_id,
            customer_id: quote.customer_id,
            job_id: quote.job_id,
            content: `Quote ${quote.quoteNumber} approved by ${signerName}. Total: $${(quote.total || 0).toFixed(2)}`,
            createdBy: 'system',
            quote_id: quoteId
        } as any);
    } catch (error) {
        console.error('Failed to log quote approval communication:', error);
    }
}

// =============================================================================
// QUOTE DECLINE WORKFLOW
// =============================================================================

export interface DeclineQuoteParams {
    quoteId: string;
    reason: string;
}

/**
 * Handle complete quote decline workflow
 * - Updates quote status to 'declined'
 * - Logs communication with decline reason
 * - Job remains in 'quote_pending' status (can create new quote)
 */
export async function declineQuote(params: DeclineQuoteParams): Promise<void> {
    const { quoteId, reason } = params;

    // Get quote to verify and get job_id
    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) {
        throw new Error('Quote not found');
    }

    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    // Update quote with decline
    await updateDoc(doc(db, 'quotes', quoteId), {
        status: 'declined',
        declinedAt: serverTimestamp(),
        declineReason: reason.trim() || 'No reason provided',
        updatedAt: serverTimestamp()
    });

    // Log communication for quote decline
    if (quote.job_id) {
        try {
            await safeLogInternalNote({
                org_id: quote.org_id,
                customer_id: quote.customer_id,
                job_id: quote.job_id,
                content: `Quote ${quote.quoteNumber} declined. Reason: ${reason || 'Not provided'}`,
                createdBy: 'system',
                quote_id: quoteId
            } as any);
        } catch (error) {
            console.error('Failed to log quote decline communication:', error);
        }
    }
}

// =============================================================================
// QUOTE SENDING WORKFLOW
// =============================================================================

export interface SendQuoteParams {
    quoteId: string;
    customerEmail: string;
    customerName: string;
    techName: string;
    sentBy: string;
}

/**
 * Handle quote sending workflow
 * - Updates quote status to 'sent'
 * - Updates job status to 'quote_pending'
 * - Logs communication for quote sent
 */
export async function sendQuoteToCustomer(params: SendQuoteParams): Promise<string> {
    const { quoteId, customerEmail, customerName, techName, sentBy } = params;

    // Get quote
    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) {
        throw new Error('Quote not found');
    }

    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    // Generate quote link
    const quoteLink = `${window.location.origin}/quote/${quoteId}`;

    // Update quote status
    await updateDoc(doc(db, 'quotes', quoteId), {
        status: 'sent',
        sentAt: serverTimestamp(),
        sentVia: 'email',
        updatedAt: serverTimestamp()
    });

    // Actually send the email to the customer via Cloud Function
    try {
        const sendQuoteEmailFn = httpsCallable(functions, 'sendQuoteEmail');
        const result = await sendQuoteEmailFn({ 
            quoteId,
            baseUrl: window.location.origin 
        });
        console.log('Quote email sent:', result.data);
    } catch (emailError) {
        console.error('Failed to send quote email (non-fatal):', emailError);
        // Don't throw — the quote is still "sent" even if email fails.
        // The customer can still access it via the link.
    }

    // Update job status to quote_pending
    if (quote.job_id) {
        await updateDoc(doc(db, 'jobs', quote.job_id), {
            status: 'quote_pending'
        });

        // Log communication for quote sent
        try {
            await logOutboundEmail({
                org_id: quote.org_id,
                customer_id: quote.customer_id,
                job_id: quote.job_id,
                recipient: customerEmail,
                subject: `Service Quote ${quote.quoteNumber}`,
                content: `Quote ${quote.quoteNumber} sent to ${customerName} (${customerEmail}). Total: $${quote.total.toFixed(2)}. Link: ${quoteLink}`,
                createdBy: sentBy,
                quote_id: quoteId
            } as any);
        } catch (error) {
            console.error('Failed to log quote sent communication:', error);
        }
    }

    return quoteLink;
}

export interface DispatchQuoteDeliveryParams {
    quoteId: string;
    quoteNumber: string;
    total: number;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    orgId: string;
    jobId?: string;
    scopeOfWork?: string;
    channels: {
        email: boolean;
        sms: boolean;
        call: boolean;
    };
    sentBy?: string;
}

export interface DispatchDeliveryResult {
    success: boolean;
    channelsDelivered: string[];
    errors: Record<string, string>;
    quoteUrl: string;
}

/**
 * Multi-Channel Quote Dispatcher
 * Dispatches a quote via Email, SMS Text, AI Voice Call Agent, or any combination.
 * Records delivery logs, updates quote and job statuses, and generates customer portal links.
 */
export async function dispatchQuoteDelivery(params: DispatchQuoteDeliveryParams): Promise<DispatchDeliveryResult> {
    const {
        quoteId,
        quoteNumber,
        total,
        customerName,
        customerEmail,
        customerPhone,
        orgId,
        jobId,
        scopeOfWork,
        channels,
        sentBy = 'dispatcher'
    } = params;

    const quoteRef = doc(db, 'quotes', quoteId);
    const quoteDoc = await getDoc(quoteRef);
    if (!quoteDoc.exists()) {
        throw new Error('Quote not found');
    }
    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    const quoteUrl = `${window.location.origin}/quote/${quoteId}`;
    const channelsDelivered: string[] = [];
    const errors: Record<string, string> = {};
    const newLogEntries: Array<{
        channel: 'email' | 'sms' | 'call';
        target: string;
        sentAt: any;
        status: 'sent' | 'initiated' | 'failed' | 'delivered';
        details?: string;
    }> = [];

    // 1. Sync updated customer email/phone to quote doc if provided
    const customerUpdates: Record<string, any> = {};
    if (customerEmail && customerEmail !== quote.customer?.email) {
        customerUpdates['customer.email'] = customerEmail.trim();
    }
    if (customerPhone && customerPhone !== quote.customer?.phone) {
        customerUpdates['customer.phone'] = customerPhone.trim();
    }
    if (customerName && customerName !== quote.customer?.name) {
        customerUpdates['customer.name'] = customerName.trim();
    }
    if (Object.keys(customerUpdates).length > 0) {
        await updateDoc(quoteRef, customerUpdates);
    }

    // 2. Dispatch Email
    if (channels.email) {
        const targetEmail = (customerEmail || quote.customer?.email || '').trim();
        if (!targetEmail) {
            errors.email = 'No email address provided for customer';
        } else {
            try {
                const sendQuoteEmailFn = httpsCallable(functions, 'sendQuoteEmail');
                await sendQuoteEmailFn({ 
                    quoteId,
                    baseUrl: window.location.origin 
                });
                channelsDelivered.push('email');
                newLogEntries.push({
                    channel: 'email',
                    target: targetEmail,
                    sentAt: new Date().toISOString(),
                    status: 'sent',
                    details: 'Delivered via SendGrid branded email notification'
                });
            } catch (err: any) {
                console.error('[QuoteService] Email delivery failed:', err);
                errors.email = err.message || 'Failed to send quote email';
                newLogEntries.push({
                    channel: 'email',
                    target: targetEmail,
                    sentAt: new Date().toISOString(),
                    status: 'failed',
                    details: err.message || 'Email delivery failed'
                });
            }
        }
    }

    // 3. Dispatch SMS Text
    if (channels.sms) {
        const targetPhone = (customerPhone || quote.customer?.phone || '').trim();
        if (!targetPhone) {
            errors.sms = 'No phone number provided for customer SMS';
        } else {
            const smsBody = `Hello ${customerName || 'there'}, your service quote ${quoteNumber} for $${total.toFixed(2)} is ready for your review. View & approve: ${quoteUrl}`;
            try {
                const sendDirectSMSFn = httpsCallable(functions, 'sendDirectSMS');
                await sendDirectSMSFn({
                    to: targetPhone,
                    body: smsBody,
                    orgId: orgId || quote.org_id || 'default',
                    customerId: quote.customer_id || '',
                    customerName: customerName || quote.customer?.name || 'Customer',
                    jobId: jobId || quote.job_id || '',
                    quoteNumber
                });
                channelsDelivered.push('sms');
                newLogEntries.push({
                    channel: 'sms',
                    target: targetPhone,
                    sentAt: new Date().toISOString(),
                    status: 'sent',
                    details: `SMS sent: "${smsBody.slice(0, 60)}..."`
                });
            } catch (err: any) {
                console.error('[QuoteService] SMS delivery failed:', err);
                errors.sms = err.message || 'SMS delivery failed';
                newLogEntries.push({
                    channel: 'sms',
                    target: targetPhone,
                    sentAt: new Date().toISOString(),
                    status: 'failed',
                    details: err.message || 'SMS delivery error'
                });
            }
        }
    }

    // 4. Dispatch AI Voice Call Agent
    if (channels.call) {
        const targetPhone = (customerPhone || quote.customer?.phone || '').trim();
        if (!targetPhone) {
            errors.call = 'No phone number provided for AI voice call';
        } else {
            try {
                // Queue in pending_callbacks
                await addDoc(collection(db, 'pending_callbacks'), {
                    orgId: orgId || quote.org_id || 'default',
                    customerPhone: targetPhone,
                    customerName: customerName || quote.customer?.name || 'Customer',
                    quoteId,
                    jobId: jobId || quote.job_id || '',
                    jobDescription: scopeOfWork || quote.scopeOfWork || `Quote ${quoteNumber}`,
                    type: 'quote_ready',
                    status: 'pending',
                    createdAt: serverTimestamp(),
                    requestedBy: sentBy
                });

                // If job_id exists and Twilio callback callable is ready, attempt immediate call trigger
                const effectiveJobId = jobId || quote.job_id;
                if (effectiveJobId) {
                    try {
                        const initiateCallFn = httpsCallable(functions, 'initiateCustomerCallback');
                        await initiateCallFn({
                            jobId: effectiveJobId,
                            orgId: orgId || quote.org_id || 'default'
                        });
                    } catch (callErr) {
                        console.log('[QuoteService] Immediate voice call deferred to queue:', callErr);
                    }
                }

                channelsDelivered.push('call');
                newLogEntries.push({
                    channel: 'call',
                    target: targetPhone,
                    sentAt: new Date().toISOString(),
                    status: 'initiated',
                    details: 'AI phone agent queued for outbound callback to review estimate with customer'
                });
            } catch (err: any) {
                console.error('[QuoteService] AI Call dispatch failed:', err);
                errors.call = err.message || 'Failed to dispatch AI call agent';
                newLogEntries.push({
                    channel: 'call',
                    target: targetPhone,
                    sentAt: new Date().toISOString(),
                    status: 'failed',
                    details: err.message || 'AI Call dispatch error'
                });
            }
        }
    }

    // 5. Update quote record with delivery info
    const existingLog = quote.deliveryLog || [];
    const methods = channelsDelivered.length > 0
        ? channelsDelivered
        : Object.keys(channels).filter(k => (channels as any)[k]);

    const sentViaLabel = methods.map(m => m === 'call' ? 'ai call' : m).join(' + ');

    await updateDoc(quoteRef, {
        status: 'sent',
        sentAt: serverTimestamp(),
        sentVia: sentViaLabel || 'email',
        deliveryMethods: methods as any,
        deliveryLog: [...existingLog, ...newLogEntries],
        updatedAt: serverTimestamp()
    });

    // 6. Update linked job status if present
    const linkedJobId = jobId || quote.job_id;
    if (linkedJobId) {
        try {
            await updateDoc(doc(db, 'jobs', linkedJobId), {
                status: 'quote_pending'
            });
        } catch (jobErr) {
            console.warn('[QuoteService] Failed to update job status:', jobErr);
        }
    }

    return {
        success: channelsDelivered.length > 0,
        channelsDelivered,
        errors,
        quoteUrl
    };
}

// =============================================================================
// INVOICE GENERATION FROM QUOTE
// =============================================================================

/**
 * Generate an invoice from an approved quote
 */
export async function generateInvoiceFromQuote(quoteId: string): Promise<string> {
    // Get quote
    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) {
        throw new Error('Quote not found');
    }

    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    if (quote.status !== 'approved' && quote.status !== 'completed') {
        throw new Error('Can only generate invoice from approved or completed quotes');
    }

    // Get job to get customer info
    const jobDoc = await getDoc(doc(db, 'jobs', quote.job_id));
    if (!jobDoc.exists()) {
        throw new Error('Job not found');
    }

    const job = { id: jobDoc.id, ...jobDoc.data() } as Job;

    // Create invoice from quote line items
    const invoiceData: Omit<Invoice, 'id'> = {
        org_id: quote.org_id,
        customer_id: quote.customer_id || '',
        job_id: quote.job_id,
        quote_id: quoteId,
        customer: {
            name: job.customer.name,
            address: job.customer.address,
            email: job.customer.email
        },
        items: quote.lineItems.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total: item.total
        })),
        total: quote.total,
        status: 'draft',
        createdAt: serverTimestamp(),
        dueDate: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // 30 days
        deposit_applied: job.deposit_paid ? (job.deposit_amount || 0) : 0
    };

    const docRef = await addDoc(collection(db, 'invoices'), invoiceData);

    // Update quote status to completed
    await updateDoc(doc(db, 'quotes', quoteId), {
        status: 'completed',
        updatedAt: serverTimestamp()
    });

    return docRef.id;
}

// =============================================================================
// OVERRUN VALIDATION
// =============================================================================

export interface OverrunValidation {
    withinThreshold: boolean;
    overrunPercent: number;
    overrunAmount: number;
    requiresApproval: boolean;
}

/**
 * Check if actual costs are within quote's overrun threshold
 */
export async function checkOverrunThreshold(
    quoteId: string,
    actualCosts: number
): Promise<OverrunValidation> {
    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) {
        throw new Error('Quote not found');
    }

    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    const overrunAmount = actualCosts - quote.total;
    const overrunPercent = (overrunAmount / quote.total) * 100;

    const withinThreshold = quote.overrunProtection.enabled
        ? overrunPercent <= quote.overrunProtection.maxOverrunPercent
        : true;

    const requiresApproval = quote.overrunProtection.enabled &&
        quote.overrunProtection.overrunApprovalRequired &&
        overrunPercent > quote.overrunProtection.maxOverrunPercent;

    return {
        withinThreshold,
        overrunPercent,
        overrunAmount,
        requiresApproval
    };
}

// =============================================================================
// OVERRUN REQUEST
// =============================================================================

export interface OverrunRequestParams {
    quoteId: string;
    jobId: string;
    reason: string;
    additionalItems: QuoteLineItem[];
    requestedBy: string;
}

/**
 * Create an overrun approval request
 */
export async function requestOverrunApproval(params: OverrunRequestParams): Promise<string> {
    const { quoteId, jobId, reason, additionalItems, requestedBy } = params;

    // Get quote
    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) {
        throw new Error('Quote not found');
    }

    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    const additionalTotal = additionalItems.reduce((sum, item) => sum + item.total, 0);
    const newTotal = quote.total + additionalTotal;
    const percentOverOriginal = ((newTotal - quote.total) / quote.total) * 100;

    const overrunData = {
        org_id: quote.org_id,
        job_id: jobId,
        quote_id: quoteId,
        reason,
        additionalItems,
        additionalTotal,
        newTotal,
        percentOverOriginal,
        requestedAt: serverTimestamp(),
        requestedBy,
        sentToCustomer: false,
        customerResponse: 'pending',
        status: 'pending'
    };

    const docRef = await addDoc(collection(db, 'overrunRequests'), overrunData);

    // Log communication
    try {
        await logInternalNote({
            org_id: quote.org_id,
            customer_id: quote.customer_id,
            job_id: jobId,
            content: `Overrun approval requested: +$${additionalTotal.toFixed(2)} (${percentOverOriginal.toFixed(1)}% over quote). Reason: ${reason}`,
            createdBy: requestedBy,
            quote_id: quoteId
        } as any);
    } catch (error) {
        console.error('Failed to log overrun request communication:', error);
    }

    return docRef.id;
}

// =============================================================================
// INTERACTIVE QUOTING WORKFLOW
// =============================================================================

export interface ProposeQuoteChangesParams {
    quoteId: string;
    customerNotes: string;
}

/**
 * Handle a customer proposing changes to a quote
 * - Updates quote status to 'tech_review'
 * - Adds customer's note to quote
 */
export async function proposeQuoteChanges(params: ProposeQuoteChangesParams): Promise<void> {
    const { quoteId, customerNotes } = params;

    // Get quote
    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) {
        throw new Error('Quote not found');
    }

    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    const newNote = {
        text: customerNotes.trim(),
        createdAt: new Date().toISOString(),
        author: 'customer' as const,
        type: 'message' as const,
    };

    const statusNote = {
        text: 'Change requested by customer — awaiting technician review',
        createdAt: new Date().toISOString(),
        author: 'system' as const,
        type: 'status_change' as const,
        waitingFor: 'tech' as const,
    };

    const existingNotes = quote.customerNotes || [];

    // Update quote status and notes
    await updateDoc(doc(db, 'quotes', quoteId), {
        status: 'tech_review',
        customerNotes: [...existingNotes, newNote, statusNote],
        updatedAt: serverTimestamp()
    });

    // Log communication
    if (quote.job_id) {
        try {
            await safeLogInternalNote({
                org_id: quote.org_id,
                customer_id: quote.customer_id,
                job_id: quote.job_id,
                content: `Customer requested changes to Quote ${quote.quoteNumber}: "${customerNotes}"`,
                createdBy: 'customer',
                quote_id: quoteId
            } as any);
        } catch (error) {
            console.error('Failed to log quote change request communication:', error);
        }
    }
}

// =============================================================================
// RECALCULATE QUOTE DEPOSIT ON QUOTE CHANGES
// =============================================================================

export interface RecalculateDepositParams {
    total: number;
    lineItems?: QuoteLineItem[];
    depositCondition?: string;
    existingDepositAmount?: number;
    existingDepositPercent?: number;
    requiresDeposit?: boolean;
    upfrontPolicy?: any;
    customerData?: any;
    isDepositPaid?: boolean;
}

export interface RecalculateDepositResult {
    requiresDeposit: boolean;
    depositAmount: number;
    depositPercent: number;
    evaluatedRule: string;
}

export function recalculateDepositForQuote(params: RecalculateDepositParams): RecalculateDepositResult {
    const {
        total,
        lineItems = [],
        depositCondition = 'none',
        existingDepositAmount = 0,
        existingDepositPercent,
        requiresDeposit = false,
        upfrontPolicy,
        customerData,
        isDepositPaid = false
    } = params;

    // If deposit has already been paid by the customer, lock historical paid deposit amount
    if (isDepositPaid) {
        return {
            requiresDeposit: true,
            depositAmount: Math.round((existingDepositAmount || 0) * 100) / 100,
            depositPercent: existingDepositPercent || (total > 0 ? Math.round(((existingDepositAmount || 0) / total) * 100) : 50),
            evaluatedRule: depositCondition || 'custom'
        };
    }

    if (depositCondition === 'none' || total <= 0) {
        return {
            requiresDeposit: false,
            depositAmount: 0,
            depositPercent: 0,
            evaluatedRule: 'none'
        };
    }

    const defaultPercent = existingDepositPercent ?? upfrontPolicy?.depositPercent ?? 50;
    const threshold = upfrontPolicy?.overThreshold ?? 500;
    const paidEstimateAmount = upfrontPolicy?.paidEstimateAmount ?? 75;

    if (depositCondition === 'policy') {
        if (!upfrontPolicy || !upfrontPolicy.enabled) {
            return { requiresDeposit: false, depositAmount: 0, depositPercent: 0, evaluatedRule: 'none' };
        }

        const rules = upfrontPolicy.defaultRules || (upfrontPolicy.defaultRule && upfrontPolicy.defaultRule !== 'none' ? [upfrontPolicy.defaultRule] : []);
        if (rules.length === 0) {
            return { requiresDeposit: false, depositAmount: 0, depositPercent: 0, evaluatedRule: 'none' };
        }

        let highestAmount = 0;
        let highestRule = 'none';

        rules.forEach((rule: string) => {
            let amount = 0;
            if (rule === 'always') {
                amount = total * (defaultPercent / 100);
            } else if (rule === 'new_customers_only') {
                const isNew = !customerData || !customerData.stats || !customerData.stats.totalSpent || customerData.stats.totalSpent === 0;
                if (isNew) amount = total * (defaultPercent / 100);
            } else if (rule === 'over_threshold') {
                if (total > threshold) amount = total * (defaultPercent / 100);
            } else if (rule === 'materials_only' || rule === '100_percent_materials') {
                amount = lineItems.filter(i => i.type === 'material').reduce((sum, item) => sum + (item.total || 0), 0);
            } else if (rule === 'paid_estimate') {
                amount = paidEstimateAmount;
            }

            if (amount > highestAmount) {
                highestAmount = amount;
                highestRule = rule;
            }
        });

        if (highestAmount > 0) {
            const finalAmt = highestRule === 'paid_estimate' ? highestAmount : Math.min(highestAmount, total);
            return {
                requiresDeposit: true,
                depositAmount: Math.round(finalAmt * 100) / 100,
                depositPercent: defaultPercent,
                evaluatedRule: highestRule
            };
        }

        return { requiresDeposit: false, depositAmount: 0, depositPercent: 0, evaluatedRule: 'none' };
    }

    if (depositCondition === '50_percent' || depositCondition === 'always') {
        const amt = Math.min(total * (defaultPercent / 100), total);
        return {
            requiresDeposit: true,
            depositAmount: Math.round(amt * 100) / 100,
            depositPercent: defaultPercent,
            evaluatedRule: 'always'
        };
    }

    if (depositCondition === '100_percent_materials' || depositCondition === 'materials_only') {
        const materialsTotal = lineItems.filter(i => i.type === 'material').reduce((sum, item) => sum + (item.total || 0), 0);
        const amt = Math.min(materialsTotal, total);
        return {
            requiresDeposit: amt > 0,
            depositAmount: Math.round(amt * 100) / 100,
            depositPercent: total > 0 ? Math.round((amt / total) * 100) : 100,
            evaluatedRule: 'materials_only'
        };
    }

    if (depositCondition === '50_percent_if_over_500' || depositCondition === 'over_threshold') {
        const isOver = total > threshold;
        const amt = isOver ? Math.min(total * (defaultPercent / 100), total) : 0;
        return {
            requiresDeposit: isOver,
            depositAmount: Math.round(amt * 100) / 100,
            depositPercent: defaultPercent,
            evaluatedRule: 'over_threshold'
        };
    }

    if (depositCondition === 'new_customers_only') {
        const isNew = !customerData || !customerData.stats || !customerData.stats.totalSpent || customerData.stats.totalSpent === 0;
        const amt = isNew ? Math.min(total * (defaultPercent / 100), total) : 0;
        return {
            requiresDeposit: isNew,
            depositAmount: Math.round(amt * 100) / 100,
            depositPercent: defaultPercent,
            evaluatedRule: 'new_customers_only'
        };
    }

    if (depositCondition === 'paid_estimate') {
        return {
            requiresDeposit: true,
            depositAmount: Math.round(paidEstimateAmount * 100) / 100,
            depositPercent: 0,
            evaluatedRule: 'paid_estimate'
        };
    }

    if (depositCondition === 'custom') {
        if (!requiresDeposit) {
            return { requiresDeposit: false, depositAmount: 0, depositPercent: 0, evaluatedRule: 'none' };
        }
        let amt = existingDepositAmount;
        if (existingDepositPercent && existingDepositPercent > 0) {
            amt = Math.min(total * (existingDepositPercent / 100), total);
        } else {
            amt = Math.min(existingDepositAmount, total);
        }
        return {
            requiresDeposit: true,
            depositAmount: Math.round(amt * 100) / 100,
            depositPercent: existingDepositPercent || (total > 0 ? Math.round((amt / total) * 100) : 0),
            evaluatedRule: 'custom'
        };
    }

    return {
        requiresDeposit: requiresDeposit && total > 0,
        depositAmount: Math.round(Math.min(existingDepositAmount, total) * 100) / 100,
        depositPercent: defaultPercent,
        evaluatedRule: 'none'
    };
}

export interface UpdateAndResendQuoteParams {
    quoteId: string;
    updates: Partial<Quote>;
    techNotes?: string;
    techName: string;
}

/**
 * Handle a tech revising an interactive quote and sending it back out
 * - Applies updates to the quote
 * - Updates quote status to 'sent'
 * - Adds tech's note to quote
 */
export async function updateAndResendQuote(params: UpdateAndResendQuoteParams): Promise<void> {
    const { quoteId, updates, techNotes, techName } = params;

    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
    if (!quoteDoc.exists()) {
        throw new Error('Quote not found');
    }

    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;
    
    // Save current state to previousVersions
    const previousVersions = quote.previousVersions || [];
    const archivedQuote = { ...quote };
    delete (archivedQuote as any).id;
    previousVersions.push(archivedQuote);
    
    let updatedNotes = quote.customerNotes || [];
    if (techNotes && techNotes.trim().length > 0) {
        updatedNotes = [
            ...updatedNotes,
            {
                text: techNotes.trim(),
                createdAt: new Date().toISOString(),
                author: 'tech' as const,
                type: 'message' as const,
            }
        ];
    }

    // Always add a status change note when resending
    updatedNotes = [
        ...updatedNotes,
        {
            text: `Quote revised and resent by ${techName} — awaiting customer response`,
            createdAt: new Date().toISOString(),
            author: 'system' as const,
            type: 'status_change' as const,
            waitingFor: 'customer' as const,
        }
    ];

    // Recalculate deposit if quote total or line items changed and deposit is not yet paid
    const effectiveTotal = updates.total !== undefined ? updates.total : quote.total;
    const effectiveLineItems = updates.lineItems !== undefined ? updates.lineItems : quote.lineItems;
    const effectiveCondition = updates.depositCondition !== undefined ? updates.depositCondition : (quote.depositCondition || 'none');
    const isDepositPaid = quote.agreement?.depositPaid || false;

    const mergedAgreement = { ...(quote.agreement || {}), ...(updates.agreement || {}) };

    if (!isDepositPaid) {
        const depositRecalc = recalculateDepositForQuote({
            total: effectiveTotal,
            lineItems: effectiveLineItems,
            depositCondition: effectiveCondition,
            existingDepositAmount: mergedAgreement.depositAmount || 0,
            existingDepositPercent: mergedAgreement.depositPercent,
            requiresDeposit: mergedAgreement.requiresDeposit || false,
            isDepositPaid
        });

        mergedAgreement.requiresDeposit = depositRecalc.requiresDeposit;
        mergedAgreement.depositAmount = depositRecalc.depositAmount;
        mergedAgreement.depositPercent = depositRecalc.depositPercent;

        // Invalidate stale payment session URL if deposit amount changed
        if (mergedAgreement.depositAmount !== quote.agreement?.depositAmount) {
            delete mergedAgreement.depositPaymentUrl;
            delete mergedAgreement.depositCheckoutSessionId;
        }
    }

    updates.agreement = mergedAgreement as Quote['agreement'];

    // Merge updates and resend
    await updateDoc(doc(db, 'quotes', quoteId), {
        ...updates,
        status: 'sent',
        customerNotes: updatedNotes,
        previousVersions,
        updatedAt: serverTimestamp()
    });

    // Send the updated quote email to the customer
    try {
        const sendQuoteEmailFn = httpsCallable(functions, 'sendQuoteEmail');
        await sendQuoteEmailFn({ 
            quoteId,
            baseUrl: window.location.origin 
        });
        console.log('Revised quote email sent');
    } catch (emailError) {
        console.error('Failed to send revised quote email (non-fatal):', emailError);
    }

    // Log communication
    if (quote.job_id) {
        try {
            await logInternalNote({
                org_id: quote.org_id,
                customer_id: quote.customer_id,
                job_id: quote.job_id,
                content: `Tech ${techName} updated and resent Quote ${quote.quoteNumber}. ${techNotes ? 'Notes: "' + techNotes + '"' : ''}`,
                createdBy: techName,
                quote_id: quoteId
            } as any);
        } catch (error) {
            console.error('Failed to log quote resend communication:', error);
        }
    }
}
