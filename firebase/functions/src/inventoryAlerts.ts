import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as sgMail from "@sendgrid/mail";

// Initialize Sendgrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
}
const FROM_EMAIL = "service@dispatch-box.com";

const db = admin.firestore();

export const onMaterialUpdated = functions.firestore
    .document("materials/{materialId}")
    .onUpdate(async (change, context) => {
        const materialBefore = change.before.data();
        const materialAfter = change.after.data();

        const beforeQuantity = typeof materialBefore.quantity === 'number' ? materialBefore.quantity : 0;
        const afterQuantity = typeof materialAfter.quantity === 'number' ? materialAfter.quantity : 0;
        
        // Only trigger if quantity ACTUALLY decreased
        if (afterQuantity >= beforeQuantity) return null;

        const minQuantity = typeof materialAfter.minQuantity === 'number' ? materialAfter.minQuantity : 5;

        // Condition for low stock: it just dropped to or below minQuantity
        if (afterQuantity <= minQuantity && beforeQuantity > minQuantity) {
            const orgId = materialAfter.org_id;
            if (!orgId) return null;

            // Find all users in this org subscribed to immediate alerts
            const usersSnap = await db.collection("users")
                .where("org_id", "==", orgId)
                .where("inventorySettings.immediateAlertsEnabled", "==", true)
                .get();

            if (usersSnap.empty) return null;

            const emails = usersSnap.docs
                .map(d => d.data().inventorySettings?.alertEmail || d.data().email)
                .filter(Boolean);

            if (emails.length > 0 && SENDGRID_API_KEY) {
                const msg = {
                    to: emails,
                    from: FROM_EMAIL,
                    subject: `Low Stock Alert: ${materialAfter.name}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #e53e3e;">Low Stock Alert</h2>
                            <p>This is an automated alert from DispatchBox.</p>
                            <p>The inventory level for <strong>${materialAfter.name}</strong> has dropped to or below your minimum threshold.</p>
                            
                            <table style="border-collapse: collapse; width: 100%; max-width: 400px; margin-top: 20px;">
                                <tr>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: bold;">Current Quantity:</td>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0; color: #e53e3e; font-weight: bold;">${afterQuantity} ${materialAfter.unit || 'units'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: bold;">Minimum Threshold:</td>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0;">${minQuantity} ${materialAfter.unit || 'units'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: bold;">Location:</td>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0;">${materialAfter.location || 'N/A'}</td>
                                </tr>
                            </table>
                            
                            <p style="margin-top: 20px;">Please reorder this material to prevent supply shortages.</p>
                        </div>
                    `
                };

                try {
                    await sgMail.sendMultiple(msg);
                    console.log(`[InventoryAlerts] Low stock email sent for ${materialAfter.name} to ${emails.length} users`);
                } catch (error) {
                    console.error("[InventoryAlerts] Failed to send email:", error);
                }
            }
        }

        return null;
    });
