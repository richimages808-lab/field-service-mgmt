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

        // Job status flags
        const wasScheduled = previousData?.status === 'scheduled';
        const isScheduled = newData?.status === 'scheduled';

        // Job Cancellation / Unschedule check
        if (wasScheduled && !isScheduled) {
            console.log(`Job ${jobId} unscheduled or cancelled. Cancelling any pending notification...`);
            try {
                const notifRef = db.collection('scheduled_job_notifications').doc(jobId);
                const notifDoc = await notifRef.get();
                if (notifDoc.exists && notifDoc.data()?.status === 'pending') {
                    await notifRef.update({
                        status: 'cancelled',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`Successfully cancelled pending notification for Job ${jobId}`);
                }
            } catch (err) {
                console.warn(`Failed to cancel pending notification for Job ${jobId}:`, err);
            }
        }

        // Job Scheduling / Rescheduling logic
        // Did the schedule actually change?
        const isNewlyScheduled = isScheduled && !wasScheduled;
        
        // Or did the date/time or assigned tech change while already scheduled?
        const scheduleTimeChanged = isScheduled && wasScheduled && 
            (newData.scheduled_at?.toMillis() !== previousData?.scheduled_at?.toMillis() ||
             newData.assigned_tech_id !== previousData?.assigned_tech_id);

        if (isNewlyScheduled || scheduleTimeChanged) {
            console.log(`Job ${jobId} schedule updated. Processing customer notification...`);
            await handleJobScheduledNotification(newData.org_id, jobId, newData, true);
        }

        return null;
    });

export const onJobCreated = functions.firestore
    .document('jobs/{jobId}')
    .onCreate(async (snapshot, context) => {
        const newData = snapshot.data();
        const jobId = context.params.jobId;

        if (newData?.status === 'scheduled') {
            console.log(`Job ${jobId} created as scheduled. Processing customer notification...`);
            await handleJobScheduledNotification(newData.org_id, jobId, newData, false);
        }
        return null;
    });

/**
 * Helper to process instant dispatch or queue delayed confirmation for scheduled jobs
 */
async function handleJobScheduledNotification(
    orgId: string,
    jobId: string,
    jobData: any,
    isUpdate: boolean = false
) {
    if (!orgId) return;

    // Default Org Notification Settings
    let notifSettings = {
        enabled: true,
        timing: 'delayed' as 'instant' | 'delayed' | 'manual',
        delayMinutes: 30,
        defaultChannel: 'customer_preference' as 'customer_preference' | 'sms' | 'email' | 'phone_call' | 'all',
        resetTimerOnReschedule: true,
        includeTrackingLink: true
    };

    try {
        const orgDoc = await db.collection('organizations').doc(orgId).get();
        if (orgDoc.exists) {
            const customSettings = orgDoc.data()?.settings?.jobScheduledNotification;
            if (customSettings) {
                notifSettings = { ...notifSettings, ...customSettings };
            }
        }
    } catch (err) {
        console.warn(`[Jobs] Failed to load org ${orgId} notification settings:`, err);
    }

    if (!notifSettings.enabled || notifSettings.timing === 'manual') {
        console.log(`[Jobs] Scheduled notification is manual or disabled for Org ${orgId}`);
        return;
    }

    const customerName = jobData.customer?.name || 'Customer';
    const customerPhone = jobData.customer?.phone || '';
    const customerEmail = jobData.customer?.email || '';

    let scheduledTimeString = 'an upcoming time';
    if (jobData.scheduled_at) {
        const date = jobData.scheduled_at.toDate ? jobData.scheduled_at.toDate() : new Date(jobData.scheduled_at);
        scheduledTimeString = date.toLocaleString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    }

    // Determine delivery channel
    const pref = jobData.request?.communicationPreference; // 'phone' | 'text' | 'email'
    let deliveryMethod: 'sms' | 'email' | 'phone_call' | 'all' | 'preferred' = 'preferred';

    if (notifSettings.defaultChannel === 'customer_preference') {
        if (pref === 'phone') deliveryMethod = 'phone_call';
        else if (pref === 'text') deliveryMethod = 'sms';
        else if (pref === 'email') deliveryMethod = 'email';
        else deliveryMethod = 'preferred';
    } else {
        deliveryMethod = notifSettings.defaultChannel;
    }

    // Instant Mode
    if (notifSettings.timing === 'instant') {
        console.log(`[Jobs] Instant notification mode for Job ${jobId} via ${deliveryMethod}`);
        try {
            await sendJobScheduledCommunication(
                orgId,
                jobId,
                customerName,
                customerPhone,
                customerEmail,
                deliveryMethod,
                scheduledTimeString
            );
        } catch (error) {
            console.error(`[Jobs] Failed to send instant schedule notification for Job ${jobId}:`, error);
        }
        return;
    }

    // Delayed Mode (e.g. 30 minutes grace period for dispatcher adjustments)
    const delayMinutes = Math.max(1, notifSettings.delayMinutes || 30);
    const executeAt = admin.firestore.Timestamp.fromMillis(Date.now() + delayMinutes * 60 * 1000);

    console.log(`[Jobs] Queuing delayed notification for Job ${jobId} in ${delayMinutes} mins (executeAt: ${executeAt.toDate().toISOString()})`);

    const notifRef = db.collection('scheduled_job_notifications').doc(jobId);
    await notifRef.set({
        orgId,
        jobId,
        customerName,
        customerPhone: customerPhone || null,
        customerEmail: customerEmail || null,
        scheduledAt: jobData.scheduled_at,
        scheduledTimeString,
        assignedTechName: jobData.assigned_tech_name || null,
        channel: deliveryMethod,
        status: 'pending',
        executeAt,
        delayMinutes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(isUpdate ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
    }, { merge: true });
}

