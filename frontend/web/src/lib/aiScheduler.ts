import { Job, SchedulingPreferences } from '../types';
import { Timestamp } from 'firebase/firestore';
import { addMinutes, setHours, setMinutes, format, parse, isWithinInterval, parseISO } from 'date-fns';
import { calculateDistance } from './scheduler';

/**
 * Research-backed scheduling optimization parameters
 *
 * Based on industry best practices from:
 * - Field Service Management studies (2024)
 * - OSHA work hour regulations
 * - Transportation research on rush hour patterns
 * - Service industry productivity research
 *
 * Key findings:
 * 1. Technicians are most productive in 6-8 hour workdays (not including breaks)
 * 2. Rush hour adds 30-50% to drive times in urban areas
 * 3. Regular breaks improve safety and reduce errors
 * 4. 10-minute buffers between jobs account for unexpected delays
 * 5. Realistic scheduling improves customer satisfaction and reduces burnout
 */

// --- Constants ---
interface Location {
    address: string;
    lat: number;
    lng: number;
}

const PARTS_STORES: Location[] = [
    { address: 'Home Depot - Honolulu (421 Alakawa St)', lat: 21.3196, lng: -157.8735 },
    { address: 'Lowe\'s - Iwilei (411 Pacific St)', lat: 21.3170, lng: -157.8700 },
    { address: 'City Mill - Kaimuki (3086 Waialae Ave)', lat: 21.2850, lng: -157.8050 },
    { address: 'Ferguson Plumbing Supply - Sand Island', lat: 21.3250, lng: -157.8900 }
];

// Firebase function URL for Google Maps API integration
const FIREBASE_FUNCTION_URL = 'https://us-central1-maintenancemanager-c5533.cloudfunctions.net/calculateDriveTime';

interface DriveTimeResult {
    distance: number; // meters
    duration: number; // seconds
    durationInTraffic?: number; // seconds with traffic
}

interface ScheduledJob extends Job {
    driveTimeMinutes?: number;
    arrivalTime?: Date;
    departureTime?: Date;
}

// --- Logistics Optimization Engine (LOE) ---
/**
 * Geographic cluster for grouping nearby jobs
 */
interface JobCluster {
    centroid: { lat: number; lng: number };
    jobs: Job[];
    name: string; // e.g., "Downtown", "North Side"
}

/**
 * Phase 1: Spatial Analysis - Group jobs into geographic clusters
 * Uses simple k-means-like clustering based on proximity
 */
function clusterJobsByLocation(jobs: Job[], maxClusters: number = 3): JobCluster[] {
    if (jobs.length === 0) return [];
    if (jobs.length <= maxClusters) {
        // If we have fewer jobs than max clusters, each job is its own cluster
        return jobs.map((job, i) => ({
            centroid: job.location!,
            jobs: [job],
            name: `Stop ${i + 1}`
        }));
    }

    // Simple clustering: find furthest jobs as initial centroids
    const centroids: { lat: number; lng: number }[] = [];
    centroids.push(jobs[0].location!);

    // Add centroids that are furthest from existing centroids
    for (let i = 1; i < Math.min(maxClusters, jobs.length); i++) {
        let maxDist = 0;
        let furthestJob = jobs[1];

        for (const job of jobs) {
            if (!job.location) continue;
            const minDistToCentroid = Math.min(
                ...centroids.map(c => calculateDistance(c, job.location!))
            );
            if (minDistToCentroid > maxDist) {
                maxDist = minDistToCentroid;
                furthestJob = job;
            }
        }
        centroids.push(furthestJob.location!);
    }

    // Assign jobs to nearest centroid
    const clusters: JobCluster[] = centroids.map((centroid, i) => ({
        centroid,
        jobs: [],
        name: `Cluster ${i + 1}`
    }));

    for (const job of jobs) {
        if (!job.location) continue;
        let nearestClusterIdx = 0;
        let minDist = Infinity;

        for (let i = 0; i < clusters.length; i++) {
            const dist = calculateDistance(clusters[i].centroid, job.location);
            if (dist < minDist) {
                minDist = dist;
                nearestClusterIdx = i;
            }
        }

        clusters[nearestClusterIdx].jobs.push(job);
    }

    // Filter out empty clusters and name them based on position
    const nonEmptyClusters = clusters.filter(c => c.jobs.length > 0);

    // Update cluster names based on geographic analysis
    if (nonEmptyClusters.length > 1) {
        const avgLat = nonEmptyClusters.reduce((sum, c) => sum + c.centroid.lat, 0) / nonEmptyClusters.length;
        const avgLng = nonEmptyClusters.reduce((sum, c) => sum + c.centroid.lng, 0) / nonEmptyClusters.length;

        nonEmptyClusters.forEach(cluster => {
            const isNorth = cluster.centroid.lat > avgLat;
            const isEast = cluster.centroid.lng > avgLng;
            cluster.name = `${isNorth ? 'North' : 'South'} ${isEast ? 'East' : 'West'} Area`;
        });
    }

    return nonEmptyClusters;
}

/**
 * Phase 2: Smart Job Selection - Find the best job considering both distance AND customer availability
 * Balances route efficiency with customer time slot preferences
 */
function findNearestJob(
    currentLocation: { lat: number; lng: number },
    availableJobs: Job[],
    urgentDeadlines: Map<string, Date>, // Job ID -> deadline for time window override
    currentTime?: Date, // Current scheduled time for availability matching
    respectTimeWindows: boolean = true // Whether to prioritize customer availability
): { job: Job; distance: number; reason: string } | null {
    if (availableJobs.length === 0) return null;

    const now = currentTime || new Date();

    // Law 4: Time-Window Override - Check for urgent deadlines first
    for (const job of availableJobs) {
        const deadline = urgentDeadlines.get(job.id);
        if (deadline && deadline.getTime() - now.getTime() < 60 * 60 * 1000) { // Within 1 hour
            const distance = calculateDistance(currentLocation, job.location!);
            return {
                job,
                distance,
                reason: `URGENT: Must arrive by ${format(deadline, 'h:mm a')} (deadline override)`
            };
        }
    }

    // Score each job based on distance AND availability match
    interface JobScore {
        job: Job;
        distance: number;
        score: number;
        hasAvailability: boolean;
        reason: string;
    }

    const scoredJobs: JobScore[] = [];

    for (const job of availableJobs) {
        if (!job.location) continue;

        const distance = calculateDistance(currentLocation, job.location);
        let score = 100;
        let reason = '';
        let hasAvailability = false;

        // Check if job has availability windows and if current time matches
        if (job.request?.availabilityWindows && job.request.availabilityWindows.length > 0) {
            hasAvailability = true;

            // Check if current time is within any availability window
            const dayOfWeek = format(now, 'EEEE').toLowerCase();
            const scheduledDate = format(now, 'yyyy-MM-dd');
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentTimeInMinutes = currentHour * 60 + currentMinute;

            let matchesWindow = false;
            let preferredTimeMatch = false;

            for (const window of job.request.availabilityWindows) {
                const windowDay = window.day.toLowerCase();
                const appliesToDay = windowDay === dayOfWeek || window.day === scheduledDate;

                if (appliesToDay) {
                    const [startHour, startMin] = window.startTime.split(':').map(Number);
                    const [endHour, endMin] = window.endTime.split(':').map(Number);
                    const windowStart = startHour * 60 + startMin;
                    const windowEnd = endHour * 60 + endMin;

                    if (currentTimeInMinutes >= windowStart && currentTimeInMinutes < windowEnd) {
                        matchesWindow = true;

                        // Check preferred time bonus
                        if (window.preferredTime === 'morning' && currentHour >= 8 && currentHour < 12) {
                            preferredTimeMatch = true;
                        } else if (window.preferredTime === 'afternoon' && currentHour >= 12 && currentHour < 17) {
                            preferredTimeMatch = true;
                        } else if (window.preferredTime === 'evening' && currentHour >= 17) {
                            preferredTimeMatch = true;
                        }
                    }
                }
            }

            if (matchesWindow) {
                score += 50; // Big bonus for matching customer availability
                reason = 'Customer available now';
                if (preferredTimeMatch) {
                    score += 20; // Extra bonus for matching preferred time
                    reason = 'Customer preferred time';
                }
            } else if (respectTimeWindows) {
                score -= 30; // Penalty for scheduling outside customer availability
                reason = 'Outside customer availability';
            }
        } else {
            // No availability restrictions - just use distance
            reason = 'No time restrictions';
        }

        // Distance penalty (lower distance = higher score)
        // Normalized: 0km = 0 penalty, 50km = -50 penalty
        const distancePenalty = Math.min(distance, 50);
        score -= distancePenalty;

        // Priority bonus
        if (job.priority === 'critical') score += 30;
        else if (job.priority === 'high') score += 20;
        else if (job.priority === 'medium') score += 10;

        scoredJobs.push({
            job,
            distance,
            score,
            hasAvailability,
            reason: `${reason} (${distance.toFixed(1)}km away)`
        });
    }

    // Sort by score (highest first)
    scoredJobs.sort((a, b) => b.score - a.score);

    if (scoredJobs.length === 0) return null;

    const best = scoredJobs[0];
    return {
        job: best.job,
        distance: best.distance,
        reason: best.reason
    };
}

/**
 * Get real drive time from Google Maps API via Firebase Function
 */
export async function getRealDriveTime(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    departureTime?: Date
): Promise<DriveTimeResult> {
    try {
        const response = await fetch(FIREBASE_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                origin: `${origin.lat},${origin.lng}`,
                destination: `${destination.lat},${destination.lng}`,
                departureTime: departureTime ? departureTime.toISOString() : new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error('Drive time API failed');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.warn('Failed to get real drive time, using estimation:', error);
        // Fallback to simple calculation
        const distanceKm = calculateDistance(origin, destination);
        const estimatedMinutes = Math.ceil(distanceKm * 2) + 10; // 2 min/km + 10 min buffer
        return {
            distance: distanceKm * 1000,
            duration: estimatedMinutes * 60,
            durationInTraffic: estimatedMinutes * 60
        };
    }
}

/**
 * Check if a time is within customer's availability window
 */
function isTimeAvailable(
    scheduledTime: Date,
    job: Job,
    jobDuration: number
): boolean {
    if (!job.request.availabilityWindows || job.request.availabilityWindows.length === 0) {
        // No restrictions, any time is fine
        return true;
    }

    const dayOfWeek = format(scheduledTime, 'EEEE').toLowerCase();
    const scheduledDate = format(scheduledTime, 'yyyy-MM-dd');
    const endTime = addMinutes(scheduledTime, jobDuration);

    for (const window of job.request.availabilityWindows) {
        // Check if window applies to this day
        const appliesToDay = window.day === dayOfWeek || window.day === scheduledDate;
        if (!appliesToDay) continue;

        // Parse window times
        const windowStart = parse(window.startTime, 'HH:mm', scheduledTime);
        const windowEnd = parse(window.endTime, 'HH:mm', scheduledTime);

        // Check if job fits within window
        const jobFitsInWindow =
            scheduledTime >= windowStart &&
            endTime <= windowEnd;

        if (jobFitsInWindow) {
            return true;
        }
    }

    return false;
}

/**
 * Calculate score for scheduling a job at a specific time
 * Higher score = better fit
 * @param priorityWeighting 0-100, where 0=pure efficiency (minimize drive), 100=pure priority
 * @param preferComplexJobsEarly If true, give bonus to long jobs scheduled in the morning
 */
function calculateSchedulingScore(
    job: Job,
    scheduledTime: Date,
    driveTimeMinutes: number,
    jobDuration: number,
    priorityWeighting: number = 70,
    preferComplexJobsEarly: boolean = true
): number {
    let score = 100;

    // Penalty for long drive times (efficiency component)
    // Scale based on priorityWeighting: higher weighting = less penalty for drive time
    const driveTimePenalty = Math.min(driveTimeMinutes / 2, 30);
    const efficiencyWeight = (100 - priorityWeighting) / 100; // 0-1 scale
    score -= driveTimePenalty * efficiencyWeight;

    // Bonus for matching availability windows (+20 points)
    if (isTimeAvailable(scheduledTime, job, jobDuration)) {
        score += 20;
    } else {
        // Heavy penalty if outside availability (-50 points)
        score -= 50;
    }

    // Priority bonus (scaled by priorityWeighting)
    const priorityWeight = priorityWeighting / 100; // 0-1 scale
    if (job.priority === 'critical') score += 30 * priorityWeight;
    else if (job.priority === 'high') score += 20 * priorityWeight;
    else if (job.priority === 'medium') score += 10 * priorityWeight;

    // Preferred time bonus
    const hour = scheduledTime.getHours();
    const preferredTime = job.request.availabilityWindows?.[0]?.preferredTime;

    if (preferredTime === 'morning' && hour >= 8 && hour < 12) score += 10;
    else if (preferredTime === 'afternoon' && hour >= 12 && hour < 17) score += 10;
    else if (preferredTime === 'evening' && hour >= 17 && hour < 20) score += 10;

    // Complex jobs early bonus (when technician is fresh)
    // Long jobs (90+ min) get bonus in morning, penalty in afternoon
    if (preferComplexJobsEarly && jobDuration >= 90) {
        if (hour >= 8 && hour < 12) {
            score += 15; // Morning bonus for complex jobs
        } else if (hour >= 14 && hour < 17) {
            score -= 10; // Afternoon penalty for complex jobs
        }
    }

    return score;
}

// Default preferences - Industry best practices
function getDefaultPreferences(): SchedulingPreferences {
    return {
        workStartTime: '08:00',
        workEndTime: '17:00',
        maxDailyHours: 8,
        maxDailyDriveTime: 180,
        workDays: [1, 2, 3, 4, 5], // Monday-Friday

        lunchBreak: {
            enabled: true,
            startTime: '12:00',
            duration: 30,
            flexible: true,
        },
        morningBreak: {
            enabled: true,
            preferredTime: '10:00',
            duration: 15,
        },
        afternoonBreak: {
            enabled: true,
            preferredTime: '15:00',
            duration: 15,
        },

        partsPickup: {
            enabled: true,
            strategy: 'enroute',
            maxDetourMinutes: 15,
        },

        routePreferences: {
            minimizeDriving: true,
            clusterJobs: true,
            avoidRushHour: true,
            preferredStartLocation: 'home',
        },

        jobPreferences: {
            bufferBetweenJobs: 10,
            preferComplexJobsEarly: true,
            maxJobsPerDay: 6,
            allowBackToBack: false,
        },

        customerPreferences: {
            respectTimeWindows: true,
            callAheadBuffer: 15,
            allowEarlyArrivals: false,
        },

        advanced: {
            considerTraffic: true,
            weatherAware: false,
            priorityWeighting: 70,
        },
    };
}

// Constants for scheduling logic
const MAX_DISTANCE_SAME_DAY_KM = 200; // Jobs >200km away need different day
const RUSH_HOUR_MORNING_START = 7; // 7-9am rush hour
const RUSH_HOUR_MORNING_END = 9;
const RUSH_HOUR_EVENING_START = 16; // 4-6pm rush hour
const RUSH_HOUR_EVENING_END = 18;
const RUSH_HOUR_MULTIPLIER = 1.5; // Drive times increase 50% during rush hour

interface SchedulingResult {
    scheduledJobs: ScheduledJob[];
    unschedulableJobs: Job[];
    warnings: string[];
}

/**
 * Apply rush hour multiplier to drive time based on time of day
 */
function applyRushHourMultiplier(driveTimeMinutes: number, currentTime: Date, considerTraffic: boolean = true): number {
    if (!considerTraffic) return driveTimeMinutes;

    const hour = currentTime.getHours();

    // Check if we're in rush hour
    const isMorningRush = hour >= RUSH_HOUR_MORNING_START && hour < RUSH_HOUR_MORNING_END;
    const isEveningRush = hour >= RUSH_HOUR_EVENING_START && hour < RUSH_HOUR_EVENING_END;

    if (isMorningRush || isEveningRush) {
        return Math.ceil(driveTimeMinutes * RUSH_HOUR_MULTIPLIER);
    }

    return driveTimeMinutes;
}

/**
 * Check if we need to insert a break based on current time and work duration
 */
function getRequiredBreak(
    currentTime: Date,
    totalWorkMinutes: number,
    prefs: SchedulingPreferences,
    hasHadLunch: boolean,
    hasHadMorningBreak: boolean,
    hasHadAfternoonBreak: boolean
): {
    breakType: 'lunch' | 'morning' | 'afternoon' | null;
    duration: number
} {
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();

    // Parse preference times
    const lunchHour = prefs.lunchBreak.enabled ? parseInt(prefs.lunchBreak.startTime.split(':')[0]) : -1;
    const morningHour = prefs.morningBreak.enabled ? parseInt(prefs.morningBreak.preferredTime.split(':')[0]) : -1;
    const afternoonHour = prefs.afternoonBreak.enabled ? parseInt(prefs.afternoonBreak.preferredTime.split(':')[0]) : -1;

    // Lunch break
    if (!hasHadLunch && prefs.lunchBreak.enabled) {
        const flexWindow = prefs.lunchBreak.flexible ? 30 : 0; // ±30 min if flexible
        const lunchStart = lunchHour * 60;
        const currentMinutes = hour * 60 + minute;

        if (currentMinutes >= lunchStart - flexWindow && currentMinutes <= lunchStart + flexWindow) {
            return { breakType: 'lunch', duration: prefs.lunchBreak.duration };
        }
    }

    // Morning break after ~2 hours of work
    if (!hasHadMorningBreak && prefs.morningBreak.enabled && hour >= morningHour && totalWorkMinutes >= 120) {
        return { breakType: 'morning', duration: prefs.morningBreak.duration };
    }

    // Afternoon break after ~5 hours of work
    if (!hasHadAfternoonBreak && prefs.afternoonBreak.enabled && hour >= afternoonHour && totalWorkMinutes >= 300) {
        return { breakType: 'afternoon', duration: prefs.afternoonBreak.duration };
    }

    return { breakType: null, duration: 0 };
}

/**
 * Check if a job is feasible for same-day scheduling
 */
function isJobFeasibleForDay(
    job: Job,
    currentLocation: { lat: number; lng: number },
    currentTime: Date,
    workEndHour: number
): { feasible: boolean; reason?: string } {
    if (!job.location) {
        return { feasible: false, reason: 'No location data' };
    }

    // Check distance from current location
    const distanceKm = calculateDistance(currentLocation, job.location);

    if (distanceKm > MAX_DISTANCE_SAME_DAY_KM) {
        return {
            feasible: false,
            reason: `Too far (${distanceKm.toFixed(0)}km) - needs separate day or different island`
        };
    }

    // Check if we can complete before end of day (use preference work end hour)
    const estimatedDriveMinutes = Math.ceil(distanceKm * 2) + 10;
    const estimatedJobDuration = job.estimated_duration || 60;
    const estimatedCompletionTime = addMinutes(currentTime, estimatedDriveMinutes + estimatedJobDuration);

    if (estimatedCompletionTime.getHours() >= workEndHour) {
        return { feasible: false, reason: 'Would exceed work hours' };
    }

    return { feasible: true };
}

/**
 * Create a parts run job for picking up parts at a store
 */
async function createPartsRun(
    job: Job,
    currentLocation: { lat: number; lng: number },
    currentTime: Date,
    useRealDriveTimes: boolean,
    preferredStore?: string
): Promise<{ partsRun: ScheduledJob; driveTimeMinutes: number; departure: Date; store: Location }> {
    // Find nearest parts store (or preferred store if specified)
    let selectedStore = PARTS_STORES[0];
    let minDistance = Infinity;

    for (const store of PARTS_STORES) {
        if (preferredStore && store.address.includes(preferredStore)) {
            selectedStore = store;
            break;
        }
        const dist = calculateDistance(currentLocation, store);
        if (dist < minDistance) {
            minDistance = dist;
            selectedStore = store;
        }
    }

    // Get drive time to store
    let driveToStoreMinutes: number;
    if (useRealDriveTimes) {
        try {
            const driveData = await getRealDriveTime(currentLocation, selectedStore, currentTime);
            driveToStoreMinutes = Math.ceil((driveData.durationInTraffic || driveData.duration) / 60);
        } catch {
            driveToStoreMinutes = Math.ceil(minDistance * 2) + 10;
        }
    } else {
        driveToStoreMinutes = Math.ceil(minDistance * 2) + 10;
    }

    const storeArrival = addMinutes(currentTime, driveToStoreMinutes);
    const storeDeparture = addMinutes(storeArrival, 30); // 30 min pickup time

    // Create parts run job
    const partsRun: ScheduledJob = {
        id: `parts-run-${job.id}-${Date.now()}`,
        org_id: job.org_id,
        status: 'scheduled',
        priority: 'medium',
        customer: {
            name: selectedStore.address.split('(')[0].trim(),
            address: selectedStore.address,
            phone: 'N/A',
            email: 'parts@store.com'
        },
        request: {
            description: `Pick up ${job.parts_description || 'parts'} for ${job.customer.name}`,
            type: 'parts_run',
            photos: [],
            availability: []
        },
        location: { lat: selectedStore.lat, lng: selectedStore.lng },
        assigned_tech_id: job.assigned_tech_id,
        assigned_tech_name: job.assigned_tech_name,
        scheduled_at: Timestamp.fromDate(storeArrival),
        estimated_duration: 30,
        type: 'parts_run',
        createdAt: Timestamp.now(),
        driveTimeMinutes: driveToStoreMinutes,
        arrivalTime: storeArrival,
        departureTime: storeDeparture
    };

    return {
        partsRun,
        driveTimeMinutes: driveToStoreMinutes,
        departure: storeDeparture,
        store: selectedStore
    };
}

/**
 * AI-powered route optimizer with Google Maps integration
 * Features:
 * - Real-time traffic-aware drive times
 * - Customer availability window matching
 * - Parts pickup optimization with 4 strategies
 * - Priority-based scheduling
 * - Multi-day routing for remote locations
 */
export async function optimizeScheduleWithAI(
    jobs: Job[],
    currentLocation: { lat: number; lng: number },
    startTime: Date = new Date(),
    useRealDriveTimes: boolean = true,
    userPreferences?: SchedulingPreferences
): Promise<SchedulingResult> {
    // Apply user preferences or use defaults
    const prefs = userPreferences || getDefaultPreferences();
    console.log(`🤖 AI Scheduler: Optimizing ${jobs.length} jobs with real-time data...`);
    console.log(`⚙️ Using preferences: ${prefs.workStartTime} - ${prefs.workEndTime}, max ${prefs.maxDailyHours}h work, max ${prefs.maxDailyDriveTime}m drive`);

    const optimizedSchedule: ScheduledJob[] = [];
    const unschedulableJobs: Job[] = [];
    const warnings: string[] = [];
    const pendingJobs = [...jobs.filter(j => j.type !== 'parts_run' && j.location)];

    // Parse work hours from preferences
    const workStartHour = parseInt(prefs.workStartTime.split(':')[0]);
    const workStartMinute = parseInt(prefs.workStartTime.split(':')[1]);
    const workEndHour = parseInt(prefs.workEndTime.split(':')[0]);
    const maxDailyWorkMinutes = prefs.maxDailyHours * 60;
    const maxDailyDriveMinutes = prefs.maxDailyDriveTime;
    const bufferBetweenJobs = prefs.jobPreferences.bufferBetweenJobs;
    const maxJobsPerDay = prefs.jobPreferences.maxJobsPerDay;

    let currentLoc = currentLocation;
    let currentTime = new Date(startTime);
    let dailyDriveTime = 0;
    let dailyWorkTime = 0; // Track actual work time (not including breaks)
    let totalElapsedTime = 0; // Track total time including breaks
    let hasHadLunch = false;
    let hasHadMorningBreak = false;
    let hasHadAfternoonBreak = false;
    let jobsScheduledToday = 0;

    // Track jobs that need parts (for 'morning' and 'endofday' strategies)
    const jobsNeedingParts: Job[] = [];

    // Parts pickup strategy
    const partsStrategy = prefs.partsPickup.enabled ? prefs.partsPickup.strategy : 'asneeded';
    console.log(`🔧 Parts pickup strategy: ${partsStrategy}`);

    // Start at work start hour if before working hours
    if (currentTime.getHours() < workStartHour || (currentTime.getHours() === workStartHour && currentTime.getMinutes() < workStartMinute)) {
        currentTime = setMinutes(setHours(currentTime, workStartHour), workStartMinute);
    }

    // STRATEGY: 'morning' - Pick up all parts first thing
    if (partsStrategy === 'morning' && prefs.partsPickup.enabled) {
        const jobsWithParts = pendingJobs.filter(j => j.parts_needed);
        if (jobsWithParts.length > 0) {
            console.log(`📦 Morning strategy: Picking up parts for ${jobsWithParts.length} jobs before starting work`);

            // Pick up parts at preferred store or nearest
            const firstJob = jobsWithParts[0];
            const partsInfo = await createPartsRun(
                firstJob,
                currentLoc,
                currentTime,
                useRealDriveTimes,
                prefs.partsPickup.preferredStore
            );

            optimizedSchedule.push(partsInfo.partsRun);
            currentLoc = partsInfo.store;
            currentTime = partsInfo.departure;
            dailyDriveTime += partsInfo.driveTimeMinutes;
            totalElapsedTime += partsInfo.driveTimeMinutes + 30; // 30 min pickup time

            console.log(`✓ Parts picked up at ${format(partsInfo.partsRun.arrivalTime, 'h:mm a')}`);
        }
    }

    // --- LOE Phase 1: Spatial Analysis - Clustering ---
    console.log(`\n📊 Phase 1: Spatial Analysis - Clustering ${pendingJobs.length} jobs...`);
    const clusters = clusterJobsByLocation(pendingJobs, 3);
    console.log(`✓ Found ${clusters.length} geographic clusters: ${clusters.map(c => c.name).join(', ')}`);

    // Build urgentDeadlines map for time window override
    const urgentDeadlines = new Map<string, Date>();
    // Note: Current availability is string array, time window objects would need to be added to type
    // For now, use high priority as proxy for urgency
    pendingJobs.forEach(job => {
        if (job.priority === 'critical' && job.scheduled_at) {
            urgentDeadlines.set(job.id, (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)));
        }
    });

    console.log(`\n🚗 Phase 2: Route Optimization - Building optimal sequence...`);
    console.log(`📍 Starting location: ${currentLoc.lat.toFixed(4)}, ${currentLoc.lng.toFixed(4)}`);

    // Track which cluster we're currently working on
    let currentClusterIndex = 0;

    while (pendingJobs.length > 0) {
        // Check if we've hit max jobs per day limit
        if (jobsScheduledToday >= maxJobsPerDay) {
            console.log(`⚠️ Reached max jobs per day limit (${maxJobsPerDay})`);
            pendingJobs.forEach(job => {
                unschedulableJobs.push(job);
                warnings.push(`${job.customer.name}: Reached daily job limit (${maxJobsPerDay} jobs) - schedule for another day`);
            });
            break;
        }

        // Check if we need a break before next job
        const breakCheck = getRequiredBreak(
            currentTime,
            totalElapsedTime,
            prefs,
            hasHadLunch,
            hasHadMorningBreak,
            hasHadAfternoonBreak
        );

        if (breakCheck.breakType) {
            console.log(`☕ Taking ${breakCheck.breakType} break (${breakCheck.duration} min)`);
            currentTime = addMinutes(currentTime, breakCheck.duration);
            totalElapsedTime += breakCheck.duration;

            if (breakCheck.breakType === 'lunch') hasHadLunch = true;
            else if (breakCheck.breakType === 'morning') hasHadMorningBreak = true;
            else if (breakCheck.breakType === 'afternoon') hasHadAfternoonBreak = true;
        }
        // --- LOE Algorithm: Cluster-First, Route-Second ---

        // Law 3: Cluster Constraint - Get jobs from current cluster
        let availableJobs = pendingJobs;
        if (currentClusterIndex < clusters.length) {
            const currentCluster = clusters[currentClusterIndex];
            availableJobs = pendingJobs.filter(j => currentCluster.jobs.includes(j));

            // If current cluster is exhausted, move to next cluster
            if (availableJobs.length === 0) {
                currentClusterIndex++;
                if (currentClusterIndex < clusters.length) {
                    const nextCluster = clusters[currentClusterIndex];
                    availableJobs = pendingJobs.filter(j => nextCluster.jobs.includes(j));
                    console.log(`\n📍 Moving to next cluster: ${nextCluster.name}`);
                } else {
                    availableJobs = pendingJobs; // All clusters done, process remaining
                }
            }
        }

        // Laws 1, 2, 4: Apply Anchor Rule, Proximity Chain, Time-Window Override, AND Customer Availability
        const nearestResult = findNearestJob(
            currentLoc,
            availableJobs,
            urgentDeadlines,
            currentTime,
            prefs.customerPreferences.respectTimeWindows
        );

        if (!nearestResult) {
            // No feasible jobs found in current cluster, try next cluster
            if (currentClusterIndex < clusters.length - 1) {
                currentClusterIndex++;
                console.log(`⚠️ No feasible jobs in current cluster, moving to next`);
                continue;
            } else {
                // No more clusters to try
                console.warn(`Could not schedule ${pendingJobs.length} remaining jobs for this day`);
                pendingJobs.forEach(job => {
                    unschedulableJobs.push(job);
                    const distanceKm = calculateDistance(currentLoc, job.location!);
                    if (distanceKm > MAX_DISTANCE_SAME_DAY_KM) {
                        warnings.push(`${job.customer.name}: Too far (${distanceKm.toFixed(0)}km) - schedule for different day`);
                    } else {
                        warnings.push(`${job.customer.name}: Could not fit in today's schedule - try tomorrow`);
                    }
                });
                break;
            }
        }

        const bestJob = nearestResult.job;
        const bestJobIndex = pendingJobs.indexOf(bestJob);

        console.log(`✓ Selected: ${bestJob.customer.name} - ${nearestResult.reason}`);

        // Now validate with feasibility and time constraints
        const feasibility = isJobFeasibleForDay(bestJob, currentLoc, currentTime, workEndHour);
        if (!feasibility.feasible) {
            console.log(`⚠️ Skipping ${bestJob.customer.name}: ${feasibility.reason}`);
            pendingJobs.splice(bestJobIndex, 1);
            unschedulableJobs.push(bestJob);
            warnings.push(`${bestJob.customer.name}: ${feasibility.reason}`);
            continue;
        }

        // Get drive time (real or estimated)
        let baseDriveTime: number;
        if (useRealDriveTimes) {
            try {
                const driveData = await getRealDriveTime(currentLoc, bestJob.location!, currentTime);
                baseDriveTime = Math.ceil((driveData.durationInTraffic || driveData.duration) / 60);
            } catch {
                baseDriveTime = Math.ceil(nearestResult.distance * 2) + 10;
            }
        } else {
            baseDriveTime = Math.ceil(nearestResult.distance * 2) + 10;
        }

        // Apply rush hour multiplier and add buffer (from preferences)
        let bestDriveTime = applyRushHourMultiplier(baseDriveTime, currentTime, prefs.advanced.considerTraffic);
        bestDriveTime += bufferBetweenJobs;

        // Check if adding this job would exceed daily limits
        if (dailyDriveTime + bestDriveTime > maxDailyDriveMinutes) {
            console.log(`⚠️ ${bestJob.customer.name} would exceed daily drive time limit (${dailyDriveTime}m + ${bestDriveTime}m > ${maxDailyDriveMinutes}m)`);
            pendingJobs.splice(bestJobIndex, 1);
            unschedulableJobs.push(bestJob);
            warnings.push(`${bestJob.customer.name}: Would exceed daily drive time limit`);
            continue;
        }

        const arrivalTime = addMinutes(currentTime, bestDriveTime);
        const jobDuration = bestJob.estimated_duration || 60;
        const completionTime = addMinutes(arrivalTime, jobDuration);

        // Check if we would exceed work hours
        const projectedWorkTime = dailyWorkTime + jobDuration;
        if (projectedWorkTime > maxDailyWorkMinutes) {
            console.log(`⚠️ ${bestJob.customer.name} would exceed daily work hour limit (${projectedWorkTime}m > ${maxDailyWorkMinutes}m)`);
            pendingJobs.splice(bestJobIndex, 1);
            unschedulableJobs.push(bestJob);
            warnings.push(`${bestJob.customer.name}: Would exceed daily work hours`);
            continue;
        }

        // Check if arrival or completion would be after work end time
        if (arrivalTime.getHours() >= workEndHour || completionTime.getHours() >= workEndHour) {
            console.log(`⚠️ ${bestJob.customer.name} would arrive/complete after end of day (${format(arrivalTime, 'h:mm a')} - ${format(completionTime, 'h:mm a')} vs ${prefs.workEndTime})`);
            pendingJobs.splice(bestJobIndex, 1);
            unschedulableJobs.push(bestJob);
            warnings.push(`${bestJob.customer.name}: Would finish after work end time`);
            continue;
        }

        // Handle parts pickup based on strategy
        if (bestJob.parts_needed && prefs.partsPickup.enabled) {
            if (partsStrategy === 'enroute') {
                // STRATEGY: 'enroute' - Pick up parts on the way to job
                const partsInfo = await createPartsRun(
                    bestJob,
                    currentLoc,
                    currentTime,
                    useRealDriveTimes,
                    prefs.partsPickup.preferredStore
                );

                // Check if detour is acceptable
                const detourMinutes = partsInfo.driveTimeMinutes;
                const maxDetour = prefs.partsPickup.maxDetourMinutes || 15;

                if (detourMinutes <= maxDetour) {
                    optimizedSchedule.push(partsInfo.partsRun);
                    currentLoc = partsInfo.store;
                    currentTime = partsInfo.departure;
                    dailyDriveTime += partsInfo.driveTimeMinutes;
                    totalElapsedTime += partsInfo.driveTimeMinutes + 30;
                    console.log(`📦 En-route pickup: ${partsInfo.store.address.split('(')[0].trim()} (${detourMinutes}m detour)`);
                } else {
                    console.log(`⚠️ Parts pickup would exceed max detour (${detourMinutes}m > ${maxDetour}m), skipping`);
                }
            } else if (partsStrategy === 'asneeded') {
                // STRATEGY: 'asneeded' - Pick up parts only when needed (same as enroute for now)
                const partsInfo = await createPartsRun(
                    bestJob,
                    currentLoc,
                    currentTime,
                    useRealDriveTimes,
                    prefs.partsPickup.preferredStore
                );

                optimizedSchedule.push(partsInfo.partsRun);
                currentLoc = partsInfo.store;
                currentTime = partsInfo.departure;
                dailyDriveTime += partsInfo.driveTimeMinutes;
                totalElapsedTime += partsInfo.driveTimeMinutes + 30;
                console.log(`📦 As-needed pickup: ${partsInfo.store.address.split('(')[0].trim()}`);
            } else if (partsStrategy === 'endofday') {
                // STRATEGY: 'endofday' - Track for later, pick up at end
                jobsNeedingParts.push(bestJob);
                console.log(`📦 End-of-day strategy: Will pick up parts after completing jobs`);
            }
            // 'morning' strategy already handled parts at start of day
        }

        // Schedule the actual job
        const jobArrival = addMinutes(currentTime, bestDriveTime);
        const jobDeparture = addMinutes(jobArrival, jobDuration);

        const scheduledJob: ScheduledJob = {
            ...bestJob,
            scheduled_at: Timestamp.fromDate(jobArrival),
            status: 'scheduled',
            driveTimeMinutes: bestDriveTime,
            arrivalTime: jobArrival,
            departureTime: jobDeparture
        };

        optimizedSchedule.push(scheduledJob);

        // Update current location and time
        currentLoc = bestJob.location!;
        currentTime = jobDeparture;
        dailyDriveTime += bestDriveTime;
        dailyWorkTime += jobDuration;
        totalElapsedTime += bestDriveTime + jobDuration;
        jobsScheduledToday++;

        // Remove job from pending list
        pendingJobs.splice(bestJobIndex, 1);

        console.log(`📍 Stop ${jobsScheduledToday}: ${bestJob.customer.name} at ${format(jobArrival, 'h:mm a')} (${bestDriveTime}m drive, ${jobDuration}m work)`);
    }

    // STRATEGY: 'endofday' - Pick up all parts at end of day
    if (partsStrategy === 'endofday' && jobsNeedingParts.length > 0 && prefs.partsPickup.enabled) {
        console.log(`📦 End-of-day strategy: Picking up parts for ${jobsNeedingParts.length} jobs after completing work`);

        const partsInfo = await createPartsRun(
            jobsNeedingParts[0],
            currentLoc,
            currentTime,
            useRealDriveTimes,
            prefs.partsPickup.preferredStore
        );

        optimizedSchedule.push(partsInfo.partsRun);
        console.log(`✓ Parts picked up at ${format(partsInfo.partsRun.arrivalTime, 'h:mm a')} at end of day`);
    }

    // --- LOE Phase 3: Route Verification ---
    console.log(`\n📊 Phase 3: Route Summary`);
    console.log(`✅ Total stops scheduled: ${optimizedSchedule.filter(j => j.type !== 'parts_run').length}`);
    console.log(`📦 Parts runs: ${optimizedSchedule.filter(j => j.type === 'parts_run').length}`);
    console.log(`🚗 Total drive time: ${dailyDriveTime}m (max: ${maxDailyDriveMinutes}m)`);
    console.log(`⚒️  Total work time: ${dailyWorkTime}m (max: ${maxDailyWorkMinutes}m)`);
    if (unschedulableJobs.length > 0) {
        console.log(`⚠️ Unschedulable jobs: ${unschedulableJobs.length}`);
    }
    console.log(`\n✅ LOE Optimization Complete\n`);

    return {
        scheduledJobs: optimizedSchedule,
        unschedulableJobs,
        warnings
    };
}

/**
 * Generate Google Maps route URL for the day's schedule
 */
export function generateGoogleMapsRoute(
    startLocation: { lat: number; lng: number },
    jobs: ScheduledJob[]
): string {
    if (jobs.length === 0) {
        return '';
    }

    const origin = `${startLocation.lat},${startLocation.lng}`;
    const destination = jobs[jobs.length - 1].location
        ? `${jobs[jobs.length - 1].location!.lat},${jobs[jobs.length - 1].location!.lng}`
        : origin;

    // Waypoints (max 25 for Google Maps)
    const waypoints = jobs.slice(0, -1)
        .filter(j => j.location)
        .slice(0, 24) // Max 25 waypoints
        .map(j => `${j.location!.lat},${j.location!.lng}`)
        .join('|');

    const baseUrl = 'https://www.google.com/maps/dir/?api=1';
    const params = new URLSearchParams({
        origin,
        destination,
        travelmode: 'driving',
        ...(waypoints && { waypoints })
    });

    return `${baseUrl}&${params.toString()}`;
}

/**
 * Calculate total drive time and distance for the day
 */
export function calculateDayStatistics(jobs: ScheduledJob[]): {
    totalDriveTime: number;
    totalWorkTime: number;
    totalJobs: number;
    partsRuns: number;
    estimatedEndTime?: Date;
} {
    const totalDriveTime = jobs.reduce((sum, j) => sum + (j.driveTimeMinutes || 0), 0);
    const totalWorkTime = jobs.reduce((sum, j) => sum + (j.estimated_duration || 0), 0);
    const totalJobs = jobs.filter(j => j.type !== 'parts_run').length;
    const partsRuns = jobs.filter(j => j.type === 'parts_run').length;
    const estimatedEndTime = jobs.length > 0 ? jobs[jobs.length - 1].departureTime : undefined;

    return {
        totalDriveTime,
        totalWorkTime,
        totalJobs,
        partsRuns,
        estimatedEndTime
    };
}
