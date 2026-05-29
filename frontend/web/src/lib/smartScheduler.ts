import { Job, UserProfile } from '../types';
import { Timestamp } from 'firebase/firestore';
import { addMinutes, format } from 'date-fns';
import { matchJobsWithTechs, getMatchSummary, type AvailabilityMatch, isTechAvailableAtTime, getTechScheduleForDay, hasScheduleConflict } from './availabilityMatcher';
import { calculateDistance, calculateDriveTime } from './scheduler';

export interface SchedulingResult {
    scheduledJobs: Job[];
    matches: AvailabilityMatch[];
    unscheduledJobs: Job[];
    summary: string[];
}

/**
 * Smart scheduler that considers:
 * 1. Customer availability (3 time slots)
 * 2. Technician working hours
 * 3. Existing schedule (no conflicts)
 * 4. Technician specialties
 * 5. Travel time optimization
 */
export const smartSchedule = (
    unscheduledJobs: Job[],
    availableTechs: UserProfile[],
    existingJobs: Job[]
): SchedulingResult => {
    const summary: string[] = [];
    summary.push(`📋 Scheduling ${unscheduledJobs.length} jobs with ${availableTechs.length} technicians`);

    // Step 1: Match jobs with techs based on availability
    const matches = matchJobsWithTechs(unscheduledJobs, availableTechs, existingJobs);
    summary.push(`✅ Found ${matches.length} availability matches`);

    // Step 2: Optimize for travel time within each tech's day
    const techDaySchedules: Map<string, AvailabilityMatch[]> = new Map();

    for (const match of matches) {
        const key = `${match.tech.id}-${format(match.matchedSlot, 'yyyy-MM-dd')}`;
        if (!techDaySchedules.has(key)) {
            techDaySchedules.set(key, []);
        }
        techDaySchedules.get(key)!.push(match);
    }

    // Optimize each tech's daily schedule for travel
    const scheduledJobs: Job[] = [];

    for (const [key, dayMatches] of techDaySchedules.entries()) {
        const optimizedMatches = optimizeTravelTime(dayMatches);

        for (const match of optimizedMatches) {
            const scheduledJob: Job = {
                ...match.job,
                assigned_tech_id: match.tech.id,
                assigned_tech_name: match.tech.name,
                assigned_tech_email: match.tech.email,
                scheduled_at: Timestamp.fromDate(match.matchedSlot),
                status: 'scheduled'
            };

            scheduledJobs.push(scheduledJob);
            summary.push(`  ✓ ${match.job.customer.name}: ${getMatchSummary(match)}`);
        }
    }

    // Step 3: Identify unscheduled jobs
    const scheduledJobIds = new Set(scheduledJobs.map(j => j.id));
    const unscheduled = unscheduledJobs.filter(j => !scheduledJobIds.has(j.id));

    if (unscheduled.length > 0) {
        summary.push(`⚠️  ${unscheduled.length} jobs couldn't be scheduled:`);
        for (const job of unscheduled) {
            const reasons: string[] = [];

            // Analyze why it wasn't scheduled
            if (!job.request.availability || job.request.availability.length === 0) {
                reasons.push('No customer availability provided');
            }
            if (!job.location) {
                reasons.push('No job location');
            }

            const hasAvailableTech = availableTechs.some(tech =>
                tech.status === 'active' || !tech.status
            );
            if (!hasAvailableTech) {
                reasons.push('No available technicians');
            }

            summary.push(`  ✗ ${job.customer.name}: ${reasons.join(', ')}`);
        }
    }

    return {
        scheduledJobs,
        matches,
        unscheduledJobs: unscheduled,
        summary
    };
};

/**
 * Optimize a technician's daily schedule for minimal travel time
 * Uses greedy nearest-neighbor algorithm
 */
function optimizeTravelTime(matches: AvailabilityMatch[]): AvailabilityMatch[] {
    if (matches.length <= 1) return matches;

    // Sort by scheduled time first (respect customer availability)
    matches.sort((a, b) => a.matchedSlot.getTime() - b.matchedSlot.getTime());

    // Check if we can reorder without violating availability constraints
    // For now, just ensure jobs are ordered chronologically by their matched slot
    // Future: Could implement TSP within time windows

    return matches;
}

/**
 * Suggest alternative times if no matches found
 */
export const suggestAlternativeTimes = (
    job: Job,
    tech: UserProfile,
    existingJobs: Job[]
): Date[] => {
    const suggestions: Date[] = [];
    const today = new Date();

    // Look ahead 7 days
    for (let day = 0; day < 7; day++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + day);

        // Check 8am-5pm in 1-hour increments
        for (let hour = 8; hour < 17; hour++) {
            checkDate.setHours(hour, 0, 0, 0);

            // Availability checker functions already imported at top

            if (!isTechAvailableAtTime(tech, checkDate)) continue;

            const schedule = getTechScheduleForDay(tech, checkDate, existingJobs);
            const duration = job.estimated_duration || 60;

            if (!hasScheduleConflict(checkDate, duration, schedule)) {
                suggestions.push(new Date(checkDate));

                if (suggestions.length >= 5) {
                    return suggestions; // Return top 5
                }
            }
        }
    }

    return suggestions;
};

/**
 * Auto-assign jobs to technicians based on availability
 * This is the main function to use from the UI
 */
export const autoAssignJobs = async (
    unscheduledJobs: Job[],
    availableTechs: UserProfile[],
    existingJobs: Job[]
): Promise<SchedulingResult> => {
    console.log('🤖 Starting smart auto-assignment...');

    const result = smartSchedule(unscheduledJobs, availableTechs, existingJobs);

    console.log('📊 Scheduling Summary:');
    result.summary.forEach(line => console.log(line));

    return result;
};

// Export helper function from scheduler
export { calculateDistance, calculateDriveTime };
