import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret_key || 'sk_test_fake', {
    apiVersion: '2023-10-16', // Using a stable API version
});

const APP_URL = process.env.APP_URL || 'https://maintenancemanager-c5533.web.app';

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

    res.json({ received: true });
});
