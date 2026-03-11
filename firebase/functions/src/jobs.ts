import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const onJobStatusChanged = functions.firestore
    .document('jobs/{jobId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const previousData = change.before.data();

        // Check if status changed to 'completed'
        if (newData.status === 'completed' && previousData.status !== 'completed') {
            const jobId = context.params.jobId;
            console.log(`Job ${jobId} completed. Checking for material usage...`);

            // Check if there are parts usage to process
            const parts = newData.costs?.parts;

            // Handle both structure types (legacy number vs new object)
            if (!parts || typeof parts !== 'object' || !parts.items || !Array.isArray(parts.items) || parts.items.length === 0) {
                console.log(`No parts recorded for Job ${jobId}.`);
                return null;
            }

            const items: any[] = parts.items;
            const batch = db.batch();
            let updateCount = 0;

            for (const item of items) {
                if (item.material_id && item.quantity > 0) {
                    const materialRef = db.collection('materials').doc(item.material_id);
                    // Decrement using FieldValue.increment for atomicity
                    batch.update(materialRef, {
                        quantity: admin.firestore.FieldValue.increment(-item.quantity),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // Also log usage in inventory_usage collection (optional but good for history)
                    const usageRef = db.collection('inventory_usage').doc();
                    batch.set(usageRef, {
                        job_id: jobId,
                        org_id: newData.org_id,
                        material_id: item.material_id,
                        material_name: item.name,
                        quantity: item.quantity,
                        usedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    updateCount++;
                }
            }

            if (updateCount > 0) {
                try {
                    await batch.commit();
                    console.log(`Successfully decremented ${updateCount} materials for Job ${jobId}.`);
                } catch (error) {
                    console.error(`Error updating inventory for Job ${jobId}:`, error);
                }
            } else {
                console.log(`No linked materials found to decrement for Job ${jobId}.`);
            }
        }

        return null;
    });
