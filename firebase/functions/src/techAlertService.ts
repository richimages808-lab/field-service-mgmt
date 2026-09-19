import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { sendSMS } from "./twilio/sms";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * Format a Firestore timestamp or Date string nicely for SMS
 */
function formatScheduledTime(scheduledAt: any, timezone: string = 'Pacific/Honolulu'): string {
    if (!scheduledAt) return 'Scheduled (Pending Confirmation)';
    try {
        const date = scheduledAt.toDate ? scheduledAt.toDate() : new Date(scheduledAt);
        return date.toLocaleString('en-US', {
            timeZone: timezone,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch {
        return 'Scheduled';
    }
}

/**
 * Core function to send technician assignment SMS
 */
export async function sendTechAssignmentSMS(
    orgId: string,
    jobId: string,
    overrideTechPhone?: string
): Promise<{ success: boolean; deliveredPhone?: string; error?: string; body?: string }> {
    try {
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) {
            return { success: false, error: 'Job not found' };
        }

        const job = jobDoc.data()!;
        const effectiveOrgId = orgId || job.org_id;

        // Fetch Org data
        let orgName = 'HiTopPlumbers';
        let orgTimezone = 'Pacific/Honolulu';
        let customTemplate: string | null = null;

        if (effectiveOrgId) {
            const orgDoc = await db.collection('organizations').doc(effectiveOrgId).get();
            if (orgDoc.exists) {
                const orgData = orgDoc.data()!;
                orgName = orgData.branding?.companyName || orgData.name || 'HiTopPlumbers';
                orgTimezone = orgData.settings?.timezone || orgData.timezone || 'Pacific/Honolulu';
                customTemplate = orgData.smsAutomation?.templates?.tech_job_assignment?.template || null;
            }
        }

        // Fetch Technician Info
        let techName = job.assigned_tech_name || 'Technician';
        let techPhone = overrideTechPhone || null;

        if (!techPhone && job.assigned_tech_id) {
            const techDoc = await db.collection('users').doc(job.assigned_tech_id).get();
            if (techDoc.exists) {
                const techData = techDoc.data()!;
                techName = techData.name || techName;
                techPhone = techData.phone || techData.contactPhone || null;
            }
        }

        // If tech has no phone and no override, check if we're in test environment
        if (!techPhone && (effectiveOrgId === 'demo-org' || orgName.toLowerCase().includes('hitop'))) {
            techPhone = '8082829726'; // Standard test phone for demo-org / HiTopPlumbers
        }

        if (!techPhone) {
            const err = `No phone number configured for technician ${techName}`;
            await db.collection('jobs').doc(jobId).update({
                'tech_alert_status.sent': false,
                'tech_alert_status.error': err,
                'tech_alert_status.channel': 'sms'
            });
            return { success: false, error: err };
        }

        const customerName = job.customer?.name || 'Customer';
        const address = job.customer?.address || 'Site Location';
        const jobTitle = job.request?.type || job.request?.description?.substring(0, 45) || 'Service Call';
        const scheduledTime = formatScheduledTime(job.scheduled_at, orgTimezone);
        const priority = (job.priority || 'medium').toUpperCase();
        const shortJobId = jobId.substring(0, 8);
        const techJobUrl = `https://dispatch-box.com/tech?jobId=${jobId}`;

        // Default or configured template
        const template = customTemplate ||
            `{companyName}: 🚨 New Job Assigned! {customerName} at {address} for {jobTitle} on {scheduledTime} (Priority: {priority}). View details: {techJobUrl} Reply STOP to opt out.`;

        // Render template variables
        let body = template
            .replace(/\{companyName\}/g, orgName)
            .replace(/\{techName\}/g, techName)
            .replace(/\{customerName\}/g, customerName)
            .replace(/\{address\}/g, address)
            .replace(/\{jobTitle\}/g, jobTitle)
            .replace(/\{scheduledTime\}/g, scheduledTime)
            .replace(/\{priority\}/g, priority)
            .replace(/\{jobId\}/g, shortJobId)
            .replace(/\{techJobUrl\}/g, techJobUrl);

        console.log(`[TechAlert] Sending assignment SMS to ${techPhone} for Job ${jobId}: ${body}`);

        const result = await sendSMS(techPhone, body, {
            orgId: effectiveOrgId || null,
            jobId,
            customerName
        });

        if (result.success) {
            await db.collection('jobs').doc(jobId).update({
                'tech_alert_status.sent': true,
                'tech_alert_status.sentAt': admin.firestore.FieldValue.serverTimestamp(),
                'tech_alert_status.channel': 'sms',
                'tech_alert_status.deliveredPhone': techPhone,
                'tech_alert_status.acknowledged': job.tech_alert_status?.acknowledged || false,
                'tech_alert_status.acknowledgedAt': job.tech_alert_status?.acknowledgedAt || null,
                'tech_alert_status.error': null
            });
            return { success: true, deliveredPhone: techPhone, body };
        } else {
            await db.collection('jobs').doc(jobId).update({
                'tech_alert_status.sent': false,
                'tech_alert_status.error': 'Failed to send SMS via Twilio',
                'tech_alert_status.channel': 'sms'
            });
            return { success: false, deliveredPhone: techPhone, error: 'Failed to send SMS via Twilio' };
        }
    } catch (err: any) {
        console.error('[TechAlert] Error dispatching tech assignment SMS:', err);
        return { success: false, error: err.message || 'Unknown error' };
    }
}

/**
 * Callable HTTPS function: Dispatcher manually triggers or re-sends tech alert
 */
export const sendTechJobAlert = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { jobId, overrideTechPhone, orgId } = data;
    if (!jobId) {
        throw new functions.https.HttpsError('invalid-argument', 'jobId is required.');
    }

    const effectiveOrgId = orgId || context.auth.token.org_id;
    const result = await sendTechAssignmentSMS(effectiveOrgId, jobId, overrideTechPhone);
    return result;
});

/**
 * Callable HTTPS function: Tech acknowledges job assignment
 */
export const acknowledgeTechJob = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { jobId } = data;
    if (!jobId) {
        throw new functions.https.HttpsError('invalid-argument', 'jobId is required.');
    }

    const jobRef = db.collection('jobs').doc(jobId);
    await jobRef.update({
        'tech_alert_status.acknowledged': true,
        'tech_alert_status.acknowledgedAt': admin.firestore.FieldValue.serverTimestamp(),
        'tech_alert_status.acknowledgedBy': context.auth.uid
    });

    return { success: true, acknowledgedAt: new Date().toISOString() };
});

/**
 * Callable HTTPS function: Tech saves pre-job truck prep checklist items
 */
export const updateJobPrepChecklist = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { jobId, prepChecklist } = data;
    if (!jobId || !Array.isArray(prepChecklist)) {
        throw new functions.https.HttpsError('invalid-argument', 'jobId and prepChecklist array are required.');
    }

    const jobRef = db.collection('jobs').doc(jobId);
    await jobRef.update({
        prep_checklist: prepChecklist,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
});

/**
 * Core function to send customer en-route / on-the-way SMS
 */
export async function sendCustomerEnRouteSMS(
    orgId: string,
    jobId: string,
    etaMinutes: number = 20,
    overrideCustomerPhone?: string
): Promise<{ success: boolean; deliveredPhone?: string; error?: string; body?: string }> {
    try {
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) {
            return { success: false, error: 'Job not found' };
        }

        const job = jobDoc.data()!;
        const effectiveOrgId = orgId || job.org_id;

        let orgName = 'HiTopPlumbers';
        let customTemplate: string | null = null;

        if (effectiveOrgId) {
            const orgDoc = await db.collection('organizations').doc(effectiveOrgId).get();
            if (orgDoc.exists) {
                const orgData = orgDoc.data()!;
                orgName = orgData.branding?.companyName || orgData.name || 'HiTopPlumbers';
                customTemplate = orgData.smsAutomation?.templates?.tech_en_route?.template || null;
            }
        }

        const customerName = job.customer?.name || 'Customer';
        let customerPhone = overrideCustomerPhone || job.customer?.phone || null;
        const techName = job.assigned_tech_name || 'Technician';
        const address = job.customer?.address || 'your location';
        const jobTitle = job.request?.type || job.request?.description?.substring(0, 45) || 'Service Call';
        const shortJobId = jobId.substring(0, 8);

        if (!customerPhone && (effectiveOrgId === 'demo-org' || orgName.toLowerCase().includes('hitop'))) {
            customerPhone = '8082829726';
        }

        if (!customerPhone) {
            console.warn(`[TechEnRoute] No customer phone available for job ${jobId}`);
            return { success: false, error: 'No customer phone number available' };
        }

        const template = customTemplate ||
            `{companyName}: Hi {customerName}, your technician {techName} is on the way to {address} for {jobTitle}! Estimated arrival: ~{etaMinutes} mins. Reply STOP to opt out.`;

        const body = template
            .replace(/\{companyName\}/g, orgName)
            .replace(/\{customerName\}/g, customerName)
            .replace(/\{techName\}/g, techName)
            .replace(/\{address\}/g, address)
            .replace(/\{jobTitle\}/g, jobTitle)
            .replace(/\{etaMinutes\}/g, String(etaMinutes))
            .replace(/\{jobId\}/g, shortJobId);

        console.log(`[TechEnRoute] Sending en route SMS to customer ${customerPhone} for Job ${jobId}: ${body}`);

        const result = await sendSMS(customerPhone, body, {
            orgId: effectiveOrgId || null,
            jobId,
            customerName
        });

        if (result.success) {
            await db.collection('jobs').doc(jobId).update({
                customer_en_route_notified: true,
                customer_en_route_notified_at: admin.firestore.FieldValue.serverTimestamp(),
                customer_en_route_delivered_phone: customerPhone
            });
            return { success: true, deliveredPhone: customerPhone, body };
        } else {
            return { success: false, deliveredPhone: customerPhone, error: 'Failed to send SMS via Twilio' };
        }
    } catch (err: any) {
        console.error('[TechEnRoute] Error dispatching customer en-route SMS:', err);
        return { success: false, error: err.message || 'Unknown error' };
    }
}

/**
 * Callable HTTPS function: Trigger customer en-route SMS
 */
export const notifyCustomerTechEnRoute = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { jobId, orgId, etaMinutes, overrideCustomerPhone } = data;
    if (!jobId) {
        throw new functions.https.HttpsError('invalid-argument', 'jobId is required.');
    }

    const effectiveOrgId = orgId || context.auth.token.org_id;
    const result = await sendCustomerEnRouteSMS(effectiveOrgId, jobId, etaMinutes || 20, overrideCustomerPhone);
    return result;
});

/**
 * Core function to send customer delay SMS
 */
export async function sendCustomerDelaySMS(
    orgId: string,
    jobId: string,
    delayMinutes: number = 30,
    reason?: string,
    overrideCustomerPhone?: string
): Promise<{ success: boolean; deliveredPhone?: string; error?: string; body?: string }> {
    try {
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) {
            return { success: false, error: 'Job not found' };
        }

        const job = jobDoc.data()!;
        const effectiveOrgId = orgId || job.org_id;

        let orgName = 'HiTopPlumbers';
        let customTemplate: string | null = null;

        if (effectiveOrgId) {
            const orgDoc = await db.collection('organizations').doc(effectiveOrgId).get();
            if (orgDoc.exists) {
                const orgData = orgDoc.data()!;
                orgName = orgData.branding?.companyName || orgData.name || 'HiTopPlumbers';
                customTemplate = orgData.smsAutomation?.templates?.tech_delayed?.template || null;
            }
        }

        const customerName = job.customer?.name || 'Customer';
        let customerPhone = overrideCustomerPhone || job.customer?.phone || null;
        const techName = job.assigned_tech_name || 'Technician';
        const address = job.customer?.address || 'your location';
        const jobTitle = job.request?.type || job.request?.description?.substring(0, 45) || 'Service Call';
        const delayReason = reason || 'traffic and job complexity';
        const shortJobId = jobId.substring(0, 8);

        if (!customerPhone && (effectiveOrgId === 'demo-org' || orgName.toLowerCase().includes('hitop'))) {
            customerPhone = '8082829726';
        }

        if (!customerPhone) {
            console.warn(`[TechDelay] No customer phone available for job ${jobId}`);
            return { success: false, error: 'No customer phone number available' };
        }

        const template = customTemplate ||
            `{companyName}: Hi {customerName}, technician {techName} is running approximately {delayMinutes} mins behind due to {delayReason}. We apologize for the wait and are en route soon! Reply STOP to opt out.`;

        const body = template
            .replace(/\{companyName\}/g, orgName)
            .replace(/\{customerName\}/g, customerName)
            .replace(/\{techName\}/g, techName)
            .replace(/\{address\}/g, address)
            .replace(/\{jobTitle\}/g, jobTitle)
            .replace(/\{delayMinutes\}/g, String(delayMinutes))
            .replace(/\{delayReason\}/g, delayReason)
            .replace(/\{jobId\}/g, shortJobId);

        console.log(`[TechDelay] Sending delay SMS to customer ${customerPhone} for Job ${jobId}: ${body}`);

        const result = await sendSMS(customerPhone, body, {
            orgId: effectiveOrgId || null,
            jobId,
            customerName
        });

        if (result.success) {
            await db.collection('jobs').doc(jobId).update({
                customer_delay_notified: true,
                customer_delay_notified_at: admin.firestore.FieldValue.serverTimestamp(),
                customer_delay_delivered_phone: customerPhone
            });
            return { success: true, deliveredPhone: customerPhone, body };
        } else {
            return { success: false, deliveredPhone: customerPhone, error: 'Failed to send SMS via Twilio' };
        }
    } catch (err: any) {
        console.error('[TechDelay] Error dispatching customer delay SMS:', err);
        return { success: false, error: err.message || 'Unknown error' };
    }
}

/**
 * Callable HTTPS function: Trigger customer delay alert
 */
export const notifyCustomerTechDelayed = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { jobId, orgId, delayMinutes, reason, overrideCustomerPhone } = data;
    if (!jobId) {
        throw new functions.https.HttpsError('invalid-argument', 'jobId is required.');
    }

    const effectiveOrgId = orgId || context.auth.token.org_id;
    const result = await sendCustomerDelaySMS(effectiveOrgId, jobId, delayMinutes || 30, reason, overrideCustomerPhone);
    return result;
});

/**
 * Core function to send customer arrival SMS when technician arrives on site
 */
export async function sendCustomerArrivalSMS(
    orgId: string,
    jobId: string,
    overrideCustomerPhone?: string
): Promise<{ success: boolean; deliveredPhone?: string; error?: string; body?: string }> {
    try {
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) {
            return { success: false, error: 'Job not found' };
        }

        const job = jobDoc.data()!;
        const effectiveOrgId = orgId || job.org_id;

        // Fetch Org data
        let orgName = 'HiTopPlumbers';
        let customTemplate: string | null = null;

        if (effectiveOrgId) {
            const orgDoc = await db.collection('organizations').doc(effectiveOrgId).get();
            if (orgDoc.exists) {
                const orgData = orgDoc.data()!;
                orgName = orgData.branding?.companyName || orgData.name || 'HiTopPlumbers';
                customTemplate = orgData.smsAutomation?.templates?.tech_arrived?.template || null;
            }
        }

        const customerName = job.customer?.name || 'Customer';
        let customerPhone = overrideCustomerPhone || job.customer?.phone || null;
        const techName = job.assigned_tech_name || 'Technician';
        const address = job.customer?.address || 'your service address';
        const jobTitle = job.request?.type || job.request?.description?.substring(0, 45) || 'Service Call';
        const shortJobId = jobId.substring(0, 8);

        // Demo org / test phone fallback
        if (!customerPhone && (effectiveOrgId === 'demo-org' || orgName.toLowerCase().includes('hitop'))) {
            customerPhone = '8082829726';
        }

        if (!customerPhone) {
            console.warn(`[TechArrival] No customer phone available for job ${jobId}`);
            return { success: false, error: 'No customer phone number available' };
        }

        // Default or configured template
        const template = customTemplate ||
            `{companyName}: Hi {customerName}, technician {techName} has arrived at your location ({address}) and has started work on {jobTitle}. Reply STOP to opt out.`;

        const body = template
            .replace(/\{companyName\}/g, orgName)
            .replace(/\{customerName\}/g, customerName)
            .replace(/\{techName\}/g, techName)
            .replace(/\{address\}/g, address)
            .replace(/\{jobTitle\}/g, jobTitle)
            .replace(/\{jobId\}/g, shortJobId);

        console.log(`[TechArrival] Sending arrival SMS to customer ${customerPhone} for Job ${jobId}: ${body}`);

        const result = await sendSMS(customerPhone, body, {
            orgId: effectiveOrgId || null,
            jobId,
            customerName
        });

        if (result.success) {
            await db.collection('jobs').doc(jobId).update({
                customer_arrival_notified: true,
                customer_arrival_notified_at: admin.firestore.FieldValue.serverTimestamp(),
                customer_arrival_delivered_phone: customerPhone
            });
            return { success: true, deliveredPhone: customerPhone, body };
        } else {
            return { success: false, deliveredPhone: customerPhone, error: 'Failed to send SMS via Twilio' };
        }
    } catch (err: any) {
        console.error('[TechArrival] Error dispatching customer arrival SMS:', err);
        return { success: false, error: err.message || 'Unknown error' };
    }
}

/**
 * Callable HTTPS function: Trigger customer arrival alert when tech checks in
 */
export const notifyCustomerTechArrived = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { jobId, orgId, overrideCustomerPhone } = data;
    if (!jobId) {
        throw new functions.https.HttpsError('invalid-argument', 'jobId is required.');
    }

    const effectiveOrgId = orgId || context.auth.token.org_id;
    const result = await sendCustomerArrivalSMS(effectiveOrgId, jobId, overrideCustomerPhone);
    return result;
});

/**
 * Sends automated SMS notification to the customer when a job is marked completed
 */
export async function sendCustomerCompletionSMS(
    orgId: string,
    jobId: string,
    overrideCustomerPhone?: string
): Promise<{ success: boolean; deliveredPhone?: string; body?: string; error?: string }> {
    try {
        const db = admin.firestore();
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) {
            return { success: false, error: `Job ${jobId} not found` };
        }

        const job = jobDoc.data() as any;
        const customerPhone = overrideCustomerPhone || job.customer?.phone;
        if (!customerPhone) {
            console.warn(`[TechCompletion] No phone number for customer on Job ${jobId}`);
            return { success: false, error: 'No customer phone number available' };
        }

        // Fetch organization settings & custom templates
        let effectiveOrgId = orgId || job.org_id;
        let orgName = 'Field Service';
        let customTemplate: string | null = null;

        if (effectiveOrgId) {
            const orgDoc = await db.collection('organizations').doc(effectiveOrgId).get();
            if (orgDoc.exists) {
                const orgData = orgDoc.data() as any;
                orgName = orgData.businessName || orgData.name || orgName;
                if (orgData.sms_templates?.job_completed?.template && orgData.sms_templates.job_completed.enabled !== false) {
                    customTemplate = orgData.sms_templates.job_completed.template;
                }
            }
        }

        const defaultTemplate = '{companyName}: Hi {customerName}, technician {techName} has completed work on {jobTitle}. Thank you for choosing us! Reply STOP to opt out.';
        const activeTemplate = customTemplate || defaultTemplate;

        const customerName = job.customer?.name || 'Valued Customer';
        const techName = job.assigned_tech_name || 'Your technician';
        const jobTitle = job.request?.title || job.type || 'your service request';
        const shortJobId = `#${jobId.substring(0, 8)}`;

        const body = activeTemplate
            .replace(/\{companyName\}/g, orgName)
            .replace(/\{customerName\}/g, customerName)
            .replace(/\{techName\}/g, techName)
            .replace(/\{jobTitle\}/g, jobTitle)
            .replace(/\{jobId\}/g, shortJobId);

        console.log(`[TechCompletion] Sending completion SMS to customer ${customerPhone} for Job ${jobId}: ${body}`);

        const result = await sendSMS(customerPhone, body, {
            orgId: effectiveOrgId || null,
            jobId,
            customerName
        });

        if (result.success) {
            await db.collection('jobs').doc(jobId).update({
                customer_completion_notified: true,
                customer_completion_notified_at: admin.firestore.FieldValue.serverTimestamp(),
                customer_completion_delivered_phone: customerPhone
            });
            return { success: true, deliveredPhone: customerPhone, body };
        } else {
            return { success: false, deliveredPhone: customerPhone, error: 'Failed to send SMS via Twilio' };
        }
    } catch (err: any) {
        console.error('[TechCompletion] Error dispatching customer completion SMS:', err);
        return { success: false, error: err.message || 'Unknown error' };
    }
}

/**
 * Callable HTTPS function: Trigger customer completion alert when tech completes job
 */
export const notifyCustomerJobCompleted = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { jobId, orgId, overrideCustomerPhone } = data;
    if (!jobId) {
        throw new functions.https.HttpsError('invalid-argument', 'jobId is required.');
    }

    const effectiveOrgId = orgId || context.auth.token.org_id;
    const result = await sendCustomerCompletionSMS(effectiveOrgId, jobId, overrideCustomerPhone);
    return result;
});
