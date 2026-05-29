/**
 * Tech Matching Engine
 * 
 * Ranks technicians for a given job based on multiple weighted factors:
 * - Skill Match (30%): Tech specialties vs job required skills
 * - Workload (25%): How many active/scheduled jobs the tech has today
 * - Availability (20%): Whether the tech is available on the target day
 * - Proximity (15%): Service area coverage and distance to job location
 * - Certifications (10%): Relevant certifications for the job type
 */

import { Job, UserProfile, AIJobRecommendation } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface TechScoreBreakdown {
    skillMatch: number;        // 0-100
    workload: number;          // 0-100 (100 = lightest load)
    availability: number;      // 0-100
    proximity: number;         // 0-100
    certifications: number;    // 0-100
}

export interface TechRecommendation {
    tech: UserProfile;
    compositeScore: number;    // 0-100 weighted average
    breakdown: TechScoreBreakdown;
    matchedSkills: string[];
    missingSkills: string[];
    activeJobsToday: number;
    availableSlots: AvailableSlot[];
    warnings: string[];        // e.g. "Outside working hours", "High workload"
}

export interface AvailableSlot {
    start: Date;
    end: Date;
    durationMinutes: number;
}

interface ScoringWeights {
    skillMatch: number;
    workload: number;
    availability: number;
    proximity: number;
    certifications: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
    skillMatch: 0.30,
    workload: 0.25,
    availability: 0.20,
    proximity: 0.15,
    certifications: 0.10
};

// ============================================================================
// Main Scoring Function
// ============================================================================

export function rankTechnicians(
    technicians: UserProfile[],
    job: Job,
    allJobs: Job[],
    targetDate: Date,
    weights: ScoringWeights = DEFAULT_WEIGHTS
): TechRecommendation[] {
    const recommendations = technicians
        .filter(tech => tech.status !== 'inactive')
        .map(tech => scoreTechnician(tech, job, allJobs, targetDate, weights));

    // Sort by composite score descending
    recommendations.sort((a, b) => b.compositeScore - a.compositeScore);

    return recommendations;
}

function scoreTechnician(
    tech: UserProfile,
    job: Job,
    allJobs: Job[],
    targetDate: Date,
    weights: ScoringWeights
): TechRecommendation {
    const warnings: string[] = [];

    // Extract required skills from AI recommendation or job type
    const requiredSkills = getRequiredSkills(job);
    const jobType = job.request?.type || job.category || '';

    // 1. Skill Match Score
    const { score: skillScore, matched, missing } = calculateSkillMatch(tech, requiredSkills);

    // 2. Workload Score
    const techJobsToday = getTechJobsForDay(tech.id, allJobs, targetDate);
    const workloadScore = calculateWorkloadScore(techJobsToday, tech);
    if (techJobsToday.length >= (tech.schedulingPreferences?.jobPreferences?.maxJobsPerDay || 6)) {
        warnings.push('At max capacity for the day');
    }

    // 3. Availability Score
    const { score: availScore, slots } = calculateAvailabilityScore(tech, targetDate, techJobsToday, job);
    if (availScore === 0) {
        warnings.push('Not available on this day');
    } else if (availScore < 50) {
        warnings.push('Limited availability');
    }

    // 4. Proximity Score
    const proxScore = calculateProximityScore(tech, job);
    if (proxScore < 30) {
        warnings.push('Outside primary service area');
    }

    // 5. Certification Score
    const certScore = calculateCertificationScore(tech, jobType);

    const breakdown: TechScoreBreakdown = {
        skillMatch: Math.round(skillScore),
        workload: Math.round(workloadScore),
        availability: Math.round(availScore),
        proximity: Math.round(proxScore),
        certifications: Math.round(certScore)
    };

    const compositeScore = Math.round(
        skillScore * weights.skillMatch +
        workloadScore * weights.workload +
        availScore * weights.availability +
        proxScore * weights.proximity +
        certScore * weights.certifications
    );

    return {
        tech,
        compositeScore,
        breakdown,
        matchedSkills: matched,
        missingSkills: missing,
        activeJobsToday: techJobsToday.length,
        availableSlots: slots,
        warnings
    };
}

// ============================================================================
// Individual Score Calculators
// ============================================================================

function getRequiredSkills(job: Job): string[] {
    const skills: string[] = [];

    // From AI recommendation
    if (job.intakeReview?.aiRecommendation?.skillsRequired) {
        skills.push(...job.intakeReview.aiRecommendation.skillsRequired);
    }

    // From job type / category
    if (job.request?.type) {
        skills.push(job.request.type.toLowerCase());
    }
    if (job.category) {
        skills.push(job.category.toLowerCase());
    }

    // Deduplicate
    return [...new Set(skills.map(s => s.toLowerCase().trim()))];
}

function calculateSkillMatch(
    tech: UserProfile,
    requiredSkills: string[]
): { score: number; matched: string[]; missing: string[] } {
    if (requiredSkills.length === 0) {
        return { score: 75, matched: [], missing: [] }; // Neutral if no skills required
    }

    const techSkills = (tech.specialties || []).map(s => s.toLowerCase().trim());
    const matched: string[] = [];
    const missing: string[] = [];

    for (const skill of requiredSkills) {
        // Fuzzy match: check if any tech skill contains or is contained by the required skill
        const isMatch = techSkills.some(ts =>
            ts.includes(skill) || skill.includes(ts) ||
            levenshteinSimilarity(ts, skill) > 0.7
        );

        if (isMatch) {
            matched.push(skill);
        } else {
            missing.push(skill);
        }
    }

    const score = (matched.length / requiredSkills.length) * 100;
    return { score, matched, missing };
}

function calculateWorkloadScore(techJobsToday: Job[], tech: UserProfile): number {
    const maxJobs = tech.schedulingPreferences?.jobPreferences?.maxJobsPerDay || 6;
    const currentLoad = techJobsToday.length;

    if (currentLoad >= maxJobs) return 0;
    if (currentLoad === 0) return 100;

    // Linear scale: 0 jobs = 100, maxJobs = 0
    return Math.round(((maxJobs - currentLoad) / maxJobs) * 100);
}

function calculateAvailabilityScore(
    tech: UserProfile,
    targetDate: Date,
    techJobsToday: Job[],
    job: Job
): { score: number; slots: AvailableSlot[] } {
    const dayOfWeek = targetDate.getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayNames[dayOfWeek] as keyof NonNullable<UserProfile['weeklyAvailability']>;

    // Check weekly availability
    const weeklyAvail = tech.weeklyAvailability;
    if (weeklyAvail) {
        const dayAvail = weeklyAvail[dayKey];
        if (dayAvail && !dayAvail.available) {
            return { score: 0, slots: [] };
        }
    }

    // Check vacation dates
    if (tech.vacationDates) {
        const targetTime = targetDate.getTime();
        for (const vacation of tech.vacationDates) {
            const start = vacation.start?.toDate ? vacation.start.toDate().getTime() : new Date(vacation.start).getTime();
            const end = vacation.end?.toDate ? vacation.end.toDate().getTime() : new Date(vacation.end).getTime();
            if (targetTime >= start && targetTime <= end) {
                return { score: 0, slots: [] };
            }
        }
    }

    // Get working hours
    const workStart = getWorkingHoursStart(tech, dayKey);
    const workEnd = getWorkingHoursEnd(tech, dayKey);

    // Calculate available slots (gaps between scheduled jobs)
    const jobDuration = job.estimated_duration || 60;
    const slots = findAvailableSlots(targetDate, workStart, workEnd, techJobsToday, jobDuration);

    // Score based on how many fitting slots exist
    if (slots.length === 0) return { score: 10, slots: [] }; // Low but not zero — dispatcher can override
    if (slots.length >= 3) return { score: 100, slots };
    if (slots.length === 2) return { score: 80, slots };
    return { score: 60, slots };
}

function calculateProximityScore(tech: UserProfile, job: Job): number {
    if (!job.location) return 50; // Neutral if no job location

    // Check service areas
    if (tech.serviceAreas && tech.serviceAreas.length > 0) {
        // Check if job address matches any service area zip code
        const jobAddress = job.customer?.address || '';
        const hasPrimaryMatch = tech.serviceAreas.some(area =>
            area.priority === 'primary' && jobAddress.includes(area.zipCode)
        );
        if (hasPrimaryMatch) return 100;

        const hasSecondaryMatch = tech.serviceAreas.some(area =>
            area.priority === 'secondary' && jobAddress.includes(area.zipCode)
        );
        if (hasSecondaryMatch) return 70;

        const hasEmergencyMatch = tech.serviceAreas.some(area =>
            area.priority === 'emergency_only' && jobAddress.includes(area.zipCode)
        );
        if (hasEmergencyMatch) return 40;
    }

    // If tech has home location, calculate rough distance
    if (tech.homeLocation?.lat && tech.homeLocation?.lng && job.location) {
        const distance = haversineDistance(
            tech.homeLocation.lat, tech.homeLocation.lng,
            job.location.lat, job.location.lng
        );
        const maxDistance = tech.maxTravelDistance || 30; // miles

        if (distance <= maxDistance * 0.5) return 100;
        if (distance <= maxDistance) return 70;
        if (distance <= maxDistance * 1.5) return 40;
        return 10;
    }

    return 50; // Neutral default
}

function calculateCertificationScore(tech: UserProfile, jobType: string): number {
    if (!jobType || !tech.certifications || tech.certifications.length === 0) {
        return 50; // Neutral
    }

    const jobTypeLower = jobType.toLowerCase();
    const relevantCerts = tech.certifications.filter(cert => {
        const certName = (cert.name || '').toLowerCase();
        const certIssuer = (cert.issuer || '').toLowerCase();
        return certName.includes(jobTypeLower) ||
            jobTypeLower.includes(certName) ||
            certIssuer.includes(jobTypeLower);
    });

    if (relevantCerts.length === 0) return 30;

    // Check if any are expired
    const validCerts = relevantCerts.filter(cert => {
        if (!cert.expiryDate) return true;
        const expiry = cert.expiryDate?.toDate ? cert.expiryDate.toDate() : new Date(cert.expiryDate);
        return expiry > new Date();
    });

    if (validCerts.length > 0 && validCerts.some(c => c.verified)) return 100;
    if (validCerts.length > 0) return 80;
    return 40; // Has relevant but expired certs
}

// ============================================================================
// Helpers
// ============================================================================

function getTechJobsForDay(techId: string, allJobs: Job[], targetDate: Date): Job[] {
    return allJobs.filter(j => {
        if (j.assigned_tech_id !== techId) return false;
        if (!j.scheduled_at) return false;
        if (j.status === 'cancelled' || j.status === 'completed') return false;

        const jobDate = j.scheduled_at?.toDate ? j.scheduled_at.toDate() : new Date(j.scheduled_at);
        return isSameDay(jobDate, targetDate);
    });
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

function getWorkingHoursStart(tech: UserProfile, dayKey: string): number {
    const dayAvail = tech.weeklyAvailability?.[dayKey as keyof NonNullable<UserProfile['weeklyAvailability']>];
    if (dayAvail && 'startTime' in dayAvail && dayAvail.startTime) {
        return parseInt(dayAvail.startTime.split(':')[0]);
    }
    if (tech.preferences?.working_hours?.start) {
        return parseInt(tech.preferences.working_hours.start.split(':')[0]);
    }
    return 8; // Default 8 AM
}

function getWorkingHoursEnd(tech: UserProfile, dayKey: string): number {
    const dayAvail = tech.weeklyAvailability?.[dayKey as keyof NonNullable<UserProfile['weeklyAvailability']>];
    if (dayAvail && 'endTime' in dayAvail && dayAvail.endTime) {
        return parseInt(dayAvail.endTime.split(':')[0]);
    }
    if (tech.preferences?.working_hours?.end) {
        return parseInt(tech.preferences.working_hours.end.split(':')[0]);
    }
    return 18; // Default 6 PM
}

function findAvailableSlots(
    targetDate: Date,
    workStartHour: number,
    workEndHour: number,
    techJobs: Job[],
    requiredDuration: number
): AvailableSlot[] {
    const slots: AvailableSlot[] = [];

    // Build list of occupied time ranges
    const occupied: { start: number; end: number }[] = techJobs
        .filter(j => j.scheduled_at)
        .map(j => {
            const start = j.scheduled_at?.toDate ? j.scheduled_at.toDate() : new Date(j.scheduled_at);
            const duration = j.estimated_duration || 60;
            const end = new Date(start.getTime() + duration * 60000);
            return { start: start.getTime(), end: end.getTime() };
        })
        .sort((a, b) => a.start - b.start);

    // Walk through the work day looking for gaps
    const dayStart = new Date(targetDate);
    dayStart.setHours(workStartHour, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(workEndHour, 0, 0, 0);

    let cursor = dayStart.getTime();

    for (const block of occupied) {
        if (cursor < block.start) {
            const gapMinutes = (block.start - cursor) / 60000;
            if (gapMinutes >= requiredDuration) {
                slots.push({
                    start: new Date(cursor),
                    end: new Date(block.start),
                    durationMinutes: gapMinutes
                });
            }
        }
        cursor = Math.max(cursor, block.end);
    }

    // Check gap after last job until end of day
    if (cursor < dayEnd.getTime()) {
        const gapMinutes = (dayEnd.getTime() - cursor) / 60000;
        if (gapMinutes >= requiredDuration) {
            slots.push({
                start: new Date(cursor),
                end: dayEnd,
                durationMinutes: gapMinutes
            });
        }
    }

    return slots;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg: number): number {
    return deg * (Math.PI / 180);
}

function levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    const distance = matrix[a.length][b.length];
    return 1 - distance / Math.max(a.length, b.length);
}

// ============================================================================
// Quick-Assign: Find the best tech & earliest slot automatically
// ============================================================================

export function getAutoAssignment(
    technicians: UserProfile[],
    job: Job,
    allJobs: Job[],
    targetDate: Date
): { tech: UserProfile; slot: AvailableSlot } | null {
    const ranked = rankTechnicians(technicians, job, allJobs, targetDate);

    for (const rec of ranked) {
        if (rec.compositeScore < 20) continue; // Skip very poor matches
        if (rec.availableSlots.length > 0) {
            return {
                tech: rec.tech,
                slot: rec.availableSlots[0] // Earliest available
            };
        }
    }

    return null;
}
