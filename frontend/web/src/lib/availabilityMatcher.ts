import { Job, UserProfile } from '../types';
import { parse, isWithinInterval, addMinutes, isSameDay, format } from 'date-fns';

interface TimeSlot {
    start: Date;
    end: Date;
    jobId?: string; // If slot is occupied
}

export interface AvailabilityMatch {
    job: Job;
    tech: UserProfile;
    matchedSlot: Date;
    confidence: number; // 0-1 score
    reason: string;
}

/**
 * Parse customer availability to Date objects
 * Supports both legacy string format and new availabilityWindows format
 */
export const parseAvailability = (job: Job): Date[] => {
    const slots: Date[] = [];

    // Check new availabilityWindows format first
    if (job.request?.availabilityWindows && job.request.availabilityWindows.length > 0) {
        const now = new Date();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        for (const window of job.request.availabilityWindows) {
            try {
                // Parse the day
                let targetDate: Date;
                const windowDay = window.day.toLowerCase();

                // Check if it's a specific date (YYYY-MM-DD) or day name
                if (window.day.includes('-')) {
                    targetDate = new Date(window.day);
                } else {
                    // Find next occurrence of this day
                    const dayIndex = dayNames.indexOf(windowDay);
                    if (dayIndex === -1) continue;

                    targetDate = new Date(now);
                    const currentDay = targetDate.getDay();
                    const daysUntil = (dayIndex - currentDay + 7) % 7 || 7;
                    targetDate.setDate(targetDate.getDate() + daysUntil);
                }

                // Parse start time and create time slots
                const [startHour, startMin] = window.startTime.split(':').map(Number);
                const [endHour, endMin] = window.endTime.split(':').map(Number);

                // Create slots every 30 minutes within the window
                for (let hour = startHour; hour < endHour; hour++) {
                    for (let min = 0; min < 60; min += 30) {
                        if (hour === startHour && min < startMin) continue;
                        if (hour === endHour - 1 && min >= endMin) continue;

                        const slot = new Date(targetDate);
                        slot.setHours(hour, min, 0, 0);
                        slots.push(slot);
                    }
                }

                // Add preferred time if specified
                if (window.preferredTime) {
                    const preferredSlot = new Date(targetDate);
                    if (window.preferredTime === 'morning') {
                        preferredSlot.setHours(9, 0, 0, 0);
                    } else if (window.preferredTime === 'afternoon') {
                        preferredSlot.setHours(14, 0, 0, 0);
                    } else if (window.preferredTime === 'evening') {
                        preferredSlot.setHours(17, 0, 0, 0);
                    }
                    // Add preferred slot to beginning (higher priority)
                    slots.unshift(preferredSlot);
                }
            } catch (error) {
                console.error('Error parsing availability window:', window, error);
            }
        }
    }

    // Fall back to legacy string availability format
    if (slots.length === 0 && job.request?.availability && job.request.availability.length > 0) {
        job.request.availability.forEach(slot => {
            if (typeof slot === 'string') {
                try {
                    const parsed = new Date(slot);
                    if (!isNaN(parsed.getTime())) {
                        slots.push(parsed);
                    }
                } catch (error) {
                    console.error('Failed to parse availability slot:', slot, error);
                }
            }
        });
    }

    // Remove duplicates and sort by date
    const uniqueSlots = Array.from(new Set(slots.map(s => s.getTime()))).map(t => new Date(t));
    return uniqueSlots.sort((a, b) => a.getTime() - b.getTime());
};

/**
 * Check if a technician is available during their working hours
 */
export const isTechAvailableAtTime = (
    tech: UserProfile,
    time: Date
): boolean => {
    // Check if tech has working hours set
    if (!tech.preferences?.working_hours) {
        // Default: available 8am-5pm on weekdays
        const hour = time.getHours();
        const day = time.getDay();
        return day >= 1 && day <= 5 && hour >= 8 && hour < 17;
    }

    const { start, end } = tech.preferences.working_hours;
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    const timeHour = time.getHours();
    const timeMin = time.getMinutes();
    const timeInMinutes = timeHour * 60 + timeMin;
    const startInMinutes = startHour * 60 + startMin;
    const endInMinutes = endHour * 60 + endMin;

    // Check preferred days
    if (tech.preferences.preferred_days) {
        const day = time.getDay(); // 0 = Sunday
        if (!tech.preferences.preferred_days.includes(day)) {
            return false;
        }
    }

    return timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes;
};

/**
 * Get all scheduled jobs for a technician on a given day
 */
export const getTechScheduleForDay = (
    tech: UserProfile,
    date: Date,
    allJobs: Job[]
): TimeSlot[] => {
    const techJobs = allJobs.filter(job =>
        job.assigned_tech_id === tech.id &&
        job.scheduled_at &&
        isSameDay(job.scheduled_at.toDate ? (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)) : new Date(job.scheduled_at), date)
    );

    return techJobs.map(job => {
        const start = job.scheduled_at.toDate ? (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)) : new Date(job.scheduled_at);
        const duration = job.estimated_duration || 60;
        const end = addMinutes(start, duration);
        return { start, end, jobId: job.id };
    }).sort((a, b) => a.start.getTime() - b.start.getTime());
};

/**
 * Check if a time slot conflicts with existing schedule
 */
export const hasScheduleConflict = (
    proposedStart: Date,
    duration: number,
    existingSlots: TimeSlot[]
): boolean => {
    const proposedEnd = addMinutes(proposedStart, duration);

    return existingSlots.some(slot => {
        // Check if intervals overlap
        return (
            (proposedStart >= slot.start && proposedStart < slot.end) ||
            (proposedEnd > slot.start && proposedEnd <= slot.end) ||
            (proposedStart <= slot.start && proposedEnd >= slot.end)
        );
    });
};

/**
 * Find the best matching time slot between customer availability and tech schedule
 */
export const findBestTimeSlot = (
    job: Job,
    tech: UserProfile,
    existingJobs: Job[]
): { slot: Date; confidence: number; reason: string } | null => {
    // Parse customer availability
    const customerSlots = parseAvailability(job);
    if (customerSlots.length === 0) {
        return null;
    }

    const duration = job.estimated_duration || 60;
    const matches: { slot: Date; confidence: number; reason: string }[] = [];

    for (const slot of customerSlots) {
        let confidence = 0;
        const reasons: string[] = [];

        // Get tech's schedule for this day
        const techSchedule = getTechScheduleForDay(tech, slot, existingJobs);

        // Check tech availability
        if (!isTechAvailableAtTime(tech, slot)) {
            continue; // Skip this slot, tech not available
        }
        confidence += 0.4;
        reasons.push('Tech available');

        // Check for schedule conflicts
        if (hasScheduleConflict(slot, duration, techSchedule)) {
            continue; // Skip conflicting slots
        }
        confidence += 0.4;
        reasons.push('No conflicts');

        // Prefer earlier in customer's list (they probably prefer it more)
        const preferenceBonus = (3 - customerSlots.indexOf(slot)) * 0.1;
        confidence += preferenceBonus;
        reasons.push(`Customer preference #${customerSlots.indexOf(slot) + 1}`);

        // Prefer slots earlier in the day (unless job is complex)
        const hour = slot.getHours();
        if (hour >= 8 && hour < 12) {
            confidence += 0.1;
            reasons.push('Morning slot');
        }

        matches.push({
            slot,
            confidence,
            reason: reasons.join(', ')
        });
    }

    // Return best match
    if (matches.length === 0) return null;
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches[0];
};

/**
 * Match multiple jobs with multiple technicians based on availability
 */
export const matchJobsWithTechs = (
    unscheduledJobs: Job[],
    availableTechs: UserProfile[],
    existingJobs: Job[]
): AvailabilityMatch[] => {
    const matches: AvailabilityMatch[] = [];

    // Sort jobs by priority and creation date
    const sortedJobs = [...unscheduledJobs].sort((a, b) => {
        const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
        const aPriority = priorityWeight[a.priority] || 0;
        const bPriority = priorityWeight[b.priority] || 0;

        if (aPriority !== bPriority) {
            return bPriority - aPriority; // Higher priority first
        }

        // Same priority, use creation date
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return aDate.getTime() - bDate.getTime(); // Older first
    });

    for (const job of sortedJobs) {
        let bestMatch: AvailabilityMatch | null = null;

        for (const tech of availableTechs) {
            // Skip if tech is inactive
            if (tech.status === 'inactive') continue;

            // Check specialty match (bonus points but not required)
            let specialtyBonus = 0;
            if (tech.specialties && (job.request?.type || 'General')) {
                const hasSpecialty = tech.specialties.some(s =>
                    s.toLowerCase().includes((job.request?.type || 'General')!.toLowerCase()) ||
                    (job.request?.type || 'General')!.toLowerCase().includes(s.toLowerCase())
                );
                if (hasSpecialty) {
                    specialtyBonus = 0.2;
                }
            }

            // Find best time slot for this tech
            const timeMatch = findBestTimeSlot(job, tech, existingJobs);
            if (!timeMatch) continue; // No available slots

            const totalConfidence = Math.min(1, timeMatch.confidence + specialtyBonus);
            const match: AvailabilityMatch = {
                job,
                tech,
                matchedSlot: timeMatch.slot,
                confidence: totalConfidence,
                reason: timeMatch.reason + (specialtyBonus > 0 ? ', Specialty match' : '')
            };

            if (!bestMatch || match.confidence > bestMatch.confidence) {
                bestMatch = match;
            }
        }

        if (bestMatch) {
            matches.push(bestMatch);
            // Add to existing jobs so it's considered for next iterations
            existingJobs.push({
                ...bestMatch.job,
                assigned_tech_id: bestMatch.tech.id,
                scheduled_at: bestMatch.matchedSlot,
                status: 'scheduled'
            } as Job);
        }
    }

    return matches;
};

/**
 * Get human-readable summary of availability matching
 */
export const getMatchSummary = (match: AvailabilityMatch): string => {
    const date = format(match.matchedSlot, 'MMM d, yyyy');
    const time = format(match.matchedSlot, 'h:mm a');
    const confidence = Math.round(match.confidence * 100);

    return `${match.tech.name} on ${date} at ${time} (${confidence}% match)`;
};
