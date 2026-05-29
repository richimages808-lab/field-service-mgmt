import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Job, UserProfile } from '../types';
import { addMinutes, isWithinInterval, parseISO, format, startOfDay, endOfDay } from 'date-fns';

export interface TechAvailability {
    techId: string;
    techName: string;
    isAvailable: boolean;
    reason?: string;
    nextAvailableSlot?: Date;
    scheduledJobs: Job[];
    totalScheduledHours: number;
    workingHours: {
        start: string;
        end: string;
    };
}

export interface AvailabilityCheckOptions {
    requestedDate?: Date;
    estimatedDuration?: number; // in minutes
    org_id: string;
    jobType?: string;
}

/**
 * Check availability of all technicians for a given date and time
 */
export async function checkTechAvailability(
    technicians: UserProfile[],
    options: AvailabilityCheckOptions
): Promise<TechAvailability[]> {
    const { requestedDate, estimatedDuration = 60, org_id } = options;
    const checkDate = requestedDate || new Date();

    const availabilityResults: TechAvailability[] = [];

    for (const tech of technicians) {
        // Get technician's scheduled jobs for the requested date
        const scheduledJobs = await getTechScheduledJobs(tech.id, checkDate, org_id);

        // Get technician's scheduling preferences (default to 8am-5pm if not set)
        const workingHours = tech.schedulingPreferences?.workStartTime && tech.schedulingPreferences?.workEndTime
            ? {
                start: tech.schedulingPreferences.workStartTime,
                end: tech.schedulingPreferences.workEndTime
            }
            : {
                start: '08:00',
                end: '17:00'
            };

        // Calculate total scheduled hours
        const totalScheduledMinutes = scheduledJobs.reduce((sum, job) => {
            return sum + (job.estimated_duration || 60);
        }, 0);
        const totalScheduledHours = totalScheduledMinutes / 60;

        // Check if tech has capacity (assuming 8 hour workday minus lunch)
        const maxDailyMinutes = tech.schedulingPreferences?.maxDailyHours
            ? tech.schedulingPreferences.maxDailyHours * 60
            : 8 * 60; // Default 8 hours

        const availableMinutes = maxDailyMinutes - totalScheduledMinutes;
        const hasCapacity = availableMinutes >= estimatedDuration;

        // Find next available slot
        const nextAvailableSlot = hasCapacity
            ? findNextAvailableSlot(scheduledJobs, workingHours, estimatedDuration, checkDate)
            : undefined;

        const isAvailable = hasCapacity && nextAvailableSlot !== undefined;

        let reason: string | undefined;
        if (!hasCapacity) {
            reason = `Fully booked (${totalScheduledHours.toFixed(1)} hours scheduled)`;
        } else if (!nextAvailableSlot) {
            reason = `No available time slots`;
        }

        availabilityResults.push({
            techId: tech.id,
            techName: tech.name,
            isAvailable,
            reason,
            nextAvailableSlot,
            scheduledJobs,
            totalScheduledHours,
            workingHours
        });
    }

    // Sort by availability (available first) then by scheduled hours (least busy first)
    return availabilityResults.sort((a, b) => {
        if (a.isAvailable && !b.isAvailable) return -1;
        if (!a.isAvailable && b.isAvailable) return 1;
        return a.totalScheduledHours - b.totalScheduledHours;
    });
}

/**
 * Get all scheduled jobs for a technician on a specific date
 */
async function getTechScheduledJobs(
    techId: string,
    date: Date,
    org_id: string
): Promise<Job[]> {
    const dayStart = Timestamp.fromDate(startOfDay(date));
    const dayEnd = Timestamp.fromDate(endOfDay(date));

    const q = query(
        collection(db, 'jobs'),
        where('org_id', '==', org_id),
        where('assigned_tech_id', '==', techId),
        where('status', 'in', ['scheduled', 'in_progress']),
        where('scheduled_at', '>=', dayStart),
        where('scheduled_at', '<=', dayEnd)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
}

/**
 * Find the next available time slot for a technician
 */
function findNextAvailableSlot(
    scheduledJobs: Job[],
    workingHours: { start: string; end: string },
    durationMinutes: number,
    date: Date
): Date | undefined {
    // Sort jobs by scheduled time
    const sortedJobs = [...scheduledJobs].sort((a, b) => {
        const aTime = a.scheduled_at?.toDate?.() || new Date(a.scheduled_at);
        const bTime = b.scheduled_at?.toDate?.() || new Date(b.scheduled_at);
        return aTime.getTime() - bTime.getTime();
    });

    // Parse working hours
    const [startHour, startMinute] = workingHours.start.split(':').map(Number);
    const [endHour, endMinute] = workingHours.end.split(':').map(Number);

    const workStart = new Date(date);
    workStart.setHours(startHour, startMinute, 0, 0);

    const workEnd = new Date(date);
    workEnd.setHours(endHour, endMinute, 0, 0);

    // Start checking from work start time
    let currentTime = workStart;

    for (const job of sortedJobs) {
        const jobStart = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
        const jobEnd = addMinutes(jobStart, job.estimated_duration || 60);

        // If there's a gap before this job, check if the duration fits
        const gapMinutes = (jobStart.getTime() - currentTime.getTime()) / 60000;
        if (gapMinutes >= durationMinutes) {
            // Found a slot!
            return currentTime;
        }

        // Move current time to after this job
        currentTime = jobEnd;
    }

    // Check if there's time after the last job
    const remainingMinutes = (workEnd.getTime() - currentTime.getTime()) / 60000;
    if (remainingMinutes >= durationMinutes) {
        return currentTime;
    }

    return undefined;
}

/**
 * Get summary of technician availability for a date range
 */
export async function getTechAvailabilitySummary(
    techId: string,
    startDate: Date,
    endDate: Date,
    org_id: string
): Promise<Map<string, TechAvailability>> {
    const availabilityMap = new Map<string, TechAvailability>();

    // Get all jobs in date range
    const q = query(
        collection(db, 'jobs'),
        where('org_id', '==', org_id),
        where('assigned_tech_id', '==', techId),
        where('status', 'in', ['scheduled', 'in_progress']),
        where('scheduled_at', '>=', Timestamp.fromDate(startDate)),
        where('scheduled_at', '<=', Timestamp.fromDate(endDate))
    );

    const snapshot = await getDocs(q);
    const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

    // Group jobs by date
    const jobsByDate = new Map<string, Job[]>();
    jobs.forEach(job => {
        const jobDate = job.scheduled_at?.toDate?.() || new Date(job.scheduled_at);
        const dateKey = format(jobDate, 'yyyy-MM-dd');
        if (!jobsByDate.has(dateKey)) {
            jobsByDate.set(dateKey, []);
        }
        jobsByDate.get(dateKey)!.push(job);
    });

    // Calculate availability for each date
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const dateKey = format(currentDate, 'yyyy-MM-dd');
        const dayJobs = jobsByDate.get(dateKey) || [];

        const totalMinutes = dayJobs.reduce((sum, job) => sum + (job.estimated_duration || 60), 0);
        const totalHours = totalMinutes / 60;

        availabilityMap.set(dateKey, {
            techId,
            techName: '', // Will be filled in by caller
            isAvailable: totalHours < 8, // Assuming 8 hour workday
            scheduledJobs: dayJobs,
            totalScheduledHours: totalHours,
            workingHours: { start: '08:00', end: '17:00' }
        });

        currentDate = addMinutes(currentDate, 24 * 60); // Next day
    }

    return availabilityMap;
}

/**
 * Suggest best technician for a job based on availability, skills, and location
 */
export interface TechSuggestion {
    tech: UserProfile;
    availability: TechAvailability;
    score: number;
    reasons: string[];
}

export async function suggestBestTech(
    technicians: UserProfile[],
    jobDetails: {
        type?: string;
        location?: { lat: number; lng: number };
        estimatedDuration?: number;
        requestedDate?: Date;
        org_id: string;
    }
): Promise<TechSuggestion[]> {
    // Get availability for all techs
    const availabilities = await checkTechAvailability(technicians, {
        requestedDate: jobDetails.requestedDate,
        estimatedDuration: jobDetails.estimatedDuration,
        org_id: jobDetails.org_id,
        jobType: jobDetails.type
    });

    const suggestions: TechSuggestion[] = [];

    for (let i = 0; i < technicians.length; i++) {
        const tech = technicians[i];
        const availability = availabilities.find(a => a.techId === tech.id)!;

        let score = 0;
        const reasons: string[] = [];

        // Availability score (most important)
        if (availability.isAvailable) {
            score += 50;
            reasons.push('Available on requested date');
        } else {
            reasons.push(availability.reason || 'Not available');
        }

        // Workload score (less busy = better)
        const workloadScore = Math.max(0, 30 - (availability.totalScheduledHours * 3));
        score += workloadScore;
        if (availability.totalScheduledHours === 0) {
            reasons.push('No jobs scheduled yet');
        } else if (availability.totalScheduledHours < 4) {
            reasons.push('Light workload');
        }

        // Skills match score
        if (jobDetails.type && tech.specialties?.includes(jobDetails.type)) {
            score += 20;
            reasons.push(`Has ${jobDetails.type} expertise`);
        }

        suggestions.push({
            tech,
            availability,
            score,
            reasons
        });
    }

    // Sort by score (highest first)
    return suggestions.sort((a, b) => b.score - a.score);
}
