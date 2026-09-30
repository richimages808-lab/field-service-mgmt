/**
 * Call Type / Job Category Inference Engine
 * 
 * Automatically infers and assumes the appropriate JobCategory (or public service type)
 * based on the entered text description, uploaded image/photo metadata, and AI estimate output.
 */

import { JobCategory } from '../types';

export interface InferredCategoryResult {
    category: JobCategory;
    confidence: 'high' | 'medium' | 'low';
    source: 'text' | 'image' | 'ai' | 'default';
    reason: string;
    matchedKeyword?: string;
}

// Keyword dictionaries ranked by specificity
const KEYWORD_RULES: Array<{
    category: JobCategory;
    confidence: 'high' | 'medium';
    keywords: string[];
    reason: string;
}> = [
    // 1. Emergency (highest priority for safety & critical issues)
    {
        category: 'emergency',
        confidence: 'high',
        keywords: [
            'emergency', 'urgent', 'asap', 'flooding', 'flood', 'burst pipe', 'pipe burst',
            'water pouring', 'gas leak', 'gas smell', 'sparking', 'sparks', 'smoke',
            'fire hazard', 'breaker smoking', 'power outage', 'no power at all',
            'freezing without heat', 'carbon monoxide', 'immediate attention', 'disaster'
        ],
        reason: 'Emergency or urgent hazard detected'
    },
    // 2. Warranty / Rework
    {
        category: 'warranty',
        confidence: 'high',
        keywords: [
            'warranty', 'guarantee', 're-work', 'rework', 'revisit', 'recall',
            'under warranty', 'fixed last week', 'repaired recently but leaking',
            'follow-up from previous', 'follow up on prior'
        ],
        reason: 'Warranty or previous service follow-up detected'
    },
    // 3. Consultation / Estimate Only
    {
        category: 'consultation',
        confidence: 'high',
        keywords: [
            'consultation', 'consult', 'quote only', 'estimate only', 'walkthrough',
            'walk through', 'planning', 'advice', 'second opinion', 'evaluate options',
            'discuss options', 'proposal only'
        ],
        reason: 'Consultation or quote inquiry detected'
    },
    // 4. Inspection / Diagnostic
    {
        category: 'inspection',
        confidence: 'high',
        keywords: [
            'inspection', 'inspect', 'diagnose', 'diagnosis', 'troubleshoot', 'assessment',
            'assess', 'audit', 'check why', 'investigate', 'look into', 'find out why',
            'safety check', 'code inspection', 'compliance check', 'diagnostic fee'
        ],
        reason: 'Diagnostic or inspection request detected'
    },
    // 5. Maintenance (Scheduled / Routine)
    {
        category: 'maintenance',
        confidence: 'high',
        keywords: [
            'maintenance', 'tune up', 'tune-up', 'tuneup', 'filter change', 'change filter',
            'clean coils', 'flush water heater', 'flush tank', 'servicing', 'routine service',
            'annual service', 'seasonal check', 'winterize', 'de-winterize', 'checkup',
            'preventive'
        ],
        reason: 'Routine maintenance or servicing detected'
    },
    // 6. Installation / Replacement
    {
        category: 'installation',
        confidence: 'high',
        keywords: [
            'replace', 'replacement', 'install', 'installation', 'installing',
            'swap', 'swap out', 'mount', 'mounting', 'new install', 'upgrade',
            'putting in', 'put in', 'new unit', 'hook up', 'hookup', 'assemble',
            'assembly', 'add new', 'set up new'
        ],
        reason: 'Installation or replacement detected'
    },
    // 7. Repair (Common failure keywords)
    {
        category: 'repair',
        confidence: 'high',
        keywords: [
            'repair', 'fix', 'broken', 'leak', 'leaking', 'dripping', 'drip',
            'clog', 'clogged', 'clogging', 'overflow', 'overflowing', 'backing up',
            'running water', 'running toilet', 'won\'t drain', 'slow drain',
            'won\'t turn on', 'not working', 'malfunction', 'damaged', 'rattling',
            'squeaking', 'cracked', 'short circuit', 'cold water only', 'no hot water'
        ],
        reason: 'Repair or component malfunction detected'
    },
];

/**
 * Infer the JobCategory based on text description, photos, and/or AI recommendation.
 */
export function inferJobCategory(
    description: string,
    photos?: Array<File | string>,
    aiClassification?: { jobType?: string }
): InferredCategoryResult {
    // 1. If AI classification is available (from Gemini estimate), prioritize it
    if (aiClassification?.jobType) {
        const aiType = aiClassification.jobType.toLowerCase().trim();
        if (aiType.includes('replace') || aiType.includes('install')) {
            return {
                category: 'installation',
                confidence: 'high',
                source: 'ai',
                reason: 'Classified as installation/replacement by AI'
            };
        }
        if (aiType.includes('repair')) {
            return {
                category: 'repair',
                confidence: 'high',
                source: 'ai',
                reason: 'Classified as repair by AI'
            };
        }
        if (aiType.includes('maintenance')) {
            return {
                category: 'maintenance',
                confidence: 'high',
                source: 'ai',
                reason: 'Classified as maintenance by AI'
            };
        }
        if (aiType.includes('diagnostic') || aiType.includes('inspect')) {
            return {
                category: 'inspection',
                confidence: 'high',
                source: 'ai',
                reason: 'Classified as inspection/diagnostic by AI'
            };
        }
    }

    const text = (description || '').toLowerCase().trim();

    // 2. Scan text against keyword rules
    if (text.length >= 3) {
        for (const rule of KEYWORD_RULES) {
            for (const kw of rule.keywords) {
                // Word boundary match where possible
                const regex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
                if (regex.test(text) || text.includes(kw)) {
                    return {
                        category: rule.category,
                        confidence: rule.confidence,
                        source: 'text',
                        reason: rule.reason,
                        matchedKeyword: kw
                    };
                }
            }
        }
    }

    // 3. Scan photo file names if available
    if (photos && photos.length > 0) {
        for (const photo of photos) {
            const fileName = typeof photo === 'string'
                ? photo.toLowerCase()
                : (photo.name || '').toLowerCase();

            for (const rule of KEYWORD_RULES) {
                for (const kw of rule.keywords) {
                    if (fileName.includes(kw)) {
                        return {
                            category: rule.category,
                            confidence: 'medium',
                            source: 'image',
                            reason: `Assumed from image name "${fileName}"`,
                            matchedKeyword: kw
                        };
                    }
                }
            }
        }

        // If photos are provided but no specific keyword matched, photos usually indicate repair/damage
        return {
            category: 'repair',
            confidence: 'medium',
            source: 'image',
            reason: 'Assumed repair from attached photo(s)'
        };
    }

    // 4. Default fallback
    return {
        category: 'repair',
        confidence: 'low',
        source: 'default',
        reason: 'Standard default service category'
    };
}

/**
 * Helper to infer public contact page service type from description.
 */
export function inferPublicServiceType(description: string): string | null {
    const text = (description || '').toLowerCase();
    if (!text || text.length < 4) return null;

    if (text.includes('urgent') || text.includes('emergency') || text.includes('flood') || text.includes('burst')) {
        return 'Emergency Service';
    }
    if (text.includes('ac') || text.includes('air condition') || text.includes('heat') || text.includes('furnace') || text.includes('hvac') || text.includes('cooling') || text.includes('thermostat')) {
        return 'HVAC';
    }
    if (text.includes('pipe') || text.includes('leak') || text.includes('faucet') || text.includes('sink') || text.includes('toilet') || text.includes('shower') || text.includes('drain') || text.includes('plumb') || text.includes('water heater')) {
        return 'Plumbing';
    }
    if (text.includes('breaker') || text.includes('outlet') || text.includes('wiring') || text.includes('electric') || text.includes('light') || text.includes('switch') || text.includes('voltage') || text.includes('panel')) {
        return 'Electrical';
    }
    if (text.includes('estimate') || text.includes('quote') || text.includes('consult')) {
        return 'Quote / Estimate';
    }
    if (text.includes('maintenance') || text.includes('tune up') || text.includes('service') || text.includes('filter')) {
        return 'General Maintenance';
    }
    return null;
}
