import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getAppBaseUrl } from './appLinks';
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret_key || 'sk_test_fake', {
    apiVersion: '2023-10-16', // Using a stable API version
});

const APP_URL = process.env.APP_URL || getAppBaseUrl();

export const createStripeConnectAccount = functions.https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }

    const userId = context.auth.uid;
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
        throw new functions.https.HttpsError('not-found', 'User profile not found.');
    }

    const orgId = data?.orgId || userData.org_id || userData.organizationId;
    let stripeAccountId = userData.stripeAccountId;

    if (!stripeAccountId && orgId) {
        const orgDoc = await admin.firestore().collection('organizations').doc(orgId).get();
        stripeAccountId = orgDoc.data()?.stripeAccountId;
    }

    // Create connected account if it doesn't exist
    if (!stripeAccountId) {
        try {
            const account = await stripe.accounts.create({
                type: 'express',
                email: userData.email,
                business_type: 'individual',
                business_profile: {
                    product_description: 'Field service technician services',
                },
            });
            stripeAccountId = account.id;

            // Save to Firestore (both user and organization if present)
            await admin.firestore().collection('users').doc(userId).update({
                stripeAccountId: stripeAccountId,
            });
            if (orgId) {
                await admin.firestore().collection('organizations').doc(orgId).set({
                    stripeAccountId: stripeAccountId,
                    settings: { stripeEnabled: true }
                }, { merge: true });
            }
        } catch (error: any) {
            console.error('Error creating Stripe account:', error);
            throw new functions.https.HttpsError('internal', error.message);
        }
    }

    const returnPath = typeof data?.returnPath === 'string' && data.returnPath.startsWith('/')
        ? data.returnPath
        : '/tech-profile?tab=payments';
    const sep = returnPath.includes('?') ? '&' : '?';

    // Create Account Link
    try {
        const accountLink = await stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: `${APP_URL}${returnPath}${sep}stripe_refresh=true`,
            return_url: `${APP_URL}${returnPath}${sep}stripe_return=true`,
            type: 'account_onboarding',
        });

        return { url: accountLink.url, stripeAccountId };
    } catch (error: any) {
        console.error('Error creating account link:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const getStripeConnectDashboardUrl = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }

    const userId = context.auth.uid;
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();
    let stripeAccountId = userData?.stripeAccountId;

    const orgId = data?.orgId || userData?.org_id || userData?.organizationId;
    if (!stripeAccountId && orgId) {
        const orgDoc = await admin.firestore().collection('organizations').doc(orgId).get();
        stripeAccountId = orgDoc.data()?.stripeAccountId;
    }

    if (!stripeAccountId) {
        throw new functions.https.HttpsError('failed-precondition', 'No Stripe account connected.');
    }

    try {
        const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
        return { url: loginLink.url };
    } catch (error: any) {
        console.error('Error creating login link:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// =============================================================================
// DEPOSIT CHECKOUT SESSION
// =============================================================================

/**
 * Build a concise, customer-friendly description for the Stripe checkout page.
 * Strips out technician-only step-by-step procedures and keeps only the
 * high-level assessment. Stripe limits product descriptions to ~500 chars.
 */
function buildStripeDescription(quote: any): string {
    // Prefer the customer's original request as a brief anchor
    const customerRequest = quote.customerDescription || quote.request?.description || '';

    // Try to extract just the assessment portion from scopeOfWork
    // scopeOfWork format: "Assessment: ... Proposed Work: Step 1: ... Customer Request: ..."
    let assessment = '';
    if (quote.scopeOfWork) {
        const scope = quote.scopeOfWork as string;
        // Extract everything between "Assessment:" and "Proposed Work:" (or "Step 1:")
        const assessmentMatch = scope.match(/Assessment:\s*([\s\S]*?)(?:\s*Proposed Work:|Step\s*1[:\.]|$)/i);
        if (assessmentMatch && assessmentMatch[1].trim()) {
            assessment = assessmentMatch[1].trim();
        } else {
            // No "Assessment:" header — take the first sentence or two before any "Step" references
            const beforeSteps = scope.split(/\bStep\s*\d/i)[0].trim();
            assessment = beforeSteps || scope;
        }
    }

    // Build the final description: assessment + customer request, capped at 500 chars
    let description = assessment || customerRequest || 'Service work as quoted';

    // If we have a customer request and it's different from the assessment, append it
    if (customerRequest && assessment && !assessment.toLowerCase().includes(customerRequest.toLowerCase().slice(0, 30))) {
        description = `${assessment}\n\nCustomer Request: ${customerRequest}`;
    }

    // Stripe product descriptions should be concise — cap at 500 chars
    if (description.length > 500) {
        description = description.slice(0, 497) + '...';
    }

    return description;
}

/**
 * Creates a Stripe Checkout Session for upfront deposit/paid estimate collection.
 * Called from the customer-facing payment page (no auth required — uses quoteId as token).
 */
export const createDepositCheckout = functions.https.onCall(async (data) => {
    const { quoteId } = data;
    if (!quoteId) {
        throw new functions.https.HttpsError('invalid-argument', 'quoteId is required');
    }

    // Fetch quote
    const quoteSnap = await admin.firestore().collection('quotes').doc(quoteId).get();
    if (!quoteSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Quote not found');
    }
    const quote = quoteSnap.data()!;

    // Guard: deposit already paid
    if (quote.agreement?.depositPaid) {
        throw new functions.https.HttpsError('already-exists', 'Deposit has already been paid for this quote.');
    }

    // Guard: deposit not required
    if (!quote.agreement?.requiresDeposit) {
        throw new functions.https.HttpsError('failed-precondition', 'This quote does not require a deposit.');
    }

    // Calculate effective deposit amount
    const rawDepositAmount = quote.agreement?.depositAmount || 0;
    const quoteTotal = quote.total || 0;
    const isPaidEstimate = quote.depositCondition === 'paid_estimate';

    let effectiveDepositAmount = rawDepositAmount;
    if (!isPaidEstimate) {
        const depositPercent = quote.agreement?.depositPercent || 50;
        if (quote.depositCondition && quote.depositCondition !== 'custom') {
            const calculatedPercentAmt = Math.round(quoteTotal * (depositPercent / 100) * 100) / 100;
            effectiveDepositAmount = Math.min(calculatedPercentAmt > 0 ? calculatedPercentAmt : rawDepositAmount, quoteTotal);
        } else {
            effectiveDepositAmount = Math.min(rawDepositAmount, quoteTotal);
        }
    }
    effectiveDepositAmount = Math.round(effectiveDepositAmount * 100) / 100;

    if (effectiveDepositAmount <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Deposit amount must be greater than zero.');
    }

    // Fast-path: Reuse existing valid deposit payment URL if stored amount matches effective deposit and session is still open
    if (quote.agreement?.depositPaymentUrl && quote.agreement?.depositCheckoutSessionId && quote.agreement?.depositAmount === effectiveDepositAmount) {
        try {
            const existingSession = await stripe.checkout.sessions.retrieve(quote.agreement.depositCheckoutSessionId);
            if (existingSession && existingSession.status === 'open') {
                return { url: existingSession.url || quote.agreement.depositPaymentUrl, sessionId: existingSession.id };
            }
        } catch (err) {
            console.warn('[createDepositCheckout] Stored session check failed, creating a new session:', err);
        }
    }

    // Load org for branding / disclaimer
    const orgSnap = await admin.firestore().collection('organizations').doc(quote.org_id).get();
    const org = orgSnap.exists ? orgSnap.data()! : {} as any;
    const companyName = org.name || 'Service Provider';

    const quoteNumber = quote.quoteNumber || quoteId.slice(0, 8).toUpperCase();
    const lineItemName = isPaidEstimate
        ? `Paid Estimate — ${companyName}`
        : `Deposit for Quote #${quoteNumber} — ${companyName}`;

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: lineItemName,
                            description: buildStripeDescription(quote),
                        },
                        unit_amount: Math.round(effectiveDepositAmount * 100), // Stripe expects cents
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                quoteId,
                jobId: quote.job_id || '',
                orgId: quote.org_id || '',
                type: 'deposit',
            },
            success_url: `${APP_URL}/pay/${quoteId}?status=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${APP_URL}/pay/${quoteId}?status=cancelled`,
            customer_email: quote.customer?.email || undefined,
            consent_collection: {
                terms_of_service: 'none', // We show our own disclaimer
            },
        });

        // Save session ID and updated effective deposit amount to quote
        await admin.firestore().collection('quotes').doc(quoteId).update({
            'agreement.depositAmount': effectiveDepositAmount,
            'agreement.depositCheckoutSessionId': session.id,
            'agreement.depositPaymentUrl': session.url,
        });

        return { url: session.url, sessionId: session.id };
    } catch (error: any) {
        console.error('Error creating deposit checkout session:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// =============================================================================
// INVOICE CHECKOUT SESSION & VERIFICATION
// =============================================================================

async function recordInvoicePaidInFirestore(invoiceId: string, paymentIntentId: string, paidAmountDollars: number, paymentMethod: string = 'card') {
    const db = admin.firestore();
    const invoiceRef = db.collection('invoices').doc(invoiceId);
    const snap = await invoiceRef.get();
    if (!snap.exists) return { alreadyPaid: false };
    const inv = snap.data()!;
    if (inv.status === 'paid' && inv.stripePaymentIntentId === paymentIntentId) {
        return { alreadyPaid: true };
    }

    const total = Number(inv.total ?? inv.amount ?? 0);
    const prevApplied = Number(inv.payments_applied ?? 0);
    const effectivePaid = paidAmountDollars > 0 ? paidAmountDollars : Math.max(0, Number(inv.balance_due ?? (total - prevApplied)));
    const newApplied = Math.round((prevApplied + effectivePaid) * 100) / 100;
    const newBalance = Math.max(0, Math.round((total - newApplied) * 100) / 100);
    const newStatus = newBalance <= 0.01 ? 'paid' : 'partial';

    await invoiceRef.update({
        status: newStatus,
        balance_due: newBalance,
        payments_applied: newApplied,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        stripePaymentIntentId: paymentIntentId || 'stripe_checkout',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Record ledger entry in payments collection
    await db.collection('payments').add({
        invoice_id: invoiceId,
        org_id: inv.org_id || '',
        customer_id: inv.customer_id || '',
        amount: effectivePaid,
        method: paymentMethod,
        reference_number: paymentIntentId || 'stripe_checkout',
        date: admin.firestore.FieldValue.serverTimestamp(),
        notes: 'Online payment via Stripe Checkout',
        recorded_by: 'customer_portal_stripe',
    });

    return { alreadyPaid: false, status: newStatus, balance_due: newBalance };
}

/**
 * Creates a Stripe Checkout Session for paying a final invoice online.
 * Callable from both the authenticated Customer Portal (/portal/invoices/:id)
 * and the token-resolved invoice link (/t/:token).
 */
export const createInvoiceCheckout = functions.https.onCall(async (data) => {
    const { invoiceId, returnUrl } = data || {};
    if (!invoiceId) {
        throw new functions.https.HttpsError('invalid-argument', 'invoiceId is required');
    }

    const invoiceSnap = await admin.firestore().collection('invoices').doc(invoiceId).get();
    if (!invoiceSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Invoice not found');
    }
    const invoice = invoiceSnap.data()!;

    if (invoice.status === 'paid') {
        throw new functions.https.HttpsError('already-exists', 'This invoice has already been paid.');
    }
    if (invoice.status === 'void') {
        throw new functions.https.HttpsError('failed-precondition', 'This invoice has been voided.');
    }

    const total = Number(invoice.total ?? invoice.amount ?? 0);
    const paymentsApplied = Number(invoice.payments_applied ?? 0);
    const rawBalance = invoice.balance_due !== undefined ? Number(invoice.balance_due) : (total - paymentsApplied);
    const balanceDue = Math.round(Math.max(0, rawBalance) * 100) / 100;

    if (balanceDue <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Invoice balance due must be greater than zero.');
    }

    const orgId = invoice.org_id || '';
    const orgSnap = orgId ? await admin.firestore().collection('organizations').doc(orgId).get() : null;
    const org = orgSnap && orgSnap.exists ? orgSnap.data()! : ({} as any);
    const companyName = org.branding?.companyName || org.name || 'Service Provider';
    const invoiceNumber = invoice.invoiceNumber || `INV-${invoiceId.slice(0, 8).toUpperCase()}`;

    const baseReturnUrl = (typeof returnUrl === 'string' && /^https?:\/\//i.test(returnUrl))
        ? returnUrl.split('?')[0]
        : `${APP_URL}/portal/invoices/${invoiceId}`;

    const itemDescriptions = (invoice.items || [])
        .map((it: any) => it.description || it.name)
        .filter(Boolean)
        .join(', ')
        .slice(0, 450);

    try {
        const sessionConfig: any = {
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Invoice #${invoiceNumber} — ${companyName}`,
                            description: itemDescriptions || `Balance due for Invoice #${invoiceNumber}`,
                        },
                        unit_amount: Math.round(balanceDue * 100),
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                invoiceId,
                jobId: invoice.job_id || '',
                orgId,
                customerId: invoice.customer_id || '',
                type: 'invoice',
                amountDollars: String(balanceDue),
            },
            success_url: `${baseReturnUrl}?status=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseReturnUrl}?status=cancelled`,
            customer_email: invoice.customer?.email || undefined,
        };

        if (org.stripeAccountId && org.stripeChargesEnabled) {
            sessionConfig.payment_intent_data = {
                transfer_data: { destination: org.stripeAccountId },
            };
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);

        await admin.firestore().collection('invoices').doc(invoiceId).update({
            stripeCheckoutSessionId: session.id,
            stripePaymentUrl: session.url,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { url: session.url, sessionId: session.id };
    } catch (error: any) {
        console.error('Error creating invoice checkout session:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Verifies a completed Stripe Checkout Session for an invoice when the customer returns to the portal.
 */
export const verifyInvoiceCheckout = functions.https.onCall(async (data) => {
    const { invoiceId, sessionId } = data || {};
    if (!invoiceId || !sessionId) {
        throw new functions.https.HttpsError('invalid-argument', 'invoiceId and sessionId are required');
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session && (session.payment_status === 'paid' || session.status === 'complete')) {
            const paidDollars = session.amount_total ? (session.amount_total / 100) : 0;
            const res = await recordInvoicePaidInFirestore(
                invoiceId,
                String(session.payment_intent || session.id),
                paidDollars,
                session.payment_method_types?.[0] || 'card'
            );
            return { paid: true, ...res };
        }
        return { paid: false, status: session?.payment_status || 'unpaid' };
    } catch (error: any) {
        console.error('Error verifying invoice checkout session:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || functions.config().stripe?.webhook_secret;

    let event;

    try {
        if (endpointSecret && sig) {
            // Verify signature
            event = stripe.webhooks.constructEvent(req.rawBody, sig as string, endpointSecret);
        } else {
            // Fallback for development without signature verification if secret is not set
            event = req.body;
        }
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle the event
    if (event.type === 'account.updated') {
        const account = event.data.object as any;
        const stripeAccountId = account.id;
        const chargesEnabled = account.charges_enabled;

        // Find the user with this stripe account ID
        const usersSnapshot = await admin.firestore().collection('users')
            .where('stripeAccountId', '==', stripeAccountId)
            .limit(1)
            .get();

        if (!usersSnapshot.empty) {
            const userDoc = usersSnapshot.docs[0];
            await userDoc.ref.update({
                stripeChargesEnabled: chargesEnabled,
            });
            const orgId = userDoc.data()?.org_id || userDoc.data()?.organizationId;
            if (orgId) {
                await admin.firestore().collection('organizations').doc(orgId).set({
                    stripeAccountId,
                    stripeChargesEnabled: chargesEnabled,
                    settings: { stripeEnabled: chargesEnabled }
                }, { merge: true });
            }
        }
    }

    // Handle deposit or final invoice payment completion
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const metadata = session.metadata || {};

        if (metadata.type === 'invoice' && metadata.invoiceId) {
            const invoiceId = metadata.invoiceId;
            const paymentIntentId = String(session.payment_intent || session.id);
            const paidDollars = session.amount_total ? (session.amount_total / 100) : Number(metadata.amountDollars || 0);
            console.log(`Invoice payment completed for invoice ${invoiceId}, PI: ${paymentIntentId}`);
            await recordInvoicePaidInFirestore(invoiceId, paymentIntentId, paidDollars, session.payment_method_types?.[0] || 'card');
        }

        if (metadata.type === 'deposit' && metadata.quoteId) {
            const quoteId = metadata.quoteId;
            const jobId = metadata.jobId;
            const paymentIntentId = session.payment_intent;

            console.log(`Deposit payment completed for quote ${quoteId}, PI: ${paymentIntentId}`);

            // Update quote — mark deposit as paid
            await admin.firestore().collection('quotes').doc(quoteId).update({
                'agreement.depositPaid': true,
                'agreement.depositPaidAt': admin.firestore.FieldValue.serverTimestamp(),
                'agreement.depositPaymentIntentId': paymentIntentId,
                'agreement.depositPaymentMethod': session.payment_method_types?.[0] || 'card',
            });

            // Update linked job if it exists
            if (jobId) {
                await admin.firestore().collection('jobs').doc(jobId).update({
                    deposit_paid: true,
                    deposit_paid_at: admin.firestore.FieldValue.serverTimestamp(),
                    deposit_payment_id: paymentIntentId,
                });
            }

            console.log(`Deposit marked as paid for quote ${quoteId}`);
        }
    }

    res.json({ received: true });
});
