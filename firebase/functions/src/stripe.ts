import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret_key || 'sk_test_fake', {
    apiVersion: '2023-10-16', // Using a stable API version
});

const APP_URL = process.env.APP_URL || 'https://dispatch-box.com';

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

    let stripeAccountId = userData.stripeAccountId;

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

            // Save to Firestore
            await admin.firestore().collection('users').doc(userId).update({
                stripeAccountId: stripeAccountId,
            });
        } catch (error: any) {
            console.error('Error creating Stripe account:', error);
            throw new functions.https.HttpsError('internal', error.message);
        }
    }

    // Create Account Link
    try {
        const accountLink = await stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: `${APP_URL}/tech-profile?stripe_refresh=true&tab=payments`,
            return_url: `${APP_URL}/tech-profile?stripe_return=true&tab=payments`,
            type: 'account_onboarding',
        });

        return { url: accountLink.url };
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
    const stripeAccountId = userDoc.data()?.stripeAccountId;

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
        }
    }

    // Handle deposit payment completion
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const metadata = session.metadata || {};

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
