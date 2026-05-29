import { Job, ServiceZone } from '../types';
import { Timestamp } from 'firebase/firestore';
import { addMinutes, setHours, setMinutes, isWithinInterval, getHours } from 'date-fns';

// --- Constants (Duplicated from seeding.ts for safety/speed) ---
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

// Traffic multipliers by hour (24-hour format)
const TRAFFIC_MULTIPLIERS: Record<number, number> = {
    7: 1.3, 8: 1.5, 9: 1.3,  // Morning rush
    12: 1.2, 13: 1.2,         // Lunch
    16: 1.3, 17: 1.5, 18: 1.4 // Evening rush
};

// --- Helpers ---
const deg2rad = (deg: number) => deg * (Math.PI / 180);

export const calculateDistance = (loc1: { lat: number, lng: number }, loc2: { lat: number, lng: number }) => {
    const R = 6371;
    const dLat = deg2rad(loc2.lat - loc1.lat);
    const dLng = deg2rad(loc2.lng - loc1.lng);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(loc1.lat)) * Math.cos(deg2rad(loc2.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const calculateDriveTime = (distanceKm: number, currentTime?: Date) => {
    // Base: 2 min/km + 10 min buffer
    let baseTime = Math.ceil(distanceKm * 2) + 10;

    // Apply traffic multiplier if time is provided
    if (currentTime) {
        const hour = getHours(currentTime);
        const multiplier = TRAFFIC_MULTIPLIERS[hour] || 1.0;
        baseTime = Math.ceil(baseTime * multiplier);
    }

    return baseTime;
};

export const getSmartDuration = (job: Job): number => {
    let duration = job.estimated_duration || 60;
    if (job.complexity === 'medium') duration += 30;
    if (job.complexity === 'complex') duration += 60;
    return duration;
};

export const getCurrentLocation = (): Promise<{ lat: number, lng: number }> => {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ lat: 0, lng: 0 });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => {
                console.warn("Location access denied, using default.", err);
                resolve({ lat: 0, lng: 0 });
            }
        );
    });
};

// Check if job can be scheduled at given time considering time windows
export const isWithinTimeWindow = (job: Job, scheduledTime: Date): boolean => {
    if (!job.request?.availabilityWindows || job.request.availabilityWindows.length === 0) {
        return true; // No restrictions
    }

    // Check if any availability window includes this time
    return job.request.availabilityWindows.some(window => {
        try {
            // Parse the time window (simplified - assumes same day)
            const [startHour, startMin] = window.startTime.split(':').map(Number);
            const [endHour, endMin] = window.endTime.split(':').map(Number);

            const start = new Date(scheduledTime);
            start.setHours(startHour, startMin, 0, 0);

            const end = new Date(scheduledTime);
            end.setHours(endHour, endMin, 0, 0);

            return isWithinInterval(scheduledTime, { start, end });
        } catch {
            return true; // If parsing fails, allow it
        }
    });
};

// Calculate priority score for job ordering
export const calculatePriorityScore = (job: Job): number => {
    const priorityWeights = {
        critical: 100,
        high: 50,
        medium: 20,
        low: 10
    };

    let score = priorityWeights[job.priority] || 10;

    // Add urgency based on creation time (older = higher score)
    const age = Date.now() - (job.createdAt?.toMillis?.() || Date.now());
    const daysOld = age / (1000 * 60 * 60 * 24);
    score += Math.min(daysOld * 5, 50); // Max +50 for age

    // Penalty for complex jobs (schedule them earlier)
    if (job.complexity === 'complex') score += 15;
    if (job.complexity === 'medium') score += 5;

    return score;
};

// Group jobs by service zone
export const groupJobsByZone = (jobs: Job[], zones: ServiceZone[]): Record<string, Job[]> => {
    const grouped: Record<string, Job[]> = { unzoned: [] };

    jobs.forEach(job => {
        let assigned = false;

        for (const zone of zones) {
            if (!zone.isActive || !zone.zipCodes || zone.zipCodes.length === 0) continue;

            // Check if job address ZIP matches zone
            const jobZip = job.customer.address.match(/\d{5}/)?.[0];
            if (jobZip && zone.zipCodes.includes(jobZip)) {
                if (!grouped[zone.id]) grouped[zone.id] = [];
                grouped[zone.id].push(job);
                assigned = true;
                break;
            }
        }

        if (!assigned) {
            grouped.unzoned.push(job);
        }
    });

    return grouped;
};

// Find optimal zone order for technician
export const optimizeZoneOrder = (
    zoneIds: string[],
    zones: ServiceZone[],
    startLocation: { lat: number, lng: number }
): string[] => {
    if (zoneIds.length <= 1) return zoneIds;

    const ordered: string[] = [];
    const remaining = [...zoneIds];
    const currentLoc = startLocation;

    while (remaining.length > 0) {
        let bestZoneId = remaining[0];
        let bestDist = Infinity;

        // Find nearest zone center
        for (const zoneId of remaining) {
            const zone = zones.find(z => z.id === zoneId);
            if (!zone) continue;

            // Estimate zone center (would need actual center or first job location)
            // For now, use simple heuristic
            const dist = Math.random(); // Placeholder
            if (dist < bestDist) {
                bestDist = dist;
                bestZoneId = zoneId;
            }
        }

        ordered.push(bestZoneId);
        remaining.splice(remaining.indexOf(bestZoneId), 1);
    }

    return ordered;
};

// --- Enhanced Optimization Logic ---
interface OptimizationOptions {
    respectTimeWindows?: boolean;
    considerTraffic?: boolean;
    serviceZones?: ServiceZone[];
    maxWorkHours?: number;
    startTime?: Date;
}

export const optimizeSchedule = (
    jobs: Job[],
    currentLocation: { lat: number, lng: number },
    partsFlags: Record<string, boolean>, // jobId -> needsParts
    options: OptimizationOptions = {}
): Job[] => {
    const {
        respectTimeWindows = true,
        considerTraffic = true,
        serviceZones = [],
        maxWorkHours = 10,
        startTime
    } = options;

    // Filter out parts runs and sort by priority
    let pendingJobs = jobs
        .filter(j => j.type !== 'parts_run')
        .sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a));

    const optimizedSchedule: Job[] = [];
    let lastLocation = currentLocation;
    let currentTime = startTime || new Date();

    // If it's morning (before 8am), start at 8am today
    if (currentTime.getHours() < 8) {
        currentTime = setMinutes(setHours(currentTime, 8), 0);
    }

    const workStartTime = new Date(currentTime);
    const workEndTime = addMinutes(workStartTime, maxWorkHours * 60);

    // Group by zones if provided
    if (serviceZones.length > 0) {
        const grouped = groupJobsByZone(pendingJobs, serviceZones);
        const zoneIds = Object.keys(grouped).filter(id => id !== 'unzoned' && grouped[id].length > 0);
        const orderedZones = optimizeZoneOrder(zoneIds, serviceZones, lastLocation);

        // Rebuild pendingJobs in zone order
        const reordered: Job[] = [];
        orderedZones.forEach(zoneId => {
            if (grouped[zoneId]) {
                reordered.push(...grouped[zoneId]);
            }
        });
        // Add unzoned jobs at the end
        reordered.push(...grouped.unzoned);
        pendingJobs = reordered;
    }

    // Enhanced Greedy TSP Strategy with Time Windows
    while (pendingJobs.length > 0 && currentTime < workEndTime) {
        let bestJobIndex = -1;
        let bestScore = -Infinity;

        // Find best job considering distance, priority, and time windows
        for (let i = 0; i < pendingJobs.length; i++) {
            const job = pendingJobs[i];
            if (!job.location) continue;

            const dist = calculateDistance(lastLocation, job.location);
            const driveTime = considerTraffic
                ? calculateDriveTime(dist, currentTime)
                : calculateDriveTime(dist);

            const arrivalTime = addMinutes(currentTime, driveTime);

            // Check time window compliance
            if (respectTimeWindows && !isWithinTimeWindow(job, arrivalTime)) {
                continue; // Skip jobs that can't fit time window
            }

            // Calculate score: prioritize close + high priority
            const distanceScore = 1 / (1 + dist); // Closer = higher score
            const priorityScore = calculatePriorityScore(job) / 100;
            const totalScore = distanceScore * 0.6 + priorityScore * 0.4;

            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestJobIndex = i;
            }
        }

        if (bestJobIndex === -1) {
            // No more jobs can fit in time window or distance constraints
            break;
        }

        const job = pendingJobs[bestJobIndex];

        // Check if this job needs parts
        if (partsFlags[job.id]) {
            // Find nearest parts store
            let nearestStore = PARTS_STORES[0];
            let minStoreDist = Infinity;

            for (const store of PARTS_STORES) {
                const d = calculateDistance(lastLocation, store);
                if (d < minStoreDist) {
                    minStoreDist = d;
                    nearestStore = store;
                }
            }

            // Create Parts Run
            const driveToStore = considerTraffic
                ? calculateDriveTime(calculateDistance(lastLocation, nearestStore), currentTime)
                : calculateDriveTime(calculateDistance(lastLocation, nearestStore));

            const storeArrivalTime = addMinutes(currentTime, driveToStore);

            // Check if parts run fits in work hours
            if (storeArrivalTime < workEndTime) {
                const partsRun: Job = {
                    id: `parts-run-${job.id}-${Date.now()}`,
                    org_id: job.org_id,
                    status: 'scheduled',
                    priority: 'medium',
                    customer: {
                        name: nearestStore.address.split('(')[0].trim(),
                        address: nearestStore.address,
                        phone: 'N/A',
                        email: 'parts@store.com'
                    },
                    request: {
                        description: `Pick up parts for ${job.customer.name}`,
                        type: 'parts_run',
                        photos: [],
                        availability: []
                    },
                    location: { lat: nearestStore.lat, lng: nearestStore.lng },
                    assigned_tech_id: job.assigned_tech_id,
                    assigned_tech_name: job.assigned_tech_name,
                    scheduled_at: Timestamp.fromDate(storeArrivalTime),
                    estimated_duration: 30,
                    type: 'parts_run',
                    createdAt: Timestamp.now()
                } as Job;

                optimizedSchedule.push(partsRun);

                currentTime = addMinutes(storeArrivalTime, 30 + 15); // 30m shop + 15m buffer
                lastLocation = nearestStore;
            }
        }

        // Schedule the Job
        const driveToJob = considerTraffic
            ? calculateDriveTime(calculateDistance(lastLocation, job.location!), currentTime)
            : calculateDriveTime(calculateDistance(lastLocation, job.location!));

        const jobArrivalTime = addMinutes(currentTime, driveToJob);
        const jobDuration = getSmartDuration(job);
        const jobEndTime = addMinutes(jobArrivalTime, jobDuration);

        // Check if job fits in remaining work hours
        if (jobEndTime > workEndTime) {
            // Job would exceed work hours, skip it
            pendingJobs.splice(bestJobIndex, 1);
            continue;
        }

        // Get service zone buffer if applicable
        let travelBuffer = 15; // Default buffer
        if (serviceZones.length > 0) {
            const jobZip = job.customer.address.match(/\d{5}/)?.[0];
            const zone = serviceZones.find(z =>
                z.isActive && z.zipCodes?.includes(jobZip || '')
            );
            if (zone) {
                travelBuffer = zone.travelTimeBuffer;
            }
        }

        const scheduledJob = {
            ...job,
            scheduled_at: Timestamp.fromDate(jobArrivalTime),
            status: 'scheduled'
        } as Job;

        optimizedSchedule.push(scheduledJob);

        currentTime = addMinutes(jobArrivalTime, jobDuration + travelBuffer);
        lastLocation = job.location!;

        // Remove from pending
        pendingJobs.splice(bestJobIndex, 1);
    }

    console.log(`Optimized ${optimizedSchedule.length} jobs. ${pendingJobs.length} jobs couldn't fit.`);

    return optimizedSchedule;
};

// Legacy version for backward compatibility
export const optimizeScheduleSimple = (
    jobs: Job[],
    currentLocation: { lat: number, lng: number },
    partsFlags: Record<string, boolean>
): Job[] => {
    return optimizeSchedule(jobs, currentLocation, partsFlags, {
        respectTimeWindows: false,
        considerTraffic: false
    });
};
