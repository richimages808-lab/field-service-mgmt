import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendJobScheduledCommunication } from './customerCommunication';

const db = admin.firestore();

export const onJobStatusChanged = functions.firestore
    .document('jobs/{jobId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const previousData = change.before.data();
        const jobId = context.params.jobId;

        // Check if status changed to 'completed'
        if (newData.status === 'completed' && previousData.status !== 'completed') {
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

        // New Scheduling logic
        const wasScheduled = previousData?.status === 'scheduled';
        const isScheduled = newData?.status === 'scheduled';
        
        // Did the schedule actually change?
        const isNewlyScheduled = isScheduled && !wasScheduled;
        
        // Or did the date/time change while already scheduled?
        const scheduleTimeChanged = isScheduled && wasScheduled && 
            (newData.scheduled_at?.toMillis() !== previousData?.scheduled_at?.toMillis());

        if (isNewlyScheduled || scheduleTimeChanged) {
            console.log(`Job ${jobId} schedule updated. Sending notification...`);
            
            const orgId = newData.org_id;
            const customerName = newData.customer?.name || 'Customer';
            const customerPhone = newData.customer?.phone;
            const customerEmail = newData.customer?.email;
            
            // Format the date for the message
            let scheduledTimeString = 'an upcoming time';
            if (newData.scheduled_at) {
                 const date = newData.scheduled_at.toDate();
                 scheduledTimeString = date.toLocaleString('en-US', { 
                     weekday: 'long', 
                     month: 'short', 
                     day: 'numeric', 
                     hour: 'numeric', 
                     minute: '2-digit',
                     timeZoneName: 'short'
                 });
            }

            // Determine preferred method
            const pref = newData.request?.communicationPreference; // 'phone' | 'text' | 'email'
            let autoFollowUp: 'none' | 'preferred' | 'sms' | 'email' = 'preferred';
            if (pref === 'text') autoFollowUp = 'sms';
            else if (pref === 'email') autoFollowUp = 'email';
            
            try {
                await sendJobScheduledCommunication(
                    orgId,
                    jobId,
                    customerName,
                    customerPhone,
                    customerEmail,
                    autoFollowUp,
                    scheduledTimeString
                );
                console.log(`Successfully sent schedule notification for Job ${jobId}`);
            } catch (error) {
                console.error(`Failed to send schedule notification for Job ${jobId}:`, error);
            }
        }

        return null;
    });

export const onJobCreated = functions.firestore
    .document('jobs/{jobId}')
    .onCreate(async (snapshot, context) => {
        const newData = snapshot.data();
        const jobId = context.params.jobId;

        if (newData?.status === 'scheduled') {
            console.log(`Job ${jobId} created as scheduled. Sending notification...`);
            
            const orgId = newData.org_id;
            const customerName = newData.customer?.name || 'Customer';
            const customerPhone = newData.customer?.phone;
            const customerEmail = newData.customer?.email;
            
            let scheduledTimeString = 'an upcoming time';
            if (newData.scheduled_at) {
                 const date = newData.scheduled_at.toDate();
                 scheduledTimeString = date.toLocaleString('en-US', { 
                     weekday: 'long', 
                     month: 'short', 
                     day: 'numeric', 
                     hour: 'numeric', 
                     minute: '2-digit',
                     timeZoneName: 'short'
                 });
            }

            const pref = newData.request?.communicationPreference;
            let autoFollowUp: 'none' | 'preferred' | 'sms' | 'email' = 'preferred';
            if (pref === 'text') autoFollowUp = 'sms';
            else if (pref === 'email') autoFollowUp = 'email';
            
            try {
                await sendJobScheduledCommunication(
                    orgId,
                    jobId,
                    customerName,
                    customerPhone,
                    customerEmail,
                    autoFollowUp,
                    scheduledTimeString
                );
            } catch (error) {
                console.error(`Failed to send schedule notification for Job ${jobId}:`, error);
            }
        }
        return null;
    });
