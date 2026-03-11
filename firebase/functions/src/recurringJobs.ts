import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

export const processRecurringJobs = functions.pubsub.schedule("every 24 hours").onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    const snapshot = await db.collection("recurring_schedules")
        .where("isActive", "==", true)
        .where("nextRunAt", "<=", now)
        .get();

    if (snapshot.empty) {
        console.log("No recurring jobs due at this time.");
        return;
    }

    console.log(`Processing ${snapshot.size} recurring jobs...`);

    const promises: Promise<void>[] = [];

    for (const doc of snapshot.docs) {
        const schedule = { id: doc.id, ...doc.data() } as any;

        promises.push((async () => {
            try {
                // Create a new job based on the template
                const jobData = {
                    ...schedule.jobTemplate,
                    org_id: schedule.org_id,
                    status: 'pending',
                    quote_status: 'draft',
                    recurring_schedule_id: schedule.id,
                    createdAt: serverNow,
                    createdBy: 'system_scheduler'
                };

                await db.collection("jobs").add(jobData);

                // Calculate nextRunAt based on frequency
                let nextRunAt = new Date();
                const currentNextRunAt = schedule.nextRunAt.toDate();

                switch (schedule.frequency) {
                    case 'weekly':
                        currentNextRunAt.setDate(currentNextRunAt.getDate() + 7);
                        break;
                    case 'biweekly':
                        currentNextRunAt.setDate(currentNextRunAt.getDate() + 14);
                        break;
                    case 'monthly':
                        currentNextRunAt.setMonth(currentNextRunAt.getMonth() + 1);
                        break;
                    case 'quarterly':
                        currentNextRunAt.setMonth(currentNextRunAt.getMonth() + 3);
                        break;
                    default:
                        console.warn(`Unknown frequency ${schedule.frequency} for schedule ${schedule.id}, defaulting to monthly.`);
                        currentNextRunAt.setMonth(currentNextRunAt.getMonth() + 1);
                }

                nextRunAt = currentNextRunAt;

                // If it's still in the past (e.g. system was down for a long time), bring it to the future
                if (nextRunAt.getTime() < Date.now()) {
                    nextRunAt = new Date();
                    switch (schedule.frequency) {
                        case 'weekly': nextRunAt.setDate(nextRunAt.getDate() + 7); break;
                        case 'biweekly': nextRunAt.setDate(nextRunAt.getDate() + 14); break;
                        case 'monthly': nextRunAt.setMonth(nextRunAt.getMonth() + 1); break;
                        case 'quarterly': nextRunAt.setMonth(nextRunAt.getMonth() + 3); break;
                    }
                }

                await doc.ref.update({
                    lastRunAt: serverNow,
                    nextRunAt: admin.firestore.Timestamp.fromDate(nextRunAt)
                });

                console.log(`Successfully processed recurring schedule ${schedule.id}`);
            } catch (error) {
                console.error(`Error processing recurring schedule ${schedule.id}:`, error);
            }
        })());
    }

    await Promise.all(promises);
});
