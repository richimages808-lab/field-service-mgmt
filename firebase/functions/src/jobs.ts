import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendJobScheduledCommunication, sendCustomerEnRouteCommunication } from './customerCommunication';
import { sendTechAssignmentSMS } from './techAlertService';

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

            // Close out the approved quote so the quote list reflects finished work
            const activeQuoteId = newData.active_quote_id || newData.createdFromQuoteId;
            if (activeQuoteId) {
                try {
                    const qRef = db.collection('quotes').doc(activeQuoteId);
                    const qSnap = await qRef.get();
                    if (qSnap.exists && qSnap.data()?.status === 'approved') {
                        await qRef.update({
                            status: 'completed',
                            completedAt: admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                } catch (qErr) {
                    console.warn(`Failed to mark quote ${activeQuoteId} completed for Job ${jobId}:`, qErr);
                }
            }

            // Check if there are parts usage to process
            const parts = newData.costs?.parts;

            // The Job Completion Wizard deducts inventory itself (and returns unused
            // prepped items). It flags the job so we don't deduct a second time.
            if (newData.inventory_deducted === true) {
                console.log(`Inventory for Job ${jobId} already deducted by completion wizard.`);
                return null;
            }

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

        // Job status flags — "booked" = has a confirmed slot on the calendar.
        // Dispatching (scheduled → dispatched) must not cancel the customer's confirmation.
        const BOOKED = ['scheduled', 'dispatched'];
        const wasScheduled = BOOKED.includes(previousData?.status);
        const isScheduled = BOOKED.includes(newData?.status);

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
        const dateChanged = newData.scheduled_at?.toMillis?.() !== previousData?.scheduled_at?.toMillis?.();

        // A new time was set → the customer's "different date" request is handled
        if (dateChanged && newData.scheduled_at && newData.customer_reschedule_request?.status === 'pending') {
            await change.after.ref.update({
                'customer_reschedule_request.status': 'resolved',
                'customer_reschedule_request.resolvedAt': admin.firestore.FieldValue.serverTimestamp(),
                reschedule_requested: false,
            }).catch(e => console.warn(`[Jobs] Could not resolve reschedule request for ${jobId}:`, e));
            try {
                const open = await change.after.ref.collection('rescheduleRequests')
                    .where('source', '==', 'customer').where('status', '==', 'pending').get();
                await Promise.all(open.docs.map(d => d.ref.update({ status: 'resolved', resolvedAt: admin.firestore.FieldValue.serverTimestamp() })));
            } catch (e) { console.warn(`[Jobs] Could not close customer reschedule history for ${jobId}:`, e); }
        }

        // Staff approval gate: auto-scheduled times wait for a dispatcher/tech to
        // confirm before the customer is told. If staff move a pending time
        // themselves, that counts as approval.
        const confirmationPending = newData.schedule_confirmation?.status === 'pending';
        const autoWroteThis = newData.autoScheduledAt?.toMillis?.() !== previousData?.autoScheduledAt?.toMillis?.();
        const staffMovedPendingTime = confirmationPending && scheduleTimeChanged && dateChanged && !autoWroteThis;
        const justConfirmed = isScheduled && !confirmationPending &&
            previousData?.schedule_confirmation?.status === 'pending' &&
            newData.schedule_confirmation?.status === 'confirmed';

        // Tech Assignment Alert logic
        const isNewlyAssigned = newData.assigned_tech_id && (newData.assigned_tech_id !== previousData?.assigned_tech_id || isNewlyScheduled);
        if (isNewlyAssigned) {
            console.log(`Job ${jobId} assigned to technician ${newData.assigned_tech_name || newData.assigned_tech_id}. Dispatching tech alert...`);
            handleTechAssignmentAlert(newData.org_id, jobId).catch(e => console.warn(`[TechAlert] Auto alert error for Job ${jobId}:`, e));
        }

        // Technician En Route Alert logic
        const isNewlyEnRoute = newData.status === 'en_route' && previousData?.status !== 'en_route';
        if (isNewlyEnRoute) {
            console.log(`Job ${jobId} status updated to en_route. Dispatching customer en-route alert...`);
            handleCustomerEnRouteAlert(newData.org_id, jobId, newData).catch(e => console.warn(`[Jobs] En-route customer alert error for Job ${jobId}:`, e));
        }

        if (staffMovedPendingTime) {
            // Mark approved; that write re-triggers this function and sends the notice
            await change.after.ref.update({
                schedule_confirmation: {
                    status: 'confirmed',
                    confirmedBy: 'staff_reschedule',
                    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
            });
        } else if (justConfirmed) {
            console.log(`Job ${jobId} schedule confirmed by staff. Sending customer confirmation now...`);
            await handleJobScheduledNotification(newData.org_id, jobId, newData, true, true);
        } else if ((isNewlyScheduled || scheduleTimeChanged) && !confirmationPending) {
            // Only a date/time change matters to the customer — not a tech swap
            if (isNewlyScheduled || dateChanged) {
                console.log(`Job ${jobId} schedule updated. Processing customer notification...`);
                await handleJobScheduledNotification(newData.org_id, jobId, newData, true);
            }
        } else if ((isNewlyScheduled || scheduleTimeChanged) && confirmationPending) {
            console.log(`Job ${jobId} has a proposed time awaiting staff approval — customer not notified yet.`);
        }

        return null;
    });

export const onJobCreated = functions.firestore
    .document('jobs/{jobId}')
    .onCreate(async (snapshot, context) => {
        const newData = snapshot.data();
        const jobId = context.params.jobId;

        if (newData?.assigned_tech_id) {
            console.log(`New Job ${jobId} created with assigned tech. Dispatching tech alert...`);
            handleTechAssignmentAlert(newData.org_id, jobId).catch(e => console.warn(`[TechAlert] Auto alert on create error for Job ${jobId}:`, e));
        }

        if (newData?.status === 'scheduled' && newData?.schedule_confirmation?.status !== 'pending') {
            console.log(`Job ${jobId} created as scheduled. Processing customer notification...`);
            await handleJobScheduledNotification(newData.org_id, jobId, newData, false);
        }
        return null;
    });

/**
 * Helper to process automated technician assignment alert
 */
async function handleTechAssignmentAlert(orgId: string, jobId: string) {
    if (!orgId || !jobId) return;
    try {
        let techAlertEnabled = true;
        const orgDoc = await db.collection('organizations').doc(orgId).get();
        if (orgDoc.exists) {
            const techSettings = orgDoc.data()?.settings?.techAlertSettings;
            if (techSettings && techSettings.sendSmsOnAssign === false) {
                techAlertEnabled = false;
            }
        }

        if (techAlertEnabled) {
            await sendTechAssignmentSMS(orgId, jobId);
        }
    } catch (err) {
        console.warn(`[TechAlert] Failed to check tech alert settings for Job ${jobId}:`, err);
    }
}

/**
 * Helper to process automated customer notification when technician starts transit (en route)
 */
async function handleCustomerEnRouteAlert(orgId: string, jobId: string, jobData: any) {
    if (!orgId || !jobId) return;
    try {
        const customerName = jobData.customer?.name || 'Customer';
        const customerPhone = jobData.customer?.phone || '';
        const customerEmail = jobData.customer?.email || '';
        const techName = jobData.assigned_tech_name || 'Technician';

        const sent = await sendCustomerEnRouteCommunication(
            orgId,
            jobId,
            customerName,
            customerPhone,
            customerEmail,
            techName
        );

        if (sent) {
            await db.collection('jobs').doc(jobId).update({
                customer_arrival_notified: true,
                en_route_notified_at: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[Jobs] Successfully notified customer for en-route Job ${jobId}`);
        }
    } catch (err) {
        console.error(`[Jobs] Failed to send en-route notification for Job ${jobId}:`, err);
    }
}

/**
 * Helper to process instant dispatch or queue delayed confirmation for scheduled jobs
 */
async function handleJobScheduledNotification(
    orgId: string,
    jobId: string,
    jobData: any,
    isUpdate: boolean = false,
    forceInstant: boolean = false
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

    let orgTimezone = '';
    try {
        const orgDoc = await db.collection('organizations').doc(orgId).get();
        if (orgDoc.exists) {
            const orgData = orgDoc.data() || {};
            orgTimezone = orgData.timezone || orgData.settings?.timezone || '';
            const customSettings = orgData.settings?.jobScheduledNotification;
            if (customSettings) {
                notifSettings = { ...notifSettings, ...customSettings };
            }
        }
    } catch (err) {
        console.warn(`[Jobs] Failed to load org ${orgId} notification settings:`, err);
    }

    // A staff confirmation is an explicit "send it" — only a fully disabled setting stops it
    if (!notifSettings.enabled || (notifSettings.timing === 'manual' && !forceInstant)) {
        console.log(`[Jobs] Scheduled notification is manual or disabled for Org ${orgId}`);
        return;
    }

    const customerName = jobData.customer?.name || 'Customer';
    const customerPhone = jobData.customer?.phone || '';
    const customerEmail = jobData.customer?.email || '';

    let scheduledTimeString = 'an upcoming time';
    if (jobData.scheduled_at) {
        const date = jobData.scheduled_at.toDate ? jobData.scheduled_at.toDate() : new Date(jobData.scheduled_at);
        const formattedDate = date.toLocaleString('en-US', {
            timeZone: jobData.timezone || orgTimezone || 'Pacific/Honolulu',
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });
        const durationMin = Number(jobData.estimated_duration) || 0;
        let durationText = '';
        if (durationMin >= 60) {
            const hours = Math.round((durationMin / 60) * 10) / 10;
            durationText = ` (~${hours} hr${hours !== 1 ? 's' : ''})`;
        } else if (durationMin > 0) {
            durationText = ` (~${durationMin} mins)`;
        }
        scheduledTimeString = `${formattedDate}${durationText}`;
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
    if (notifSettings.timing === 'instant' || forceInstant) {
        console.log(`[Jobs] Instant notification mode for Job ${jobId} via ${deliveryMethod}`);
        try {
            const sent = await sendJobScheduledCommunication(
                orgId,
                jobId,
                customerName,
                customerPhone,
                customerEmail,
                deliveryMethod,
                scheduledTimeString
            );
            await db.collection('jobs').doc(jobId).update({
                customer_schedule_notice: {
                    sent,
                    channel: deliveryMethod,
                    timeText: scheduledTimeString,
                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                },
            }).catch(() => { /* non-fatal */ });
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

