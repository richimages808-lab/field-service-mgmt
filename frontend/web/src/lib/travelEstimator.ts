import { Job, UserProfile } from '../types';
import { differenceInMinutes, getHours, getDay, isSameDay } from 'date-fns';

// ============================================================================
// Types
// ============================================================================
export interface GeoPoint {
    lat: number;
    lng: number;
    address?: string;
}

export type TrafficLevel = 'light' | 'moderate' | 'heavy' | 'severe';

export interface DriveEstimate {
    distanceMiles: number;
    distanceKm: number;
    baseDurationMinutes: number; // Free-flow driving time
    trafficDurationMinutes: number; // Duration with historical traffic
    delayMinutes: number; // Extra delay due to traffic
    recommendedBufferMinutes: number; // Total buffer needed (drive time + 5-10 min safety)
    trafficLevel: TrafficLevel;
    trafficReason: string;
    originLabel: string;
    destinationLabel: string;
    departureTime: Date;
    estimatedArrivalTime: Date;
}

export interface SlotViabilityResult {
    status: 'optimal' | 'tight' | 'conflict_incoming' | 'conflict_outgoing' | 'conflict_both' | 'available';
    incomingTransit?: DriveEstimate;
    outgoingTransit?: DriveEstimate;
    earliestViableStart?: Date;
    deficitMinutes?: number;
    reason: string;
}

// ============================================================================
// Fallback Geocoding Coordinates for Common Metro / Hawaii Locations
// ============================================================================
const KNOWN_GEO_CACHE: Record<string, { lat: number; lng: number }> = {
    'honolulu': { lat: 21.3069, lng: -157.8583 },
    'waikiki': { lat: 21.2785, lng: -157.8287 },
    'ala moana': { lat: 21.2909, lng: -157.8435 },
    'kaimuki': { lat: 21.2891, lng: -157.8014 },
    'kahala': { lat: 21.2778, lng: -157.7854 },
    'kailua': { lat: 21.4022, lng: -157.7394 },
    'kaneohe': { lat: 21.4181, lng: -157.8036 },
    'aiea': { lat: 21.3833, lng: -157.9429 },
    'pearl city': { lat: 21.3972, lng: -157.9711 },
    'mililani': { lat: 21.4514, lng: -158.0150 },
    'kapolei': { lat: 21.3325, lng: -158.0519 },
    'ewa beach': { lat: 21.3156, lng: -158.0072 },
    'waipahu': { lat: 21.3867, lng: -158.0092 },
    'haleiwa': { lat: 21.5911, lng: -158.1033 },
    'waianae': { lat: 21.4389, lng: -158.1878 },
    'kahului': { lat: 20.8893, lng: -156.4729 },
    'kihei': { lat: 20.7644, lng: -156.4450 },
    'lahaina': { lat: 20.8783, lng: -156.6825 },
    'hilo': { lat: 19.7297, lng: -155.0900 },
    'kailua-kona': { lat: 19.6499, lng: -155.9969 },
    'lihue': { lat: 21.9811, lng: -159.3711 },
    'kapaa': { lat: 22.0716, lng: -159.3167 }
};

// ============================================================================
// Geographic & Road Network Distance Helpers
// ============================================================================
const deg2rad = (deg: number): number => deg * (Math.PI / 180);

/**
 * Calculates straight-line Great Circle distance in kilometers
 */
export const haversineDistanceKm = (loc1: { lat: number; lng: number }, loc2: { lat: number; lng: number }): number => {
    const R = 6371; // Earth radius in km
    const dLat = deg2rad(loc2.lat - loc1.lat);
    const dLng = deg2rad(loc2.lng - loc1.lng);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(loc1.lat)) * Math.cos(deg2rad(loc2.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Extracts coordinates from a Job or UserProfile or Address string
 */
export const extractLocation = (
    entity: Job | UserProfile | GeoPoint | string | undefined | null
): { lat: number; lng: number; label: string } | null => {
    if (!entity) return null;

    // Direct GeoPoint / location object
    if (typeof entity === 'object' && 'lat' in entity && 'lng' in entity && typeof entity.lat === 'number' && typeof entity.lng === 'number') {
        return {
            lat: entity.lat,
            lng: entity.lng,
            label: (entity as any).address || (entity as any).label || 'Location'
        };
    }

    // Job entity
    if (typeof entity === 'object' && 'customer' in entity) {
        const job = entity as Job;
        if (job.location?.lat && job.location?.lng) {
            return {
                lat: job.location.lat,
                lng: job.location.lng,
                label: job.customer?.address || job.site_name || job.customer?.name || 'Job Site'
            };
        }
        if (job.customer?.address) {
            const geocoded = geocodeFromAddressString(job.customer.address);
            if (geocoded) return { ...geocoded, label: job.customer.address };
        }
    }

    // UserProfile entity
    if (typeof entity === 'object' && 'role' in entity) {
        const tech = entity as UserProfile;
        if (tech.homeLocation?.lat && tech.homeLocation?.lng) {
            return {
                lat: tech.homeLocation.lat,
                lng: tech.homeLocation.lng,
                label: tech.homeLocation.address || `${tech.name}'s Base`
            };
        }
        if (tech.address) {
            const geocoded = geocodeFromAddressString(tech.address);
            if (geocoded) return { ...geocoded, label: tech.address };
        }
    }

    // String address
    if (typeof entity === 'string') {
        const geocoded = geocodeFromAddressString(entity);
        if (geocoded) return { ...geocoded, label: entity };
    }

    return null;
};

/**
 * Rough geocode fallback by pattern matching known city/area names
 */
function geocodeFromAddressString(address: string): { lat: number; lng: number } | null {
    if (!address) return null;
    const lower = address.toLowerCase();
    for (const [key, coords] of Object.entries(KNOWN_GEO_CACHE)) {
        if (lower.includes(key)) {
            return coords;
        }
    }
    // Default fallback to central metro coordinates (Honolulu central)
    return { lat: 21.3069, lng: -157.8583 };
}

// ============================================================================
// Historical Traffic Profile Model
// ============================================================================
/**
 * Computes historical traffic multiplier based on day of week and departure time.
 * - Rush hour peaks: 7:00 AM - 9:30 AM (Inbound) and 3:45 PM - 6:45 PM (Outbound)
 * - Lunch peak: 11:45 AM - 1:15 PM
 * - Friday PM surge starts earlier (2:30 PM - 6:30 PM)
 * - Weekend traffic is milder with midday recreational peaks
 */
export function getHistoricalTrafficMultiplier(departureTime: Date): {
    multiplier: number;
    trafficLevel: TrafficLevel;
    trafficReason: string;
} {
    const dayOfWeek = getDay(departureTime); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isFriday = dayOfWeek === 5;
    const hour = getHours(departureTime) + departureTime.getMinutes() / 60;

    // Default off-peak
    let multiplier = 1.0;
    let trafficLevel: TrafficLevel = 'light';
    let trafficReason = 'Light traffic flow';

    if (isWeekend) {
        if (hour >= 11.5 && hour <= 16.0) {
            multiplier = 1.25;
            trafficLevel = 'moderate';
            trafficReason = 'Weekend midday traffic';
        }
    } else {
        // Weekday Morning Inbound Peak (7:00 AM - 9:30 AM)
        if (hour >= 7.0 && hour <= 9.5) {
            if (hour >= 7.5 && hour <= 8.75) {
                multiplier = 1.65; // Peak rush hour (+65% travel time)
                trafficLevel = 'severe';
                trafficReason = 'Heavy morning rush hour delay';
            } else {
                multiplier = 1.40;
                trafficLevel = 'heavy';
                trafficReason = 'Morning commuter traffic';
            }
        }
        // Weekday Midday / Lunch (11:45 AM - 1:15 PM)
        else if (hour >= 11.75 && hour <= 13.25) {
            multiplier = 1.25;
            trafficLevel = 'moderate';
            trafficReason = 'Midday commercial traffic';
        }
        // Friday Early PM Surge (2:30 PM - 6:30 PM)
        else if (isFriday && hour >= 14.5 && hour <= 18.5) {
            if (hour >= 15.25 && hour <= 17.5) {
                multiplier = 1.70;
                trafficLevel = 'severe';
                trafficReason = 'Heavy Friday afternoon commute';
            } else {
                multiplier = 1.45;
                trafficLevel = 'heavy';
                trafficReason = 'Friday afternoon traffic building';
            }
        }
        // Standard Mon-Thu Evening Outbound Peak (3:45 PM - 6:45 PM)
        else if (hour >= 15.75 && hour <= 18.75) {
            if (hour >= 16.5 && hour <= 17.75) {
                multiplier = 1.60;
                trafficLevel = 'severe';
                trafficReason = 'Heavy evening rush hour delay';
            } else {
                multiplier = 1.35;
                trafficLevel = 'heavy';
                trafficReason = 'Evening commuter traffic';
            }
        }
        // Shoulder hours (6:30 - 7:00 AM, 9:30 - 10:30 AM, 3:00 - 3:45 PM, 6:45 - 7:30 PM)
        else if ((hour >= 6.5 && hour < 7.0) || (hour > 9.5 && hour <= 10.5) || (hour >= 15.0 && hour < 15.75) || (hour > 18.75 && hour <= 19.5)) {
            multiplier = 1.15;
            trafficLevel = 'moderate';
            trafficReason = 'Moderate traffic flow';
        }
    }

    return { multiplier, trafficLevel, trafficReason };
}

// ============================================================================
// Main Drive Time Estimator
// ============================================================================
/**
 * Computes the estimated driving time, road distance, and traffic delay
 * between two locations at a specific target departure time.
 */
export function estimateDriveTime(
    originEntity: Job | UserProfile | GeoPoint | string | undefined | null,
    destinationEntity: Job | UserProfile | GeoPoint | string | undefined | null,
    departureTime: Date = new Date(),
    options: { safetyBufferMinutes?: number; roadFactor?: number } = {}
): DriveEstimate {
    const origin = extractLocation(originEntity);
    const destination = extractLocation(destinationEntity);

    // If both origin and destination are identical or missing
    if (!origin || !destination) {
        return {
            distanceMiles: 0,
            distanceKm: 0,
            baseDurationMinutes: 10,
            trafficDurationMinutes: 10,
            delayMinutes: 0,
            recommendedBufferMinutes: 10,
            trafficLevel: 'light',
            trafficReason: 'Default estimate (location unspecified)',
            originLabel: origin?.label || 'Origin',
            destinationLabel: destination?.label || 'Destination',
            departureTime,
            estimatedArrivalTime: new Date(departureTime.getTime() + 10 * 60000)
        };
    }

    // Straight line distance
    const straightKm = haversineDistanceKm(origin, destination);

    // If practically same location (< 200m)
    if (straightKm < 0.2) {
        return {
            distanceMiles: 0.1,
            distanceKm: 0.2,
            baseDurationMinutes: 2,
            trafficDurationMinutes: 2,
            delayMinutes: 0,
            recommendedBufferMinutes: 5,
            trafficLevel: 'light',
            trafficReason: 'Same site or adjacent location',
            originLabel: origin.label,
            destinationLabel: destination.label,
            departureTime,
            estimatedArrivalTime: new Date(departureTime.getTime() + 2 * 60000)
        };
    }

    // Road network curvature factor (roads are rarely straight lines: typically 1.25x - 1.38x)
    const roadFactor = options.roadFactor || (straightKm < 5 ? 1.35 : straightKm < 20 ? 1.28 : 1.22);
    const roadKm = straightKm * roadFactor;
    const roadMiles = roadKm * 0.621371;

    // Average free-flow speed based on distance (city streets 25-35 mph vs highway 50-60 mph)
    let avgFreeFlowSpeedMph = 30; // default city speed
    if (roadMiles > 15) {
        avgFreeFlowSpeedMph = 48; // predominantly highway
    } else if (roadMiles > 6) {
        avgFreeFlowSpeedMph = 38; // mixed arterial & highway
    }

    // Base free-flow minutes + 3 minutes for stoplights/parking arrival
    const baseMinutes = Math.max(3, Math.round((roadMiles / avgFreeFlowSpeedMph) * 60) + 3);

    // Apply historical traffic model
    const trafficInfo = getHistoricalTrafficMultiplier(departureTime);
    const trafficMinutes = Math.max(baseMinutes, Math.round(baseMinutes * trafficInfo.multiplier));
    const delayMinutes = trafficMinutes - baseMinutes;

    // Safety buffer (drive time + 5-10 min padding for parking/setup)
    const safetyPadding = options.safetyBufferMinutes ?? (trafficMinutes > 30 ? 10 : 5);
    const recommendedBufferMinutes = trafficMinutes + safetyPadding;

    const estimatedArrivalTime = new Date(departureTime.getTime() + trafficMinutes * 60000);

    return {
        distanceMiles: Math.round(roadMiles * 10) / 10,
        distanceKm: Math.round(roadKm * 10) / 10,
        baseDurationMinutes: baseMinutes,
        trafficDurationMinutes: trafficMinutes,
        delayMinutes,
        recommendedBufferMinutes,
        trafficLevel: trafficInfo.trafficLevel,
        trafficReason: trafficInfo.trafficReason,
        originLabel: origin.label,
        destinationLabel: destination.label,
        departureTime,
        estimatedArrivalTime
    };
}

// ============================================================================
// Schedule Leg Finder & Slot Viability Assessor
// ============================================================================

/**
 * Finds the scheduled jobs on a given day for a technician, ordered chronologically.
 */
export function getTechOrderedJobsForDay(
    techId: string,
    allJobs: Job[],
    date: Date,
    excludeJobId?: string
): Array<{ job: Job; startTime: Date; endTime: Date }> {
    return allJobs
        .filter(j => {
            if (j.id === excludeJobId || j.assigned_tech_id !== techId) return false;
            if (!['scheduled', 'in_progress', 'completed'].includes(j.status)) return false;
            const sTime = parseFirestoreDate(j.scheduled_at);
            return sTime && isSameDay(sTime, date);
        })
        .map(j => {
            const sTime = parseFirestoreDate(j.scheduled_at)!;
            const duration = j.estimated_duration || 60;
            const eTime = new Date(sTime.getTime() + duration * 60000);
            return { job: j, startTime: sTime, endTime: eTime };
        })
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Evaluates whether a candidate job can be scheduled at targetSlot for a technician,
 * accounting for travel time from previous stop (or base) and to next stop.
 */
export function evaluateSlotViability(
    candidateJob: Job,
    tech: UserProfile,
    allJobs: Job[],
    targetSlot: Date,
    jobDurationMinutes: number = candidateJob.estimated_duration || 60
): SlotViabilityResult {
    const dayJobs = getTechOrderedJobsForDay(tech.id, allJobs, targetSlot, candidateJob.id);
    const candidateStart = targetSlot;
    const candidateEnd = new Date(candidateStart.getTime() + jobDurationMinutes * 60000);

    // Find preceding job (ends before or at candidateStart)
    const precedingLegs = dayJobs.filter(leg => leg.endTime <= candidateStart);
    const precedingJob = precedingLegs.length > 0 ? precedingLegs[precedingLegs.length - 1] : null;

    // Find succeeding job (starts after or at candidateEnd)
    const succeedingLegs = dayJobs.filter(leg => leg.startTime >= candidateEnd);
    const succeedingJob = succeedingLegs.length > 0 ? succeedingLegs[0] : null;

    // Direct overlap check with any job
    const directOverlap = dayJobs.find(leg => {
        return (candidateStart < leg.endTime && candidateEnd > leg.startTime);
    });

    if (directOverlap) {
        return {
            status: 'conflict_both',
            reason: `Direct collision with ${directOverlap.job.customer.name} (${formatTime(directOverlap.startTime)} - ${formatTime(directOverlap.endTime)})`,
            deficitMinutes: 60
        };
    }

    // 1. Calculate incoming travel time
    let incomingTransit: DriveEstimate;
    if (precedingJob) {
        // Drive from previous job
        incomingTransit = estimateDriveTime(
            precedingJob.job,
            candidateJob,
            precedingJob.endTime
        );
    } else {
        // First job of the day: drive from tech's home base / start location
        const morningDeparture = new Date(targetSlot);
        morningDeparture.setHours(8, 0, 0, 0); // start of day assumption
        incomingTransit = estimateDriveTime(
            tech.homeLocation ? { lat: tech.homeLocation.lat, lng: tech.homeLocation.lng, address: tech.homeLocation.address } : tech.address || 'Tech Base',
            candidateJob,
            morningDeparture
        );
    }

    // Check if previous job end + incoming transit exceeds candidateStart
    let incomingConflict = false;
    let deficitIncoming = 0;
    let earliestViableStart = candidateStart;

    if (precedingJob) {
        const requiredArrivalTime = new Date(precedingJob.endTime.getTime() + incomingTransit.trafficDurationMinutes * 60000);
        if (candidateStart < requiredArrivalTime) {
            incomingConflict = true;
            deficitIncoming = differenceInMinutes(requiredArrivalTime, candidateStart);
            earliestViableStart = requiredArrivalTime;
        }
    }

    // 2. Calculate outgoing travel time
    let outgoingTransit: DriveEstimate | undefined;
    let outgoingConflict = false;
    let deficitOutgoing = 0;

    if (succeedingJob) {
        outgoingTransit = estimateDriveTime(
            candidateJob,
            succeedingJob.job,
            candidateEnd
        );
        const requiredDepartureForNext = new Date(succeedingJob.startTime.getTime() - outgoingTransit.trafficDurationMinutes * 60000);
        if (candidateEnd > requiredDepartureForNext) {
            outgoingConflict = true;
            deficitOutgoing = differenceInMinutes(candidateEnd, requiredDepartureForNext);
        }
    }

    // Determine status
    if (incomingConflict && outgoingConflict) {
        return {
            status: 'conflict_both',
            incomingTransit,
            outgoingTransit,
            earliestViableStart,
            deficitMinutes: Math.max(deficitIncoming, deficitOutgoing),
            reason: `Insufficient travel time: needs ${incomingTransit.trafficDurationMinutes}m from ${incomingTransit.originLabel} and ${outgoingTransit?.trafficDurationMinutes}m to ${outgoingTransit?.destinationLabel}`
        };
    }

    if (incomingConflict) {
        return {
            status: 'conflict_incoming',
            incomingTransit,
            outgoingTransit,
            earliestViableStart,
            deficitMinutes: deficitIncoming,
            reason: `Insufficient travel time: requires ~${incomingTransit.trafficDurationMinutes}m drive from previous stop (${incomingTransit.originLabel}). Earliest arrival: ${formatTime(earliestViableStart)}.`
        };
    }

    if (outgoingConflict) {
        return {
            status: 'conflict_outgoing',
            incomingTransit,
            outgoingTransit,
            earliestViableStart,
            deficitMinutes: deficitOutgoing,
            reason: `Insufficient travel time to next stop (${succeedingJob!.job.customer.name}): needs ~${outgoingTransit!.trafficDurationMinutes}m drive.`
        };
    }

    // Tight margin check (< 8 minutes buffer)
    const marginFromPrevious = precedingJob ? differenceInMinutes(candidateStart, precedingJob.endTime) - incomingTransit.trafficDurationMinutes : 30;
    const marginToNext = succeedingJob && outgoingTransit ? differenceInMinutes(succeedingJob.startTime, candidateEnd) - outgoingTransit.trafficDurationMinutes : 30;

    if (marginFromPrevious < 8 || marginToNext < 8) {
        return {
            status: 'tight',
            incomingTransit,
            outgoingTransit,
            earliestViableStart: candidateStart,
            reason: `Tight travel schedule: ${incomingTransit.trafficDurationMinutes}m drive from ${incomingTransit.originLabel} (${marginFromPrevious}m buffer)`
        };
    }

    return {
        status: 'optimal',
        incomingTransit,
        outgoingTransit,
        earliestViableStart: candidateStart,
        reason: `Optimal time slot: includes ${incomingTransit.trafficDurationMinutes}m drive time with ${incomingTransit.trafficLevel} traffic`
    };
}

// ============================================================================
// Helpers
// ============================================================================
function parseFirestoreDate(ts: any): Date | null {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') {
        try { return ts.toDate(); } catch {}
    }
    if (ts instanceof Date) return ts;
    if (ts.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
