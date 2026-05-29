/**
 * TicketMentionParser - Detects and links job/ticket references in customer messages
 */

import { Job } from '../types';

export interface DetectedTicketReference {
    jobId: string;
    jobTitle: string;
    confidence: 'high' | 'medium' | 'low';
    matchReason: string;
    originalText: string;
    startIndex: number;
    endIndex: number;
}

export interface ParsedMessage {
    originalContent: string;
    highlightedContent: string; // HTML with linked tickets
    detectedReferences: DetectedTicketReference[];
    detectedIntent?: MessageIntent;
}

export type MessageIntent =
    | 'schedule_request'
    | 'reschedule_request'
    | 'cancellation_request'
    | 'question'
    | 'confirmation'
    | 'complaint'
    | 'update'
    | 'general';

// Patterns for detecting ticket references
const TICKET_PATTERNS = [
    // Direct ticket/job number mentions
    /(?:ticket|job|order|request|appointment|service)\s*#?\s*(\d{4,})/gi,
    /(?:ref|reference|id)[\s:#]*(\d{4,})/gi,
    /#(\d{4,})/g,

    // Date-based references
    /(?:my|the)\s+(?:appointment|service|job)\s+(?:on|for)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
    /(?:my|the)\s+(?:appointment|service|job)\s+(?:on|for)\s+(\d{1,2}\/\d{1,2})/gi,
];

// Intent detection patterns
const INTENT_PATTERNS: { pattern: RegExp; intent: MessageIntent }[] = [
    { pattern: /\b(reschedule|move|change\s+(?:the\s+)?(?:date|time)|different\s+(?:day|time))\b/i, intent: 'reschedule_request' },
    { pattern: /\b(cancel|cancell?ation|don't\s+need|no\s+longer\s+need)\b/i, intent: 'cancellation_request' },
    { pattern: /\b(schedule|book|set\s+up|arrange|when\s+can\s+you)\b/i, intent: 'schedule_request' },
    { pattern: /\b(confirm|yes|sounds\s+good|works\s+for\s+me|that's\s+fine)\b/i, intent: 'confirmation' },
    { pattern: /\b(disappointed|angry|upset|terrible|horrible|unacceptable|complaint|refund)\b/i, intent: 'complaint' },
    { pattern: /\?/g, intent: 'question' },
    { pattern: /\b(update|fyi|heads\s+up|just\s+so\s+you\s+know|letting\s+you\s+know)\b/i, intent: 'update' },
];

// Service type keywords for fuzzy matching
const SERVICE_KEYWORDS: Record<string, string[]> = {
    'ac': ['ac', 'air conditioning', 'air conditioner', 'cooling', 'hvac', 'a/c'],
    'heating': ['heating', 'heater', 'furnace', 'heat pump', 'warm'],
    'plumbing': ['plumbing', 'plumber', 'pipe', 'leak', 'drain', 'toilet', 'faucet', 'water heater'],
    'electrical': ['electrical', 'electric', 'outlet', 'switch', 'wiring', 'circuit', 'breaker'],
    'appliance': ['appliance', 'washer', 'dryer', 'refrigerator', 'fridge', 'dishwasher', 'oven', 'stove'],
    'maintenance': ['maintenance', 'tune-up', 'checkup', 'inspection', 'service'],
};

/**
 * Parse a message for ticket references and intent
 */
export function parseMessageForTickets(
    content: string,
    customerJobs: Job[],
    allJobs?: Job[]
): ParsedMessage {
    const detectedReferences: DetectedTicketReference[] = [];
    let highlightedContent = content;

    // 1. Check for explicit ticket number mentions
    for (const pattern of TICKET_PATTERNS) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(content)) !== null) {
            const ticketNumber = match[1];

            // Try to find matching job
            const matchingJob = [...customerJobs, ...(allJobs || [])].find(job =>
                job.id.includes(ticketNumber) ||
                job.id.endsWith(ticketNumber)
            );

            if (matchingJob) {
                detectedReferences.push({
                    jobId: matchingJob.id,
                    jobTitle: (matchingJob.request?.description || 'No description').slice(0, 50),
                    confidence: 'high',
                    matchReason: `Direct ticket reference: ${match[0]}`,
                    originalText: match[0],
                    startIndex: match.index,
                    endIndex: match.index + match[0].length
                });
            }
        }
    }

    // 2. Fuzzy match by service type
    const lowerContent = content.toLowerCase();
    for (const job of customerJobs) {
        const jobDescription = (job.request?.description || 'No description').toLowerCase();

        // Check each service category
        for (const [category, keywords] of Object.entries(SERVICE_KEYWORDS)) {
            const matchedKeyword = keywords.find(kw =>
                lowerContent.includes(kw) && jobDescription.includes(kw)
            );

            if (matchedKeyword && !detectedReferences.some(r => r.jobId === job.id)) {
                // Find the keyword position in the message
                const keywordIndex = lowerContent.indexOf(matchedKeyword);

                detectedReferences.push({
                    jobId: job.id,
                    jobTitle: (job.request?.description || 'No description').slice(0, 50),
                    confidence: 'medium',
                    matchReason: `Service type match: "${matchedKeyword}"`,
                    originalText: matchedKeyword,
                    startIndex: keywordIndex,
                    endIndex: keywordIndex + matchedKeyword.length
                });
            }
        }
    }

    // 3. Check for single open job (assume they're talking about it)
    if (detectedReferences.length === 0 && customerJobs.length === 1) {
        detectedReferences.push({
            jobId: customerJobs[0].id,
            jobTitle: customerJobs[0].request.description.slice(0, 50),
            confidence: 'low',
            matchReason: 'Only open ticket for this customer',
            originalText: '',
            startIndex: 0,
            endIndex: 0
        });
    }

    // 4. Detect message intent
    const detectedIntent = detectIntent(content);

    // 5. Build highlighted content with clickable links
    highlightedContent = buildHighlightedContent(content, detectedReferences);

    return {
        originalContent: content,
        highlightedContent,
        detectedReferences,
        detectedIntent
    };
}

/**
 * Detect the primary intent of a message
 */
export function detectIntent(content: string): MessageIntent {
    for (const { pattern, intent } of INTENT_PATTERNS) {
        if (pattern.test(content)) {
            return intent;
        }
    }
    return 'general';
}

/**
 * Build HTML content with ticket references highlighted and linked
 */
function buildHighlightedContent(
    content: string,
    references: DetectedTicketReference[]
): string {
    if (references.length === 0 || references.every(r => r.startIndex === 0 && r.endIndex === 0)) {
        return content;
    }

    // Sort references by position (descending to replace from end to start)
    const sortedRefs = [...references]
        .filter(r => r.startIndex !== r.endIndex)
        .sort((a, b) => b.startIndex - a.startIndex);

    let result = content;
    for (const ref of sortedRefs) {
        const before = result.slice(0, ref.startIndex);
        const match = result.slice(ref.startIndex, ref.endIndex);
        const after = result.slice(ref.endIndex);

        const link = `<span class="ticket-mention" data-job-id="${ref.jobId}" title="${ref.jobTitle}">${match}</span>`;
        result = before + link + after;
    }

    return result;
}

/**
 * Get suggested actions based on detected intent
 */
export function getSuggestedActions(intent: MessageIntent, references: DetectedTicketReference[]): string[] {
    const actions: string[] = [];

    switch (intent) {
        case 'reschedule_request':
            actions.push('Open reschedule dialog');
            if (references.length > 0) {
                actions.push(`Edit ticket #${references[0].jobId.slice(-4)}`);
            }
            break;

        case 'cancellation_request':
            actions.push('Confirm cancellation');
            actions.push('Offer to reschedule instead');
            break;

        case 'schedule_request':
            actions.push('Open scheduling calendar');
            actions.push('Send available times');
            break;

        case 'question':
            actions.push('Reply with answer');
            if (references.length > 0) {
                actions.push('View ticket details');
            }
            break;

        case 'confirmation':
            actions.push('Send confirmation receipt');
            actions.push('Add reminder');
            break;

        case 'complaint':
            actions.push('Escalate to manager');
            actions.push('Create follow-up task');
            actions.push('Offer resolution');
            break;

        default:
            actions.push('Reply');
            if (references.length > 0) {
                actions.push('View related ticket');
            }
    }

    return actions;
}

/**
 * Extract potential ticket numbers from text (for search)
 */
export function extractTicketNumbers(content: string): string[] {
    const numbers: string[] = [];

    for (const pattern of TICKET_PATTERNS) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(content)) !== null) {
            if (match[1] && !numbers.includes(match[1])) {
                numbers.push(match[1]);
            }
        }
    }

    return numbers;
}
