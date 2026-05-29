/**
 * NotificationService - Handles sending notifications to customers
 * Supports email and SMS with templated messages
 */

import { format } from 'date-fns';
import { Job } from '../types';

// Notification Types
export type NotificationType =
    | 'scheduled'
    | 'rescheduled'
    | 'reminder_24hr'
    | 'reminder_1hr'
    | 'en_route'
    | 'completed'
    | 'cancelled';

export type NotificationMethod = 'email' | 'sms' | 'both';

export interface NotificationOptions {
    method: NotificationMethod;
    includeCalendarInvite?: boolean;
    includeDirections?: boolean;
    customMessage?: string;
}

export interface NotificationResult {
    success: boolean;
    messageId?: string;
    error?: string;
    method: NotificationMethod;
    sentAt: Date;
}

// Notification Templates
const EMAIL_TEMPLATES: Record<NotificationType, { subject: string; body: string }> = {
    scheduled: {
        subject: '✅ Your service appointment is confirmed - {{serviceName}}',
        body: `Hi {{customerName}},

Great news! Your service appointment has been scheduled.

📅 **Date:** {{date}}
🕐 **Time:** {{time}}
👷 **Technician:** {{techName}}
📍 **Address:** {{address}}

**Service:** {{serviceName}}
**Estimated Duration:** {{duration}}

{{#if includeDirections}}
📍 [View Directions]({{directionsUrl}})
{{/if}}

{{#if calendarInvite}}
📅 [Add to Calendar]({{calendarUrl}})
{{/if}}

If you need to reschedule, please reply to this email or call us at {{companyPhone}}.

Thank you for choosing {{companyName}}!

---
{{companyName}}
{{companyPhone}}
{{companyEmail}}`
    },
    rescheduled: {
        subject: '📅 Your appointment has been rescheduled - {{serviceName}}',
        body: `Hi {{customerName}},

Your service appointment has been rescheduled.

**New Date & Time:**
📅 **Date:** {{date}}
🕐 **Time:** {{time}}
👷 **Technician:** {{techName}}

**Previous appointment was:** {{previousDate}} at {{previousTime}}

If this doesn't work for you, please reply to this email or call us at {{companyPhone}}.

Thank you for your understanding!

---
{{companyName}}`
    },
    reminder_24hr: {
        subject: '⏰ Reminder: Service appointment tomorrow - {{serviceName}}',
        body: `Hi {{customerName}},

This is a friendly reminder that your service appointment is tomorrow.

📅 **Date:** {{date}}
🕐 **Time:** {{time}}
👷 **Technician:** {{techName}}

**Service:** {{serviceName}}

Please ensure access to the area where service is needed. If you need to reschedule, please contact us as soon as possible.

See you tomorrow!

---
{{companyName}}
{{companyPhone}}`
    },
    reminder_1hr: {
        subject: '🔔 Your technician arrives in 1 hour',
        body: `Hi {{customerName}},

{{techName}} will be arriving in approximately 1 hour for your {{serviceName}} appointment.

Please ensure someone is available to provide access.

---
{{companyName}}`
    },
    en_route: {
        subject: '🚗 Your technician is on the way!',
        body: `Hi {{customerName}},

{{techName}} is now on the way to your location!

⏱️ **Estimated Arrival:** {{eta}}

They'll call if they have any trouble finding the location.

---
{{companyName}}`
    },
    completed: {
        subject: '✅ Service complete - How did we do?',
        body: `Hi {{customerName}},

Your {{serviceName}} service has been completed.

**Summary:**
- Technician: {{techName}}
- Date: {{date}}
- Work performed: {{workSummary}}

We hope you're satisfied with our service! Please take a moment to let us know how we did:

⭐ [Rate Your Experience]({{feedbackUrl}})

Thank you for choosing {{companyName}}!

---
{{companyName}}`
    },
    cancelled: {
        subject: '❌ Your appointment has been cancelled',
        body: `Hi {{customerName}},

Your service appointment for {{serviceName}} on {{date}} at {{time}} has been cancelled.

If you'd like to reschedule, please reply to this email or call us at {{companyPhone}}.

We hope to serve you again soon!

---
{{companyName}}`
    }
};

const SMS_TEMPLATES: Record<NotificationType, string> = {
    scheduled: `✅ Appointment confirmed: {{serviceName}} on {{date}} at {{time}}. Tech: {{techName}}. Reply HELP for assistance.`,
    rescheduled: `📅 Rescheduled: {{serviceName}} moved to {{date}} at {{time}}. Reply if this doesn't work.`,
    reminder_24hr: `⏰ Reminder: {{techName}} arriving tomorrow {{time}} for {{serviceName}}. Reply RESCHEDULE to change.`,
    reminder_1hr: `🔔 {{techName}} arrives in ~1 hour for your {{serviceName}} appointment.`,
    en_route: `🚗 {{techName}} is on the way! ETA: {{eta}}`,
    completed: `✅ {{serviceName}} complete! Rate us: {{feedbackUrl}}`,
    cancelled: `❌ Your {{serviceName}} appointment on {{date}} has been cancelled. Call {{companyPhone}} to reschedule.`
};

// Template variable replacement
function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
    let result = template;

    // Replace simple variables {{variable}}
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }

    // Handle conditionals {{#if condition}}...{{/if}}
    result = result.replace(/{{#if (\w+)}}([\s\S]*?){{\/if}}/g, (match, condition, content) => {
        return variables[condition] ? content : '';
    });

    return result;
}

// Build notification variables from job
function buildNotificationVariables(
    job: Job,
    type: NotificationType,
    options: NotificationOptions & {
        previousDate?: Date;
        eta?: Date;
        workSummary?: string;
    } = { method: 'email' }
): Record<string, string> {
    const scheduledDate = job.scheduled_at?.toDate?.() || new Date();

    return {
        customerName: job.customer.name.split(' ')[0], // First name
        fullCustomerName: job.customer.name,
        serviceName: (job.request?.description || 'No description').slice(0, 50),
        date: format(scheduledDate, 'EEEE, MMMM d, yyyy'),
        time: format(scheduledDate, 'h:mm a'),
        techName: job.assigned_tech_name || 'Your technician',
        address: job.customer.address,
        duration: `${job.estimated_duration || 60} minutes`,

        // Company info (would come from org settings)
        companyName: 'DispatchBox',
        companyPhone: '(808) 555-0100',
        companyEmail: 'support@dispatchbox.com',

        // Conditional content
        includeDirections: options.includeDirections ? 'true' : '',
        calendarInvite: options.includeCalendarInvite ? 'true' : '',

        // URLs (would be generated)
        directionsUrl: `https://maps.google.com/?q=${encodeURIComponent(job.customer.address)}`,
        calendarUrl: '#', // Would generate .ics file
        feedbackUrl: `https://dispatchbox.com/feedback/${job.id}`,

        // Optional fields
        previousDate: options.previousDate ? format(options.previousDate, 'MMMM d') : '',
        previousTime: options.previousDate ? format(options.previousDate, 'h:mm a') : '',
        eta: options.eta ? format(options.eta, 'h:mm a') : '',
        workSummary: options.workSummary || (job.request?.description || 'No description')
    };
}

// Main notification functions
export async function sendSchedulingNotification(
    job: Job,
    type: NotificationType,
    options: NotificationOptions = { method: 'email' }
): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    const variables = buildNotificationVariables(job, type, options);

    const customerEmail = job.customer.email;
    const customerPhone = job.customer.phone;

    // Send email if requested
    if (options.method === 'email' || options.method === 'both') {
        if (customerEmail) {
            const template = EMAIL_TEMPLATES[type];
            const subject = replaceTemplateVariables(template.subject, variables);
            const body = replaceTemplateVariables(template.body, variables);

            const result = await sendEmail(customerEmail, subject, body);
            results.push(result);

            // Log to communication history
            await logCommunication(job, {
                type: 'email',
                direction: 'outbound',
                content: body,
                subject,
                notificationType: type
            });
        } else {
            results.push({
                success: false,
                error: 'No email address available',
                method: 'email',
                sentAt: new Date()
            });
        }
    }

    // Send SMS if requested
    if (options.method === 'sms' || options.method === 'both') {
        if (customerPhone) {
            const template = SMS_TEMPLATES[type];
            const message = replaceTemplateVariables(template, variables);

            const result = await sendSMS(customerPhone, message);
            results.push(result);

            // Log to communication history
            await logCommunication(job, {
                type: 'sms',
                direction: 'outbound',
                content: message,
                notificationType: type
            });
        } else {
            results.push({
                success: false,
                error: 'No phone number available',
                method: 'sms',
                sentAt: new Date()
            });
        }
    }

    return results;
}

// Placeholder email sending function (would integrate with SendGrid/etc)
async function sendEmail(to: string, subject: string, body: string): Promise<NotificationResult> {
    console.log(`[NotificationService] Sending email to ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body preview: ${body.slice(0, 100)}...`);

    // TODO: Integrate with SendGrid or similar
    // const sgMail = require('@sendgrid/mail');
    // await sgMail.send({ to, from: 'noreply@dispatchbox.com', subject, html: body });

    // For now, simulate success
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
        success: true,
        messageId: `email_${Date.now()}`,
        method: 'email',
        sentAt: new Date()
    };
}

// Placeholder SMS sending function (would integrate with Twilio/etc)
async function sendSMS(to: string, message: string): Promise<NotificationResult> {
    console.log(`[NotificationService] Sending SMS to ${to}`);
    console.log(`  Message: ${message}`);

    // TODO: Integrate with Twilio or similar
    // const twilio = require('twilio')(accountSid, authToken);
    // await twilio.messages.create({ body: message, to, from: '+18085550100' });

    // For now, simulate success
    await new Promise(resolve => setTimeout(resolve, 300));

    return {
        success: true,
        messageId: `sms_${Date.now()}`,
        method: 'sms',
        sentAt: new Date()
    };
}

// Log communication to Firestore
async function logCommunication(
    job: Job,
    message: {
        type: 'email' | 'sms';
        direction: 'inbound' | 'outbound';
        content: string;
        subject?: string;
        notificationType?: NotificationType;
    }
): Promise<void> {
    console.log(`[NotificationService] Logging communication for job ${job.id}:`, message.type);

    // TODO: Save to Firestore customerCommunications collection
    // await addDoc(collection(db, 'customerCommunications'), {
    //     customerId: job.customer.id,
    //     customerEmail: job.customer.email,
    //     jobIds: [job.id],
    //     message: {
    //         ...message,
    //         timestamp: serverTimestamp(),
    //         status: 'sent'
    //     }
    // });
}

// Convenience functions for common notifications
export const sendScheduledConfirmation = (job: Job, options?: NotificationOptions) =>
    sendSchedulingNotification(job, 'scheduled', { method: 'both', includeCalendarInvite: true, ...options });

export const sendRescheduledNotification = (job: Job, previousDate: Date, options?: NotificationOptions) =>
    sendSchedulingNotification(job, 'rescheduled', { method: 'both', ...options });

export const send24HourReminder = (job: Job, options?: NotificationOptions) =>
    sendSchedulingNotification(job, 'reminder_24hr', { method: 'sms', ...options });

export const sendEnRouteNotification = (job: Job, eta: Date, options?: NotificationOptions) =>
    sendSchedulingNotification(job, 'en_route', { method: 'sms', ...options });

export const sendCompletionNotification = (job: Job, workSummary: string, options?: NotificationOptions) =>
    sendSchedulingNotification(job, 'completed', { method: 'email', ...options });
