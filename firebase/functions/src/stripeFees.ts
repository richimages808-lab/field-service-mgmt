import * as functions from "firebase-functions";
import * as admin from 'firebase-admin';

// Initialize Sendgrid if it's not already
const sgMail = require('@sendgrid/mail');
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export const onBaseStripeRateChanged = functions.firestore
    .document('site_config/global')
    .onUpdate(async (change, context) => {
        const after = change.after.data();
        const before = change.before.data();

        const oldRate = before.baseStripeRate || 2.9;
        const newRate = after.baseStripeRate || 2.9;

        // Only trigger if the rate INCREASED
        if (newRate <= oldRate) {
            return null;
        }

        const db = admin.firestore();
        const orgsSnap = await db.collection('organizations').get();
        
        console.log(`Global Base Stripe Rate increased from ${oldRate}% to ${newRate}%. Adjusting ${orgsSnap.size} tenants.`);

        const batch = db.batch();
        const emailPromises: Promise<any>[] = [];

        for (const orgDoc of orgsSnap.docs) {
            const org = orgDoc.data();
            
            // Only update active tenants who have an email
            if (!org.email && !org.ownerEmail) continue;

            const currentMargin = org.settings?.processingMarginPercent !== undefined ? org.settings.processingMarginPercent : 1.0;
            const newTotalFee = newRate + currentMargin;

            // Update the Organization Document
            batch.update(orgDoc.ref, {
                'settings.stripeFeeOverridePercent': newTotalFee,
                'settings.processingMarginPercent': currentMargin // ensure it's explicitly set
            });

            // Prepare Email Notification
            const recipientEmail = org.email || org.ownerEmail;
            const tenantName = org.name || "Valued Custom";

            const msg = {
                to: recipientEmail,
                from: 'billing@dispatchbox.com', // Assuming generic verified sender
                subject: 'Important Update Regarding Processing Fees',
                text: `Dear ${tenantName},\n\nAs part of our commitment to providing you with the best software infrastructure, we want to inform you of an upcoming industry-wide adjustment to credit card processing fees by underlying payment providers. Effective immediately, the base processing rate has increased.\n\nWe have absorbed as much of this upstream cost as possible to remain competitive, but this requires an adjustment of your transaction fee to ${newTotalFee}%. This allows us to ensure the uninterrupted security and reliability of your transaction channels.\n\nThank you for your business,\nDispatchBox Platform Billing`,
                html: `
                    <div style="font-family: sans-serif; p: 20px;">
                        <h2>Important Update Regarding Processing Fees</h2>
                        <p>Dear ${tenantName},</p>
                        <p>As part of our commitment to providing you with the best software infrastructure, we want to inform you of an upcoming industry-wide adjustment to credit card processing fees by underlying payment providers.</p>
                        <p>We have absorbed as much of this upstream cost as possible to remain competitive, but this requires an adjustment of your transaction fee to <strong>${newTotalFee}%</strong>.</p>
                        <p>This allows us to ensure the uninterrupted security and reliability of your transaction channels.</p>
                        <br/>
                        <p>Thank you for your business,</p>
                        <p><strong>DispatchBox Platform Billing</strong></p>
                    </div>
                `,
            };

            if (process.env.SENDGRID_API_KEY) {
                emailPromises.push(sgMail.send(msg).catch((e: any) => console.error("SendGrid failed", e)));
            }
        }

        await batch.commit();
        if (emailPromises.length > 0) {
            await Promise.all(emailPromises);
        }

        console.log("Successfully propagated rate hike and dispatched emails!");
        return { success: true };
    });
