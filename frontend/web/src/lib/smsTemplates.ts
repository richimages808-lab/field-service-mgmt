export interface SMSTemplateVariable {
    tag: string;
    label: string;
    example: string;
}

export interface SMSTemplateConfig {
    id: string;
    name: string;
    description: string;
    category: 'appointments' | 'quotes' | 'technician' | 'intake';
    enabled: boolean;
    template: string;
    timing: 'instant' | 'delayed' | '24h_before' | '2h_before' | 'manual';
    delayMinutes?: number;
    availableVariables: SMSTemplateVariable[];
}

export interface SMSAutomationSettings {
    enabled: boolean;
    templates: Record<string, SMSTemplateConfig>;
    retentionDays?: number;
}

export const DEFAULT_SMS_TEMPLATES: Record<string, SMSTemplateConfig> = {
    appointment_confirmation: {
        id: 'appointment_confirmation',
        name: 'Appointment Confirmation',
        description: 'Sent automatically when a service job is scheduled or assigned a time slot.',
        category: 'appointments',
        enabled: true,
        timing: 'delayed',
        delayMinutes: 15,
        template: '{companyName}: Hi {customerName}, your service appointment for {jobTitle} (#{jobId}) is confirmed for {scheduledTime}. Technician {techName} is assigned. Track arrival: {trackingLink} Reply STOP to opt out.',
        availableVariables: [
            { tag: '{companyName}', label: 'Company Name', example: 'Hitop Plumbers' },
            { tag: '{customerName}', label: 'Customer Name', example: 'Rich' },
            { tag: '{jobTitle}', label: 'Job Title', example: 'Water Heater Service' },
            { tag: '{jobId}', label: 'Job / Request #', example: 'JOB-7081' },
            { tag: '{scheduledTime}', label: 'Scheduled Time', example: 'Tomorrow at 9:00 AM HST' },
            { tag: '{techName}', label: 'Assigned Tech', example: 'Mike' },
            { tag: '{trackingLink}', label: 'Tracking Code Link', example: 'https://dispatch-box.com/t/abc12345' }
        ]
    },
    appointment_reminder_24h: {
        id: 'appointment_reminder_24h',
        name: '24-Hour Appointment Reminder',
        description: 'Sent 24 hours before the scheduled service appointment window.',
        category: 'appointments',
        enabled: true,
        timing: '24h_before',
        template: '{companyName}: Reminder: Your service appointment is scheduled for tomorrow at {scheduledTime}. Let us know if you need to reschedule or have special gate/parking instructions. Reply STOP to opt out.',
        availableVariables: [
            { tag: '{companyName}', label: 'Company Name', example: 'Hitop Plumbers' },
            { tag: '{customerName}', label: 'Customer Name', example: 'Rich' },
            { tag: '{jobTitle}', label: 'Job Title', example: 'Water Heater Service' },
            { tag: '{scheduledTime}', label: 'Scheduled Time', example: 'Tomorrow at 9:00 AM HST' },
            { tag: '{trackingLink}', label: 'Tracking Code Link', example: 'https://dispatch-box.com/t/abc12345' }
        ]
    },
    tech_en_route: {
        id: 'tech_en_route',
        name: 'Technician En Route / Arrival Alert',
        description: 'Sent when the technician taps "En Route" to notify customer of transit and ETA.',
        category: 'technician',
        enabled: true,
        timing: 'instant',
        template: '{companyName}: Tech {techName} is on the way to your location for {jobTitle}! Estimated arrival: {eta}. View live arrival: {trackingLink}',
        availableVariables: [
            { tag: '{companyName}', label: 'Company Name', example: 'Hitop Plumbers' },
            { tag: '{customerName}', label: 'Customer Name', example: 'Rich' },
            { tag: '{techName}', label: 'Technician Name', example: 'Mike' },
            { tag: '{jobTitle}', label: 'Job Title', example: 'Water Heater Service' },
            { tag: '{eta}', label: 'Estimated ETA', example: '15-20 mins' },
            { tag: '{trackingLink}', label: 'Tracking Code Link', example: 'https://dispatch-box.com/t/abc12345' }
        ]
    },
    quote_delivery: {
        id: 'quote_delivery',
        name: 'Service Quote Delivery',
        description: 'Sent when a quote is created or sent to the customer with interactive SMS approval.',
        category: 'quotes',
        enabled: true,
        timing: 'instant',
        template: '{companyName}: Your quote #{quoteNumber} for ${quoteTotal} is ready! View details & approve: {quoteUrl}\n\n👉 Reply "APPROVE" directly to this text to accept, or reply with questions/changes.',
        availableVariables: [
            { tag: '{companyName}', label: 'Company Name', example: 'Hitop Plumbers' },
            { tag: '{customerName}', label: 'Customer Name', example: 'Rich' },
            { tag: '{quoteNumber}', label: 'Quote #', example: 'Q-7081' },
            { tag: '{quoteTotal}', label: 'Quote Total ($)', example: '442.67' },
            { tag: '{quoteUrl}', label: 'Quote Link', example: 'https://dispatch-box.com/quote/quote_test_7081' }
        ]
    },
    quote_approved: {
        id: 'quote_approved',
        name: 'Quote Approved Confirmation',
        description: 'Sent immediately when the customer approves a quote via text reply or online portal.',
        category: 'quotes',
        enabled: true,
        timing: 'instant',
        template: '{companyName}: Thank you! Quote #{quoteNumber} has been approved. A coordinator will be in touch shortly to finalize your service schedule.',
        availableVariables: [
            { tag: '{companyName}', label: 'Company Name', example: 'Hitop Plumbers' },
            { tag: '{customerName}', label: 'Customer Name', example: 'Rich' },
            { tag: '{quoteNumber}', label: 'Quote #', example: 'Q-7081' }
        ]
    },
    tech_question: {
        id: 'tech_question',
        name: 'Technician Question / Instructions',
        description: 'Sent when a dispatcher or technician sends a question or on-site prep inquiry.',
        category: 'technician',
        enabled: true,
        timing: 'instant',
        template: '{companyName}: Question regarding your upcoming service (#{jobId}):\n\n{questionText}\n\nPlease reply directly to this text.',
        availableVariables: [
            { tag: '{companyName}', label: 'Company Name', example: 'Hitop Plumbers' },
            { tag: '{customerName}', label: 'Customer Name', example: 'Rich' },
            { tag: '{jobId}', label: 'Job / Request #', example: 'JOB-7081' },
            { tag: '{questionText}', label: 'Question Text', example: 'Is the main shutoff valve in the garage?' }
        ]
    },
    inbound_ticket_created: {
        id: 'inbound_ticket_created',
        name: 'Inbound SMS Ticket Auto-Reply',
        description: 'Sent automatically when a customer texts a new service request to your business number.',
        category: 'intake',
        enabled: true,
        timing: 'instant',
        template: 'Thanks for contacting {companyName}! We\'ve created ticket #{ticketId} for your request. A team member will follow up shortly. Tracking: {trackingLink}',
        availableVariables: [
            { tag: '{companyName}', label: 'Company Name', example: 'Hitop Plumbers' },
            { tag: '{ticketId}', label: 'Ticket #', example: 'TCK-8092' },
            { tag: '{trackingLink}', label: 'Tracking Code Link', example: 'https://dispatch-box.com/t/abc12345' }
        ]
    }
};

/**
 * Replace placeholders in template with preview/dummy data
 */
export function renderSmsPreview(template: string, customVars?: Record<string, string>): string {
    let result = template;
    const defaults: Record<string, string> = {
        '{companyName}': 'Hitop Plumbers',
        '{customerName}': 'Rich',
        '{jobTitle}': 'Water Heater Service',
        '{jobId}': 'JOB-7081',
        '{scheduledTime}': 'Tomorrow at 9:00 AM HST',
        '{techName}': 'Mike',
        '{trackingLink}': 'https://dispatch-box.com/t/demo7081',
        '{quoteNumber}': 'Q-7081',
        '{quoteTotal}': '442.67',
        '{quoteUrl}': 'https://dispatch-box.com/quote/q7081',
        '{eta}': '15 mins',
        '{questionText}': 'Could you confirm if the water valve is in the garage?',
        '{ticketId}': 'TCK-8092',
        ...customVars
    };

    for (const [tag, val] of Object.entries(defaults)) {
        result = result.split(tag).join(val);
    }
    return result;
}

/**
 * Calculate SMS segments based on GSM-7 vs Unicode
 */
export function calculateSmsSegments(text: string): { charCount: number; segmentCount: number; isUnicode: boolean } {
    const charCount = text.length;
    // Check for unicode / non-GSM characters (like emojis or special accents)
    // GSM-7 basic character set regex
    const gsm7Regex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]*$/;
    const isUnicode = !gsm7Regex.test(text);

    if (isUnicode) {
        // Unicode SMS (UCS-2): 70 chars per single segment, 67 chars for multi-segment
        if (charCount <= 70) return { charCount, segmentCount: 1, isUnicode: true };
        return { charCount, segmentCount: Math.ceil(charCount / 67), isUnicode: true };
    } else {
        // Standard GSM-7: 160 chars per single segment, 153 chars for multi-segment
        if (charCount <= 160) return { charCount, segmentCount: 1, isUnicode: false };
        return { charCount, segmentCount: Math.ceil(charCount / 153), isUnicode: false };
    }
}
